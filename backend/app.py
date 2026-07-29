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
JWT_EXPIRY_HOURS = int(os.environ.get('JWT_EXPIRY_HOURS', '2160'))
SMTP_HOST = os.environ.get('SMTP_HOST', 'smtp.fastmail.com')
SMTP_PORT = int(os.environ.get('SMTP_PORT', '465'))
SMTP_USER = os.environ.get('SMTP_USER', 'ai@slopvibe.org')
SMTP_PASS = os.environ.get('SMTP_PASS', '3q6q6a76769d6r5c')
MAIL_FROM = os.environ.get('MAIL_FROM', 'ai@slopvibe.org')
APP_URL = os.environ.get('APP_URL', 'https://slopvibe.org/nutri-food/')

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
            is_admin INTEGER DEFAULT 0,
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
    user = db.execute('SELECT id, email, name, is_admin FROM users WHERE id = ?', (payload['uid'],)).fetchone()
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

    send_welcome_email(email, name)

    token = make_token(cursor.lastrowid, email)
    return jsonify({
        'token': token,
        'user': {'id': cursor.lastrowid, 'email': email, 'name': name, 'is_admin': 0}
    }), 201

@app.route('/api/login', methods=['POST'])
def login():
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

    token = make_token(user['id'], user['email'])
    return jsonify({
        'token': token,
        'user': {'id': user['id'], 'email': user['email'], 'name': user['name'], 'is_admin': user['is_admin']}
    })

# ─── Admin: edit foods ───

FOODS_PATH = os.environ.get('FOODS_PATH', '/data/foods.json')

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

# ─── Password reset ───

@app.route('/api/forgot-password', methods=['POST'])
def forgot_password():
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
    expires_at = datetime.utcnow() + timedelta(hours=1)
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
    if datetime.utcnow() > expires_at:
        return jsonify({'error': 'Ce lien a expiré'}), 400

    # Get user and update password
    user = db.execute('SELECT * FROM users WHERE id = ?', (row['user_id'],)).fetchone()
    if not user:
        return jsonify({'error': 'Utilisateur introuvable'}), 400

    new_salt = secrets.token_hex(16)
    new_hash = hash_password(new_password, new_salt)
    db.execute(
        'UPDATE users SET password_hash = ?, salt = ?, updated_at = datetime(\'now\') WHERE id = ?',
        (new_hash, new_salt, user['id'])
    )
    db.execute('UPDATE reset_tokens SET used = 1 WHERE id = ?', (row['id'],))
    db.commit()

    # Issue new login token
    token = make_token(user['id'], user['email'])
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
        'UPDATE users SET password_hash = ?, salt = ?, updated_at = datetime(\'now\') WHERE id = ?',
        (new_hash, new_salt, user['id'])
    )
    db.commit()

    return jsonify({'status': 'ok'})

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
    db.commit()

    return jsonify({'status': 'saved', 'updated_at': datetime.utcnow().isoformat()})

# ─── Share link ───

@app.route('/api/share', methods=['POST'])
def create_share():
    user = get_auth_user()
    if not user:
        return jsonify({'error': 'Non autorisé'}), 401

    share_token = secrets.token_urlsafe(16)
    db = get_db()
    # Store share token in a simple table
    db.execute('''CREATE TABLE IF NOT EXISTS share_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token TEXT UNIQUE NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )''')
    db.execute('INSERT OR REPLACE INTO share_links (user_id, token) VALUES (?, ?)', (user['id'], share_token))
    db.commit()

    return jsonify({'share_url': f'{APP_URL}#share={share_token}', 'token': share_token})

@app.route('/api/shared/<token>', methods=['GET'])
def get_shared(token):
    db = get_db()
    db.execute('''CREATE TABLE IF NOT EXISTS share_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token TEXT UNIQUE NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )''')
    row = db.execute('SELECT user_id FROM share_links WHERE token = ?', (token,)).fetchone()
    if not row:
        return jsonify({'error': 'Lien invalide'}), 404

    sel = db.execute('SELECT data FROM selections WHERE user_id = ?', (row['user_id'],)).fetchone()
    user = db.execute('SELECT name FROM users WHERE id = ?', (row['user_id'],)).fetchone()

    selections_data = json.loads(sel['data']) if sel else {}

    # Build grocery list from selections
    grocery = []
    foods_data = {}
    try:
        with open(FOODS_PATH, 'r') as f:
            foods_data = json.load(f)
    except:
        pass

    import datetime
    current_month = datetime.datetime.now().month

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

# Initialize DB on import
init_db()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
