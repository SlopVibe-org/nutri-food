"""Foods blueprint: /api/foods, CNF search/check, admin food show/hide/recalculate, seasonal."""
import json
from datetime import date
from flask import Blueprint, request, jsonify

from extensions import get_nf_db, ERR_FORBIDDEN
from utils.foods_helpers import (
    load_foods, _build_section_dict, _build_category_dict,
    _insert_food_nutrients_and_aliases, _save_season_and_deals,
)
from utils.nutrition import calculate_density
from utils.season import lookup_quebec_season
from utils.foods_helpers import load_raw_deals

bp = Blueprint('foods', __name__)

from blueprints.auth import get_auth_user


@bp.route('/api/foods', methods=['GET'])
def get_foods():
    return jsonify(load_foods())


@bp.route('/api/admin/food/show', methods=['POST'])
def admin_show_food():
    user = get_auth_user()
    if not user or not user['is_admin']:
        return jsonify({'error': ERR_FORBIDDEN}), 403
    data = request.get_json() or {}
    source_id = data.get('source_id')
    source_type = data.get('source_type', 1)
    nf_category = data.get('nf_category')
    name = data.get('name')
    density = data.get('density')
    highlights = data.get('highlights', '')
    aliases = data.get('aliases', [])
    if not nf_category:
        return jsonify({'error': 'Catégorie requise'}), 400
    db = get_nf_db()
    existing = db.execute('SELECT id FROM nf_foods WHERE source_type = ? AND source_id = ?', (source_type, source_id)).fetchone()
    if existing:
        db.close()
        return jsonify({'error': 'Cet aliment est déjà affiché'}), 409
    cnf_nutrients = []
    if source_type == 1 and source_id:
        cnf = db.execute('SELECT name_fr, name_en FROM food WHERE food_id = ?', (source_id,)).fetchone()
        if cnf:
            name = name or cnf['name_fr'] or cnf['name_en']
            cnf_nutrients = db.execute('SELECT nutrient_code, amount FROM nutrient_amount WHERE food_id = ?', (source_id,)).fetchall()
    cur = db.cursor()
    if density is None:
        nutrient_map = {nv['nutrient_code']: nv['amount'] for nv in cnf_nutrients} if cnf_nutrients else {}
        density = calculate_density(nutrient_map, nf_category)
    elif density == 0:
        density = 50
    cur.execute('''INSERT INTO nf_foods
        (source_type, source_id, visible, nf_category, density, highlights, name_fr, name_en)
        VALUES (?,?,?,?,?,?,?,?)''',
        (source_type, source_id, 1, nf_category, density, highlights, name, name))
    new_id = cur.lastrowid
    _insert_food_nutrients_and_aliases(cur, new_id, cnf_nutrients, aliases, name)
    db.commit()
    db.close()
    _save_season_and_deals(new_id, name)
    return jsonify({'status': 'ok', 'id': new_id})


@bp.route('/api/admin/food/hide', methods=['POST'])
def admin_hide_food():
    user = get_auth_user()
    if not user or not user['is_admin']:
        return jsonify({'error': ERR_FORBIDDEN}), 403
    data = request.get_json() or {}
    food_id = data.get('id')
    food_name = data.get('name')
    if not food_id and not food_name:
        return jsonify({'error': 'ID ou nom requis'}), 400
    db = get_nf_db()
    if not food_id:
        row = db.execute('SELECT id FROM nf_foods WHERE name_fr = ?', (food_name,)).fetchone()
        if not row:
            db.close()
            return jsonify({'error': 'Aliment introuvable'}), 404
        food_id = row['id']
    # Get food name before deleting (for raw deals cleanup)
    if not food_name:
        row = db.execute('SELECT name_fr FROM nf_foods WHERE id = ?', (food_id,)).fetchone()
        food_name = row['name_fr'] if row else None
    # Delete related rows first (no CASCADE in schema)
    db.execute('DELETE FROM nf_foods_nutrients WHERE nf_food_id = ?', (food_id,))
    db.execute('DELETE FROM nf_foods_aliases WHERE nf_food_id = ?', (food_id,))
    db.execute('DELETE FROM nf_foods WHERE id = ?', (food_id,))
    db.commit()
    db.close()
    # Remove from raw deals file
    if food_name:
        from utils.foods_helpers import remove_from_raw_deals
        remove_from_raw_deals(food_name)
    return jsonify({'status': 'ok'})


