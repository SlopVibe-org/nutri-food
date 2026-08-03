import pytest
import os
import tempfile
import sys

# Ensure backend dir is on path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))


@pytest.fixture
def app(tmp_path):
    """Create a Flask app instance with a temp DB."""
    db_path = str(tmp_path / 'test.db')
    os.environ['DB_PATH'] = db_path
    os.environ['NF_DB_PATH'] = db_path
    os.environ['JWT_SECRET'] = 'test-secret-key-for-testing'
    os.environ['SMTP_HOST'] = 'localhost'
    os.environ['SMTP_PORT'] = '0'
    os.environ['SMTP_USER'] = 'test@test.com'
    os.environ['SMTP_PASS'] = ''
    os.environ['MAIL_FROM'] = 'test@test.com'
    os.environ['APP_URL'] = 'http://localhost/'
    os.environ['JWT_EXPIRY_HOURS'] = '2160'

    # Import after env is set
    import importlib
    import app as app_module
    importlib.reload(app_module)
    app_module.init_db()

    # Create minimal nf_* tables (not created by init_db)
    import sqlite3
    conn = sqlite3.connect(db_path)
    conn.executescript('''
        CREATE TABLE IF NOT EXISTS nf_sections (id TEXT PRIMARY KEY, name TEXT, icon TEXT);
        CREATE TABLE IF NOT EXISTS nf_categories (
            id TEXT PRIMARY KEY, name TEXT, icon TEXT, section_id TEXT, type TEXT,
            weekly_min INTEGER DEFAULT 0, weekly_max INTEGER DEFAULT 0, daily INTEGER DEFAULT 0,
            absorption_tip TEXT, warning_tip TEXT
        );
        CREATE TABLE IF NOT EXISTS nf_foods (
            id INTEGER PRIMARY KEY AUTOINCREMENT, source_type INTEGER DEFAULT 0, source_id INTEGER,
            visible INTEGER DEFAULT 1, nf_category TEXT, density INTEGER DEFAULT 50,
            highlights TEXT, name_fr TEXT, name_en TEXT,
            absorption_tip TEXT, warning_tip TEXT, season TEXT, import_season TEXT
        );
        CREATE TABLE IF NOT EXISTS nf_foods_nutrients (
            nf_food_id INTEGER, nutrient_code INTEGER, amount REAL,
            PRIMARY KEY (nf_food_id, nutrient_code)
        );
        CREATE TABLE IF NOT EXISTS nf_foods_aliases (
            nf_food_id INTEGER, alias TEXT, PRIMARY KEY (nf_food_id, alias)
        );
        INSERT OR IGNORE INTO nf_sections VALUES
            ('viandes-laitiers', 'Viandes & Laitiers', '🥩'),
            ('legumes', 'Légumes', '🥬');
        INSERT OR IGNORE INTO nf_categories VALUES
            ('legumes-verts-fonces', 'Légumes verts foncés', '🥬', 'legumes', 'select', 7, 14, 0, NULL, NULL),
            ('fruits-petits', 'Petits fruits', '🫐', 'legumes', 'select', 3, 7, 0, NULL, NULL);
        INSERT OR IGNORE INTO nf_foods (id, source_type, source_id, visible, nf_category, density, highlights, name_fr, name_en)
        VALUES
            (1, 0, NULL, 1, 'legumes-verts-fonces', 85, 'Fer, Calcium', 'épinard', 'spinach'),
            (2, 0, NULL, 1, 'legumes-verts-fonces', 70, 'Vitamine C', 'brocoli', 'broccoli'),
            (3, 0, NULL, 1, 'fruits-petits', 90, 'Vitamine C, Fer', 'bleuet', 'blueberry'),
            (4, 0, NULL, 1, 'fruits-petits', 80, 'Vitamine C', 'fraise', 'strawberry');
        INSERT OR IGNORE INTO nf_foods_nutrients VALUES
            (1, 203, 2.9), (1, 291, 2.2), (1, 303, 2.7), (1, 301, 99), (1, 401, 28), (1, 208, 23),
            (2, 203, 2.8), (2, 291, 2.6), (2, 303, 0.9), (2, 301, 47), (2, 401, 89), (2, 208, 34),
            (3, 203, 0.7), (3, 291, 2.4), (3, 303, 0.3), (3, 301, 6), (3, 401, 9.7), (3, 208, 57),
            (4, 203, 0.7), (4, 291, 2.0), (4, 303, 0.4), (4, 301, 16), (4, 401, 58.8), (4, 208, 32);
    ''')
    conn.commit()
    conn.close()

    app_module.app.config['TESTING'] = True
    yield app_module


@pytest.fixture
def client(app):
    """Flask test client."""
    return app.app.test_client()


@pytest.fixture
def auth_client(app, client):
    """Client that is already registered and logged in."""
    # Register
    r = client.post('/api/register', json={
        'email': 'test@example.com',
        'name': 'TestUser',
        'password': 'password123'
    })
    assert r.status_code == 201
    token = r.get_json()['token']
    # Attach token to all subsequent requests
    client._token = token
    client.environ_base = {'HTTP_AUTHORIZATION': f'Bearer {token}'}
    return client


def auth_headers(client):
    """Get auth headers from a client that has logged in."""
    token = getattr(client, '_token', None)
    if token:
        return {'Authorization': f'Bearer {token}'}
    return {}
