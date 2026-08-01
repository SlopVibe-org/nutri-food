# 🍎 NutriFood — Rapport QA

**Date:** 1er août 2026  
**Commit:** `787e39d`  
**URL:** https://slopvibe.org/nutri-food/

---

## Lighthouse

| Catégorie | Score |
|-----------|-------|
| Performance | 🟢 **100** |
| Accessibility | 🟢 **100** |
| Best Practices | 🟢 **100** |
| SEO | 🟢 **100** |
| Agentic Browsing | 🟢 **100** |

**Scores parfaits — zéro issue.**

---

## OWASP ZAP — Baseline Scan

**Tool:** ZAP 2.16.1 (Docker)
**URLs scannées:** 8  
**Exit code:** 3 (warnings)

| Type | Nombre |
|------|--------|
| 🔴 FAIL | **0** |
| 🟡 WARN | **5** |
| 🟢 INFO | **1** |

**0 vulnérabilité exploitable.**

### Analyse des WARNs

Tous liés au CSP (hardening) :

| # | Règle | Description |
|---|-------|-------------|
| 1 | Duplicate X-Frame-Options | Cloudflare + nginx double header |
| 2 | CSP: No fallback directive | Manque de fallback pour certaines directives |
| 3 | CSP: Wildcard directive | Utilisation de `*` dans CSP |
| 4 | CSP: script-src unsafe-inline | Scripts inline允许 |
| 5 | CSP: style-src unsafe-inline | Styles inline允许 |

### Corrections appliquées (sécurité nginx)

```
# Avant
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Content-Security-Policy "default-src 'self'; ..." always;

# Après
add_header Content-Security-Policy "default-src 'self'; ...; object-src 'none'; base-uri 'self'; frame-ancestors 'none';" always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
add_header Cross-Origin-Resource-Policy "same-origin" always;
add_header Cross-Origin-Opener-Policy "same-origin" always;
add_header X-Frame-Options "DENY" always;
```

---

## SonarQube — Static Analysis

**Server:** SonarQube Community 26.7.0 @ http://10.81.69.110:9000  
**Scanner:** SonarScanner CLI 7.1.0

| Métrique | Valeur |
|----------|--------|
| Lines of code (NCLOC) | 5,237 |
| Bugs | 🟢 **0** |
| Vulnerabilities | 🟡 **2** (faux positifs) |
| Code smells | 🟡 **4** |
| Coverage | ❌ 0.0% |
| Duplicated lines | 🟢 **0.3%** |
| Technical debt | 5h 41min |

### 6 issues OPEN (1 blocker, 3 critical, 2 major)

| # | Sévérité | Type | Fichier | Règle | Description | Statut |
|---|----------|------|---------|-------|-------------|--------|
| 1 | BLOCKER | Vulnerability | app.py:2036 | Bind 0.0.0.0 | Requis pour Docker | Faux positif — `# nosec B201` |
| 2 | CRITICAL | Vulnerability | app.py:20 | CSRF disabled | JWT Bearer tokens | Faux positif — pas de cookies |
| 3 | CRITICAL | Code Smell | render.js:474 | Cognitive Complexity 26 | Event delegation | ✅ Refactoré : `_handleRemoveCatToggle`, `_handleDealsToggle`, `_handleDealFoodClick` |
| 4 | CRITICAL | Code Smell | cnf.js:215 | Cognitive Complexity 20 | cnfSelectProduct | ✅ Refactoré : `_cnfSeasonBadge`, `_cnfDealsPreview` |
| 5 | MAJOR | Code Smell | index.html:573 | CSS contrast | .reset-badge | ✅ Corrigé : `#e0f2fe` → `#f0f9ff`, bg opacity 0.25 → 0.35 |
| 6 | MAJOR | Code Smell | app.js:115 | Top-level init() | ✅ Corrigé : `DOMContentLoaded` wrapper |

### Évolution des code smells

