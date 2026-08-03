"""Nutrition calculation helpers for NutriFood."""
import json
from extensions import SQL_SELECTIONS, get_db


# ─── Daily Values (Canadian, per day) for density calculation ───
# Only beneficial micronutrients + fiber; excludes macros, calories, sodium
DAILY_VALUES = {
    291: 28.0,    # Fibres (g)
    301: 1300.0,  # Calcium (mg)
    303: 18.0,    # Fer (mg)
    304: 370.0,   # Magnésium (mg) — avg M/F
    305: 1250.0,  # Phosphore (mg)
    306: 4700.0,  # Potassium (mg)
    309: 11.0,    # Zinc (mg)
    312: 2.0,     # Cuivre (mg)
    315: 2.3,     # Manganèse (mg)
    317: 55.0,    # Sélénium (µg)
    328: 15.0,    # Vitamine D (µg)
    401: 75.0,    # Vitamine C (mg)
    404: 1.1,     # Thiamine (mg)
    405: 1.1,     # Riboflavine (mg)
    406: 14.0,    # Niacine (mg)
    415: 1.5,     # Vitamine B-6 (mg)
    417: 400.0,   # Folacine (µg)
    418: 2.4,     # Vitamine B-12 (µg)
    430: 120.0,   # Vitamine K (µg)
}

# Portion sizes per category (grams) — must match frontend PORTION_GRAMS
PORTION_GRAMS_DB = {
    'poissons-gras': 100, 'poissons-blancs': 100, 'fruits-mer': 100,
    'poulet': 100, 'viande-rouge': 100, 'oeufs': 120,
    'legumineuses': 100, 'noix-graines': 30, 'lait': 250,
    'legumes-verts-fonces': 80, 'legumes-jaune-orange': 80,
    'legumes-rouges': 80, 'legumes-blancs': 80, 'legumes-mauves': 80,
    'fruits-petits': 150, 'fruits-protecteurs': 150, 'fruits-autres': 150,
    'feculents-tres-bons': 150, 'feculents-bons': 150, 'feculents-tubercules': 150,
    'habitudes-bons-gras': 15, 'habitudes-boissons': 250,
    'habitudes-fermentes': 100, 'habitudes-herbes-epices': 2,
}

DEFAULT_TARGETS = {'protein': 350, 'fiber': 175, 'iron': 56, 'vitamin_c': 280, 'calcium': 700, 'omega3': 3.5}

NUTRIENT_LABELS = {
    'protein': 'protéines',
    'fiber': 'fibres',
    'iron': 'fer',
    'vitamin_c': 'vitamine C',
    'calcium': 'calcium',
    'omega3': 'oméga-3'
}


def calculate_density(nutrients_per_100g, category):
    """Calculate nutrient density using Canadian regulatory thresholds.
    Source >=5% DV = 5pts, Bonne source >=15% = 10pts, Excellente source >=30% = 20pts.
    Capped at 100."""
    portion_g = PORTION_GRAMS_DB.get(category, 100)
    portion_factor = portion_g / 100.0
    score = 0
    for code, amount in nutrients_per_100g.items():
        if code not in DAILY_VALUES or DAILY_VALUES[code] <= 0:
            continue
        dv_pct = (amount * portion_factor / DAILY_VALUES[code]) * 100
        if dv_pct >= 30:
            score += 20
        elif dv_pct >= 15:
            score += 10
        elif dv_pct >= 5:
            score += 5
    return min(score, 100)


def compute_nutrition_totals(user_id, foods_data):
    """Compute weekly nutrition totals from user's selections."""
    db = get_db()
    row = db.execute(SQL_SELECTIONS, (user_id,)).fetchone()
    if not row:
        return {'protein': 0, 'fiber': 0, 'iron': 0, 'vitamin_c': 0, 'calcium': 0, 'omega3': 0}

    selections_data = json.loads(row['data']) if row['data'] else {}
    totals = {'protein': 0, 'fiber': 0, 'iron': 0, 'vitamin_c': 0, 'calcium': 0, 'omega3': 0}

    categories = foods_data.get('categories', [])
    for cat in categories:
        cat_id = cat.get('id')
        cat_selections = selections_data.get(cat_id, [])
        if not cat_selections:
            continue
        # Build a lookup for this category's foods
        food_map = {f['name']: f for f in cat.get('foods', [])}
        for item in cat_selections:
            food_name = item.get('name', '')
            qty = item.get('qty', 1)
            food = food_map.get(food_name)
            if not food:
                continue
            n = food.get('nutrition', {})
            totals['protein'] += n.get('protein', 0) * qty
            totals['fiber'] += n.get('fiber', 0) * qty
            totals['iron'] += n.get('iron', 0) * qty
            totals['vitamin_c'] += n.get('vit_c', 0) * qty
            totals['calcium'] += n.get('calcium', 0) * qty
            totals['omega3'] += n.get('omega3', 0) * qty

    return totals


def compute_totals_from_selections(selections_data, categories):
    """Compute nutrition totals from a selections dict."""
    totals = {'protein': 0, 'fiber': 0, 'iron': 0, 'vitamin_c': 0, 'calcium': 0, 'omega3': 0, 'calories': 0}
    for cat_id, items in selections_data.items():
        cat = next((c for c in categories if c.get('id') == cat_id), None)
        if not cat:
            continue
        food_map = {f['name']: f for f in cat.get('foods', [])}
        for item in items:
            food = food_map.get(item.get('name', ''))
            if not food:
                continue
            n = food.get('nutrition', {})
            qty = item.get('qty', 1)
            totals['protein'] += n.get('protein', 0) * qty
            totals['fiber'] += n.get('fiber', 0) * qty
            totals['iron'] += n.get('iron', 0) * qty
            totals['vitamin_c'] += n.get('vit_c', 0) * qty
            totals['calcium'] += n.get('calcium', 0) * qty
            totals['omega3'] += n.get('omega3', 0) * qty
            totals['calories'] += n.get('calories', 0) * qty
    return totals


def get_user_targets(user_id):
    """Get user's weekly targets (custom or default)."""
    db = get_db()
    row = db.execute('SELECT protein, fiber, iron, vitamin_c, calcium, omega3 FROM user_goals WHERE user_id = ?', (user_id,)).fetchone()
    if row:
        return {
            'protein': row['protein'],
            'fiber': row['fiber'],
            'iron': row['iron'],
            'vitamin_c': row['vitamin_c'],
            'calcium': row['calcium'],
            'omega3': row['omega3']
        }
    return dict(DEFAULT_TARGETS)


def _compute_journal_avg(avg_totals, days_with_entries, days):
    """Compute average nutrition totals over days with entries.
    Modifies avg_totals in place. (S3776 helper)
    """
    divisor = days_with_entries if days_with_entries > 0 else days
    for k in avg_totals:
        avg_totals[k] = round(avg_totals[k] / divisor, 2)
    return avg_totals
