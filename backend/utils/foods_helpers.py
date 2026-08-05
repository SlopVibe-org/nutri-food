"""Food dict builders and CNF-related helpers for NutriFood."""
import json
import re
from extensions import get_nf_db


NUTRIENT_MAP = {
    203: 'protein', 291: 'fiber', 303: 'iron', 401: 'vit_c', 301: 'calcium',
    208: 'calories',
}

# Deal filter config
_re_deals = re

TRANSFORM_WORDS = {
    'saveur', 'arome', 'arôme', 'style', 'facon', 'façon', 'recette',
    'instantane', 'instantané', 'poudre', 'bouillon', 'chips', 'croustilles',
    'biscuits', 'barre', 'soupe', 'nouilles', 'pates', 'pâtes', 'cereales',
    'céréales', 'condiment', 'melange', 'mélange', 'sauce', 'marinade',
    'boisson', 'the', 'thé', 'cafe', 'café', 'jus', 'yaourt', 'yogourt',
    'fromage fondu', 'tartine', 'galette', 'crepe', 'crêpe', 'desse', 'dessert',
    'glace', 'sorbet', 'chocolat', 'bonbon', 'confiserie', 'sirop',
    'plat', 'repas', 'microwave', 'micro-ondes', 'congele', 'surgelé',
    # beverages
    'limonade', 'eau', 'soda', 'gingembre', 'kombucha', 'smoothie',
    # snacks/sweet
    'compote', 'collation', 'energie', 'énergie', 'gel', 'gels',
    # condiments/spreads
    'vinaigrette', 'tartinade', 'beurre', 'confiture', 'gelée',
    # baked goods
    'pain', 'gateau', 'gâteau', 'muffin', 'donut', 'beigne', 'croissant',
    'tarte', 'tourtiere', 'brioche', 'chausson', 'pate', 'pâte',
}
STRICT_MATCH_KEYWORDS = {
    'cannelle', 'curcuma', 'curry', 'paprika', 'cumin', 'origan', 'basilic',
    'thym', 'romarin', 'sauge', 'aneth', 'coriandre', 'persil', 'estragon',
    'menthe', 'laurier', 'piment', 'muscade', 'clou', 'cardamome', 'fenouil',
    'fenugrec', 'safran', 'sesame', 'sésame', 'graine', 'poivre', 'sel',
    'ail', 'oignon', 'échalote', 'gingembre', 'vanille', 'moutarde',
    'pacane', 'pacanes', 'amande', 'amandes', 'noix', 'cajou', 'pistache',
    'arachide', 'arachides', 'tournesol', 'citrouille',
    'huile', 'olive', 'coco',
}
PET_INDICATORS = {'chat', 'chien', 'animal', 'pet', 'special kitty', 'friskies', 'whiskas', 'purina cat'}
GENERIC_WORDS = {'les', 'des', 'de', 'et', 'la', 'le', 'un', 'une', 'aux', 'crue', 'cuit', 'cru'}


def _build_section_dict(s):
    """Build a section dict from a DB row (S3776 helper)."""
    return {'id': s['id'], 'name': s['name'], 'icon': s['icon']}


def _safe_json(raw):
    """Safely parse JSON field, return None on failure."""
    if not raw:
        return None
    try:
        return json.loads(raw)
    except Exception:
        return None


def _build_food_dict(f, db):
    """Build a single food dict from a DB row."""
    fd = {'name': f['name_fr'] or f['name_en'], 'density': f['density'] or 50,
          'nutrients': f['highlights'] or ''}
    aliases = db.execute('SELECT alias FROM nf_foods_aliases WHERE nf_food_id = ?', (f['id'],)).fetchall()
    if aliases:
        fd['aliases'] = [a['alias'] for a in aliases]
    nutr_vals = db.execute('SELECT nutrient_code, amount FROM nf_foods_nutrients WHERE nf_food_id = ?', (f['id'],)).fetchall()
    nutrition = {}
    for nv in nutr_vals:
        field = NUTRIENT_MAP.get(nv['nutrient_code'])
        if field:
            nutrition[field] = round(nv['amount'], 2)
    omega3_codes = [629, 621, 631, 851]
    o3_vals = [nv for nv in nutr_vals if nv['nutrient_code'] in omega3_codes]
    if o3_vals:
        nutrition['omega3'] = round(sum(nv['amount'] for nv in o3_vals), 2)
    if nutrition:
        fd['nutrition'] = nutrition
    season = _safe_json(f['season'])
    if season:
        fd['season'] = season
    import_season = _safe_json(f['import_season'])
    if import_season:
        fd['import_season'] = import_season
    ft = {}
    if f['absorption_tip']:
        ft['absorption'] = f['absorption_tip']
    if f['warning_tip']:
        ft['warnings'] = f['warning_tip']
    if ft:
        fd['tips'] = ft
    return fd


