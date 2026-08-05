# 🔍 NutriFood — Revue Complète (2026-08-05)

## 📊 Sommaire

| Catégorie | Critical | High | Medium | Low | Total |
|-----------|----------|------|--------|-----|-------|
| **Backend** | 3 | 8 | 12 | 10 | 33 |
| **Frontend** | 4 | 7 | 10 | 5 | 26 |
| **Fonctionnel** | — | — | — | — | 15 |

---

# BACKEND

## 🔴 Critical

### C1. Race condition sur `deals_raw.json`
- **Fichier:** `utils/foods_helpers.py` — `load_raw_deals / add_to_raw_deals / remove_from_raw_deals / fetch_all_deals_raw`
- **Description:** Read-modify-write du fichier sans lock. Le thread de refresh et les routes admin écrivent en parallèle.
- **Fix:** `threading.Lock` global autour de toutes les opérations fichier.

### C2. `DEALS_BUILDING` non thread-safe
- **Fichier:** `utils/foods_helpers.py` — `trigger_raw_refresh_async()`
- **Description:** Check-then-set sur variable globale sans synchronisation.
- **Fix:** `threading.Lock(acquire(blocking=False))` ou `threading.Event`.

### C3. `get_nf_db()` — fuite de connexions SQLite
- **Fichier:** `extensions.py:get_nf_db()`
- **Description:** Nouvelle connexion à chaque appel, pas stockée dans `g`, pas fermée en contexte hors-request.
- **Fix:** Stocker dans `g` comme `get_db()`, ou utiliser `with closing(...)`.

## 🟠 High

### H1. Pas de validation de date sur endpoints tracking
- **Fichier:** `blueprints/tracking.py` — `save_tracking, get_tracking, delete_tracking, tracking_nutrition`
- **Description:** `<date>` accepté telquel, pas de validation `YYYY-MM-DD`.
- **Fix:** `datetime.date.fromisoformat(date)` + return 400 si invalide.

### H2. Rate limiting par IP seule
- **Fichier:** `extensions.py:check_rate_limit`
- **Description:** Derrière un proxy, tous partent la même IP. `X-Forwarded-For` ignoré.
- **Fix:** `request.headers.get('X-Forwarded-For', request.remote_addr)`.

### H3. Rate limit manquant sur `reset-password`
- **Fichier:** `blueprints/auth.py`
- **Description:** Pas de `check_rate_limit` sur reset-password — exposé au brute-force.

### H4. `tracking_nutrition` utilise date serveur au lieu de la semaine visualisée
- **Fichier:** `blueprints/tracking.py:tracking_nutrition()`
- **Description:** Si utilisateur navigue vers une semaine passée, le dashboard montre la semaine courante.

### H5. `fetch_all_deals_raw()` fait 160+ requêtes HTTP sans retry
- **Fichier:** `utils/foods_helpers.py`
- **Description:** Une erreur réseau sur un aliment skip silencieusement. Pas de retry, pas de log structuré.

### H6. Secrets en clair dans le code
- **Fichier:** `extensions.py` — SECRET_KEY hardcoded
- **Fix:** Variables d'environnement uniquement.

### H7. Pas de CSRF protection
- **Fichier:** Toutes les routes POST
- **Description:** JWT en cookie httpOnly sans CSRF token. SameSite=Strict aide mais pas complet.

### H8. SMTP error handling silencieux
- **Fichier:** `blueprints/auth.py`
- **Description:** Le thread SMTP daemon avale les exceptions. Si l'email fail, l'utilisateur ne sait jamais.

## 🟡 Medium

- **M1.** `_build_food_dict()` hardcode `density or 50` — valeur arbitraire
- **M2.** `filter_deals()` fait du filtering côté serveur à chaque requête
- **M3.** `load_foods()` ne cache pas — 160+ queries DB à chaque appel `/api/foods`
- **M4.** `_extract_food_keywords()` rstrip('s') — primitif, casse sur pluriels irréguliers
- **M5.** Suggestions `_find_suggestion_foods` skip cats par ID hardcodé
- **M6.** `_validate_share_link` fait `datetime.fromisoformat` dans try/catch générique
- **M7.** Pas de logging structuré — `print()` partout
- **M8.** Pas de health check endpoint
- **M9.** DB migrations manuelles pas versionnées
- **M10.** Tests ne couvrent pas les blueprints deals, journal, meal_plan, export, suggestions
- **M11.** `journal.py` — pas de validation du format date
- **M12.** `selections.py` — pas de limite de taille sur les données stockées

---

# FRONTEND

## 🔴 Critical

### C1. `journal.js` — auth header cassé
- **Fichier:** `journal.js:42, 59, 99, 120`
- **Description:** `'Authorization': '***' + token` au lieu de `'Bearer ' + token`. Tous les appels API du journal échouent en 401.
- **Fix:** Replace `***` par `Bearer ` (4 occurrences).

### C2. `getTodayISO()` dupliquée
- **Fichier:** `core.js:135` + `journal.js:9`
- **Description:** Redéfinition silencieuse selon l'ordre de chargement.
- **Fix:** Supprimer dans `journal.js`.

### C3. `renderSimple()` — event listener leak
- **Fichier:** `render.js:486-491`
- **Description:** `document.addEventListener('click', ...)` ajouté à chaque render. Après N renders, N listeners actifs.
- **Fix:** Extraire hors de `renderSimple()`, utiliser un flag.

### C4. `deals.js` — listener global fragile
- **Fichier:** `deals.js:185`
- **Description:** `document.addEventListener` au moment du chargement. Double-chargement possible.
- **Fix:** Utiliser un flag.

