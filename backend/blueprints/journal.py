"""Journal blueprint: /api/journal/*."""
import json
from datetime import date, timedelta
from flask import Blueprint, request, jsonify

from extensions import get_db, ERR_UNAUTHORIZED
from blueprints.auth import get_auth_user
from utils.nutrition import _compute_journal_avg

bp = Blueprint('journal', __name__)


@bp.route('/api/journal', methods=['GET'])
def get_journal():
    user = get_auth_user()
    if not user:
        return jsonify({'error': ERR_UNAUTHORIZED}), 401

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


@bp.route('/api/journal', methods=['POST'])
def save_journal_entry():
    user = get_auth_user()
    if not user:
        return jsonify({'error': ERR_UNAUTHORIZED}), 401

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


@bp.route('/api/journal', methods=['DELETE'])
def delete_journal_entry():
    user = get_auth_user()
    if not user:
        return jsonify({'error': ERR_UNAUTHORIZED}), 401

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


@bp.route('/api/journal/summary', methods=['GET'])
def journal_summary():
    user = get_auth_user()
    if not user:
        return jsonify({'error': ERR_UNAUTHORIZED}), 401

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

    avg_totals = _compute_journal_avg(avg_totals, days_with_entries, days)
    return jsonify({'days': result_days, 'avg_totals': avg_totals})