def _build_category_dict(cat, db):
    """Build a category dict with its foods list (S3776 helper)."""
    foods = db.execute('''
        SELECT f.id, f.name_fr, f.name_en, f.density, f.highlights,
               f.absorption_tip, f.warning_tip, f.season, f.import_season
        FROM nf_foods f WHERE f.nf_category = ? AND f.visible = 1 ORDER BY f.id
    ''', (cat['id'],)).fetchall()
    cat_data = {
        'id': cat['id'], 'name': cat['name'], 'icon': cat['icon'],
        'section': cat['section'], 'type': cat['type'] or 'select',
        'weekly_min': cat['weekly_min'] or 0, 'weekly_max': cat['weekly_max'] or 0,
    }
    if cat['daily']:
        cat_data['daily'] = True
    cat_tips = {}
    if cat['absorption_tip']:
        cat_tips['absorption'] = cat['absorption_tip']
    if cat['warning_tip']:
        cat_tips['warnings'] = cat['warning_tip']
    if cat_tips:
        cat_data['tips'] = cat_tips
    cat_data['foods'] = [_build_food_dict(f, db) for f in foods]
    return cat_data


def _extract_food_keywords(food_name):
    """Extract and filter keywords from a food name.
    Returns (keywords_list, is_strict). (S3776 helper)
    """
    keywords = [w.strip().lower().rstrip('s') for w in food_name.replace(',', ' ').split() if len(w.strip()) >= 3]
    keywords = [w for w in keywords if w not in GENERIC_WORDS]
    is_strict = any(kw in STRICT_MATCH_KEYWORDS for kw in keywords)
    return keywords, is_strict


def _match_food_deals(food_name, raw_deals, food_keywords, is_strict):
    """Match deals for a single food. Returns filtered list. (S3776 helper)"""
    if food_name not in raw_deals:
        return []
    filtered = []
    for r in raw_deals[food_name]:
        r_name = (r.get('name') or '').lower()
        if not any(_re_deals.search(r'\b' + _re_deals.escape(kw) + r's?\b', r_name) for kw in food_keywords):
            continue
        if any(ind in r_name for ind in PET_INDICATORS):
            continue
        if any(tw in r_name for tw in TRANSFORM_WORDS):
            continue
        if is_strict:
            if not any(r_name.startswith(kw) or r_name.startswith('moulu ' + kw) or r_name.startswith(kw + ' moulu') or r_name.startswith('beurre ' + kw) or r_name.startswith('huile ' + kw) for kw in food_keywords):
                continue
        filtered.append(r)
    return filtered


def _validate_share_link(db, token):
    """Validate a share link token. Returns (user_id, error_response).
    On success: (user_id, None). On failure: (None, (error_json, status)).
    (S3776 helper)
    """
    from flask import jsonify
    from datetime import datetime, timezone
    row = db.execute('SELECT user_id, expires_at FROM share_links WHERE token = ?', (token,)).fetchone()
    if not row:
        return None, (jsonify({'error': 'Lien invalide'}), 404)
    try:
        if datetime.fromisoformat(row['expires_at']) < datetime.now(timezone.utc):
            db.execute('DELETE FROM share_links WHERE token = ?', (token,))
            db.commit()
            return None, (jsonify({'error': 'Lien expiré'}), 404)
    except Exception:
        pass
    return row['user_id'], None


def _compute_nutrient_gaps(totals, targets):
    """Find nutrients below 80% of target. Returns sorted list of (key, pct).
    (S3776 helper)
    """
    from utils.nutrition import DEFAULT_TARGETS, NUTRIENT_LABELS
    deficient = []
    for key in DEFAULT_TARGETS:
        t = targets.get(key, DEFAULT_TARGETS[key])
        if t > 0:
            pct = (totals.get(key, 0) / t) * 100
            if pct < 80:
                deficient.append((key, pct))
    return sorted(deficient, key=lambda x: x[1])


