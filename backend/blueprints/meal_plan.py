"""Meal plan blueprint: /api/meal-plan/*."""
import json
from flask import Blueprint, request, jsonify

from extensions import get_db, ERR_UNAUTHORIZED
from blueprints.auth import get_auth_user
from blueprints.selections import get_week_key

bp = Blueprint('meal_plan', __name__)


@bp.route('/api/meal-plan', methods=['GET'])
def get_meal_plan():
    user = get_auth_user()
    if not user:
        return jsonify({'error': ERR_UNAUTHORIZED}), 401

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


@bp.route('/api/meal-plan', methods=['POST'])
def save_meal_plan():
    user = get_auth_user()
    if not user:
        return jsonify({'error': ERR_UNAUTHORIZED}), 401

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