@bp.route('/api/admin/recalculate-density', methods=['POST'])
def admin_recalculate_density():
    """Recalculate density for all foods from real nutrient data."""
    user = get_auth_user()
    if not user or not user['is_admin']:
        return jsonify({'error': ERR_FORBIDDEN}), 403
    db = get_nf_db()
    foods = db.execute('SELECT id, nf_category FROM nf_foods').fetchall()
    updated = 0
    for f in foods:
        nuts = db.execute('SELECT nutrient_code, amount FROM nf_foods_nutrients WHERE nf_food_id = ?', (f['id'],)).fetchall()
        if not nuts:
            continue
        nutrient_map = {n['nutrient_code']: n['amount'] for n in nuts}
        new_density = calculate_density(nutrient_map, f['nf_category'])
        db.execute('UPDATE nf_foods SET density = ? WHERE id = ?', (new_density, f['id']))
        updated += 1
    db.commit()
    db.close()
    return jsonify({'status': 'ok', 'updated': updated})


# ─── CNF search (original CNF tables) ───

@bp.route('/api/cnf/search', methods=['GET'])
def cnf_search():
    q = (request.args.get('q') or '').strip()
    if len(q) < 2:
        return jsonify({'error': 'Minimum 2 caractères'}), 400
    db = get_nf_db()
    rows = db.execute(
        '''SELECT f.food_id, f.name_fr, f.name_en, g.name_fr as group_fr,
               (SELECT 1 FROM nf_foods nf WHERE nf.source_type = 1 AND nf.source_id = f.food_id AND nf.visible = 1 LIMIT 1) as already_visible
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


@bp.route('/api/cnf/product/<int:food_id>', methods=['GET'])
def cnf_product(food_id):
    db = get_nf_db()
    food = db.execute('SELECT * FROM food WHERE food_id = ?', (food_id,)).fetchone()
    if not food:
        db.close()
        return jsonify({'error': 'Aliment introuvable'}), 404
    nutrients = db.execute(
        '''SELECT n.name_fr, n.unit, ROUND(na.amount, 2) as amount, n.code
           FROM nutrient_amount na JOIN nutrient_name n ON na.nutrient_code = n.code
           WHERE na.food_id = ? AND na.amount > 0 ORDER BY n.name_fr''',
        (food_id,)
    ).fetchall()
    group = db.execute('SELECT * FROM food_group WHERE code = ?', (food['group_code'],)).fetchone() if food['group_code'] else None
    db.close()
    return jsonify({'food': dict(food), 'group': dict(group) if group else None, 'nutrients': [dict(n) for n in nutrients]})


@bp.route('/api/cnf/check', methods=['GET'])
def cnf_check():
    """Check seasonality and current deals for a food item (preview before adding)."""
    food_name = (request.args.get('name') or '').strip()
    if not food_name:
        return jsonify({'error': 'Nom requis'}), 400
    # Season lookup
    season_info = lookup_quebec_season(food_name)
    current_month = date.today().month
    season_status = 'unknown'
    if season_info:
        local = season_info.get('season', [])
        imp = season_info.get('import', [])
        if local and current_month in local:
            season_status = 'local'
        elif imp and current_month in imp:
            season_status = 'imported'
        else:
            season_status = 'off'
    # Deals lookup from raw file (fast, no scraping)
    raw, _ = load_raw_deals()
    food_deals = []
    if raw and food_name in raw:
        food_deals = raw[food_name][:5]  # max 5 for preview
    return jsonify({
        'season_status': season_status,
        'season': season_info,
        'current_month': current_month,
        'deals': food_deals,
        'deals_count': len(food_deals)
    })


@bp.route('/api/seasonal', methods=['GET'])
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