def _is_candidate_food(food, selected_names, json_key):
    """Check if a food is a valid candidate for a nutrient. (S3776 helper)"""
    if food['name'] in selected_names:
        return None
    if food.get('processing_level', 1) > 1:
        return None
    n = food.get('nutrition', {})
    val = n.get(json_key, 0)
    return val if val > 0 else None


def _build_candidates_for_nutrient(cat, selected_names, json_key, nutrient_key, pct):
    """Build candidate foods for a specific nutrient. (S3776 helper)"""
    from utils.nutrition import NUTRIENT_LABELS
    candidates = []
    for food in cat.get('foods', []):
        val = _is_candidate_food(food, selected_names, json_key)
        if val:
            candidates.append({
                'food': food['name'], 'category': cat.get('name', ''),
                'nutrient': nutrient_key, 'nutrient_value': val,
                'current_pct': round(pct),
                'reason': f"Manque de {NUTRIENT_LABELS.get(nutrient_key, nutrient_key)} ({round(pct)}% de l'objectif)"
            })
    return candidates


def _find_suggestion_foods(deficient, foods_data, selected_names):
    """Find suggestion foods for deficient nutrients. Returns list of dicts."""
    from utils.nutrition import NUTRIENT_LABELS
    all_suggestions = []
    categories = foods_data.get('categories', [])
    nutrient_key_map = {'vitamin_c': 'vit_c'}
    skip_cats = {'habitudes-herbes-epices', 'habitudes-boissons'}

    for nutrient_key, pct in deficient:
        json_key = nutrient_key_map.get(nutrient_key, nutrient_key)
        candidates = []
        for cat in categories:
            if cat.get('section') == 'habitudes' and cat.get('id') in skip_cats:
                continue
            candidates.extend(_build_candidates_for_nutrient(cat, selected_names, json_key, nutrient_key, pct))
        candidates.sort(key=lambda x: x['nutrient_value'], reverse=True)
        all_suggestions.extend(candidates[:3])
        if len(all_suggestions) >= 8:
            break
    return all_suggestions[:8]


def _build_season_icon(food_data, current_month):
    """Build season icon for a food item. (S3776 helper)"""
    if not food_data:
        return ''
    season = food_data.get('season', [])
    import_season = food_data.get('import_season', [])
    if season and len(season) < 12 and current_month in season:
        return '🌱'
    if import_season and len(import_season) < 12:
        if current_month in import_season:
            return '✈️'
    if import_season and current_month in import_season:
        return '✈️'
    return ''


def _build_grocery_from_selections(selections_data, foods_data):
    """Build grocery list from selections data. (S3776 helper)"""
    from datetime import date
    current_month = date.today().month
    grocery = []
    for cat_id, items in selections_data.items():
        cat_icon = ''
        cat_foods = []
        for cat in foods_data.get('categories', []):
            if cat['id'] == cat_id:
                cat_icon = cat.get('icon', '')
                cat_foods = cat.get('foods', [])
                break
        for item in items:
            food_data = next((f for f in cat_foods if f['name'] == item.get('name', '')), None)
            season_icon = _build_season_icon(food_data, current_month)
            icon = (season_icon + ' ' if season_icon else '') + cat_icon
            grocery.append({'name': item.get('name', ''), 'qty': item.get('qty', 1), 'icon': icon})
    grocery.sort(key=lambda x: x['name'])
    return grocery


def load_foods():
    """Return foods dict from SQLite, same format as old foods.json."""
    from extensions import get_nf_db
    db = get_nf_db()
    sections = db.execute('SELECT id, name, icon FROM nf_sections ORDER BY rowid').fetchall()
    categories = db.execute('''
        SELECT id, name, icon, section_id as section, type, weekly_min, weekly_max, daily,
               absorption_tip, warning_tip
        FROM nf_categories ORDER BY rowid
    ''').fetchall()

    result = {
        'sections': [_build_section_dict(s) for s in sections],
        'categories': [_build_category_dict(cat, db) for cat in categories]
    }
    db.close()
    return result