## 🟠 High

### H1. Checkbox uncheck — premier match seulement
- **Fichier:** `render.js:356-360`
- **Description:** `querySelector` retourne le premier seulement. Multi-tabs cassé.
- **Fix:** `querySelectorAll` + iterate.

### H2. Double `renderForm()` dans cnf.js
- **Fichier:** `cnf.js:430-435`
- **Description:** Recrée le DOM, perd le focus.

### H3. Race condition sur `addSimpleFood()`
- **Fichier:** `render.js:600-604`
- **Description:** Deux clics rapides écrasent les données (last-write-wins sur `trackingWeek`).
- **Fix:** Mutex/queue.

### H4. `loadDeals().then(render())` — render prématuré
- **Fichier:** `app.js:70-74`
- **Description:** Render peut s'exécuter avant que `loadUserGoals()` soit fini.

### H5. `removeSimpleFood` — await séquentiel silencieux
- **Fichier:** `food-modal.js:264-272`
- **Description:** Erreurs par jour avalées silencieusement.

### H6. `esc()` ne couvre pas backtick
- **Fichier:** `core.js:119-121`
- **Fix:** Ajouter backtick à `ENTITY_MAP`.

### H7. `switchMode('tracking')` ne sauvegarde pas
- **Fichier:** `tracking.js:23-30`
- **Description:** Clone `selections` dans `planningSelections` mais ne sauve pas au serveur. Pertes possibles.

## 🟡 Medium

- **M1.** `fetchWithTimeout` ne cancel pas la requête (pas d'AbortController)
- **M2.** `render()` reconstruit tout le DOM à chaque appel
- **M3.** `submitForgotPassword` utilise `fetch` sans timeout
- **M4.** `_buildWeekSlotsForCat` — 4 niveaux de boucles, difficile à tester
- **M5.** `_seasonalCache` jamais invalidé (TTL manquant)
- **M6.** `share.js:loadSharedView` — pas de gestion d'erreur réseau
- **M7.** `submitResetPassword` fait `window.location.reload()` — incohérent
- **M8.** `cnfSaveToDatabase` — formule de densité arbitraire non documentée
- **M9.** `scheduleAutoSave()` en mode simple — modifications qty non sauvegardées
- **M10.** `innerHTML +=` encore présent — casse event listeners

---

# FONCTIONNEL

## 🔥 Features backend sans frontend (P1)

### F1. Journal nutritionnel — invisible dans l'UI
- API complète (`/api/journal` CRUD + summary) + `journal.js`, mais **aucun bouton/menu**. Code mort.
- **Effort:** Small — HTML + wiring menu.

### F2. Meal Plans — pas de frontend du tout
- API `/api/meal-plan` (GET/POST) + table DB, mais **aucun JS ni UI**. Feature morte.
- **Effort:** Medium.

## ✨ Features à ajouter

### F3. Onboarding / tutoriel (P2)
- Nouvel utilisateur arrive sans guide. Pas d'explication Suivi vs Planification, Avancé vs Simplifié.
- **Effort:** Medium.

### F4. Notifications / rappels (P2)
- Pas de push pour rappeler de tracker. SW déjà présent.
- **Effort:** Medium.

### F5. Mode offline PWA incomplet (P2)
- Assets cachés mais pas les données utilisateur. IndexedDB manquant.
- **Effort:** Large.

### F6. Profil utilisateur — allergies, régimes (P2)
- Aucun filtrage alimentaire. Objectifs génériques.
- **Effort:** Medium.

### F7. Partage social / export image (P3)
- Limité au lien d'épicerie.
- **Effort:** Medium.

## 🔧 Améliorations

### F8. Vue simplifiée sans nutriments (P1)
- Dashboard nutritionnel disparaît en mode simple. Aucun feedback visuel.
- **Effort:** Small.

### F9. Objectifs par défaut génériques (P1)
- 350g protéines/sem pour tout le monde. Pas de personnalisation poids/sexe/âge.
- **Effort:** Medium.

### F10. Historique sans graphiques (P2)
- Table textuelle seulement. Pas de tendances.
- **Effort:** Medium.

### F11. Liste d'épicerie depuis tracking (P2)
- Utilise toujours `planningSelections`, jamais le tracking. Vide si utilisateur tracking-only.
- **Effort:** Small.

### F12. Recherche limitée à 160 aliments (P2)
- CNF (5993 aliments) existe mais admin-only.
- **Effort:** Small.

### F13. Portions en grammes (P2)
- Portions abstraites (1, 2, 3...). `PORTION_GRAMS_DB` existe mais pas exposé.
- **Effort:** Small.

### F14. Deals non filtrés par localisation (P3)
- Pas de filtre ville/code postal.
- **Effort:** Medium.

---

# PLAN RECOMMANDÉ

| # | Issue | Priorité | Effort |
|---|-------|----------|--------|
| 1 | Fix journal.js auth header | P1 | S |
| 2 | Fix renderSimple() listener leak | P1 | S |
| 3 | Valider dates sur endpoints tracking | P1 | S |
| 4 | Exposer Journal dans l'UI | P1 | M |
| 5 | Mini-dashboard en vue simplifiée | P1 | S |
| 6 | Lock thread-safe deals_raw.json | P2 | S |
| 7 | Rate limit reset-password + X-Forwarded-For | P2 | S |
| 8 | Onboarding premier usage | P2 | M |
| 9 | Notifications push | P2 | M |
| 10 | Support bilingue FR/EN (#9) | P3 | L |
| 11 | Mode offline (IndexedDB) | P3 | L |
| 12 | Profil utilisateur | P3 | M |
