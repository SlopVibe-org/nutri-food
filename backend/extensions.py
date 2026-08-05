"""Shared extensions, constants, and DB helpers for NutriFood."""
import os
import sqlite3
import time
import re
from flask import g, request

# ─── Config ───
DB_PATH = os.environ.get('DB_PATH', '/data/nutrifood.db')
NF_DB_PATH = os.environ.get('NF_DB_PATH', '/data/nutrifood.db')
JWT_SECRET = os.environ.get('JWT_SECRET')
JWT_EXPIRY_HOURS = int(os.environ.get('JWT_EXPIRY_HOURS', '2160'))
SMTP_HOST = os.environ.get('SMTP_HOST', 'smtp.fastmail.com')
SMTP_PORT = int(os.environ.get('SMTP_PORT', '465'))
SMTP_USER = os.environ.get('SMTP_USER', 'ai@slopvibe.org')
SMTP_PASS = os.environ.get('SMTP_PASS', '')
MAIL_FROM = os.environ.get('MAIL_FROM', 'ai@slopvibe.org')
APP_URL = os.environ.get('APP_URL', 'https://slopvibe.org/nutri-food/')

EMAIL_RE = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')

# ─── Error / SQL constants (SonarQube S1192) ───
ERR_UNAUTHORIZED = 'Non autorisé'
ERR_FORBIDDEN = 'Accès refusé'
ERR_RATE_LIMIT = 'Trop de tentatives, réessayez plus tard'
SQL_TOKEN_VERSION = 'SELECT token_version FROM users WHERE id = ?'
SQL_SELECTIONS = 'SELECT data FROM selections WHERE user_id = ?'

# ─── Rate limiting ───
RATE_LIMIT = {}  # key: ip+endpoint, value: [count, first_attempt_time]
RATE_WINDOW = 60  # seconds
RATE_MAX = 10  # requests per window


def get_client_ip():
    """Get real client IP, respecting X-Forwarded-For behind proxies."""
    fwd = request.headers.get('X-Forwarded-For', '')
    if fwd:
        return fwd.split(',')[0].strip()
    return request.remote_addr or 'unknown'


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


# ─── DB helpers ───

def get_db():
    if 'db' not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db


def get_nf_db():
    """Get a connection to the nutrifood DB (for nf_* tables).
    Stored in g during request context; created directly outside request context.
    Caller is responsible for closing outside request context."""
    if g:
        if 'nf_db' not in g:
            g.nf_db = sqlite3.connect(NF_DB_PATH)
            g.nf_db.row_factory = sqlite3.Row
        return g.nf_db
    # Outside request context (background threads)
    db = sqlite3.connect(NF_DB_PATH)
    db.row_factory = sqlite3.Row
    return db


def close_db(error):
    """Teardown handler to close DB connections."""
    db = g.pop('db', None)
    if db is not None:
        db.close()
    nf_db = g.pop('nf_db', None)
    if nf_db is not None:
        nf_db.close()


def reset_rate_limit():
    """Reset rate limit state (used by tests via module reload)."""
    RATE_LIMIT.clear()