def _fetch_deals_for_food(food):
    """Fetch deals for a single food item from epiceries.ca.
    Returns list of raw deal items. (S3776 helper)
    """
    import urllib.request
    import urllib.parse
    food_name = food.get('name', '')
    if not food_name:
        return []
    query = food.get('epiceries_query') or food_name
    try:
        params = urllib.parse.urlencode({
            'endpoint': 'search',
            'q': query,
            'discounted': 'true',
            'limit': '10',
            'sort': 'price_asc',
        })
        url = f'https://epiceries.ca/api?{params}'
        req = urllib.request.Request(url, headers={'User-Agent': 'NutriFood/1.0'})
        with urllib.request.urlopen(req, timeout=8) as resp:
            body = resp.read().decode('utf-8')
        data = json.loads(body)
        if data.get('ok') and data.get('data'):
            results = data['data'].get('results', [])
            raw_items = []
            for r in results:
                raw_items.append({
                    'name': r.get('name', ''),
                    'store': r.get('store', ''),
                    'price': r.get('price'),
                    'unit_price': r.get('unitPrice', ''),
                    'size': r.get('size', ''),
                    'link': r.get('link', ''),
                    'image': r.get('image', ''),
                })
            return raw_items
    except Exception as e:
        print(f'[NutriFood] Raw fetch error for "{food_name}": {e}')
    return []


def _insert_food_nutrients_and_aliases(cur, new_id, cnf_nutrients, aliases, name):
    """Insert nutrients and aliases for a new food. (S3776 helper)"""
    for nv in cnf_nutrients:
        cur.execute('INSERT OR IGNORE INTO nf_foods_nutrients (nf_food_id, nutrient_code, amount) VALUES (?,?,?)',
                    (new_id, nv['nutrient_code'], nv['amount']))
    for a in aliases:
        cur.execute('INSERT OR IGNORE INTO nf_foods_aliases (nf_food_id, alias) VALUES (?, ?)', (new_id, a))
    if name:
        cur.execute('INSERT OR IGNORE INTO nf_foods_aliases (nf_food_id, alias) VALUES (?, ?)', (new_id, name))


def _save_season_and_deals(new_id, name):
    """Save season data and fetch deals for a new food. (S3776 helper)"""
    from utils.season import lookup_quebec_season
    season_info = lookup_quebec_season(name or '')
    if season_info:
        db2 = get_nf_db()
        db2.execute('UPDATE nf_foods SET season = ?, import_season = ? WHERE id = ?',
                    (json.dumps(season_info['season']), json.dumps(season_info['import']), new_id))
        db2.commit()
        db2.close()
    try:
        deals = _fetch_deals_for_food({'name': name, 'epiceries_query': name})
        if deals:
            add_to_raw_deals(name, deals)
    except Exception as e:
        print(f'[NutriFood] Deal fetch error on add: {e}')


# ─── Raw deals file helpers ───
import os
import threading

DEALS_RAW_FILE = '/data/deals_raw.json'
DEALS_LOCK_FILE = '/data/deals.lock'
DEALS_RAW_TTL = 7 * 24 * 3600  # 1 week

# Thread-safe lock for deals_raw.json read-modify-write operations
_deals_file_lock = threading.Lock()
# Thread-safe flag for background refresh (replaces DEALS_BUILDING global)
_deals_refresh_lock = threading.Lock()

STORE_META = {
    'maxi':    {'name': 'Maxi',     'color': '#0a6cff'},
    'iga':     {'name': 'IGA',      'color': '#d6001c'},
    'superc':  {'name': 'Super C',  'color': '#ff6600'},
    'metro':   {'name': 'Metro',    'color': '#e30613'},
    'provigo': {'name': 'Provigo',  'color': '#0066b3'},
    'walmart': {'name': 'Walmart',  'color': '#0071ce'},
}


def filter_deals(raw_deals, foods_data):
    """Pure function: read raw deals + food list, return filtered deals. No side effects."""
    result = {}
    for cat in foods_data.get('categories', []):
        for food in cat.get('foods', []):
            food_name = food.get('name', '')
            if not food_name:
                continue
            food_keywords, is_strict = _extract_food_keywords(food_name)
            filtered = _match_food_deals(food_name, raw_deals, food_keywords, is_strict)
            if filtered:
                result[food_name] = filtered
    return result


