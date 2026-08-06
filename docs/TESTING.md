# 🧪 NutriFood — Guide de test

Ce document décrit la stratégie de test, les checklists manuelles, et les résultats d'outils automatisés pour NutriFood.

---

## Tests automatisés

### Backend (Python)

```bash
# En local avec venv
cd backend
JWT_SECRET=votre_secret DB_PATH=/tmp/test.db python3 -m pytest tests/ -v

# Dans le conteneur Docker
docker exec nutrifood-api python3 -m pytest tests/ -v

# Avec couverture
docker exec nutrifood-api python3 -m pytest tests/ -v --cov=. --cov-report=term-missing
```

Couverture :
- Authentification (register, login, logout, reset password, change password)
- Rate limiting
- Validation des entrées
- API admin (hide/show aliments)
- Tracking et planification
- Export CSV
- Deals et rafraîchissement
- Suggestions nutritionnelles
- Profil utilisateur
- Meal plans
- Health endpoints (health, backup)
- CSRF protection
- Journal nutritionnel (entrées, summary)

#### Couverture de code

| Métrique | Valeur |
|----------|--------|
| Tests totaux | 93 |
| Couverture globale | 74% |
| Modules ≥ 90% | app.py, export.py, suggestions.py, journal.py, extensions.py |
| Modules à améliorer | foods.py (20%), profile.py (38%), nutrition.py (54%), foods_helpers.py (56%) |

La CI GitHub Actions exécute `pytest --cov --cov-fail-under=60` et upload le rapport en artifact.

### Frontend (JavaScript)

Les tests frontend sont actuellement manuels. Une suite Vitest est planifiée.

---

## Checklist manuelle — Interface

### Navigation générale
- [ ] Chargement de la page d'accueil sans erreurs console
- [ ] Header mobile : logo + recherche + menu (sur une ligne)
- [ ] Header desktop : logo + recherche + navigation complète
- [ ] Footer visible et correct
- [ ] Mode sombre/clair fonctionnel