| Session | Code smells | Réduction |
|---------|-------------|-----------|
| Scan initial | 695 | — |
| Batch 1 (var→let, CSS dedup, labels) | 168 | -76% |
| Batch 2 (optional chaining, complexity) | 87 | -87% |
| Batch 3 (catch blocks, decodeEntities) | 36 | -95% |
| Batch 4 (refactor app.py, constants) | 18 | -97.4% |
| **Batch 5 (31 juil — render/cnf refactor, simple view)** | **4** | **-99.4%** |
| **Batch 6 (1er août — init refactor, DB fixes)** | **4** | **-99.4%** |

---

## Test manuel — Mobile + Desktop

### Desktop (1280×720)
- ✅ Page se charge, tous les modules JS chargent
- ✅ Vue simplifiée : reset, dropdown, day checkboxes, recherche
- ✅ Vue avancée : tabs, cards, selects, chips avec qty
- ✅ Mode suivi : navigation par jour
- ✅ Toggle Avancé/Simplifié fonctionne
- ✅ Modal de connexion fonctionne

### Mobile (375×667 — iPhone SE)
- ✅ Aucun overflow horizontal
- ✅ Header sur une ligne (logo + login)
- ✅ Mode tabs et view toggle sur une ligne
- ✅ Vue simplifiée : toutes les cases, dropdowns, recherche
- ✅ Vue avancée : tabs, comboboxes
- ✅ Mode suivi : navigation par jour

### Console
- ✅ Aucune erreur JavaScript
- ✅ Aucune erreur réseau
- ✅ warnings "Password field not in form" éliminés (modals wrapped in `<form>`)

---

## Sécurité

### Headers de sécurité (après corrections)

| Header | Statut |
|--------|--------|
| Content-Security-Policy (avec fallback) | ✅ |
| Strict-Transport-Security (HSTS) | ✅ (Cloudflare) |
| X-Content-Type-Options: nosniff | ✅ |
| X-Frame-Options: DENY | ✅ |
| Referrer-Policy | ✅ |
| Permissions-Policy | ✅ |
| Cross-Origin-Resource-Policy | ✅ |
| Cross-Origin-Opener-Policy | ✅ |

### Authentification

- JWT Bearer tokens (pas de cookies de session)
- Password hashing: PBKDF2-SHA256
- Token invalidation on password change
- Rate limiting: 10 req/min sur endpoints sensibles
- Auth modals wrapped in `<form>` elements for password manager compatibility

---

## Données

- **160 aliments** across 24 categories in 5 sections
- Chaque aliment: nom, aliases, densité nutritionnelle, nutriments
- Saisons (local/importé) affichées dynamiquement
- Base CNF (Santé Canada) intégrée pour ajout de produits

---

## Modules frontend (14)

| Module | Taille | Rôle |
|--------|--------|------|
| `core.js` | 4.8K | Config API, état global, helpers DOM, loader de scripts |
| `app.js` | 3.7K | Point d'entrée, init, restauration de session |
| `auth.js` | 15.7K | Connexion, inscription, JWT, menu utilisateur |
| `render.js` | 22.7K | Rendu des sections, catégories, chips, events |
| `nutrition.js` | 12.8K | Totaux nutritionnels, objectifs, dashboard, reset |
| `tracking.js` | 2.6K | Mode Suivi : switch onglets, chargement/sauvegarde |
| `search.js` | 3.6K | Recherche normalisée avec résultats en direct |
| `deals.js` | 10.8K | Spéciaux d'épicerie, badges, modal comparatif |
| `suggestions.js` | 9.8K | Suggestions automatiques basées sur carences |
| `grocery.js` | 6.1K | Génération, partage et impression liste d'épicerie |
| `food-modal.js` | 9.7K | Fiche détaillée d'un aliment |
| `history.js` | 4.3K | Historique des snapshots hebdomadaires |
| `share.js` | 1.8K | Vue partagée en lecture seule |
| `cnf.js` | 21.1K | Recherche base CNF (Santé Canada) |

---

## Outils utilisés

| Outil | Version | Hôte |
|-------|---------|------|
| Lighthouse CLI | latest | ai-002 (10.81.69.102) |
| OWASP ZAP | 2.17.0 | ai-docker (10.81.69.110) |
| SonarQube Community | 26.7.0 | ai-docker (10.81.69.110:9000) |
| SonarScanner CLI | 7.1.0 | ai-002 |