def fetch_all_deals_raw():
    """Fetch ALL deals from epiceries.ca. Store raw in deals_raw.json. NEVER filter here."""
    import time as _time
    foods_data = load_foods()
    all_raw = {}
    total = 0
    for cat in foods_data.get('categories', []):
        for food in cat.get('foods', []):
            food_name = food.get('name', '')
            if not food_name:
                continue
            raw_items = _fetch_deals_for_food(food)
            if raw_items:
                all_raw[food_name] = raw_items
                total += len(raw_items)
            _time.sleep(0.3)
    from datetime import datetime, timezone
    cache_data = {
        'raw': all_raw,
        'updated': datetime.now(timezone.utc).isoformat(),
        'count': total
    }
    with _deals_file_lock:
        try:
            with open(DEALS_RAW_FILE, 'w') as f:
                json.dump(cache_data, f, ensure_ascii=False)
        except Exception as e:
            print(f'[NutriFood] Raw deals file write error: {e}')
    print(f'[NutriFood] Raw deals fetched: {total} items across {len(all_raw)} foods')
    return total


def load_raw_deals():
    """Load raw deals from file. Returns (raw_dict, updated_str) or (None, None)."""
    with _deals_file_lock:
        try:
            if os.path.exists(DEALS_RAW_FILE):
                with open(DEALS_RAW_FILE, 'r') as f:
                    data = json.load(f)
                return data.get('raw', {}), data.get('updated')
        except Exception as e:
            print(f'[NutriFood] Raw deals read error: {e}')
    return None, None


def add_to_raw_deals(food_name, deals):
    """Add or update deals for a food in the raw file."""
    from datetime import datetime, timezone
    with _deals_file_lock:
        try:
            if os.path.exists(DEALS_RAW_FILE):
                with open(DEALS_RAW_FILE, 'r') as f:
                    raw = json.load(f).get('raw', {})
            else:
                raw = {}
            if deals:
                raw[food_name] = deals
            elif food_name in raw:
                del raw[food_name]
            cache_data = {
                'raw': raw,
                'updated': datetime.now(timezone.utc).isoformat(),
                'count': sum(len(v) for v in raw.values())
            }
            with open(DEALS_RAW_FILE, 'w') as f:
                json.dump(cache_data, f, ensure_ascii=False)
        except Exception as e:
            print(f'[NutriFood] Error updating raw deals: {e}')


def remove_from_raw_deals(food_name):
    """Remove a food from the raw deals file."""
    from datetime import datetime, timezone
    with _deals_file_lock:
        try:
            if os.path.exists(DEALS_RAW_FILE):
                with open(DEALS_RAW_FILE, 'r') as f:
                    raw = json.load(f).get('raw', {})
            else:
                raw = {}
            if food_name in raw:
                del raw[food_name]
            cache_data = {
                'raw': raw,
                'updated': datetime.now(timezone.utc).isoformat(),
                'count': sum(len(v) for v in raw.values())
            }
            with open(DEALS_RAW_FILE, 'w') as f:
                json.dump(cache_data, f, ensure_ascii=False)
        except Exception as e:
            print(f'[NutriFood] Error removing from raw deals: {e}')


def is_raw_deals_fresh():
    """Check if raw deals file is within TTL (1 week)."""
    from datetime import datetime, timezone
    try:
        if os.path.exists(DEALS_RAW_FILE):
            mtime = os.path.getmtime(DEALS_RAW_FILE)
            age = (datetime.now(timezone.utc) - datetime.fromtimestamp(mtime, tz=timezone.utc)).total_seconds()
            return age <= DEALS_RAW_TTL
    except Exception:
        pass
    return False


def trigger_raw_refresh_async():
    """Start background fetch of raw deals if not already running."""
    from datetime import datetime, timezone
    # Try to acquire the refresh lock (non-blocking)
    if not _deals_refresh_lock.acquire(blocking=False):
        return False
    if os.path.exists(DEALS_LOCK_FILE):
        try:
            lock_age = (datetime.now(timezone.utc) - datetime.fromtimestamp(os.path.getmtime(DEALS_LOCK_FILE), tz=timezone.utc)).total_seconds()
            if lock_age < 300:
                _deals_refresh_lock.release()
                return False
        except Exception:
            pass
    try:
        with open(DEALS_LOCK_FILE, 'w') as f:
            f.write(datetime.now(timezone.utc).isoformat())
    except Exception:
        pass
    def _worker():
        try:
            fetch_all_deals_raw()
        except Exception as e:
            print(f'[NutriFood] Background raw fetch failed: {e}')
        finally:
            _deals_refresh_lock.release()
            try:
                if os.path.exists(DEALS_LOCK_FILE):
                    os.remove(DEALS_LOCK_FILE)
            except Exception:
                pass
    t = threading.Thread(target=_worker, daemon=True)
    t.start()
    return True
