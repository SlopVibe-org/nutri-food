"""Selections blueprint: /api/selections CRUD, history, share links."""
import json
import secrets
from datetime import datetime, timezone, timedelta
from flask import Blueprint, request, jsonify

from extensions import get_db, ERR_UNAUTHORIZED, SQL_SELECTIONS
import extensions as _ext
from blueprints.auth import get_auth_user
from utils.foods_helpers import (
    _validate_share_link, _build_grocery_from_selections, load_foods,
)

bp = Blueprint('selections', __name__)


def get_week_key(d=None):
    from datetime import date
    if d is None:
        d = date.today()
    iso = d.isocalendar()
    return f"{iso[0]}-W{iso[1]:02d}"


@bp.route('/api/selections', methods=['GET'])
def get_selections():
    user = get_auth_user()
    if not user:
        return jsonify({'error': ERR_UNAUTHORIZED}), 401

    db = get_db()
    row = db.execute('SELECT data, updated_at FROM selections WHERE user_id = ?', (user['id'],)).fetchone()
    if not row:
        return jsonify({'selections': {}})
    return jsonify({
        'selections': json.loads(row['data']),
        'updated_at': row['updated_at']
    })


@bp.route('/api/selections', methods=['POST'])
def save_selections():
    user = get_auth_user()
    if not user:
        return jsonify({'error': ERR_UNAUTHORIZED}), 401

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


# ─── History ───

@bp.route('/api/history', methods=['GET'])
def get_history():
    user = get_auth_user()
    if not user:
        return jsonify({'error': ERR_UNAUTHORIZED}), 401

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


@bp.route('/api/history/<week_key>', methods=['GET'])
def get_history_detail(week_key):
    user = get_auth_user()
    if not user:
        return jsonify({'error': ERR_UNAUTHORIZED}), 401

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

@bp.route('/api/share', methods=['POST'])
def create_share():
    user = get_auth_user()
    if not user:
        return jsonify({'error': ERR_UNAUTHORIZED}), 401

    share_token = secrets.token_urlsafe(16)
    expires_at = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    db = get_db()
    db.execute('INSERT OR REPLACE INTO share_links (user_id, token, expires_at) VALUES (?, ?, ?)', (user['id'], share_token, expires_at))
    db.commit()

    return jsonify({'share_url': f'{_ext.APP_URL}#share={share_token}', 'token': share_token, 'expires_at': expires_at})


@bp.route('/api/shared/<token>', methods=['GET'])
def get_shared(token):
    db = get_db()
    user_id, err = _validate_share_link(db, token)
    if err:
        return err

    sel = db.execute(SQL_SELECTIONS, (user_id,)).fetchone()
    user = db.execute('SELECT name FROM users WHERE id = ?', (user_id,)).fetchone()

    selections_data = json.loads(sel['data']) if sel else {}
    foods_data = load_foods()
    grocery = _build_grocery_from_selections(selections_data, foods_data)

    return jsonify({
        'grocery': grocery,
        'user_name': user['name'] if user else 'Inconnu'
    })
