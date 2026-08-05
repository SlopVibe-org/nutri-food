"""Profile blueprint: user profile (weight, height, age, sex, activity, diet, allergies)."""
import json
from flask import Blueprint, request, jsonify

from extensions import get_db, ERR_UNAUTHORIZED
from blueprints.auth import get_auth_user

bp = Blueprint('profile', __name__)

ALLOWED_SEX = {'male', 'female', 'other'}
ALLOWED_ACTIVITY = {'sedentary', 'light', 'moderate', 'active', 'very_active'}
ALLOWED_DIETS = {'none', 'vegetarian', 'vegan', 'ketogenic', 'mediterranean', 'gluten_free'}
ALLERGY_OPTIONS = ['peanuts', 'tree_nuts', 'milk', 'eggs', 'soy', 'wheat', 'fish', 'shellfish', 'sesame', 'mustard']

# Activity multipliers for TDEE (Total Daily Energy Expenditure)
ACTIVITY_FACTORS = {
    'sedentary': 1.2, 'light': 1.375, 'moderate': 1.55,
    'active': 1.725, 'very_active': 1.9,
}


@bp.route('/api/profile', methods=['GET'])
def get_profile():
    user = get_auth_user()
    if not user:
        return jsonify({'error': ERR_UNAUTHORIZED}), 401
    db = get_db()
    row = db.execute(
        'SELECT weight, height, age, sex, activity_level, diet, allergies FROM users WHERE id = ?',
        (user['id'],)
    ).fetchone()
    if not row:
        return jsonify({'error': 'Utilisateur introuvable'}), 404

    allergies = []
    if row['allergies']:
        try:
            allergies = json.loads(row['allergies'])
        except (json.JSONDecodeError, TypeError):
            allergies = []

    return jsonify({
        'profile': {
            'weight': row['weight'],
            'height': row['height'],
            'age': row['age'],
            'sex': row['sex'] or 'other',
            'activity_level': row['activity_level'] or 'moderate',
            'diet': row['diet'] or 'none',
            'allergies': allergies,
        }
    })


@bp.route('/api/profile', methods=['POST'])
def update_profile():
    user = get_auth_user()
    if not user:
        return jsonify({'error': ERR_UNAUTHORIZED}), 401

    data = request.get_json() or {}
    profile = data.get('profile', {})

    # Validate and extract fields
    updates = {}
    field_map = {
        'weight': ('weight', float),
        'height': ('height', float),
        'age': ('age', int),
    }

    for key, (db_col, caster) in field_map.items():
        if key in profile:
            if profile[key] is None:
                updates[db_col] = None
            else:
                try:
                    val = caster(profile[key])
                    if val < 0:
                        return jsonify({'error': f'{key} doit être positif'}), 400
                    updates[db_col] = val
                except (ValueError, TypeError):
                    return jsonify({'error': f'{key} invalide'}), 400

    if 'sex' in profile:
        sex = profile['sex']
        if sex not in ALLOWED_SEX:
            return jsonify({'error': 'Sexe invalide'}), 400
        updates['sex'] = sex

    if 'activity_level' in profile:
        activity = profile['activity_level']
        if activity not in ALLOWED_ACTIVITY:
            return jsonify({'error': "Niveau d'activité invalide"}), 400
        updates['activity_level'] = activity

    if 'diet' in profile:
        diet = profile['diet']
        if diet not in ALLOWED_DIETS:
            return jsonify({'error': 'Régime invalide'}), 400
        updates['diet'] = diet

    if 'allergies' in profile:
        allergies = profile['allergies']
        if not isinstance(allergies, list):
            return jsonify({'error': 'Allergies doit être une liste'}), 400
        # Validate each allergy
        for a in allergies:
            if a not in ALLERGY_OPTIONS:
                return jsonify({'error': f'Allergie inconnue: {a}'}), 400
        updates['allergies'] = json.dumps(allergies)

    if not updates:
        return jsonify({'error': 'Aucune donnée à mettre à jour'}), 400

    db = get_db()
    set_clauses = ', '.join(f"{k} = ?" for k in updates.keys())
    params = list(updates.values()) + [user['id']]
    db.execute(f"UPDATE users SET {set_clauses}, updated_at = datetime('now') WHERE id = ?", params)
    db.commit()

    # Return updated profile
    row = db.execute(
        'SELECT weight, height, age, sex, activity_level, diet, allergies FROM users WHERE id = ?',
        (user['id'],)
    ).fetchone()
    allergies_out = []
    if row['allergies']:
        try:
            allergies_out = json.loads(row['allergies'])
        except (json.JSONDecodeError, TypeError):
            pass

    return jsonify({
        'profile': {
            'weight': row['weight'],
            'height': row['height'],
            'age': row['age'],
            'sex': row['sex'] or 'other',
            'activity_level': row['activity_level'] or 'moderate',
            'diet': row['diet'] or 'none',
            'allergies': allergies_out,
        }
    })


@bp.route('/api/profile/recommend-targets', methods=['GET'])
def recommend_targets():
    """Calculate recommended weekly nutrition targets based on user profile.
    Uses Mifflin-St Jeor for BMR, then applies activity factor for TDEE.
    """
    user = get_auth_user()
    if not user:
        return jsonify({'error': ERR_UNAUTHORIZED}), 401
    db = get_db()
    row = db.execute(
        'SELECT weight, height, age, sex, activity_level FROM users WHERE id = ?',
        (user['id'],)
    ).fetchone()

    if not row or not row['weight'] or not row['height'] or not row['age']:
        return jsonify({'error': 'Profil incomplet — poids, taille et âge requis'}), 400

    weight = row['weight']  # kg
    height = row['height']  # cm
    age = row['age']
    sex = row['sex'] or 'other'
    activity = row['activity_level'] or 'moderate'

    # Mifflin-St Jeor BMR
    bmr = 10 * weight + 6.25 * height - 5 * age
    if sex == 'male':
        bmr += 5
    elif sex == 'female':
        bmr -= 161
    else:
        bmr -= 78  # average of male/female offset

    tdee = bmr * ACTIVITY_FACTORS.get(activity, 1.55)

    # Weekly targets (7x daily)
    # Protein: 1.6g/kg/day → weekly
    protein = round(weight * 1.6 * 7)
    # Fiber: 28-30g/day → weekly
    fiber = round(28 * 7)
    # Iron: 18mg/day (avg) → weekly
    iron = round(18 * 7)
    # Vitamin C: 75mg/day → weekly
    vitamin_c = round(75 * 7)
    # Calcium: 1300mg/day → weekly
    calcium = round(1300 * 7)
    # Omega-3: 1.6g/day → weekly
    omega3 = round(1.6 * 7, 1)

    return jsonify({
        'recommended': {
            'protein': protein,
            'fiber': fiber,
            'iron': iron,
            'vitamin_c': vitamin_c,
            'calcium': calcium,
            'omega3': omega3,
        },
        'tdee': round(tdee),
        'bmr': round(bmr),
    })
