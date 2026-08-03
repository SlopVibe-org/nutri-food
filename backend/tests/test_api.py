"""Integration tests for API endpoints."""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))


class TestHealthEndpoint:
    def test_health(self, client):
        r = client.get('/api/health')
        assert r.status_code == 200
        data = r.get_json()
        assert data['status'] == 'ok'
        assert data['service'] == 'nutrifood-api'


class TestAuth:
    def test_register_success(self, client):
        r = client.post('/api/register', json={
            'email': 'new@test.com',
            'name': 'NewUser',
            'password': 'pass123'
        })
        assert r.status_code == 201
        data = r.get_json()
        assert 'token' in data
        assert data['user']['email'] == 'new@test.com'
        assert data['user']['is_admin'] == 0

    def test_register_duplicate_email(self, client):
        client.post('/api/register', json={
            'email': 'dup@test.com', 'name': 'User1', 'password': 'pass123'
        })
        r = client.post('/api/register', json={
            'email': 'dup@test.com', 'name': 'User2', 'password': 'pass123'
        })
        assert r.status_code == 409

    def test_register_duplicate_name(self, client):
        client.post('/api/register', json={
            'email': 'a@test.com', 'name': 'SameName', 'password': 'pass123'
        })
        r = client.post('/api/register', json={
            'email': 'b@test.com', 'name': 'SameName', 'password': 'pass123'
        })
        assert r.status_code == 409

    def test_register_short_password(self, client):
        r = client.post('/api/register', json={
            'email': 'short@test.com', 'name': 'Short', 'password': '12345'
        })
        assert r.status_code == 400

    def test_register_invalid_email(self, client):
        r = client.post('/api/register', json={
            'email': 'notanemail', 'name': 'Bad', 'password': 'pass123'
        })
        assert r.status_code == 400

    def test_register_missing_fields(self, client):
        r = client.post('/api/register', json={'email': 'x@test.com'})
        assert r.status_code == 400

    def test_login_with_email(self, client):
        client.post('/api/register', json={
            'email': 'login@test.com', 'name': 'LoginUser', 'password': 'pass123'
        })
        r = client.post('/api/login', json={
            'email': 'login@test.com', 'password': 'pass123'
        })
        assert r.status_code == 200
        assert 'token' in r.get_json()

    def test_login_with_name(self, client):
        client.post('/api/register', json={
            'email': 'name@test.com', 'name': 'NameLogin', 'password': 'pass123'
        })
        r = client.post('/api/login', json={
            'email': 'NameLogin', 'password': 'pass123'
        })
        assert r.status_code == 200

    def test_login_wrong_password(self, client):
        client.post('/api/register', json={
            'email': 'wp@test.com', 'name': 'WPUser', 'password': 'pass123'
        })
        r = client.post('/api/login', json={
            'email': 'wp@test.com', 'password': 'wrongpass'
        })
        assert r.status_code == 401

    def test_login_nonexistent_user(self, client):
        r = client.post('/api/login', json={
            'email': 'ghost@test.com', 'password': 'pass123'
        })
        assert r.status_code == 401

    def test_me_without_token(self, client):
        r = client.get('/api/me')
        assert r.status_code == 401

    def test_me_with_token(self, auth_client):
        r = auth_client.get('/api/me', headers={'Authorization': f'Bearer {auth_client._token}'})
        assert r.status_code == 200
        data = r.get_json()
        assert data['user']['email'] == 'test@example.com'

    def test_me_with_invalid_token(self, client):
        r = client.get('/api/me', headers={'Authorization': 'Bearer invalidtoken'})
        assert r.status_code == 401


class TestSelections:
    def test_get_empty_selections(self, auth_client):
        r = auth_client.get('/api/selections', headers={'Authorization': f'Bearer {auth_client._token}'})
        assert r.status_code == 200
        assert r.get_json()['selections'] == {}

    def test_save_and_get_selections(self, auth_client):
        sel = {'legumes-verts-fonces': [{'name': 'epinard', 'qty': 2}]}
        r = auth_client.post('/api/selections',
            json={'selections': sel},
            headers={'Authorization': f'Bearer {auth_client._token}'}
        )
        assert r.status_code == 200

        r = auth_client.get('/api/selections', headers={'Authorization': f'Bearer {auth_client._token}'})
        data = r.get_json()
        assert 'legumes-verts-fonces' in data['selections']

    def test_selections_unauthorized(self, client):
        r = client.get('/api/selections')
        assert r.status_code == 401

    def test_save_invalid_format(self, auth_client):
        r = auth_client.post('/api/selections',
            json={'selections': 'not a dict'},
            headers={'Authorization': f'Bearer {auth_client._token}'}
        )
        assert r.status_code == 400


