"""Auth blueprint: register, login, me, change-password, forgot/reset-password, JWT helpers."""
import hashlib
import secrets
from datetime import datetime, timezone, timedelta
import jwt as pyjwt
from flask import Blueprint, request, jsonify, make_response

from extensions import (
    get_db, EMAIL_RE,
    ERR_UNAUTHORIZED, ERR_RATE_LIMIT, SQL_TOKEN_VERSION,
    check_rate_limit, get_client_ip,
)
import extensions as _ext
from utils.email import send_welcome_email, send_reset_email

bp = Blueprint('auth', __name__)

# ─── Cookie helper ───
COOKIE_NAME = 'nutrifood_token'
COOKIE_MAX_AGE = 2160 * 3600  # 90 days, matches JWT_EXPIRY_HOURS


import hmac

CSRF_COOKIE_NAME = 'nf_csrf_token'


def _generate_csrf_token():
    """Generate a random CSRF token for the double-submit cookie pattern."""
    return secrets.token_urlsafe(32)


def _set_csrf_cookie(response, token=None):
    """Set the CSRF cookie (readable by JS, sent on every request)."""
    if token is None:
        token = _generate_csrf_token()
    response.set_cookie(
        CSRF_COOKIE_NAME, token,
        max_age=COOKIE_MAX_AGE,
        httponly=False,  # JS must read this to send it back in header
        secure=True,
        samesite='Strict',
        path='/'
    )
    return response


def _verify_csrf():
    """Verify CSRF token using double-submit cookie pattern.
    Compares the X-CSRF-Token header against the nf_csrf_token cookie.
    Only applied to mutating methods (POST, PUT, DELETE, PATCH)."""
    method = request.method.upper()
    if method in ('GET', 'HEAD', 'OPTIONS'):
        return True
    cookie_token = request.cookies.get(CSRF_COOKIE_NAME)
    header_token = request.headers.get('X-CSRF-Token')
    if not cookie_token or not header_token:
        return False
    return hmac.compare_digest(cookie_token, header_token)

def _set_auth_cookie(response, token):
    """Set httpOnly cookie for progressive JWT migration."""
    response.set_cookie(
        COOKIE_NAME, token,
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        secure=True,
        samesite='Strict',
        path='/'
    )
    return response


CSRF_COOKIE_NAME = 'nf_csrf_token'

def _set_csrf_cookie(response):
    """Set CSRF cookie for double-submit pattern (readable by JS)."""
    csrf_token = secrets.token_urlsafe(32)
    response.set_cookie(
        CSRF_COOKIE_NAME, csrf_token,
        max_age=COOKIE_MAX_AGE,
        httponly=False,  # JS needs to read this
        secure=True,
        samesite='Lax',  # Lax so it's sent on same-site navigations
        path='/'
    )
    return response


@bp.before_app_request
def _validate_csrf():
    """Validate CSRF token on mutating requests (double-submit cookie pattern)."""
    if request.method in ('GET', 'HEAD', 'OPTIONS'):
        return
    # Only validate for authenticated API routes
    if not request.path.startswith('/nutri-food/api/'):
        return
    cookie_token = request.cookies.get(CSRF_COOKIE_NAME)
    header_token = request.headers.get('X-CSRF-Token')
    if not cookie_token or not header_token:
        return jsonify({'error': 'Token CSRF manquant'}), 403
    if not secrets.compare_digest(cookie_token, header_token):
        return jsonify({'error': 'Token CSRF invalide'}), 403

# ─── Auth helpers ───


def hash_password(password, salt):
    return hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000).hex()


def make_token(user_id, email, token_version=0):
    payload = {
        'uid': user_id,
        'email': email,
        'exp': datetime.now(timezone.utc) + timedelta(hours=_ext.JWT_EXPIRY_HOURS),
        'tv': token_version
    }
    return pyjwt.encode(payload, _ext.JWT_SECRET, algorithm='HS256')


def verify_token(token):
    if not token:
        return None
    try:
        payload = pyjwt.decode(token, _ext.JWT_SECRET, algorithms=['HS256'])
        # Check token_version against DB to invalidate old tokens after password change
        db = get_db()
        user = db.execute(SQL_TOKEN_VERSION, (payload.get('uid'),)).fetchone()
        if not user or payload.get('tv', 0) != user['token_version']:
            return None
        return payload
    except pyjwt.ExpiredSignatureError:
        return None
    except pyjwt.InvalidTokenError:
        return None
    except Exception:
        return None


