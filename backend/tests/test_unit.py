"""Unit tests for pure functions (no DB/network required)."""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from datetime import date
import app as app_module


class TestGetWeekKey:
    def test_known_date(self):
        # 2026-01-01 is a Thursday → ISO week 1
        d = date(2026, 1, 1)
        assert app_module.get_week_key(d) == '2026-W01'

    def test_monday(self):
        # 2026-08-03 is a Monday → week 32
        d = date(2026, 8, 3)
        assert app_module.get_week_key(d) == '2026-W32'

    def test_sunday_same_week_as_monday(self):
        monday = date(2026, 8, 3)
        sunday = date(2026, 8, 9)
        assert app_module.get_week_key(monday) == app_module.get_week_key(sunday)


class TestHashPassword:
    def test_deterministic(self):
        salt = 'abc123'
        h1 = app_module.hash_password('password', salt)
        h2 = app_module.hash_password('password', salt)
        assert h1 == h2

    def test_different_passwords(self):
        salt = 'abc123'
        assert app_module.hash_password('pass1', salt) != app_module.hash_password('pass2', salt)

    def test_different_salts(self):
        assert app_module.hash_password('password', 'salt1') != app_module.hash_password('password', 'salt2')


class TestJWT:
    def test_make_and_verify(self):
        token = app_module.make_token(1, 'user@test.com', 0)
        assert token is not None
        assert token.count('.') == 2  # standard JWT: header.payload.signature

    def test_verify_invalid_token(self):
        assert app_module.verify_token('invalid.token.here') is None
        assert app_module.verify_token('') is None
        assert app_module.verify_token(None) is None

    def test_verify_tampered_signature(self):
        token = app_module.make_token(1, 'user@test.com', 0)
        parts = token.split('.')
        # Tamper the signature (3rd part of standard JWT)
        tampered = '.'.join([parts[0], parts[1], 'a' * 43])
        assert app_module.verify_token(tampered) is None


class TestCalculateDensity:
    def test_empty_nutrients(self):
        score = app_module.calculate_density({}, 'legumes-verts-fonces')
        assert score == 0

    def test_high_nutrient_density(self):
        # 30mg iron per 100g → 30/18*100 = 166% DV → 20 pts (excellent source)
        nutrients = {303: 30.0}
        score = app_module.calculate_density(nutrients, 'legumes-verts-fonces')
        assert score == 20

    def test_multiple_nutrients_capped(self):
        # Lots of nutrients → should cap at 100
        nutrients = {303: 50, 301: 800, 291: 10, 401: 40}
        score = app_module.calculate_density(nutrients, 'legumes-verts-fonces')
        assert score <= 100

    def test_unknown_nutrient_ignored(self):
        nutrients = {99999: 1000}
        score = app_module.calculate_density(nutrients, 'legumes-verts-fonces')
        assert score == 0


class TestQuebecSeason:
    def test_bleuet_in_season_july(self):
        result = app_module.lookup_quebec_season('bleuet')
        assert result is not None
        assert 7 in result['season']

    def test_pomme_has_long_season(self):
        result = app_module.lookup_quebec_season('pomme')
        assert result is not None
        assert len(result['season']) > 5

    def test_unknown_food(self):
        assert app_module.lookup_quebec_season('pizza') is None

    def test_accent_insensitive(self):
        # Both 'epinard' and 'épinard' exist in the dict
        r1 = app_module.lookup_quebec_season('epinard')
        r2 = app_module.lookup_quebec_season('épinard')
        assert r1 is not None
        assert r2 is not None
        assert r1['season'] == r2['season']

    def test_substring_match(self):
        # 'pomme de terre' should match 'pomme'
        result = app_module.lookup_quebec_season('pomme de terre')
        assert result is not None


class TestExtractFoodKeywords:
    def test_simple_food(self):
        keywords, is_strict = app_module._extract_food_keywords('pomme')
        assert 'pomme' in keywords
        assert not is_strict

    def test_strict_keyword(self):
        keywords, is_strict = app_module._extract_food_keywords('cannelle')
        assert 'cannelle' in keywords
        assert is_strict

    def test_generic_words_filtered(self):
        keywords, _ = app_module._extract_food_keywords('les croutons')
        assert 'les' not in keywords  # generic word filtered

    def test_plural_stripped(self):
        keywords, _ = app_module._extract_food_keywords('pommes')
        assert 'pomme' in keywords


class TestEmailRegex:
    def test_valid_emails(self):
        assert app_module.EMAIL_RE.match('user@example.com')
        assert app_module.EMAIL_RE.match('test.user+tag@sub.example.org')

    def test_invalid_emails(self):
        assert not app_module.EMAIL_RE.match('notanemail')
        assert not app_module.EMAIL_RE.match('user@')
        assert not app_module.EMAIL_RE.match('@example.com')
        assert not app_module.EMAIL_RE.match('')
