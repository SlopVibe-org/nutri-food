# 🍎 NutriFood — Rapport QA

**Date:** 31 juillet 2025  
**Commit:** `41ec4b7`  
**URL:** https://slopvibe.org/nutri-food/

---

## Lighthouse

| Catégorie | Score |
|-----------|-------|
| Performance | 🟢 99 |
| Accessibility | 🟢 100 |
| Best Practices | 🟢 100 |
| SEO | 🟢 100 |

### Core Web Vitals

| Métrique | Valeur |
|----------|--------|
| First Contentful Paint | 1.0s |
| Largest Contentful Paint | 1.2s |
| Total Blocking Time | 10ms |
| Cumulative Layout Shift | 0.068 |
| Speed Index | 1.0s |

---

## OWASP ZAP — Baseline Scan

| Type | Nombre |
|------|--------|
| 🔴 FAIL | **0** |
| 🟡 WARN | 11 |
| 🟢 PASS | 56 |

**0 vulnérabilité exploitable.**

### Analyse des WARNs

| Règle | Sévérité | Cible | NutriFood? |
|-------|----------|-------|------------|
| Re-examine Cache-control | INFO | slopvibe.org/ (root) | ❌ Non |
| Multiple X-Frame-Options | LOW | NutriFood | ⚠️ Doublon nginx + Cloudflare |
| Suspicious Comments | INFO | render.js | ❌ Commentaires innocents |
| HSTS Not Set | LOW | widget/* (502) | ❌ Autre service |
| Non-Storable Content | INFO | NutriFood | ℹ️ Intentionnel (no-cache) |
| Retrieved from Cache | INFO | robots.txt | ❌ Non |
| CSP Missing Fallback | LOW | NutriFood + root | ⚠️ CSP partiel |
| Permissions Policy | LOW | widget/* (502) | ❌ Autre service |
| Modern Web Application | INFO | NutriFood | ℹ️ Normal pour SPA |
| Sub-Resource Integrity | LOW | slopvibe.org/ (root) | ❌ Non |
| Cross-Origin-Resource-Policy | LOW | NutriFood + root | ❌ Nginx, pas app |

---

## SonarQube — Static Analysis

| Métrique | Valeur |
|----------|--------|
| Lines of code | 4,637 |
| Bugs | 🟢 **0** |
| Vulnerabilities | 🟡 **2** (faux positifs) |
| Security hotspots | 🟢 **0** |
| Code smells | 🟡 **18** |
| Duplicated lines | 🟢 **0.4%** |

### Évolution des code smells

| Session | Code smells | Réduction |
|---------|-------------|-----------|
| Scan initial | 695 | — |
| Batch 1 (var→let, CSS dedup, labels) | 168 | -76% |
| Batch 2 (optional chaining, complexity) | 87 | -87% |
| Batch 3 (catch blocks, decodeEntities) | 36 | -95% |
| Batch 4 (refactor app.py, constants) | **18** | **-97.4%** |

### 2 Vulnerabilities (faux positifs)

| Règle | Description | Statut |
|-------|-------------|--------|
| python:S4502 | CSRF protection disabled | Faux positif — JWT Bearer tokens, pas de cookies |
| python:S8392 | Bind to 0.0.0.0 | Faux positif — requis pour Docker networking |

### 18 Code smells résiduels

| Règle | Nombre | Description |
|-------|--------|-------------|
| javascript:S7781 | 4 | `normalizeForSearch` — ligatures (œ→oe) intentionnelles |
| python:S3776 | 3 | Fonctions encore légèrement au-dessus de 15 |
| javascript:S3776 | 3 | `init()`, `cnfSearch()`, event handler |
| javascript:S2486 | 3 | Catch blocks avec showToast déjà présent |
| javascript:S6582 | 2 | Faux positifs (?. partiellement présent) |
| python:S1481 | 1 | cat_name variable |
| css:S7924 | 1 | Contraste limite |
| javascript:S7785 | 1 | Top-level await — intentionnel |

---

## Sécurité

### Headers de sécurité (8/8)

| Header | Statut |
|--------|--------|
| Content-Security-Policy | ✅ |
| Strict-Transport-Security (HSTS) | ✅ |
| X-Content-Type-Options: nosniff | ✅ |
| X-Frame-Options: SAMEORIGIN | ✅ |
| Referrer-Policy | ✅ |
| Permissions-Policy | ✅ |
| Cross-Origin-Embedder-Policy | ✅ |
| Cross-Origin-Opener-Policy | ✅ |

### Authentification

- JWT Bearer tokens (pas de cookies de session)
- Password hashing: PBKDF2-SHA256
- Token invalidation on password change
- Rate limiting: 10 req/min sur endpoints sensibles

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
| OWASP ZAP | stable | ai-docker (10.81.69.110) |
| SonarQube Community | 26.7.0 | ai-docker (10.81.69.110:9000) |
| SonarScanner CLI | 7.1.0 | ai-002 |
