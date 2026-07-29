import hmac
import os
import json
import sqlite3
import hashlib
import secrets
import time
import base64
import smtplib
import urllib.request
import urllib.parse
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import re
import threading
from datetime import datetime, timedelta, date, timezone
from flask import Flask, request, jsonify, g
from flask_cors import CORS

app = Flask(__name__)
CORS(app, origins=[
    "https://slopvibe.org",
    "http://localhost:*",
    "http://127.0.0.1:*"
])

DB_PATH = os.environ.get('DB_PATH', '/data/nutrifood.db')
EMAIL_RE = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')

RATE_LIMIT = {}  # key: ip+endpoint, value: [count, first_attempt_time]
RATE_WINDOW = 60  # seconds
RATE_MAX = 10  # requests per window

def check_rate_limit(key):
    now = time.time()
    if key in RATE_LIMIT:
        count, first = RATE_LIMIT[key]
        if now - first < RATE_WINDOW:
            if count >= RATE_MAX:
                return False
            RATE_LIMIT[key][0] += 1
            return True
    RATE_LIMIT[key] = [1, now]
    # Cleanup expired entries to prevent unbounded growth
    if len(RATE_LIMIT) > 1000:
        expired = [k for k, (c, first) in RATE_LIMIT.items() if now - first >= RATE_WINDOW]
        for k in expired:
            del RATE_LIMIT[k]
    return True
JWT_SECRET = os.environ.get('JWT_SECRET')
if not JWT_SECRET:
    import sys
    print('[NutriFood] FATAL: JWT_SECRET environment variable is not set. Refusing to start.')
    sys.exit(1)
JWT_EXPIRY_HOURS = int(os.environ.get('JWT_EXPIRY_HOURS', '2160'))
SMTP_HOST = os.environ.get('SMTP_HOST', 'smtp.fastmail.com')
SMTP_PORT = int(os.environ.get('SMTP_PORT', '465'))
SMTP_USER = os.environ.get('SMTP_USER', 'ai@slopvibe.org')
SMTP_PASS = os.environ.get('SMTP_PASS', '')
MAIL_FROM = os.environ.get('MAIL_FROM', 'ai@slopvibe.org')
APP_URL = os.environ.get('APP_URL', 'https://slopvibe.org/nutri-food/')

# ─── Helpers ───

def get_week_key(d=None):
    if d is None:
        d = date.today()
    iso = d.isocalendar()
    return f"{iso[0]}-W{iso[1]:02d}"

# ─── Email ───

def send_email(to_email, subject, html_body, text_body):
    msg = MIMEMultipart('alternative')
    msg['From'] = 'NutriFood <ai@slopvibe.org>'
    msg['To'] = to_email
    msg['Subject'] = subject
    msg.attach(MIMEText(text_body, 'plain'))
    msg.attach(MIMEText(html_body, 'html'))
    try:
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT) as server:
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(MAIL_FROM, to_email, msg.as_string())
        print(f'[NutriFood] Email sent to {to_email}: {subject}')
        return True
    except Exception as e:
        print(f'[NutriFood] Email error: {e}')
        return False

def send_welcome_email(to_email, name):
    html = (
        '<div style="font-family:sans-serif;max-width:500px;margin:0 auto;background:#0f1117;color:#e4e4e7;padding:32px;border-radius:12px">'
        '<h1 style="color:#4ade80;margin-bottom:8px">🍎 Bienvenue sur NutriFood!</h1>'
        f'<p style="color:#94a3b8;font-size:1.05rem">Bonjour {name},</p>'
        '<p style="color:#e4e4e7">Votre compte a été créé avec succès. Vous pouvez maintenant planifier votre semaine nutritionnelle.</p>'
        f'<div style="margin:24px 0"><a href="{APP_URL}" style="display:inline-block;padding:12px 28px;background:#22c55e;color:#0f1117;text-decoration:none;border-radius:8px;font-weight:700">Commencer →</a></div>'
        '<p style="color:#94a3b8;font-size:0.85rem;margin-top:24px">NutriFood — slopvibe.org</p>'
        '</div>'
    )
    text = f"Bienvenue sur NutriFood!\n\nBonjour {name},\n\nVotre compte a ete cree avec succes.\n\nCommencez ici: {APP_URL}\n\nNutriFood — slopvibe.org"
    return send_email(to_email, 'Bienvenue sur NutriFood! 🍎', html, text)

def send_reset_email(to_email, name, token):
    reset_url = f"{APP_URL}#reset={token}"
    html = (
        '<div style="font-family:sans-serif;max-width:500px;margin:0 auto;background:#0f1117;color:#e4e4e7;padding:32px;border-radius:12px">'
        '<h1 style="color:#4ade80;margin-bottom:8px">🔑 Réinitialisation de mot de passe</h1>'
        f'<p style="color:#94a3b8;font-size:1.05rem">Bonjour {name},</p>'
        '<p style="color:#e4e4e7">Vous avez demandé à réinitialiser votre mot de passe NutriFood.</p>'
        f'<div style="margin:24px 0"><a href="{reset_url}" style="display:inline-block;padding:12px 28px;background:#22c55e;color:#0f1117;text-decoration:none;border-radius:8px;font-weight:700">Changer mon mot de passe →</a></div>'
        '<p style="color:#94a3b8;font-size:0.85rem">Ce lien expire dans 1 heure. Si vous n\'avez pas fait cette demande, ignorez cet email.</p>'
        '<p style="color:#94a3b8;font-size:0.85rem;margin-top:24px">NutriFood — slopvibe.org</p>'
        '</div>'
    )
    text = f"Reinitialisation de mot de passe\n\nBonjour {name},\n\nCliquez ici pour changer votre mot de passe: {reset_url}\n\nCe lien expire dans 1 heure.\n\nNutriFood — slopvibe.org"
    return send_email(to_email, '🔑 Réinitialisation de mot de passe — NutriFood', html, text)

# ─── Database ───

def get_db():
    if 'db' not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db

@app.teardown_appcontext
def close_db(error):
    db = g.pop('db', None)
    if db is not None:
        db.close()

