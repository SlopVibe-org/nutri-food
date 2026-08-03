# Guide de Test — NutriFood

Ce document décrit l'ensemble des outils et procédures pour tester l'application NutriFood, des tests unitaires aux analyses de sécurité et de performance.

---

## Table des matières

1. [Tests automatisés (pytest)](#1-tests-automatisés-pytest)
2. [Intégration continue (CI locale + GitHub Actions)](#2-intégration-continue-ci-locale--github-actions)
3. [SonarQube — Analyse statique du code](#3-sonarqube--analyse-statique-du-code)
4. [OWASP ZAP — Scan de sécurité dynamique](#4-owasp-zap--scan-de-sécurité-dynamique)
5. [Lighthouse — Performance et accessibilité](#5-lighthouse--performance-et-accessibilité)
6. [Tests manuels — Checklist](#6-tests-manuels--checklist)
7. [Workflow de QA recommandé](#7-workflow-de-qa-recommandé)

---

## 1. Tests automatisés (pytest)

### Prérequis

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install pytest flask flask-cors
```

### Structure

```
backend/tests/
├── conftest.py      # Fixtures pytest (app, client, auth_client, DB de test)
├── test_unit.py     # 24 tests unitaires (fonctions pures, pas de DB)
└── test_api.py      # 40 tests d'intégration (endpoints API complets)
```

### Exécuter les tests

```bash
cd backend

# Tous les tests
JWT_SECRET=test-secret DB_PATH=/tmp/test.db NF_DB_PATH=/tmp/test.db \
  .venv/bin/python -m pytest tests/ -v

# Tests unitaires seulement
JWT_SECRET=test-secret DB_PATH=/tmp/test.db NF_DB_PATH=/tmp/test.db \
  .venv/bin/python -m pytest tests/test_unit.py -v

# Tests API seulement
JWT_SECRET=test-secret DB_PATH=/tmp/test.db NF_DB_PATH=/tmp/test.db \
  .venv/bin/python -m pytest tests/test_api.py -v

# Avec couverture (nécessite pytest-cov)
pip install pytest-cov
JWT_SECRET=test-secret DB_PATH=/tmp/test.db NF_DB_PATH=/tmp/test.db \
  .venv/bin/python -m pytest tests/ --cov=app --cov-report=term-missing
```

> ⚠️ **Variables d'environnement** : `JWT_SECRET` est obligatoire — `app.py` fait `sys.exit(1)` sans cette variable. Les variables `DB_PATH` et `NF_DB_PATH` pointent vers une DB temporaire pour l'isolation des tests.

### Ce qui est testé

**Tests unitaires (`test_unit.py`) :**
- `get_week_key()` — calcul de semaine ISO
- `hash_password()` — déterminisme, sel, mots de passe différents
- `make_token()` / `verify_token()` — création et validation JWT, tokens tampered
- `calculate_density()` — cas limites, capping à 100, nutriments inconnus
- `lookup_quebec_season()` — accents, correspondance partielle, aliments inconnus
- `_extract_food_keywords()` — pluriels, mots génériques filtrés, mode strict
- Validation d'emails (regex)

**Tests d'intégration API (`test_api.py`) :**
- **Authentification** : register, login (email + nom), doublons, validation, rate limiting
- **Sélections** : CRUD complet, accès non autorisé, format invalide
- **Tracking** : sauvegarde/lecture/suppression par jour et par semaine
- **Goals** : défauts, mise à jour, validation (valeurs négatives, types invalides)
- **Changement de mot de passe** : invalide l'ancien token
- **Reset password** : pas d'énumération d'utilisateurs
- **Foods** : endpoint public de la liste d'aliments
- **Share links** : création, accès public, token invalide
- **Journal** : CRUD + résumé nutritionnel
- **Rate limiting** : 10 requêtes / 60 secondes sur register

### Ajouter de nouveaux tests

1. **Tests unitaires** : ajouter une classe ou méthode dans `test_unit.py`. Pour les fonctions pures, aucun fixture nécessaire.

2. **Tests API** : ajouter une classe dans `test_api.py`. Utiliser les fixtures `client` (non authentifié) ou `auth_client` (authentifié).

```python
class TestNouvelleFeature:
    def test_quelque_chose(self, auth_client):
        r = auth_client.get('/api/nouveau-endpoint',
            headers={'Authorization': f'Bearer {auth_client._token}'})
        assert r.status_code == 200
```

---

## 2. Intégration continue (CI locale + GitHub Actions)

Le projet dispose d'un système de CI hybride : un **hook pre-push local** qui exécute les tests dans Docker sur ai-docker-01 avant chaque push, et un **workflow GitHub Actions** prêt à activer pour CI hébergée.

### Architecture

```
Dev (ai-001/ai-002)
  └── git push
       └── pre-push hook
            └── scripts/ci-local.sh
                 └── tar + ssh → ai-docker-01
                      └── docker run python:3.13-slim
                           └── pytest (64 tests, ~28s)
                                ├── ✅ pass → push autorisé
                                └── ❌ fail → push bloqué
```

### Installation du hook (obligatoire pour chaque dev)

```bash
cd nutri-food
bash scripts/install-hooks.sh
# ✅ Pre-push hook installed → .git/hooks/pre-push
```

Cela installe un hook `.git/hooks/pre-push` qui exécute `scripts/ci-local.sh` avant chaque push. Si les tests échouent, le push est bloqué.

### Exécution manuelle

```bash
# Lancer le CI localement sans pousser
bash scripts/ci-local.sh

# Bypasser le hook (urgence uniquement)
git push --no-verify
```

### Ce que fait le CI local

1. **Synchronise** le code vers ai-docker-01 (`/tmp/nutrifood-ci/`) via tar+ssh
2. **Lance pytest** dans un container `python:3.13-slim` avec les variables d'environnement de test
3. **Affiche les résultats** détaillés (64 tests, verbose)
4. **Bloque le push** si un seul test échoue

### Fichiers concernés

| Fichier | Rôle |
|---------|------|
| `.github/workflows/ci.yml` | Workflow GitHub Actions (pytest + ruff + bandit). Prêt à activer sur GitHub. |
| `scripts/ci-local.sh` | Script principal — sync + Docker + pytest sur ai-docker-01 |
| `scripts/pre-push` | Hook git appelé avant chaque push |
| `scripts/install-hooks.sh` | Installation du hook pour un nouveau dev |

### Workflow GitHub Actions (pour activation future)

Le fichier `.github/workflows/ci.yml` est configuré pour tourner sur `ubuntu-latest` avec :
- **pytest** — 64 tests (Python 3.12)
- **ruff** — linting du code backend
- **bandit** — scan de sécurité AST

Pour activer : il suffit de pousser le fichier sur GitHub. Les runs se déclencheront sur chaque push/PR vers `main`. Coût : 2 000 min/mois gratuites (repos privés), ~2-3 min par run.

### Ajouter un dev au CI local

Chaque développeur doit :

1. Avoir accès SSH à `ai-docker` (10.81.69.110)
2. Cloner le repo
3. Lancer `bash scripts/install-hooks.sh`

### Dépannage

| Problème | Solution |
|----------|----------|
| `permission denied` sur Docker | `sudo usermod -aG docker <user>` puis nouvelle session SSH |
| `rm: cannot remove` dans /tmp/nutrifood-ci | Le script utilise déjà `sudo rm -rf`, vérifier les permissions Docker |
| Tests lents (~60s+) | Le premier run télécharge `python:3.13-slim` (~150MB). Les runs suivants réutilisent l'image. |
| Image Python introuvable | `ssh ai-docker "sudo docker pull python:3.13-slim"` |

---

## 3. SonarQube — Analyse statique du code

La QA Suite ([github.com/SlopVibe-org/qa-suite](https://github.com/SlopVibe-org/qa-suite)) inclut SonarQube Community Edition pour l'analyse statique du code source.

### Démarrer SonarQube

```bash
git clone https://github.com/SlopVibe-org/qa-suite.git
cd qa-suite
docker compose up -d
```

Attendre ~2 minutes (premier démarrage initialise la DB PostgreSQL). Vérifier :

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:9000/
# Doit retourner 200
```

UI : `http://localhost:9000` — Login par défaut : `admin` / `admin` (changer immédiatement).

### Configuration système (obligatoire)

```bash
sudo sysctl -w vm.max_map_count=524288
sudo sysctl -w fs.file-max=131072
# Rendre permanent :
echo "vm.max_map_count=524288" | sudo tee -a /etc/sysctl.conf
echo "fs.file-max=131072" | sudo tee -a /etc/sysctl.conf
```

### Créer le projet NutriFood

1. SonarQube UI → Administration → Projects → Create
2. Project key : `nutri-food`
3. Project name : `NutriFood`

### Fichier `sonar-project.properties`

Créer à la racine du repo :

```properties
sonar.projectKey=nutri-food
sonar.projectName=NutriFood
sonar.sources=.

# Exclure les dépendances et fichiers de build
sonar.exclusions=node_modules/**,**/*.pyc,__pycache__/**,.venv/**,tests/**

# Python (backend)
sonar.python.file.suffixes=.py

# HTML (frontend — IMPORTANT: ne pas lister .html sous JS aussi)
sonar.html.file.suffixes=.html

# JavaScript (fichiers .js séparés)
sonar.javascript.file.suffixes=.js

# Couverture (si pytest-cov est utilisé)
sonar.python.coverage.reportPaths=coverage.xml
```

### Lancer un scan

```bash
# Token : SonarQube UI → Avatar → My Account → Security → Generate Token
docker run --rm \
  -v $(pwd):/usr/src \
  --network qa-suite_default \
  -e SONAR_HOST_URL=http://qa-sonarqube:9000 \
  -e SONAR_TOKEN=votre_token_ici \
  sonarsource/sonar-scanner-cli
```

### Interpréter les résultats

| Métrique | Description | Cible |
|----------|-------------|-------|
| Bugs | Code qui va mal se comporter | 0 |
| Vulnerabilities | Problèmes de sécurité | 0 |
| Code Smells | Qualité du code (style, complexité) | < 100 |
| Coverage | % couverture de tests | > 80% |
| Duplications | % code dupliqué | < 3% |
| Reliability | Note A-E | A |
| Security | Note A-E | A |
| Maintainability | Note A-E | A |

### Faux positifs connus

- **"Bind to 0.0.0.0"** dans Dockerfile — normal en conteneur. Marquer *Won't Fix*.
- **"CSRF tokens absent"** — l'app utilise JWT/Bearer, pas de cookies. *Won't Fix*.
- **`print()` au lieu de logging** — vrai positif, à corriger (issue #10).

---

## 4. OWASP ZAP — Scan de sécurité dynamique

ZAP attaque l'application en cours d'exécution pour trouver des vulnérabilités réelles (XSS, injection, headers manquants).

### Prérequis

L'app NutriFood doit être accessible depuis le host Docker :
```bash
curl -s -o /dev/null -w "%{http_code}" https://slopvibe.org/nutri-food/api/health
# Doit retourner 200
```

### Scan passif (baseline, 2-5 min)

Ne attaque pas — observe les réponses et vérifie les headers :

```bash
docker run --rm \
  -v zap_sessions:/zap/wrk \
  ghcr.io/zaproxy/zaproxy:stable \
  zap-baseline.py -t https://slopvibe.org/nutri-food/ -T 5 -s
```

- `-T 5` : timeout 5 minutes
- `-s` : sortie courte (masque les PASS, montre seulement les problèmes)

### Scan complet (actif, 15-30 min)

⚠️ **Attaque activement l'app** — utiliser sur une instance de test si possible :

```bash
docker run --rm \
  -v zap_sessions:/zap/wrk \
  ghcr.io/zaproxy/zaproxy:stable \
  zap-full-scan.py -t https://slopvibe.org/nutri-food/ -T 30
```

### Interpréter les résultats

| Niveau | Action |
|--------|--------|
| **FAIL** 🔴 | Vulnérabilité critique — corriger immédiatement |
| **WARN** 🟡 | Problème potentiel — analyser au cas par cas |
| **PASS** 🟢 | Check réussi |
| **INFO** ℹ️ | Informationnel |

### Findings attendus pour NutriFood

NutriFood utilise nginx avec une CSP complète et des security headers (voir `web/nginx.conf`). La plupart des checks devraient passer. Points d'attention :

| Finding possible | Cause | Statut |
|------------------|-------|--------|
| HSTS header | Ajouté par Cloudflare ou nginx | ✅ Déjà présent |
| CSP header | Configuré dans nginx.conf | ✅ Déjà présent |
| X-Content-Type-Options | Configuré dans nginx.conf | ✅ Déjà présent |
| X-Frame-Options | Configuré dans nginx.conf | ✅ Déjà présent |
| JWT dans localStorage | ZAP peut le signaler | ⚠️ Voir issue #16 |
| Duplication de headers | Cloudflare + nginx ajoutent les mêmes | ℹ️ Sans impact |

---

## 5. Lighthouse — Performance et accessibilité

Lighthouse analyse la page rendue : Core Web Vitals, accessibilité, bonnes pratiques, SEO.

### Installation

```bash
npm install -g lighthouse
lighthouse --version  # vérifier l'installation
```

### Audit basique

```bash
# Rapport HTML complet (s'ouvre dans le navigateur)
lighthouse https://slopvibe.org/nutri-food/ --view

# Rapport JSON (pour CI/CD)
lighthouse https://slopvibe.org/nutri-food/ \
  --output=json \
  --output-path=./lighthouse-report.json \
  --quiet \
  --chrome-flags="--headless --no-sandbox --disable-gpu"
```

### Catégories spécifiques

```bash
# Performance + Accessibilité seulement
lighthouse https://slopvibe.org/nutri-food/ --only-categories=performance,accessibility

# Desktop (par défaut : mobile)
lighthouse https://slopvibe.org/nutri-food/ --preset=desktop
```

### Page authentifiée (behind login)

Créer un script de login :

```javascript
// lighthouse-login.js
module.exports = async (page) => {
  await page.goto('https://slopvibe.org/nutri-food/');
  await page.waitForSelector('#auth-email', { visible: true });
  await page.type('#auth-email', 'test@slopvibe.org');
  await page.type('#auth-password', 'motdepasse');
  await page.click('#auth-submit');
  await page.waitForSelector('#search-bar-container', { visible: true });
};
```

```bash
lighthouse https://slopvibe.org/nutri-food/ \
  --max-wait-for-load=45000 \
  --precomputed-lantern-data-path=./lighthouse-login.js
```

### Interpréter les scores

| Score | Évaluation |
|-------|------------|
| 90-100 | 🟢 Bon |
| 50-89 | 🟡 À améliorer |
| 0-49 | 🔴 Mauvais |

### Améliorations connues pour NutriFood

| Issue Lighthouse | Statut NutriFood | Issue GitHub |
|------------------|------------------|--------------|
| Pas de manifest PWA | À faire | #3 |
| JS non bundlé (15+ fichiers) | À faire | #8 |
| Pas de meta description | ✅ Présent | — |
| Pas de main landmark | À vérifier | — |
| Pas de Service Worker | À faire | #3 (PWA) |

---

## 6. Tests manuels — Checklist

### Authentification

- [ ] Register avec email valide → compte créé, token reçu
- [ ] Register avec email dupliqué → erreur 409
- [ ] Register avec nom dupliqué → erreur 409
- [ ] Register avec mot de passe < 6 caractères → erreur 400
- [ ] Login avec email → succès
- [ ] Login avec nom d'utilisateur → succès
- [ ] Login avec mauvais mot de passe → erreur 401
- [ ] Logout → écran de connexion affiché, données effacées
- [ ] Token expiré → redirect vers login

### Suivi nutritionnel (Tracking)

- [ ] Login en mode tracking → données de tracking affichées (pas planification)
- [ ] Ajouter un aliment → case cochée, compteur mis à jour
- [ ] Changer de jour (mode avancé) → données du jour chargées
- [ ] Vue semaine (mode simple) → agrégation correcte
- [ ] Switch tracking ↔ planification → données correctes

### Interface

- [ ] Header PC : logo | recherche centrée | menu (sur une ligne)
- [ ] Header mobile : logo + recherche | menu (wrapped)
- [ ] Changement de tab → contenu mis à jour
- [ ] Recherche d'aliment → résultats filtrés
- [ ] Calories affichées dans le dashboard (non-zéro)

### Partage et export

- [ ] Créer un lien de partage → lien fonctionnel sans auth
- [ ] Accéder au lien partagé → liste d'épicerie affichée
- [ ] Lien invalide → erreur 404

### Responsive

- [ ] Desktop (> 900px) → layout complet
- [ ] Tablette (600-900px) → layout adapté
- [ ] Mobile (< 600px) → recherche pleine largeur, navigation condensée

---

## 7. Workflow de QA recommandé

```
┌──────────────────────────────────────────────────────┐
│                   AVANT CHAQUE RELEASE                │
│                                                       │
│  1. CI locale (pre-push)    → 64 tests doivent passer │
│  2. SonarQube scan          → Rating A sur tous       │
│  3. Lighthouse (desktop)    → > 80 sur les 4 catég.   │
│  4. ZAP baseline            → 0 FAIL                  │
│  5. Checklist manuelle      → Tous les points cochés  │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│               APRÈS CHANGEMENTS MAJEURS                │
│                                                       │
│  • Changements auth/sécurité → ZAP full scan          │
│  • Nouveau endpoint API     → Ajouter tests pytest + CI │
│  • Changements frontend     → Lighthouse + test manuel │
│  • Refactor backend         → SonarQube + pytest + CI  │
└──────────────────────────────────────────────────────┘
```

### Ordre de priorité des fixes

1. 🔴 **Sécurité** (ZAP FAIL, SonarQube Vulnerabilities)
2. 🟠 **Bugs** (pytest failures, SonarQube Bugs)
3. 🟡 **Performance** (Lighthouse < 50)
4. 🔵 **Qualité** (SonarQube Code Smells)
5. ⚪ **Style** (linting, formatting)
