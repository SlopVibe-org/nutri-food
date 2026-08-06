# 🧪 NutriFood — Guide de test

Ce document décrit la stratégie de test, les checklists manuelles, et les résultats d'outils automatisés pour NutriFood.

---

## Tests automatisés

### Backend (Python)

```bash
cd /opt/nutrifood
docker exec nutrifood-api python3 -m pytest tests/ -v
```

Couverture :
- Authentification (register, login, logout, reset password)
- Rate limiting
- Validation des entrées
- API admin (hide/show aliments)
- Tracking et planification

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
- [ ] Déconnexion redirige vers login
- [ ] Mot de passe oublié envoie un email
- [ ] Reset password via magic link fonctionnel
- [ ] JWT persistant (cookie httpOnly)

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

---

## Checklist manuelle — Partage et export

- [ ] Génération d'un lien de partage
- [ ] Ouverture d'un lien de partage par un autre utilisateur
- [ ] Expiration du lien après délai
- [ ] Export CSV → fichier téléchargé avec planification, tracking et objectifs

---

## Outils automatisés

### Lighthouse

| Catégorie | Score | Statut |
|-----------|-------|--------|
| Performance | 🟢 100 | ✅ |
| Accessibility | 🟢 100 | ✅ |
| Best Practices | 🟢 100 | ✅ |
| SEO | 🟢 100 | ✅ |
| PWA | 🟢 Installable | ✅ Résolu (#3) |
| Service Worker | 🟢 Actif | ✅ Résolu (#8 esbuild) |

### OWASP ZAP — Baseline Scan

- 🔴 FAIL : **0**
- 🟡 WARN : **5** (CSP hardening — voir QA_REPORT.md)
- 🟢 INFO : **1**

### SonarQube

- **Bugs :** 0 ✅
- **Vulnérabilités :** 2 (choix d'architecture, non-exploitables)
- **Code Smells :** 4 (complexité cognitive, contraste CSS)

#### Faux positifs SonarQube

| Règle | Localisation | Statut | Note |
|-------|-------------|--------|------|
| python:S1192 | `app.py` (print) | ✅ Résolu (#10) | Le `print()` était dans un bloc de diagnostic, maintenant retiré |
| javascript:S7785 | `app.js:115` | Accepté | Top-level await dans un contexte non-module intentionnel |

---

## Procédure de test avant déploiement

1. **Sauvegarder** la base de données (`sqlite3 .backup`)
2. **Pull** le code : `git pull origin main`
3. **Reconstruire** : `docker compose up -d --build`
4. **Exécuter** les tests automatisés backend
5. **Passer** la checklist manuelle (Interface + Auth + Profils)
6. **Vérifier** les scores Lighthouse
7. **Purger** le cache Cloudflare
8. **Confirmer** en production

---

## Voir aussi

- [Guide administrateur](ADMIN_GUIDE.md)
- [Rapport QA](QA_REPORT.md)
- [Guide de déploiement](DEPLOYMENT.md)
- [Guide utilisateur](USER_GUIDE.md)
