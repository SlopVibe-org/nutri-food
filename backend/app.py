import hmac
import os
import json
import sqlite3
import hashlib
import secrets
import time
import base64
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, g
from flask_cors import CORS

app = Flask(__name__)
CORS(app, origins=[
    "https://slopvibe.org",
    "http://localhost:*",
    "http://127.0.0.1:*"
])

DB_PATH = os.environ.get('DB_PATH', '/data/nutrifood.db')
JWT_SECRET = os.environ.get('JWT_SECRET', secrets.token_hex(32))
JWT_EXPIRY_HOURS = int(os.environ.get('JWT_EXPIRY_HOURS', '2160'))  # 90 days default

# Email config
SMTP_HOST = os.environ.get('SMTP_HOST', 'smtp.fastmail.com')
SMTP_PORT = int(os.environ.get('SMTP_PORT', '465'))
SMTP_USER = os.environ.get('SMTP_USER', 'ai@slopvibe.org')
SMTP_PASS = os.environ.get('SMTP_PASS', '3q6q6a76769d6r5c')
MAIL_FROM = os.environ.get('MAIL_FROM', 'ai@slopvibe.org')
APP_URL = os.environ.get('APP_URL', 'https://slopvibe.org/nutri-food/')

# ─── Email ───

def send_welcome_email(to_email, name):
    msg = MIMEMultipart('alternative')
    msg['From'] = 'NutriFood <ai@slopvibe.org>'
    msg['To'] = to_email
    msg['Subject'] = 'Bienvenue sur NutriFood! 🍎'

    html = f'''\
<div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 500px; margin: 0 auto; background: #0f1117; color: #e4e4e7; padding: 32px; border-radius: 12px;">
  <h1 style="color: #4ade80; margin-bottom: 8px;">🍎 Bienvenue sur NutriFood!</h1>
  <p style="color: #94a3b8; font-size: 1.05rem;">Bonjour {name},</p>
  <p style="color: #e4e4e7;">Votre compte a été créé avec succès. Vous pouvez maintenant planifier votre semaine nutritionnelle.</p>
  <div style="margin: 24px 0;">
    <a href="{APP_URL}" style="display: inline-block; padding: 12px 28px; background: #22c55e; color: #0f1117; text-decoration: none; border-radius: 8px; font-weight: 700;">Commencer →</a>
  </div>
  <p style="color: #94a3b8; font-size: 0.85rem; margin-top: 24px;">NutriFood — slopvibe.org</p>
</div>'''

    text = f"Bienvenue sur NutriFood!\n\nBonjour {name},\n\nVotre compte a été créé avec succès.\n\nCommencez ici: {APP_URL}\n\nNutriFood — slopvibe.org"

    msg.attach(MIMEText(text, 'plain'))
    msg.attach(MIMEText(html, 'html'))

    try:
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT) as server:
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(MAIL_FROM, to_email, msg.as_string())
        print(f'[NutriFood] Welcome email sent to {to_email}')
        return True
    except Exception as e:
        print(f'[NutriFood] Email error: {e}')
        return False

# ─── Database ───

def get_db():
    if 'db' not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute('PRAGMA journal_mode=WAL')
    return g.db

@app.teardown_appcontext
def close_db(error):
    db = g.pop('db', None)
    if db is not None:
        db.close()

def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.executescript('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
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
    ''')
    conn.commit()
    conn.close()

# ─── Auth helpers ───

def hash_password(password, salt):
    return hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000).hex()

def make_token(user_id, email):
    payload = {
        'uid': user_id,
        'email': email,
        'exp': int(time.time()) + (JWT_EXPIRY_HOURS * 3600)
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
    user = db.execute('SELECT id, email, name FROM users WHERE id = ?', (payload['uid'],)).fetchone()
    return user

# ─── Routes ───

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'service': 'nutrifood-api'})

@app.route('/api/register', methods=['POST'])
def register():
    data = request.get_json() or {}
    email = (data.get('email') or '').strip().lower()
    name = (data.get('name') or '').strip()
    password = data.get('password') or ''

    if not email or not name or not password:
        return jsonify({'error': 'Email, nom et mot de passe requis'}), 400
    if len(password) < 6:
        return jsonify({'error': 'Le mot de passe doit faire au moins 6 caractères'}), 400
    if '@' not in email:
        return jsonify({'error': 'Email invalide'}), 400

    db = get_db()
    existing = db.execute('SELECT id FROM users WHERE email = ?', (email,)).fetchone()
    if existing:
        return jsonify({'error': 'Cet email est déjà inscrit'}), 409

    salt = secrets.token_hex(16)
    pw_hash = hash_password(password, salt)
    
    cursor = db.execute(
        'INSERT INTO users (email, name, password_hash, salt) VALUES (?, ?, ?, ?)',
        (email, name, pw_hash, salt)
    )
    db.execute('INSERT INTO selections (user_id, data) VALUES (?, ?)', (cursor.lastrowid, '{}'))
    db.commit()

    # Send welcome email (async-safe: just log on failure)
    send_welcome_email(email, name)

    token = make_token(cursor.lastrowid, email)
    return jsonify({
        'token': token,
        'user': {'id': cursor.lastrowid, 'email': email, 'name': name}
    }), 201

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    identifier = (data.get('email') or data.get('identifier') or '').strip()
    password = data.get('password') or ''

    if not identifier or not password:
        return jsonify({'error': 'Identifiant et mot de passe requis'}), 400

    db = get_db()
    # Login by email or by name (case-insensitive)
    user = db.execute('SELECT * FROM users WHERE email = ? OR LOWER(name) = ?', (identifier.lower(), identifier.lower())).fetchone()
    if not user:
        return jsonify({'error': 'Email ou mot de passe incorrect'}), 401

    pw_hash = hash_password(password, user['salt'])
    if not secrets.compare_digest(pw_hash, user['password_hash']):
        return jsonify({'error': 'Email ou mot de passe incorrect'}), 401

    token = make_token(user['id'], user['email'])
    return jsonify({
        'token': token,
        'user': {'id': user['id'], 'email': user['email'], 'name': user['name']}
    })

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
    db.commit()

    return jsonify({'status': 'saved', 'updated_at': datetime.utcnow().isoformat()})

@app.route('/api/me', methods=['GET'])
def me():
    user = get_auth_user()
    if not user:
        return jsonify({'error': 'Non autorisé'}), 401
    return jsonify({
        'user': {'id': user['id'], 'email': user['email'], 'name': user['name']}
    })

# Initialize DB on import (works with gunicorn)
init_db()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