class TestTracking:
    def test_save_and_get_day(self, auth_client):
        sel = {'legumes-verts-fonces': [{'name': 'brocoli', 'qty': 1}]}
        r = auth_client.post('/api/tracking/2026-08-03',
            json={'selections': sel},
            headers={'Authorization': f'Bearer {auth_client._token}'}
        )
        assert r.status_code == 200

        r = auth_client.get('/api/tracking/2026-08-03', headers={'Authorization': f'Bearer {auth_client._token}'})
        data = r.get_json()
        assert 'legumes-verts-fonces' in data['selections']

    def test_delete_day(self, auth_client):
        auth_client.post('/api/tracking/2026-08-03',
            json={'selections': {'fruits-petits': [{'name': 'bleuet', 'qty': 1}]}},
            headers={'Authorization': f'Bearer {auth_client._token}'}
        )
        r = auth_client.delete('/api/tracking/2026-08-03', headers={'Authorization': f'Bearer {auth_client._token}'})
        assert r.status_code == 200

        r = auth_client.get('/api/tracking/2026-08-03', headers={'Authorization': f'Bearer {auth_client._token}'})
        assert r.get_json()['selections'] == {}

    def test_get_week(self, auth_client):
        auth_client.post('/api/tracking/2026-08-03',
            json={'selections': {'fruits-petits': [{'name': 'fraise', 'qty': 2}]}},
            headers={'Authorization': f'Bearer {auth_client._token}'}
        )
        r = auth_client.get('/api/tracking/week', headers={'Authorization': f'Bearer {auth_client._token}'})
        assert r.status_code == 200
        data = r.get_json()
        assert 'days' in data

    def test_delete_week(self, auth_client):
        auth_client.post('/api/tracking/2026-08-03',
            json={'selections': {'fruits-petits': [{'name': 'fraise', 'qty': 1}]}},
            headers={'Authorization': f'Bearer {auth_client._token}'}
        )
        r = auth_client.delete('/api/tracking/week', headers={'Authorization': f'Bearer {auth_client._token}'})
        assert r.status_code == 200

    def test_tracking_unauthorized(self, client):
        r = client.get('/api/tracking/2026-08-03')
        assert r.status_code == 401


class TestGoals:
    def test_get_default_goals(self, auth_client):
        r = auth_client.get('/api/goals', headers={'Authorization': f'Bearer {auth_client._token}'})
        assert r.status_code == 200
        goals = r.get_json()['goals']
        assert goals['protein'] == 350
        assert goals['fiber'] == 175

    def test_update_goals(self, auth_client):
        r = auth_client.post('/api/goals',
            json={'goals': {'protein': 400, 'fiber': 200}},
            headers={'Authorization': f'Bearer {auth_client._token}'}
        )
        assert r.status_code == 200
        goals = r.get_json()['goals']
        assert goals['protein'] == 400
        assert goals['fiber'] == 200
        # Unchanged goals should keep defaults
        assert goals['iron'] == 56

    def test_update_goals_negative(self, auth_client):
        r = auth_client.post('/api/goals',
            json={'goals': {'protein': -10}},
            headers={'Authorization': f'Bearer {auth_client._token}'}
        )
        assert r.status_code == 400

    def test_update_goals_invalid(self, auth_client):
        r = auth_client.post('/api/goals',
            json={'goals': {'protein': 'notanumber'}},
            headers={'Authorization': f'Bearer {auth_client._token}'}
        )
        assert r.status_code == 400