def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
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
    ''')
    conn.commit()
    conn.close()

# ─── Auth helpers ───

def hash_password(password, salt):
    return hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000).hex()

def make_token(user_id, email, token_version=0):
    payload = {
        'uid': user_id,
        'email': email,
        'exp': int(time.time()) + (JWT_EXPIRY_HOURS * 3600),
        'tv': token_version
    }
    payload_json = json.dumps(payload, separators=(',', ':'))
    payload_b64 = base64.urlsafe_b64encode(payload_json.encode()).decode().rstrip('=')
    sig = hmac.new(JWT_SECRET.encode(), payload_b64.encode(), hashlib.sha256)
    sig_b64 = base64.urlsafe_b64encode(sig.digest()).decode().rstrip('=')
    return f'{payload_b64}.{sig_b64}'

def verify_token(token):
    if not token:
        return None
    try:
        parts = token.split('.')
        if len(parts) != 2:
            return None
        payload_b64, sig_b64 = parts
        expected_sig = hmac.new(JWT_SECRET.encode(), payload_b64.encode(), hashlib.sha256)
        expected_sig_b64 = base64.urlsafe_b64encode(expected_sig.digest()).decode().rstrip('=')
        if not secrets.compare_digest(sig_b64, expected_sig_b64):
            return None
        padding = 4 - len(payload_b64) % 4
        payload_json = base64.urlsafe_b64decode(payload_b64 + '=' * padding).decode()
        payload = json.loads(payload_json)
        if payload.get('exp', 0) < time.time():
            return None
        # Check token_version against DB to invalidate old tokens after password change
        db = get_db()
        user = db.execute('SELECT token_version FROM users WHERE id = ?', (payload.get('uid'),)).fetchone()
        if not user or payload.get('tv', 0) != user['token_version']:
            return None
        return payload
    except Exception:
        return None

def get_auth_user():
    auth = request.headers.get('Authorization', '')
    if not auth.startswith('Bearer '):
        return None
    token = auth[7:]
    payload = verify_token(token)
    if not payload:
        return None
    db = get_db()
    user = db.execute('SELECT id, email, name, is_admin FROM users WHERE id = ?', (payload['uid'],)).fetchone()
    return user

# ─── Routes ───

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'service': 'nutrifood-api'})

@app.route('/api/register', methods=['POST'])
def register():
    if not check_rate_limit(request.remote_addr + ':register'):
        return jsonify({'error': 'Trop de tentatives, réessayez plus tard'}), 429
    data = request.get_json() or {}
    email = (data.get('email') or '').strip().lower()
    name = (data.get('name') or '').strip()
    password = data.get('password') or ''

    if not email or not name or not password:
        return jsonify({'error': 'Email, nom et mot de passe requis'}), 400
    if len(password) < 6:
        return jsonify({'error': 'Le mot de passe doit faire au moins 6 caractères'}), 400
    if not EMAIL_RE.match(email):
        return jsonify({'error': 'Email invalide'}), 400

    db = get_db()
    existing = db.execute('SELECT id FROM users WHERE email = ?', (email,)).fetchone()
    if existing:
        return jsonify({'error': 'Cet email est déjà inscrit'}), 409
    existing_name = db.execute('SELECT id FROM users WHERE LOWER(name) = LOWER(?)', (name,)).fetchone()
    if existing_name:
        return jsonify({'error': 'Ce nom d\'usager est déjà pris'}), 409

    salt = secrets.token_hex(16)
    pw_hash = hash_password(password, salt)
    cursor = db.execute(
        'INSERT INTO users (email, name, password_hash, salt) VALUES (?, ?, ?, ?)',
        (email, name, pw_hash, salt)
    )
    db.execute('INSERT INTO selections (user_id, data) VALUES (?, ?)', (cursor.lastrowid, '{}'))
    db.commit()

    send_welcome_email(email, name)

    token = make_token(cursor.lastrowid, email, 0)
    return jsonify({
        'token': token,
        'user': {'id': cursor.lastrowid, 'email': email, 'name': name, 'is_admin': 0}
    }), 201

@app.route('/api/login', methods=['POST'])
def login():
    if not check_rate_limit(request.remote_addr + ':login'):
        return jsonify({'error': 'Trop de tentatives, réessayez plus tard'}), 429
    data = request.get_json() or {}
    identifier = (data.get('email') or data.get('identifier') or '').strip()
    password = data.get('password') or ''

    if not identifier or not password:
        return jsonify({'error': 'Identifiant et mot de passe requis'}), 400

    db = get_db()
    user = db.execute(
        'SELECT * FROM users WHERE email = ? OR LOWER(name) = ?',
        (identifier.lower(), identifier.lower())
    ).fetchone()
    if not user:
        return jsonify({'error': 'Email ou mot de passe incorrect'}), 401

    pw_hash = hash_password(password, user['salt'])
    if not secrets.compare_digest(pw_hash, user['password_hash']):
        return jsonify({'error': 'Email ou mot de passe incorrect'}), 401

    token = make_token(user['id'], user['email'], user['token_version'])
    return jsonify({
        'token': token,
        'user': {'id': user['id'], 'email': user['email'], 'name': user['name'], 'is_admin': user['is_admin']}
    })

# ─── Admin: edit foods ───

FOODS_PATH = os.environ.get('FOODS_PATH', '/data/foods.json')

_FOODS_CACHE = None
_FOODS_MTIME = 0

def load_foods():
    global _FOODS_CACHE, _FOODS_MTIME
    try:
        mtime = os.path.getmtime(FOODS_PATH)
        if _FOODS_CACHE is None or mtime != _FOODS_MTIME:
            with open(FOODS_PATH, 'r') as f:
                _FOODS_CACHE = json.load(f)
            _FOODS_MTIME = mtime
    except Exception:
        return {}
    return _FOODS_CACHE if _FOODS_CACHE is not None else {}

@app.route('/api/foods', methods=['GET'])
def get_foods():
    return jsonify(load_foods())

@app.route('/api/admin/foods', methods=['POST'])
def save_foods():
    user = get_auth_user()
    if not user or not user['is_admin']:
        return jsonify({'error': 'Accès refusé'}), 403
    data = request.get_json() or {}
    foods_data = data.get('foods')
    if not foods_data or not isinstance(foods_data, dict):
        return jsonify({'error': 'Données invalides'}), 400
    try:
        with open(FOODS_PATH, 'w') as f:
            json.dump(foods_data, f, ensure_ascii=False, indent=2)
        return jsonify({'status': 'ok'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ─── CNF (Canadian Nutrient File) search ───

CNF_DB_PATH = os.environ.get('CNF_DB_PATH', '/data/cnf.db')

def get_cnf_db():
    db = sqlite3.connect(CNF_DB_PATH)
    db.row_factory = sqlite3.Row
    return db

@app.route('/api/cnf/search', methods=['GET'])
def cnf_search():
    q = (request.args.get('q') or '').strip()
    if len(q) < 2:
        return jsonify({'error': 'Minimum 2 caractères'}), 400
    db = get_cnf_db()
    rows = db.execute(
        '''SELECT f.food_id, f.name_fr, f.name_en, g.name_fr as group_fr
           FROM food f
           LEFT JOIN food_group g ON f.group_code = g.code
           WHERE f.name_fr LIKE ? OR f.name_en LIKE ?
              OR f.alt_name_fr LIKE ? OR f.alt_name_en LIKE ?
              OR f.scientific_name LIKE ?
           LIMIT 20''',
        (f'%{q}%', f'%{q}%', f'%{q}%', f'%{q}%', f'%{q}%')
    ).fetchall()
    db.close()
    return jsonify({'results': [dict(r) for r in rows]})

@app.route('/api/cnf/product/<int:food_id>', methods=['GET'])
def cnf_product(food_id):
    db = get_cnf_db()
    food = db.execute('SELECT * FROM food WHERE food_id = ?', (food_id,)).fetchone()
    if not food:
        return jsonify({'error': 'Aliment introuvable'}), 404
    nutrients = db.execute(
        '''SELECT n.name_fr, n.unit, ROUND(na.amount, 2) as amount, n.code
           FROM nutrient_amount na
           JOIN nutrient_name n ON na.nutrient_code = n.code
           WHERE na.food_id = ? AND na.amount > 0
           ORDER BY n.name_fr''',
        (food_id,)
    ).fetchall()
    group = db.execute('SELECT * FROM food_group WHERE code = ?', (food['group_code'],)).fetchone() if food['group_code'] else None
    db.close()
    return jsonify({
        'food': dict(food),
        'group': dict(group) if group else None,
        'nutrients': [dict(n) for n in nutrients]
    })

# ─── Password reset ───

@app.route('/api/forgot-password', methods=['POST'])
def forgot_password():
    if not check_rate_limit(request.remote_addr + ':forgot-password'):
        return jsonify({'error': 'Trop de tentatives, réessayez plus tard'}), 429
    data = request.get_json() or {}
    identifier = (data.get('email') or data.get('identifier') or '').strip()

    if not identifier:
        return jsonify({'error': 'Email ou nom d\'usager requis'}), 400

    db = get_db()
    user = db.execute(
        'SELECT * FROM users WHERE email = ? OR LOWER(name) = ?',
        (identifier.lower(), identifier.lower())
    ).fetchone()

    # Always return success to prevent user enumeration
    if not user:
        return jsonify({'status': 'ok'})

    # Generate reset token (1 hour expiry)
    reset_token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
    db.execute(
        'INSERT INTO reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
        (user['id'], reset_token, expires_at.isoformat())
    )
    db.commit()

    send_reset_email(user['email'], user['name'], reset_token)
    return jsonify({'status': 'ok'})

@app.route('/api/reset-password', methods=['POST'])
def reset_password():
    data = request.get_json() or {}
    reset_token = data.get('token') or ''
    new_password = data.get('password') or ''

    if not reset_token or not new_password:
        return jsonify({'error': 'Token et nouveau mot de passe requis'}), 400
    if len(new_password) < 6:
        return jsonify({'error': 'Le mot de passe doit faire au moins 6 caractères'}), 400

    db = get_db()
    row = db.execute(
        'SELECT * FROM reset_tokens WHERE token = ? AND used = 0',
        (reset_token,)
    ).fetchone()

    if not row:
        return jsonify({'error': 'Token invalide ou déjà utilisé'}), 400

    expires_at = datetime.fromisoformat(row['expires_at'])
    if datetime.now(timezone.utc) > expires_at:
        return jsonify({'error': 'Ce lien a expiré'}), 400

    # Get user and update password
    user = db.execute('SELECT * FROM users WHERE id = ?', (row['user_id'],)).fetchone()
    if not user:
        return jsonify({'error': 'Utilisateur introuvable'}), 400

    new_salt = secrets.token_hex(16)
    new_hash = hash_password(new_password, new_salt)
    db.execute(
        'UPDATE users SET password_hash = ?, salt = ?, token_version = token_version + 1, updated_at = datetime(\'now\') WHERE id = ?',
        (new_hash, new_salt, user['id'])
    )
    db.execute('UPDATE reset_tokens SET used = 1 WHERE id = ?', (row['id'],))
    db.commit()

    # Issue new login token with updated version
    new_version = db.execute('SELECT token_version FROM users WHERE id = ?', (user['id'],)).fetchone()['token_version']
    token = make_token(user['id'], user['email'], new_version)
    return jsonify({
        'status': 'ok',
        'token': token,
        'user': {'id': user['id'], 'email': user['email'], 'name': user['name']}
    })

# ─── Change password (logged in) ───

@app.route('/api/change-password', methods=['POST'])
def change_password():
    user = get_auth_user()
    if not user:
        return jsonify({'error': 'Non autorisé'}), 401

    data = request.get_json() or {}
    current_password = data.get('current_password') or ''
    new_password = data.get('new_password') or ''

    if not current_password or not new_password:
        return jsonify({'error': 'Mot de passe actuel et nouveau requis'}), 400
    if len(new_password) < 6:
        return jsonify({'error': 'Le nouveau mot de passe doit faire au moins 6 caractères'}), 400

    db = get_db()
    full_user = db.execute('SELECT * FROM users WHERE id = ?', (user['id'],)).fetchone()

    # Verify current password
    pw_hash = hash_password(current_password, full_user['salt'])
    if not secrets.compare_digest(pw_hash, full_user['password_hash']):
        return jsonify({'error': 'Mot de passe actuel incorrect'}), 403

    # Update password
    new_salt = secrets.token_hex(16)
    new_hash = hash_password(new_password, new_salt)
    db.execute(
        'UPDATE users SET password_hash = ?, salt = ?, token_version = token_version + 1, updated_at = datetime(\'now\') WHERE id = ?',
        (new_hash, new_salt, user['id'])
    )
    db.commit()

    # Issue new token with updated version
    new_version = db.execute('SELECT token_version FROM users WHERE id = ?', (user['id'],)).fetchone()['token_version']
    token = make_token(user['id'], user['email'], new_version)
    return jsonify({'status': 'ok', 'token': token})

# ─── Selections ───

@app.route('/api/selections', methods=['GET'])
def get_selections():
    user = get_auth_user()
    if not user:
        return jsonify({'error': 'Non autorisé'}), 401

    db = get_db()
    row = db.execute('SELECT data, updated_at FROM selections WHERE user_id = ?', (user['id'],)).fetchone()
    if not row:
        return jsonify({'selections': {}})
    return jsonify({
        'selections': json.loads(row['data']),
        'updated_at': row['updated_at']
    })

@app.route('/api/selections', methods=['POST'])
def save_selections():
    user = get_auth_user()
    if not user:
        return jsonify({'error': 'Non autorisé'}), 401

    data = request.get_json() or {}
    selections_data = data.get('selections', {})

    if not isinstance(selections_data, dict):
        return jsonify({'error': 'Format invalide'}), 400

    db = get_db()
    db.execute(
        '''INSERT INTO selections (user_id, data, updated_at) VALUES (?, ?, datetime('now'))
           ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = datetime('now')''',
        (user['id'], json.dumps(selections_data))
    )

    # Create weekly history snapshot if not already existing for this week
    week_key = get_week_key()
    db.execute(
        '''INSERT INTO history_snapshots (user_id, week_key, selections_data)
           VALUES (?, ?, ?)
           ON CONFLICT(user_id, week_key) DO UPDATE SET
           selections_data = excluded.selections_data, created_at = datetime('now')''',
        (user['id'], week_key, json.dumps(selections_data))
    )

    db.commit()

    return jsonify({'status': 'saved', 'updated_at': datetime.now(timezone.utc).isoformat()})

# ─── Meal Plan ───

@app.route('/api/meal-plan', methods=['GET'])
def get_meal_plan():
    user = get_auth_user()
    if not user:
        return jsonify({'error': 'Non autorisé'}), 401

    week = request.args.get('week')
    if not week:
        week = get_week_key()

    db = get_db()
    row = db.execute(
        'SELECT data FROM meal_plans WHERE user_id = ? AND week_key = ?',
        (user['id'], week)
    ).fetchone()

    data = json.loads(row['data']) if row else {}
    return jsonify({'data': data, 'week': week})

@app.route('/api/meal-plan', methods=['POST'])
def save_meal_plan():
    user = get_auth_user()
    if not user:
        return jsonify({'error': 'Non autorisé'}), 401

    body = request.get_json() or {}
    week = body.get('week')
    plan_data = body.get('data', {})

    if not week:
        return jsonify({'error': 'Le paramètre week est requis'}), 400
    if not isinstance(plan_data, dict):
        return jsonify({'error': 'Format invalide'}), 400

    db = get_db()
    db.execute(
        '''INSERT INTO meal_plans (user_id, week_key, data, updated_at)
           VALUES (?, ?, ?, datetime('now'))
           ON CONFLICT(user_id, week_key) DO UPDATE SET data = excluded.data, updated_at = datetime('now')''',
        (user['id'], week, json.dumps(plan_data))
    )
    db.commit()

    return jsonify({'status': 'ok'})

# ─── History ───

@app.route('/api/history', methods=['GET'])
def get_history():
    user = get_auth_user()
    if not user:
        return jsonify({'error': 'Non autorisé'}), 401

    db = get_db()
    rows = db.execute(
        'SELECT week_key, selections_data, created_at FROM history_snapshots WHERE user_id = ? ORDER BY week_key DESC',
        (user['id'],)
    ).fetchall()

    result = []
    for row in rows:
        try:
            sel_data = json.loads(row['selections_data'])
        except Exception:
            sel_data = {}

        total_items = sum(len(items) for items in sel_data.values()) if isinstance(sel_data, dict) else 0

        categories = {}
        if isinstance(sel_data, dict):
            for cat_id, items in sel_data.items():
                categories[cat_id] = len(items) if isinstance(items, list) else 0

        result.append({
            'week': row['week_key'],
            'date': row['created_at'],
            'summary': {
                'total_items': total_items,
                'categories': categories
            }
        })

    return jsonify(result)

@app.route('/api/history/<week_key>', methods=['GET'])
def get_history_detail(week_key):
    user = get_auth_user()
    if not user:
        return jsonify({'error': 'Non autorisé'}), 401

    db = get_db()
    row = db.execute(
        'SELECT selections_data, created_at FROM history_snapshots WHERE user_id = ? AND week_key = ?',
        (user['id'], week_key)
    ).fetchone()

    if not row:
        return jsonify({'error': 'Aucun snapshot pour cette semaine'}), 404

    return jsonify({
        'week': week_key,
        'date': row['created_at'],
        'selections': json.loads(row['selections_data'])
    })

# ─── Share link ───

@app.route('/api/share', methods=['POST'])
def create_share():
    user = get_auth_user()
    if not user:
        return jsonify({'error': 'Non autorisé'}), 401

    share_token = secrets.token_urlsafe(16)
    expires_at = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    db = get_db()
    db.execute('INSERT OR REPLACE INTO share_links (user_id, token, expires_at) VALUES (?, ?, ?)', (user['id'], share_token, expires_at))
    db.commit()

    return jsonify({'share_url': f'{APP_URL}#share={share_token}', 'token': share_token, 'expires_at': expires_at})

@app.route('/api/shared/<token>', methods=['GET'])
def get_shared(token):
    db = get_db()
    row = db.execute('SELECT user_id, expires_at FROM share_links WHERE token = ?', (token,)).fetchone()
    if not row:
        return jsonify({'error': 'Lien invalide'}), 404
    # Check expiry
    try:
        if datetime.fromisoformat(row['expires_at']) < datetime.now(timezone.utc):
            db.execute('DELETE FROM share_links WHERE token = ?', (token,))
            db.commit()
            return jsonify({'error': 'Lien expiré'}), 404
    except Exception:
        pass

    sel = db.execute('SELECT data FROM selections WHERE user_id = ?', (row['user_id'],)).fetchone()
    user = db.execute('SELECT name FROM users WHERE id = ?', (row['user_id'],)).fetchone()

    selections_data = json.loads(sel['data']) if sel else {}

    # Build grocery list from selections
    grocery = []
    foods_data = load_foods()

    current_month = date.today().month

    for cat_id, items in selections_data.items():
        cat_name = cat_id
        cat_icon = ''
        for cat in foods_data.get('categories', []):
            if cat['id'] == cat_id:
                cat_name = cat['name']
                cat_icon = cat.get('icon', '')
                break
        for item in items:
            # Find food to check season
            food_data = None
            for cat in foods_data.get('categories', []):
                if cat['id'] == cat_id:
                    food_data = next((f for f in cat['foods'] if f['name'] == item.get('name', '')), None)
                    break

            season_icon = ''
            if food_data:
                season = food_data.get('season', [])
                import_season = food_data.get('import_season', [])
                if season and len(season) < 12:
                    if current_month in season:
                        season_icon = '🌱'
                    elif import_season and current_month in import_season:
                        season_icon = '✈️'
                elif import_season and len(import_season) < 12:
                    if current_month in import_season:
                        season_icon = '✈️'

            icon = (season_icon + ' ' if season_icon else '') + cat_icon
            grocery.append({
                'name': item.get('name', ''),
                'qty': item.get('qty', 1),
                'icon': icon
            })
    grocery.sort(key=lambda x: x['name'])

    return jsonify({
        'grocery': grocery,
        'user_name': user['name'] if user else 'Inconnu'
    })

@app.route('/api/me', methods=['GET'])
def me():
    user = get_auth_user()
    if not user:
        return jsonify({'error': 'Non autorisé'}), 401
    return jsonify({
        'user': {'id': user['id'], 'email': user['email'], 'name': user['name'], 'is_admin': user['is_admin']}
    })

# ─── Nutrition Summary ───

def compute_nutrition_totals(user_id, foods_data):
    """Compute weekly nutrition totals from user's selections."""
    db = get_db()
    row = db.execute('SELECT data FROM selections WHERE user_id = ?', (user_id,)).fetchone()
    if not row:
        return {'protein': 0, 'fiber': 0, 'iron': 0, 'vitamin_c': 0, 'calcium': 0, 'omega3': 0}

    selections_data = json.loads(row['data']) if row['data'] else {}
    totals = {'protein': 0, 'fiber': 0, 'iron': 0, 'vitamin_c': 0, 'calcium': 0, 'omega3': 0}

    categories = foods_data.get('categories', [])
    for cat in categories:
        cat_id = cat.get('id')
        cat_selections = selections_data.get(cat_id, [])
        if not cat_selections:
            continue
        # Build a lookup for this category's foods
        food_map = {f['name']: f for f in cat.get('foods', [])}
        for item in cat_selections:
            food_name = item.get('name', '')
            qty = item.get('qty', 1)
            food = food_map.get(food_name)
            if not food:
                continue
            n = food.get('nutrition', {})
            totals['protein'] += n.get('protein', 0) * qty
            totals['fiber'] += n.get('fiber', 0) * qty
            totals['iron'] += n.get('iron', 0) * qty
            totals['vitamin_c'] += n.get('vit_c', 0) * qty
            totals['calcium'] += n.get('calcium', 0) * qty
            totals['omega3'] += n.get('omega3', 0) * qty

    return totals

DEFAULT_TARGETS = {'protein': 350, 'fiber': 175, 'iron': 56, 'vitamin_c': 280, 'calcium': 700, 'omega3': 3.5}

def get_user_targets(user_id):
    """Get user's weekly targets (custom or default)."""
    db = get_db()
    row = db.execute('SELECT protein, fiber, iron, vitamin_c, calcium, omega3 FROM user_goals WHERE user_id = ?', (user_id,)).fetchone()
    if row:
        return {
            'protein': row['protein'],
            'fiber': row['fiber'],
            'iron': row['iron'],
            'vitamin_c': row['vitamin_c'],
            'calcium': row['calcium'],
            'omega3': row['omega3']
        }
    return dict(DEFAULT_TARGETS)

@app.route('/api/nutrition-summary', methods=['GET'])
def nutrition_summary():
    user = get_auth_user()
    if not user:
        return jsonify({'error': 'Non autorisé'}), 401

    foods_data = load_foods()
    totals = compute_nutrition_totals(user['id'], foods_data)
    targets = get_user_targets(user['id'])

    percentages = {}
    for key in DEFAULT_TARGETS:
        t = targets.get(key, DEFAULT_TARGETS[key])
        if t > 0:
            percentages[key] = round((totals.get(key, 0) / t) * 100)
        else:
            percentages[key] = 0

    return jsonify({
        'totals': {k: round(v, 2) for k, v in totals.items()},
        'targets': targets,
        'percentages': percentages
    })

# ─── Suggestions ───

NUTRIENT_LABELS = {
    'protein': 'protéines',
    'fiber': 'fibres',
    'iron': 'fer',
    'vitamin_c': 'vitamine C',
    'calcium': 'calcium',
    'omega3': 'oméga-3'
}

@app.route('/api/suggestions', methods=['GET'])
def suggestions():
    user = get_auth_user()
    if not user:
        return jsonify({'error': 'Non autorisé'}), 401

    foods_data = load_foods()
    totals = compute_nutrition_totals(user['id'], foods_data)
    targets = get_user_targets(user['id'])

    # Find nutrients below 80% of target
    deficient = []
    for key in DEFAULT_TARGETS:
        t = targets.get(key, DEFAULT_TARGETS[key])
        if t > 0:
            pct = (totals.get(key, 0) / t) * 100
            if pct < 80:
                deficient.append((key, pct))

    if not deficient:
        return jsonify({'suggestions': []})

    # Get user's currently selected food names
    db = get_db()
    row = db.execute('SELECT data FROM selections WHERE user_id = ?', (user['id'],)).fetchone()
    selected_names = set()
    if row and row['data']:
        selections_data = json.loads(row['data'])
        for cat_id, items in selections_data.items():
            for item in items:
                selected_names.add(item.get('name', ''))

    # Build suggestion list
    all_suggestions = []
    categories = foods_data.get('categories', [])

    # Map nutrient keys to foods.json nutrition keys
    nutrient_key_map = {'vitamin_c': 'vit_c'}

    for nutrient_key, pct in sorted(deficient, key=lambda x: x[1]):
        json_key = nutrient_key_map.get(nutrient_key, nutrient_key)
        candidates = []
        for cat in categories:
            for food in cat.get('foods', []):
                if food['name'] in selected_names:
                    continue
                n = food.get('nutrition', {})
                val = n.get(json_key, 0)
                if val > 0:
                    candidates.append({
                        'food': food['name'],
                        'category': cat.get('name', ''),
                        'nutrient': nutrient_key,
                        'nutrient_value': val,
                        'current_pct': round(pct),
                        'reason': f"Manque de {NUTRIENT_LABELS.get(nutrient_key, nutrient_key)} ({round(pct)}% de l'objectif)"
                    })
        # Sort by nutrient density descending, take top 3
        candidates.sort(key=lambda x: x['nutrient_value'], reverse=True)
        all_suggestions.extend(candidates[:3])
        if len(all_suggestions) >= 8:
            break

    return jsonify({'suggestions': all_suggestions[:8]})

# ─── Seasonal ───

@app.route('/api/seasonal', methods=['GET'])
def seasonal():
    foods_data = load_foods()
    current_month = date.today().month
    seasonal_foods = []
    for cat in foods_data.get('categories', []):
        for food in cat.get('foods', []):
            season = food.get('season', [])
            if season and current_month in season:
                seasonal_foods.append(food['name'])
    return jsonify({'month': current_month, 'foods': seasonal_foods})

# ─── User Goals ───

@app.route('/api/goals', methods=['GET'])
def get_goals():
    user = get_auth_user()
    if not user:
        return jsonify({'error': 'Non autorisé'}), 401
    targets = get_user_targets(user['id'])
    return jsonify({'goals': targets})

@app.route('/api/goals', methods=['POST'])
def update_goals():
    user = get_auth_user()
    if not user:
        return jsonify({'error': 'Non autorisé'}), 401

    data = request.get_json() or {}
    goals = data.get('goals', {})

    # Validate and extract allowed fields
    allowed = ['protein', 'fiber', 'iron', 'vitamin_c', 'calcium', 'omega3']
    values = {}
    for key in allowed:
        if key in goals:
            try:
                val = float(goals[key])
                if val < 0:
                    return jsonify({'error': f'{key} doit être positif'}), 400
                values[key] = val
            except (ValueError, TypeError):
                return jsonify({'error': f'{key} doit être un nombre'}), 400

    db = get_db()
    # Build upsert query dynamically
    columns = ['user_id'] + list(values.keys())
    placeholders = ['?'] * len(columns)
    updates = ', '.join(f"{k} = excluded.{k}" for k in values.keys())
    query = f"""
        INSERT INTO user_goals ({', '.join(columns)})
        VALUES ({', '.join(placeholders)})
        ON CONFLICT(user_id) DO UPDATE SET {updates}
    """
    params = [user['id']] + list(values.values())
    db.execute(query, params)
    db.commit()

    # Return updated goals
    targets = get_user_targets(user['id'])
    return jsonify({'goals': targets})

# ─── Grocery Deals Cache (epiceries.ca) ───

DEALS_CACHE = None
DEALS_CACHE_TIME = None
DEALS_CACHE_TTL = 6 * 3600  # 6 hours
DEALS_BUILDING = False  # True while background thread is fetching
DEALS_CACHE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'deals_cache.json')
DEALS_LOCK_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'deals_cache.lock')

STORE_META = {
    'maxi':    {'name': 'Maxi',     'color': '#0a6cff'},
    'iga':     {'name': 'IGA',      'color': '#d6001c'},
    'superc':  {'name': 'Super C',  'color': '#ff6600'},
    'metro':   {'name': 'Metro',    'color': '#e30613'},
    'provigo': {'name': 'Provigo',  'color': '#0066b3'},
    'walmart': {'name': 'Walmart',  'color': '#0071ce'},
}

def fetch_deals_for_food(food_name, query=None):
    """Fetch discounted grocery deals from epiceries.ca for a given food."""
    search_query = query or food_name
    try:
        params = urllib.parse.urlencode({
            'endpoint': 'search',
            'q': search_query,
            'discounted': 'true',
            'limit': '5',
            'sort': 'price_asc',
        })
        url = f'https://epiceries.ca/api?{params}'
        req = urllib.request.Request(url, headers={'User-Agent': 'NutriFood/1.0'})
        with urllib.request.urlopen(req, timeout=8) as resp:
            body = resp.read().decode('utf-8')
        data = json.loads(body)
        if not data.get('ok') or not data.get('data'):
            return []
        results = data['data'].get('results', [])
        deals = []
        for r in results:
            deals.append({
                'name': r.get('name', ''),
                'store': r.get('store', ''),
                'price': r.get('price'),
                'unit_price': r.get('unitPrice', ''),
                'size': r.get('size', ''),
                'link': r.get('link', ''),
                'image': r.get('image', ''),
            })
        # Sort by price ascending (cheapest first)
        deals.sort(key=lambda d: d['price'] if d['price'] is not None else float('inf'))
        return deals
    except Exception as e:
        print(f'[NutriFood] Deals fetch error for "{food_name}": {e}')
        return []

def refresh_deals_cache():
    """Refresh the deals cache by querying epiceries.ca for all foods."""
    global DEALS_CACHE, DEALS_CACHE_TIME
    foods_data = load_foods()
    all_deals = {}
    total_count = 0
    for cat in foods_data.get('categories', []):
        for food in cat.get('foods', []):
            food_name = food.get('name', '')
            if not food_name:
                continue
            query = food.get('epiceries_query') or food_name
            deals = fetch_deals_for_food(food_name, query)
            if deals:
                all_deals[food_name] = deals
                total_count += len(deals)
            time.sleep(0.3)  # Respect rate limit
    # Write to file for cross-worker sharing
    cache_data = {
        'deals': all_deals,
        'updated': datetime.now(timezone.utc).isoformat(),
        'count': total_count
    }
    try:
        with open(DEALS_CACHE_FILE, 'w') as f:
            json.dump(cache_data, f, ensure_ascii=False)
    except Exception as e:
        print(f'[NutriFood] Deals cache file write error: {e}')
    # Also update in-memory
    DEALS_CACHE = all_deals
    DEALS_CACHE_TIME = datetime.now(timezone.utc)
    print(f'[NutriFood] Deals cache refreshed: {total_count} deals across {len(all_deals)} foods')
    return total_count


def _refresh_deals_thread():
    """Background thread wrapper for refresh_deals_cache."""
    global DEALS_BUILDING
    try:
        refresh_deals_cache()
    except Exception as e:
        print(f'[NutriFood] Background deals refresh failed: {e}')
    finally:
        DEALS_BUILDING = False
        # Remove lock file
        try:
            if os.path.exists(DEALS_LOCK_FILE):
                os.remove(DEALS_LOCK_FILE)
        except Exception:
            pass


def load_deals_from_file():
    """Load deals cache from file (shared across workers)."""
    global DEALS_CACHE, DEALS_CACHE_TIME
    try:
        if os.path.exists(DEALS_CACHE_FILE):
            mtime = os.path.getmtime(DEALS_CACHE_FILE)
            file_age = (datetime.now(timezone.utc) - datetime.fromtimestamp(mtime, tz=timezone.utc)).total_seconds()
            if file_age <= DEALS_CACHE_TTL:
                with open(DEALS_CACHE_FILE, 'r') as f:
                    data = json.load(f)
                DEALS_CACHE = data.get('deals', {})
                DEALS_CACHE_TIME = datetime.fromisoformat(data['updated'])
                return True
    except Exception as e:
        print(f'[NutriFood] Deals cache file read error: {e}')
    return False


def trigger_deals_refresh_async():
    """Start background refresh if not already running."""
    global DEALS_BUILDING
    if DEALS_BUILDING:
        return False
    # Check file lock (cross-worker)
    if os.path.exists(DEALS_LOCK_FILE):
        try:
            lock_age = (datetime.now(timezone.utc) - datetime.fromtimestamp(os.path.getmtime(DEALS_LOCK_FILE), tz=timezone.utc)).total_seconds()
            if lock_age < 300:  # Lock valid for 5 min
                return False
        except Exception:
            pass
    try:
        with open(DEALS_LOCK_FILE, 'w') as f:
            f.write(datetime.now(timezone.utc).isoformat())
    except Exception:
        pass
    DEALS_BUILDING = True
    t = threading.Thread(target=_refresh_deals_thread, daemon=True)
    t.start()
    return True

@app.route('/api/deals', methods=['GET'])
def get_deals():
    global DEALS_CACHE, DEALS_CACHE_TIME
    now = datetime.now(timezone.utc)

    # Try loading from file first (cross-worker cache)
    if DEALS_CACHE is None:
        load_deals_from_file()

    cache_expired = (
        DEALS_CACHE is None
        or DEALS_CACHE_TIME is None
        or (now - DEALS_CACHE_TIME).total_seconds() > DEALS_CACHE_TTL
    )
    warning = None
    if cache_expired:
        started = trigger_deals_refresh_async()
        if DEALS_CACHE is None:
            # No cache yet, building in background
            return jsonify({
                'deals': {},
                'stores': STORE_META,
                'updated': None,
                'count': 0,
                'building': True,
            })
    count = sum(len(v) for v in (DEALS_CACHE or {}).values())
    resp = {
        'deals': DEALS_CACHE or {},
        'stores': STORE_META,
        'updated': DEALS_CACHE_TIME.isoformat() if DEALS_CACHE_TIME else None,
        'count': count,
    }
    if warning:
        resp['warning'] = warning
    return jsonify(resp)

@app.route('/api/deals/refresh', methods=['POST'])
def force_refresh_deals():
    user = get_auth_user()
    if not user or not user['is_admin']:
        return jsonify({'error': 'Accès refusé'}), 403
    started = trigger_deals_refresh_async()
    if not started:
        return jsonify({'status': 'ok', 'count': sum(len(v) for v in (DEALS_CACHE or {}).values()), 'updated': DEALS_CACHE_TIME.isoformat() if DEALS_CACHE_TIME else None, 'message': 'Refresh déjà en cours'})
    return jsonify({'status': 'ok', 'message': 'Refresh lancé en arrière-plan'})

# ─── Journal ───

@app.route('/api/journal', methods=['GET'])
def get_journal():
    user = get_auth_user()
    if not user:
        return jsonify({'error': 'Non autorisé'}), 401

    journal_date = request.args.get('date')
    if not journal_date:
        journal_date = date.today().isoformat()

    db = get_db()
    rows = db.execute(
        'SELECT date, food_name, cat_id, qty, nutrition, created_at FROM journal_entries WHERE user_id = ? AND date = ? ORDER BY created_at',
        (user['id'], journal_date)
    ).fetchall()

    entries = []
    for row in rows:
        entry = {
            'date': row['date'],
            'food_name': row['food_name'],
            'cat_id': row['cat_id'],
            'qty': row['qty'],
            'nutrition': json.loads(row['nutrition']) if row['nutrition'] else None,
            'created_at': row['created_at']
        }
        entries.append(entry)

    return jsonify({'entries': entries, 'date': journal_date})


@app.route('/api/journal', methods=['POST'])
def save_journal_entry():
    user = get_auth_user()
    if not user:
        return jsonify({'error': 'Non autorisé'}), 401

    data = request.get_json() or {}
    journal_date = (data.get('date') or '').strip()
    food_name = (data.get('food_name') or '').strip()
    cat_id = data.get('cat_id')
    qty = data.get('qty', 1)
    nutrition = data.get('nutrition')

    if not journal_date or not food_name:
        return jsonify({'error': 'Date et nom d\'aliment requis'}), 400

    try:
        qty = int(qty)
        if qty < 1:
            qty = 1
    except (ValueError, TypeError):
        qty = 1

    nutrition_json = json.dumps(nutrition) if nutrition else None

    db = get_db()
    # Upsert: if (user_id, date, food_name) exists, update qty
    if cat_id:
        db.execute(
            '''INSERT INTO journal_entries (user_id, date, food_name, cat_id, qty, nutrition)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(user_id, date, food_name) DO UPDATE SET
               qty = excluded.qty, cat_id = excluded.cat_id, nutrition = excluded.nutrition''',
            (user['id'], journal_date, food_name, cat_id, qty, nutrition_json)
        )
    else:
        db.execute(
            '''INSERT INTO journal_entries (user_id, date, food_name, cat_id, qty, nutrition)
               VALUES (?, ?, ?, NULL, ?, ?)
               ON CONFLICT(user_id, date, food_name) DO UPDATE SET
               qty = excluded.qty, nutrition = excluded.nutrition''',
            (user['id'], journal_date, food_name, qty, nutrition_json)
        )
    db.commit()

    # Return the updated entry
    row = db.execute(
        'SELECT date, food_name, cat_id, qty, nutrition, created_at FROM journal_entries WHERE user_id = ? AND date = ? AND food_name = ?',
        (user['id'], journal_date, food_name)
    ).fetchone()

    return jsonify({
        'entry': {
            'date': row['date'],
            'food_name': row['food_name'],
            'cat_id': row['cat_id'],
            'qty': row['qty'],
            'nutrition': json.loads(row['nutrition']) if row['nutrition'] else None,
            'created_at': row['created_at']
        }
    })


@app.route('/api/journal', methods=['DELETE'])
def delete_journal_entry():
    user = get_auth_user()
    if not user:
        return jsonify({'error': 'Non autorisé'}), 401

    data = request.get_json() or {}
    journal_date = (data.get('date') or '').strip()
    food_name = (data.get('food_name') or '').strip()

    if not journal_date or not food_name:
        return jsonify({'error': 'Date et nom d\'aliment requis'}), 400

    db = get_db()
    db.execute(
        'DELETE FROM journal_entries WHERE user_id = ? AND date = ? AND food_name = ?',
        (user['id'], journal_date, food_name)
    )
    db.commit()

    return jsonify({'status': 'ok'})


@app.route('/api/journal/summary', methods=['GET'])
def journal_summary():
    user = get_auth_user()
    if not user:
        return jsonify({'error': 'Non autorisé'}), 401

    try:
        days = int(request.args.get('days', 7))
    except (ValueError, TypeError):
        days = 7
    days = max(1, min(days, 30))

    today = date.today()
    date_list = [(today - timedelta(days=i)).isoformat() for i in range(days)]

    db = get_db()
    result_days = []
    avg_totals = {'protein': 0, 'fiber': 0, 'iron': 0, 'vitamin_c': 0, 'calcium': 0, 'omega3': 0}
    days_with_entries = 0

    for d in date_list:
        rows = db.execute(
            'SELECT date, food_name, cat_id, qty, nutrition, created_at FROM journal_entries WHERE user_id = ? AND date = ? ORDER BY created_at',
            (user['id'], d)
        ).fetchall()

        entries = []
        day_totals = {'protein': 0, 'fiber': 0, 'iron': 0, 'vitamin_c': 0, 'calcium': 0, 'omega3': 0}

        for row in rows:
            nutrition = json.loads(row['nutrition']) if row['nutrition'] else {}
            qty = row['qty'] or 1
            entry = {
                'date': row['date'],
                'food_name': row['food_name'],
                'cat_id': row['cat_id'],
                'qty': qty,
                'nutrition': nutrition,
                'created_at': row['created_at']
            }
            entries.append(entry)

            # Accumulate totals
            day_totals['protein'] += nutrition.get('protein', 0) * qty
            day_totals['fiber'] += nutrition.get('fiber', 0) * qty
            day_totals['iron'] += nutrition.get('iron', 0) * qty
            day_totals['vitamin_c'] += nutrition.get('vit_c', 0) * qty
            day_totals['calcium'] += nutrition.get('calcium', 0) * qty
            day_totals['omega3'] += nutrition.get('omega3', 0) * qty

        result_days.append({
            'date': d,
            'entries': entries,
            'totals': {k: round(v, 2) for k, v in day_totals.items()}
        })

        if entries:
            days_with_entries += 1
            for k in avg_totals:
                avg_totals[k] += day_totals[k]

    # Average over days with entries (or all days if none)
    divisor = days_with_entries if days_with_entries > 0 else days
    for k in avg_totals:
        avg_totals[k] = round(avg_totals[k] / divisor, 2)

    return jsonify({'days': result_days, 'avg_totals': avg_totals})


# Initialize DB on import
init_db()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
