"""Export blueprint: /api/export/csv."""
import csv
import io
import json
from flask import Blueprint, request, Response
from extensions import get_db, ERR_UNAUTHORIZED
from blueprints.auth import get_auth_user

bp = Blueprint('export', __name__)


@bp.route('/api/export/csv', methods=['GET'])
def export_csv():
    user = get_auth_user()
    if not user:
        return Response(json.dumps({'error': ERR_UNAUTHORIZED}), status=401, mimetype='application/json')

    db = get_db()

    # Collect tracking data
    tracking_rows = db.execute(
        'SELECT date, data FROM tracking WHERE user_id = ? ORDER BY date',
        (user['id'],)
    ).fetchall()

    # Collect selections (planning)
    sel_row = db.execute('SELECT data FROM selections WHERE user_id = ?', (user['id'],)).fetchone()
    planning_data = json.loads(sel_row['data']) if sel_row and sel_row['data'] else {}

    # Collect goals
    goal_row = db.execute(
        'SELECT protein, fiber, iron, vitamin_c, calcium, omega3 FROM user_goals WHERE user_id = ?',
        (user['id'],)
    ).fetchone()

    # Build CSV
    output = io.StringIO()
    writer = csv.writer(output)

    # Header info
    writer.writerow(['NutriFood — Export de donnees'])
    writer.writerow(['Utilisateur', user['email']])
    writer.writerow(['Genere le', __import__('datetime').date.today().isoformat()])
    writer.writerow([])

    # Planning selections
    writer.writerow(['=== SELECTIONS (PLANIFICATION) ==='])
    writer.writerow(['Categorie', 'Aliment', 'Quantite'])
    for cat_id, items in planning_data.items():
        for item in items:
            writer.writerow([cat_id, item.get('name', ''), item.get('qty', 1)])
    writer.writerow([])

    # Tracking data
    writer.writerow(['=== SUIVI NUTRITIONNEL ==='])
    writer.writerow(['Date', 'Categorie', 'Aliment', 'Quantite'])
    for row in tracking_rows:
        date = row['date']
        day_data = json.loads(row['data']) if row['data'] else {}
        for cat_id, items in day_data.items():
            for item in items:
                writer.writerow([date, cat_id, item.get('name', ''), item.get('qty', 1)])
    writer.writerow([])

    # Goals
    writer.writerow(['=== OBJECTIFS NUTRITIONNELS ==='])
    writer.writerow(['Nutriment', 'Objectif hebdomadaire'])
    if goal_row:
        writer.writerow(['Proteine (g)', goal_row['protein']])
        writer.writerow(['Fibres (g)', goal_row['fiber']])
        writer.writerow(['Fer (mg)', goal_row['iron']])
        writer.writerow(['Vitamine C (mg)', goal_row['vitamin_c']])
        writer.writerow(['Calcium (mg)', goal_row['calcium']])
        writer.writerow(['Omega-3 (g)', goal_row['omega3']])
    else:
        writer.writerow(['(objectifs par defaut)', ''])
    writer.writerow([])

    csv_data = output.getvalue()
    output.close()

    filename = 'nutrifood-export-{}.csv'.format(__import__('datetime').date.today().isoformat())
    return Response(
        csv_data,
        mimetype='text/csv; charset=utf-8',
        headers={'Content-Disposition': 'attachment; filename="{}"'.format(filename)}
    )
