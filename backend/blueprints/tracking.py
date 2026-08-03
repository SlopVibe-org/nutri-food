"""Tracking blueprint: /api/tracking/*, /api/goals, /api/nutrition-summary."""
import json
from datetime import date, timedelta
from flask import Blueprint, request, jsonify

from extensions import get_db, ERR_UNAUTHORIZED, SQL_SELECTIONS
from blueprints.auth import get_auth_user
from utils.foods_helpers import load_foods
from utils.nutrition import (
    compute_nutrition_totals, compute_totals_from_selections,
    get_user_targets, DEFAULT_TARGETS,
)

bp = Blueprint('tracking', __name__)


@bp.route('/api/nutrition-summary', methods=['GET'])
def nutrition_summary():
    user = get_auth_user()
    if not user:
        return jsonify({'error': ERR_UNAUTHORIZED}), 401

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


@bp.route('/api/tracking/<date>', methods=['GET'])
def get_tracking(date):
    user = get_auth_user()
    if not user:
        return jsonify({'error': ERR_UNAUTHORIZED}), 401
    db = get_db()
    row = db.execute('SELECT data FROM tracking WHERE user_id = ? AND date = ?', (user["id"], date)).fetchone()
    data = json.loads(row['data']) if row and row['data'] else {}
    return jsonify({"date": date, 'selections': data})


@bp.route('/api/tracking/<date>', methods=['POST'])
def save_tracking(date):
    user = get_auth_user()
    if not user:
        return jsonify({'error': ERR_UNAUTHORIZED}), 401
    data = request.get_json() or {}
    selections_data = data.get('selections', {})
    db = get_db()
    db.execute('''INSERT INTO tracking (user_id, date, data, updated_at) VALUES (?, ?, ?, datetime('now'))
                 ON CONFLICT(user_id, date) DO UPDATE SET data = excluded.data, updated_at = datetime('now')''',
              (user['id'], date, json.dumps(selections_data)))
    db.commit()
    return jsonify({'ok': True})


@bp.route('/api/tracking/week', methods=['GET'])
def get_tracking_week():
    """Get all tracking entries for current week (Mon-Sun)."""
    user = get_auth_user()
    if not user:
        return jsonify({'error': ERR_UNAUTHORIZED}), 401
    today = date.today()
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)
    db = get_db()
    rows = db.execute('SELECT date, data FROM tracking WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date',
                      (user['id'], monday.isoformat(), sunday.isoformat())).fetchall()
    week = {}
    for row in rows:
        week[row['date']] = json.loads(row['data']) if row['data'] else {}
    return jsonify({'week_start': monday.isoformat(), 'week_end': sunday.isoformat(), 'days': week})


@bp.route('/api/tracking/nutrition/<date>', methods=['GET'])
def tracking_nutrition(date):
    """Get nutrition totals for a specific tracking day + week cumulative."""
    from datetime import date as _date
    user = get_auth_user()
    if not user:
        return jsonify({'error': ERR_UNAUTHORIZED}), 401
    foods_data = load_foods()
    categories = foods_data.get('categories', [])

    # Get this day's selections
    db = get_db()
    row = db.execute('SELECT data FROM tracking WHERE user_id = ? AND date = ?', (user["id"], date)).fetchone()
    day_selections = json.loads(row['data']) if row and row['data'] else {}

    # Compute day totals
    day_totals = compute_totals_from_selections(day_selections, categories)

    # Get week cumulative
    try:
        day_date = _date.fromisoformat(date)
    except ValueError:
        day_date = _date.today()
    monday = day_date - timedelta(days=day_date.weekday())
    week_rows = db.execute('SELECT date, data FROM tracking WHERE user_id = ? AND date >= ? AND date <= ?',
                           (user['id'], monday.isoformat(), date)).fetchall()
    week_totals = {'protein': 0, 'fiber': 0, 'iron': 0, 'vitamin_c': 0, 'calcium': 0, 'omega3': 0, 'calories': 0}
    for wr in week_rows:
        wr_data = json.loads(wr['data']) if wr['data'] else {}
        wt = compute_totals_from_selections(wr_data, categories)
        for k in week_totals:
            week_totals[k] += wt.get(k, 0)

    targets = get_user_targets(user['id'])
    return jsonify({"date": date, 'day_totals': {k: round(v, 2) for k, v in day_totals.items()},
                    'week_totals': {k: round(v, 2) for k, v in week_totals.items()}, 'targets': targets})


@bp.route('/api/tracking/<date>', methods=['DELETE'])
def delete_tracking(date):
    user = get_auth_user()
    if not user:
        return jsonify({'error': ERR_UNAUTHORIZED}), 401
    db = get_db()
    db.execute('DELETE FROM tracking WHERE user_id = ? AND date = ?', (user['id'], date))
    db.commit()
    return jsonify({'ok': True})


@bp.route('/api/tracking/week', methods=['DELETE'])
def delete_tracking_week():
    """Delete all tracking entries for current week (Mon-Sun)."""
    user = get_auth_user()
    if not user:
        return jsonify({'error': ERR_UNAUTHORIZED}), 401
    today = date.today()
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)
    db = get_db()
    db.execute('DELETE FROM tracking WHERE user_id = ? AND date >= ? AND date <= ?',
               (user['id'], monday.isoformat(), sunday.isoformat()))
    db.commit()
    return jsonify({'ok': True, 'week_start': monday.isoformat(), 'week_end': sunday.isoformat()})


@bp.route('/api/goals', methods=['GET'])
def get_goals():
    user = get_auth_user()
    if not user:
        return jsonify({'error': ERR_UNAUTHORIZED}), 401
    targets = get_user_targets(user['id'])
    return jsonify({'goals': targets})


@bp.route('/api/goals', methods=['POST'])
def update_goals():
    user = get_auth_user()
    if not user:
        return jsonify({'error': ERR_UNAUTHORIZED}), 401

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