def get_auth_user():
    # Check Bearer header first (backward compat), fall back to httpOnly cookie
    auth = request.headers.get('Authorization', '')
    if auth.startswith('Bearer '):
        token = auth[7:]
    else:
        token = request.cookies.get('nutrifood_token')
    if not token:
        return None
    payload = verify_token(token)
    if not payload:
        return None
    db = get_db()
    user = db.execute('SELECT id, email, name, is_admin FROM users WHERE id = ?', (payload['uid'],)).fetchone()
    return user

# ─── Routes ───

@bp.route('/api/health', methods=['GET'])
def health():
    from utils.foods_helpers import get_deals_health_info
    deals_info = get_deals_health_info()
    return jsonify({
        'status': 'ok',
        'service': 'nutrifood-api',
        **deals_info,
    })


@bp.route('/api/logout', methods=['POST'])
def logout():
    """Clear auth and CSRF cookies on logout."""
    resp = make_response(jsonify({'status': 'ok'}))
    resp.delete_cookie(COOKIE_NAME, path='/')
    resp.delete_cookie(CSRF_COOKIE_NAME, path='/')
    return resp


@bp.route('/api/register', methods=['POST'])
def register():
    if not check_rate_limit(get_client_ip() + ':register'):
        return jsonify({'error': ERR_RATE_LIMIT}), 429
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
    resp = make_response(jsonify({
        'token': token,
        'user': {'id': cursor.lastrowid, 'email': email, 'name': name, 'is_admin': 0}
    }), 201)
    _set_csrf_cookie(resp)
    resp = _set_auth_cookie(resp, token)
    return _set_csrf_cookie(resp)


@bp.route('/api/login', methods=['POST'])
def login():
    if not check_rate_limit(get_client_ip() + ':login'):
        return jsonify({'error': ERR_RATE_LIMIT}), 429
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
    resp = make_response(jsonify({
        'token': token,
        'user': {'id': user['id'], 'email': user['email'], 'name': user['name'], 'is_admin': user['is_admin']}
    }))
    _set_csrf_cookie(resp)
    resp = _set_auth_cookie(resp, token)
    return _set_csrf_cookie(resp)


@bp.route('/api/me', methods=['GET'])
def me():
    user = get_auth_user()
    if not user:
        return jsonify({'error': ERR_UNAUTHORIZED}), 401
    return jsonify({
        'user': {'id': user['id'], 'email': user['email'], 'name': user['name'], 'is_admin': user['is_admin']}
    })





@bp.route('/api/forgot-password', methods=['POST'])
def forgot_password():
    if not check_rate_limit(get_client_ip() + ':forgot-password'):
        return jsonify({'error': ERR_RATE_LIMIT}), 429
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


@bp.route('/api/reset-password', methods=['POST'])
def reset_password():
    if not check_rate_limit(get_client_ip() + ':reset-password'):
        return jsonify({'error': ERR_RATE_LIMIT}), 429
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
    new_version = db.execute(SQL_TOKEN_VERSION, (user['id'],)).fetchone()['token_version']
    token = make_token(user['id'], user['email'], new_version)
    resp = make_response(jsonify({
        'status': 'ok',
        'token': token,
        'user': {'id': user['id'], 'email': user['email'], 'name': user['name']}
    }))
    _set_csrf_cookie(resp)
    resp = _set_auth_cookie(resp, token)
    return _set_csrf_cookie(resp)


@bp.route('/api/change-password', methods=['POST'])
def change_password():
    user = get_auth_user()
    if not user:
        return jsonify({'error': ERR_UNAUTHORIZED}), 401

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
    new_version = db.execute(SQL_TOKEN_VERSION, (user['id'],)).fetchone()['token_version']
    token = make_token(user['id'], user['email'], new_version)
    resp = make_response(jsonify({'status': 'ok', 'token': token}))
    _set_csrf_cookie(resp)
    resp = _set_auth_cookie(resp, token)
    return _set_csrf_cookie(resp)
