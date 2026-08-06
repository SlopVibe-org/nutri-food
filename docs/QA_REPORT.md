# 🍎 NutriFood — Rapport QA

**Date:** 1er août 2026  
**Note:** Des changements ont été apportés depuis cette date (5 août — profil utilisateur, recherche CNF étendue, fix sécurité). Un re-run QA complet est recommandé.  
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

**Scores parfaits — zéro issue.**

---

## OWASP ZAP — Baseline Scan

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
| 4 | CSP: script-src unsafe-inline | Scripts inline (app cache) |
| 5 | CSP: style-src unsafe-inline | Styles inline |

---

## SonarQube

**Server:** http://10.81.69.110:9000  
**Project:** nutrifood  
**Lines of code:** 5 237

| Métrique | Valeur |
|----------|--------|
| Bugs | **0** ✅ |
| Vulnérabilités | **2** (choix d'architecture) |
| Code Smells | **4** |
| Duplication | **0.3%** |
| Rating Fiabilité | **A** ✅ |
| Rating Maintenabilité | **A** ✅ |

### Vulnérabilités (choix d'architecture, non-exploitable)

| # | Sévérité | Localisation | Description | Justification |
|---|----------|-------------|-------------|---------------|
| 1 | CRITICAL | `app.py:20` | CSRF désactivé | JWT Bearer tokens, pas de cookies → CSRF non applicable |
| 2 | BLOCKER | `app.py:2036` | Bind 0.0.0.0 | Conteneur Docker — port exposé via docker-compose |

### Code Smells (4)

| # | Règle | Localisation | Description |
|---|-------|-------------|-------------|
| 1 | css:S7924 | `index.html:573` | Contraste minimal (reset-badge) |
| 2 | javascript:S7785 | `app.js:115` | Top-level await (non-module script) |
| 3 | javascript:S3776 | `cnf.js:215` | Complexité cognitive (20/15) |
| 4 | javascript:S3776 | `render.js:474` | Complexité cognitive (26/15) — event delegation |

### Évolution des code smells

| Session | Avant | Après | Réduction |
|---------|-------|-------|-----------|
| 31 juillet (initial) | 695 | 18 | 97.4% |
| 31 juillet (refactor) | 18 | 3 | 83.3% |
| 1er août (final) | 4 | 4 | — (stable) |

---

## Audit base de données

| Vérification | Résultat |
|-------------|----------|
| Aliments total | **160** |
| Aliments sans highlights | **0** ✅ |
| Aliments sans aliases | **0** ✅ |
| Aliments avec densité 0/NULL | **3** (Tisane, Kombucha, Ghee — pas de micronutriments) |
| Catégories vides | **0** ✅ |
| Aliments dupliqués | **0** ✅ |
| Aliments cachés | **0** ✅ |

---

## Tests manuels

| Test | Desktop | Mobile |
|------|---------|--------|
| Chargement page | ✅ | ✅ |
| Connexion | ✅ | ✅ |
| Vue avancée (cartes, chips) | ✅ | ✅ |
| Vue simplifiée (cases, jours) | ✅ | ✅ |
| Toggle Avancé/Simplifié | ✅ | ✅ |
| Recherche d'aliment | ✅ | ✅ |
| Ajout/retrait d'aliment | ✅ | ✅ |
| Dropdown searchable (simple) | ✅ | ✅ |
| Bouton reset | ✅ | ✅ |
| Header sur une ligne | ✅ | ✅ |
| Header sur une ligne (mobile) | ✅ | ✅ |

---

## Sommaire

**NutriFood est en excellente santé.** Scores Lighthouse parfaits, zéro bug, zéro vulnérabilité exploitable, base de données propre. Les 4 code smells restants sont des choix techniques (complexité de fonctions event handlers, contraste CSS edge case) qui n'affectent ni la sécurité ni la fonctionnalité.
