"""NutriFood Flask app — app factory + config + backward-compatible re-exports."""
import os
import sys
import sqlite3
from flask import Flask
from flask_cors import CORS

from extensions import (
    DB_PATH, EMAIL_RE, JWT_SECRET, close_db, check_rate_limit,
    RATE_LIMIT, RATE_WINDOW, RATE_MAX,
)
import extensions as _ext

# Reset rate limiter on module reload (test compatibility with importlib.reload)
RATE_LIMIT.clear()

# Re-read env vars on module reload (conftest changes them between tests)
import extensions as _ext
_ext.DB_PATH = os.environ.get('DB_PATH', '/data/nutrifood.db')
_ext.NF_DB_PATH = os.environ.get('NF_DB_PATH', '/data/nutrifood.db')
_ext.JWT_SECRET = os.environ.get('JWT_SECRET')
_ext.JWT_EXPIRY_HOURS = int(os.environ.get('JWT_EXPIRY_HOURS', '2160'))
_ext.SMTP_HOST = os.environ.get('SMTP_HOST', 'smtp.fastmail.com')
_ext.SMTP_PORT = int(os.environ.get('SMTP_PORT', '465'))
_ext.SMTP_USER = os.environ.get('SMTP_USER', 'ai@slopvibe.org')
_ext.SMTP_PASS = os.environ.get('SMTP_PASS', '')
_ext.MAIL_FROM = os.environ.get('MAIL_FROM', 'ai@slopvibe.org')
_ext.APP_URL = os.environ.get('APP_URL', 'https://slopvibe.org/nutri-food/')

# ─── App factory ───

def create_app():
    """Create and configure the Flask application."""
    app = Flask(__name__)
    CORS(app, origins=[
        "https://slopvibe.org",
        "http://localhost:*",
        "http://127.0.0.1:*"
    ])  # Auth via httpOnly cookie + CSRF double-submit

    app.teardown_appcontext(close_db)

    # Register blueprints
    from blueprints.auth import bp as auth_bp
    from blueprints.foods import bp as foods_bp
    from blueprints.selections import bp as selections_bp
    from blueprints.tracking import bp as tracking_bp
    from blueprints.journal import bp as journal_bp
    from blueprints.deals import bp as deals_bp
    from blueprints.suggestions import bp as suggestions_bp
    from blueprints.meal_plan import bp as meal_plan_bp
    from blueprints.export import bp as export_bp
    from blueprints.profile import bp as profile_bp
    from blueprints.health import bp as health_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(foods_bp)
    app.register_blueprint(selections_bp)
    app.register_blueprint(tracking_bp)
    app.register_blueprint(journal_bp)
    app.register_blueprint(deals_bp)
    app.register_blueprint(suggestions_bp)
    app.register_blueprint(meal_plan_bp)
    app.register_blueprint(export_bp)
    app.register_blueprint(profile_bp)
    app.register_blueprint(health_bp)

    return app


def init_db():
    """Initialize the database tables."""
    db_path = _ext.DB_PATH
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.execute('PRAGMA journal_mode=WAL')
    conn.executescript('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            is_admin INTEGER DEFAULT 0,
            token_version INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS selections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            data TEXT NOT NULL DEFAULT '{}',
            updated_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(user_id)
        );
        CREATE INDEX IF NOT EXISTS idx_selections_user ON selections(user_id);
        CREATE TABLE IF NOT EXISTS reset_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token TEXT UNIQUE NOT NULL,
            expires_at TEXT NOT NULL,
            used INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_reset_token ON reset_tokens(token);
        CREATE TABLE IF NOT EXISTS meal_plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            week_key TEXT NOT NULL,
            data TEXT NOT NULL DEFAULT '{}',
            updated_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(user_id, week_key)
        );
        CREATE INDEX IF NOT EXISTS idx_meal_plans_user ON meal_plans(user_id);
        CREATE TABLE IF NOT EXISTS history_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            week_key TEXT NOT NULL,
            selections_data TEXT NOT NULL DEFAULT '{}',
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(user_id, week_key)
        );
        CREATE INDEX IF NOT EXISTS idx_history_snapshots_user ON history_snapshots(user_id);
        CREATE TABLE IF NOT EXISTS share_links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token TEXT UNIQUE NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            expires_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_share_links_token ON share_links(token);
        CREATE TABLE IF NOT EXISTS user_goals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            protein REAL DEFAULT 350,
            fiber REAL DEFAULT 175,
            iron REAL DEFAULT 56,
            vitamin_c REAL DEFAULT 280,
            calcium REAL DEFAULT 700,
            omega3 REAL DEFAULT 3.5,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(user_id)
        );
        CREATE TABLE IF NOT EXISTS journal_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            food_name TEXT NOT NULL,
            cat_id TEXT,
            qty INTEGER DEFAULT 1,
            nutrition TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(user_id, date, food_name)
        );
        CREATE INDEX IF NOT EXISTS idx_journal_user_date ON journal_entries(user_id, date);
        CREATE TABLE IF NOT EXISTS tracking (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            data TEXT NOT NULL DEFAULT '{}',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(user_id, date)
        );
        CREATE INDEX IF NOT EXISTS idx_tracking_user_date ON tracking(user_id, date);
    ''')
    # ─── Migration: add profile columns if missing (#31) ───
    cols = {r[1] for r in conn.execute("PRAGMA table_info(users)").fetchall()}
    for col, col_type, default in [
        ('weight', 'REAL', None),
        ('height', 'REAL', None),
        ('age', 'INTEGER', None),
        ('sex', 'TEXT', "'other'"),
        ('activity_level', 'TEXT', "'moderate'"),
        ('diet', 'TEXT', "'none'"),
        ('allergies', 'TEXT', None),
    ]:
        if col not in cols:
            conn.execute(f'ALTER TABLE users ADD COLUMN {col} {col_type} DEFAULT {default}')
    conn.commit()
    conn.close()


# ─── Module-level setup (for gunicorn app:app and test compatibility) ───

if not JWT_SECRET:
    print('[NutriFood] FATAL: JWT_SECRET environment variable is not set. Refusing to start.')
    sys.exit(1)

app = create_app()
init_db()

# ─── Backward-compatible re-exports (tests import these from app module) ───

from extensions import EMAIL_RE as _er  # noqa: already imported above

# Functions used by test_unit.py via app_module
from blueprints.auth import hash_password, make_token, verify_token  # noqa
from utils.nutrition import calculate_density, compute_nutrition_totals, compute_totals_from_selections, get_user_targets, DEFAULT_TARGETS  # noqa
from utils.season import lookup_quebec_season, QUEBEC_SEASONS  # noqa
from utils.foods_helpers import _extract_food_keywords  # noqa
from blueprints.selections import get_week_key  # noqa


if __name__ == '__main__':
    # nosec: required for Docker container networking — bind all interfaces inside container
    # The host port mapping in docker-compose.yml controls actual exposure
    app.run(host='0.0.0.0', port=5000)  # nosec B201