class TestPasswordChange:
    def test_change_password_success(self, auth_client):
        r = auth_client.post('/api/change-password',
            json={'current_password': 'password123', 'new_password': 'newpass456'},
            headers={'Authorization': f'Bearer {auth_client._token}'}
        )
        assert r.status_code == 200
        assert 'token' in r.get_json()

        # Old token should be invalidated
        r = auth_client.get('/api/me', headers={'Authorization': f'Bearer {auth_client._token}'})
        assert r.status_code == 401

    def test_change_password_wrong_current(self, auth_client):
        r = auth_client.post('/api/change-password',
            json={'current_password': 'wrongpass', 'new_password': 'newpass456'},
            headers={'Authorization': f'Bearer {auth_client._token}'}
        )
        assert r.status_code == 403

    def test_change_password_too_short(self, auth_client):
        r = auth_client.post('/api/change-password',
            json={'current_password': 'password123', 'new_password': '12345'},
            headers={'Authorization': f'Bearer {auth_client._token}'}
        )
        assert r.status_code == 400


class TestPasswordReset:
    def test_forgot_password_no_reveal(self, client):
        # Should always return ok even for non-existent user
        r = client.post('/api/forgot-password', json={'email': 'nonexistent@test.com'})
        assert r.status_code == 200
        assert r.get_json()['status'] == 'ok'

    def test_reset_invalid_token(self, client):
        r = client.post('/api/reset-password', json={
            'token': 'invalidtoken', 'password': 'newpass123'
        })
        assert r.status_code == 400


class TestFoodsEndpoint:
    def test_get_foods(self, client):
        r = client.get('/api/foods')
        assert r.status_code == 200
        data = r.get_json()
        assert 'sections' in data
        assert 'categories' in data
        assert isinstance(data['sections'], list)


class TestShareLink:
    def test_create_share_link(self, auth_client):
        r = auth_client.post('/api/share',
            headers={'Authorization': f'Bearer {auth_client._token}'}
        )
        assert r.status_code == 200
        data = r.get_json()
        assert 'share_url' in data
        assert 'token' in data

    def test_access_share_link(self, auth_client):
        # Create link
        r = auth_client.post('/api/share', headers={'Authorization': f'Bearer {auth_client._token}'})
        token = r.get_json()['token']

        # Access it (no auth needed)
        r = auth_client.get(f'/api/shared/{token}')
        assert r.status_code == 200
        data = r.get_json()
        assert 'grocery' in data
        assert 'user_name' in data

    def test_invalid_share_link(self, client):
        r = client.get('/api/shared/invalidtoken123')
        assert r.status_code == 404


class TestJournal:
    def test_save_and_get_entry(self, auth_client):
        r = auth_client.post('/api/journal',
            json={'date': '2026-08-03', 'food_name': 'pomme', 'cat_id': 'fruits-petits', 'qty': 2},
            headers={'Authorization': f'Bearer {auth_client._token}'}
        )
        assert r.status_code == 200

        r = auth_client.get('/api/journal?date=2026-08-03', headers={'Authorization': f'Bearer {auth_client._token}'})
        data = r.get_json()
        assert len(data['entries']) == 1
        assert data['entries'][0]['food_name'] == 'pomme'

    def test_delete_entry(self, auth_client):
        auth_client.post('/api/journal',
            json={'date': '2026-08-03', 'food_name': 'pomme', 'qty': 1},
            headers={'Authorization': f'Bearer {auth_client._token}'}
        )
        r = auth_client.delete('/api/journal',
            json={'date': '2026-08-03', 'food_name': 'pomme'},
            headers={'Authorization': f'Bearer {auth_client._token}'}
        )
        assert r.status_code == 200

    def test_journal_summary(self, auth_client):
        auth_client.post('/api/journal',
            json={'date': '2026-08-03', 'food_name': 'pomme', 'qty': 1, 'nutrition': {'protein': 0.5}},
            headers={'Authorization': f'Bearer {auth_client._token}'}
        )
        r = auth_client.get('/api/journal/summary?days=7', headers={'Authorization': f'Bearer {auth_client._token}'})
        assert r.status_code == 200
        data = r.get_json()
        assert 'days' in data
        assert 'avg_totals' in data


class TestRateLimiting:
    def test_rate_limit_register(self, client):
        # Make 10 rapid requests (the limit)
        for i in range(10):
            client.post('/api/register', json={
                'email': f'rate{i}@test.com', 'name': f'Rate{i}', 'password': 'pass123'
            })
        # 11th should be rate limited
        r = client.post('/api/register', json={
            'email': 'over@limit.com', 'name': 'OverLimit', 'password': 'pass123'
        })
        assert r.status_code == 429
