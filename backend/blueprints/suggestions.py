"""Suggestions blueprint: /api/suggestions, nutrient gap computation."""
import json
from flask import Blueprint, jsonify

from extensions import get_db, ERR_UNAUTHORIZED, SQL_SELECTIONS
from blueprints.auth import get_auth_user
from utils.foods_helpers import load_foods, _compute_nutrient_gaps, _find_suggestion_foods
from utils.nutrition import compute_nutrition_totals, get_user_targets

bp = Blueprint('suggestions', __name__)


@bp.route('/api/suggestions', methods=['GET'])
def suggestions():
    user = get_auth_user()
    if not user:
        return jsonify({'error': ERR_UNAUTHORIZED}), 401

    foods_data = load_foods()
    totals = compute_nutrition_totals(user['id'], foods_data)
    targets = get_user_targets(user['id'])

    deficient = _compute_nutrient_gaps(totals, targets)

    if not deficient:
        return jsonify({'suggestions': []})

    # Get user's currently selected food names
    db = get_db()
    row = db.execute(SQL_SELECTIONS, (user['id'],)).fetchone()
    selected_names = set()
    if row and row['data']:
        selections_data = json.loads(row['data'])
        for cat_id, items in selections_data.items():
            for item in items:
                selected_names.add(item.get('name', ''))

    all_suggestions = _find_suggestion_foods(deficient, foods_data, selected_names)
    return jsonify({'suggestions': all_suggestions})