### Authentification
- [ ] Inscription réussie avec email valide
- [ ] Erreur sur email déjà utilisé
- [ ] Connexion réussie
- [ ] Déconnexion redirige vers login (clear cookie httpOnly via `/api/logout`)
- [ ] Mot de passe oublié envoie un email
- [ ] Reset password via magic link fonctionnel
- [ ] Session persistante via cookie httpOnly (migration #38)
- [ ] Token CSRF envoyé sur les requêtes mutatives (double-submit cookie, #39)

### Vue avancée
- [ ] Cartes d'aliments affichées correctement
- [ ] Chips de nutriments visibles
- [ ] Ajout d'un aliment à la planification
- [ ] Retrait d'un aliment
- [ ] Recherche d'aliment fonctionnelle
- [ ] Filtres par catégorie
- [ ] Dropdown searchable (simple sélection)

### Vue simplifiée
- [ ] Cases à cocher par aliment
- [ ] Jours de la semaine affichés
- [ ] Toggle Avancé/Simplifié fonctionne
- [ ] Bouton reset visible et fonctionnel

### Profil utilisateur
- [ ] Accès au menu profil
- [ ] Saisie du poids, taille, âge, sexe
- [ ] Sélection du niveau d'activité
- [ ] Sélection du régime alimentaire
- [ ] Saisie des allergies
- [ ] Recommandation d'objectifs affichée après sauvegarde
- [ ] Persistance des données après rechargement

### Journal nutritionnel (#45)
- [ ] Bouton Journal dans le menu utilisateur
- [ ] Ajout d'un aliment avec quantité
- [ ] Suppression d'une entrée
- [ ] Graphique de tendances 7 jours (Chart.js)
- [ ] Graphique de tendances 30 jours
- [ ] Toggle des nutriments dans le graphique
- [ ] Sélection de date pour consulter l'historique

---

## Checklist manuelle — Sécurité

### Authentification et sessions
- [ ] Les mots de passe sont hashés avec argon2id (#36)
- [ ] Migration transparente : un ancien utilisateur PBKDF2 est re-hashé au login
- [ ] Le JWT est stocké en cookie httpOnly + Secure + SameSite (#38)
- [ ] Le localStorage ne contient plus de token JWT
- [ ] Le logout appelle `/api/logout` pour clearer les cookies

### CSRF (#39)
- [ ] Cookie `nf_csrf_token` présent après login
- [ ] Requêtes POST/PUT/DELETE incluent le header `X-CSRF-Token`
- [ ] Requête POST sans CSRF token → 403

### CSP et headers (#43)
- [ ] Header `Content-Security-Policy` inclut `form-action 'self'`, `worker-src 'self'`, `manifest-src 'self'`
- [ ] `cdn.jsdelivr.net` n'est plus dans `script-src` (Chart.js auto-hébergé)
- [ ] Aucun header CSP dupliqué (Cloudflare + nginx)
- [ ] `X-Frame-Options: DENY`
- [ ] `Strict-Transport-Security` actif
- [ ] `X-Content-Type-Options: nosniff`

---

## Checklist manuelle — Partage et export

- [ ] Génération d'un lien de partage
- [ ] Ouverture d'un lien de partage par un autre utilisateur
- [ ] Expiration du lien après délai
- [ ] Export CSV → fichier téléchargé avec planification, tracking et objectifs

---

## Checklist manuelle — Résilience (#44)

- [ ] Si epiceries.ca est indisponible, les anciens spéciaux sont conservés
- [ ] Si aucun deal n'est disponible, message « Spéciaux temporairement indisponibles »
- [ ] Health endpoint `/api/health` inclut `deals_count`, `deals_last_refresh`, `deals_stale`
- [ ] Après 2 échecs de refresh consécutifs, `deals_stale: true`

---

## Checklist manuelle — Backup (#40)

- [ ] Endpoint `/api/health/backup` retourne le dernier backup
- [ ] Script `backend/scripts/backup_db.py` crée un snapshot atomique (VACUUM INTO)
- [ ] Rétention : 7 quotidiens + 4 hebdomadaires
- [ ] Cron nocturne configuré sur le serveur

---

## Outils automatisés

### Lighthouse

| Catégorie | Score | Statut |
|-----------|-------|--------|
| Performance | 🟢 100 | ✅ |
| Accessibility | 🟢 100 | ✅ |
| Best Practices | 🟡 92 | ⚠️ CSP unsafe-inline (style) |
| SEO | 🟢 100 | ✅ |
| PWA | 🟢 Installable | ✅ Résolu (#3) |
| Service Worker | 🟢 Actif | ✅ Résolu (#8 esbuild) |

### OWASP ZAP — Baseline Scan

- 🔴 FAIL : **0**
- 🟡 WARN : **19** (CSP hardening — `unsafe-inline` pour style, directives wildcard)
  - Note: Les directives manquantes (`form-action`, `worker-src`, `manifest-src`) ont été ajoutées (#43)
  - Le `unsafe-inline` reste pour `style-src` (nécessaire pour le rendu)
  - `script-src` est maintenant `'self'` uniquement (Chart.js auto-hébergé, plus de CDN)
- 🟢 INFO : **2** (cache-control, modern web app)

### SonarQube

- **Bugs :** 0 ✅
- **Vulnérabilités :** 1 (faux positif — CORS flagged comme CSRF disabled, mais CSRF est implémenté via double-submit cookie)
- **Code Smells :** 51 (principalement `var` → `let/const` et littéraux dupliqués — pré-existant)
- **Security Hotspots :** 0 ✅
- **Duplication :** 0.3%

---

## Procédure de test avant déploiement

1. **Sauvegarder** la base de données (`python3 backend/scripts/backup_db.py`)
2. **Pull** le code : `git pull origin main`
3. **Reconstruire** : `docker compose up -d --build` (ou via `scripts/deploy.sh`)
4. **Exécuter** les tests automatisés backend : `pytest tests/ --cov`
5. **Passer** la checklist manuelle (Interface + Sécurité + Résilience)
6. **Vérifier** les scores Lighthouse
7. **Purger** le cache Cloudflare
8. **Confirmer** en production

---

## Voir aussi

- [Guide administrateur](ADMIN_GUIDE.md)
- [Rapport QA](QA_REPORT.md)
- [Guide de déploiement](DEPLOYMENT.md)
- [Guide utilisateur](USER_GUIDE.md)
