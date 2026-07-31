# NutriFood

App de planification de repas et suivi nutritionnel basée sur le Guide alimentaire canadien.

## Fonctionnalités

### Planification hebdomadaire
- Sélection d'aliments par catégorie (protéines, légumes, fruits, grains, etc.)
- Calcul automatique des objectifs nutritionnels (protéines, fibres, fer, vitamine C, calcium, oméga-3, calories)
- Objectifs personnalisables par semaine
- Liste d'épicerie générée à partir des sélections
- Suggestions de portions et carences en nutriments
- Sauvegarde automatique et historique des semaines

### Suivi quotidien (tracking)
- Onglet "Suivi" (par défaut) pour enregistrer ce que vous mangez réellement
- Navigation par jour (‹ ›) pour consulter l'historique
- Dashboard double : totaux du jour (instantané) + cumul de la semaine (API)
- Données préservées entre les deux modes (planification ↔ suivi)
- Mode mémorisé dans localStorage

### Spéciaux (deals hebdomadaires)
- Liste des spéciaux d'épiceries.ca regroupés par catégorie
- Classés du meilleur rabais (prix unitaire le plus bas)
- Logos des chaînes (IGA, Metro, Super C, Maxi, Provigo, Walmart)
- Bouton "+" pour ajouter directement à la sélection
- Clic sur une ligne → fiche produit sur le site du marchand
- Tooltips au survol : nom complet du produit, magasin, format/prix/rabais

## Architecture

### Stack
- **Frontend:** HTML/CSS/JS vanilla (14 modules modulaires avec lazy loading)
- **Backend:** Python Flask (API REST, ~1675 lignes)
- **DB:** SQLite (nutrifood.db)
- **Déploiement:** Docker Compose

### Docker
```
nutrifood-api   (Flask/Gunicorn, port 5000 interne)
nutrifood-web   (Nginx, port 5011 → proxy vers API)
```

### Données persistantes (volume `./data:/data`)
- `nutrifood.db` — base de données SQLite (users, selections, tracking, history, goals)
- `deals_raw.json` — données brutes des spéciaux (fetch hebdomadaire depuis epiceries.ca)

### Schéma DB
- `users` — comptes utilisateurs (email, password_hash, is_admin)
- `selections` — planification hebdomadaire par utilisateur
- `tracking` — suivi quotidien (user_id, date, data JSON)
- `history_snapshots` — snapshots des semaines passées
- `goals` — objectifs nutritionnels personnalisés

## Système de deals (epiceries.ca)

### Architecture en 3 couches

1. **`/data/deals_raw.json`** (source de vérité)
   - Fetch brut depuis epiceries.ca, une fois par semaine
   - Stocke TOUS les résultats sans filtrage
   - **JAMAIS modifié** après écriture (sauf refresh hebdomadaire)

2. **`filter_deals(raw, foods)`** (pure function)
   - Lit le raw, applique les filtres, retourne les deals valides
   - Aucun side effect — le raw reste intact
   - Filtres: word-boundary matching, exclusion animaux, produits transformés, strict match pour herbes/épices/noix

3. **API `/api/deals`**
   - Sert les deals filtrés en temps réel
   - Déclenche un refresh auto si le raw a >1 semaine
   - Le bouton "🔄 Rafraîchir" (admin) force un refresh manuel

### Pourquoi cette architecture?
- On ne hammer pas epiceries.ca (1 fetch/semaine, pas plus)
- Les filtres peuvent changer sans re-fetch
- Le raw persiste à travers les rebuilds Docker (volume monté)

## API Endpoints

### Aliments
- `GET /api/foods` — liste des catégories et aliments

### Authentification
- `POST /api/signup` — inscription
- `POST /api/login` — connexion (retourne JWT)
- `GET /api/me` — profil utilisateur courant
- `POST /api/change-password` — changement de mot de passe
- `POST /api/forgot-password` — mot de passe oublié (envoi lien)
- `POST /api/reset-password` — réinitialisation via magic link

### Planification
- `GET /api/selections` — sélections de l'utilisateur
- `POST /api/selections` — sauvegarder les sélections
- `GET /api/history` — historique des semaines
- `GET /api/history/<week>` — détail d'une semaine

### Suivi (tracking)
- `GET /api/tracking/<date>` — sélections du jour
- `POST /api/tracking/<date>` — sauvegarder le jour
- `DELETE /api/tracking/<date>` — effacer les données du jour
- `GET /api/tracking/week` — toutes les entrées de la semaine
- `DELETE /api/tracking/week` — effacer toute la semaine (lundi→dimanche)
- `GET /api/tracking/nutrition/<date>` — totaux nutritionnels (jour + semaine cumulée)

### Objectifs
- `GET /api/goals` — objectifs nutritionnels
- `POST /api/goals` — mettre à jour les objectifs

### Spéciaux (deals)
- `GET /api/deals` — spéciaux filtrés (lus depuis deals_raw.json, filtrés à la volée)
- `POST /api/deals/refresh` — forcer un refresh du raw (admin only)

### Autres
- `GET /api/suggestions` — suggestions basées sur carences
- `POST /api/share` — générer un lien de partage
- `GET /api/share/<token>` — vue partagée (lecture seule)

## Sécurité

### Headers de sécurité (nginx)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Strict-Transport-Security` (HSTS)
- `Content-Security-Policy` (CSP)
- `Referrer-Policy`
- `Permissions-Policy`
- `Cross-Origin-Embedder-Policy`

### Authentification
- JWT tokens (Bearer), pas de cookies de session
- Password hashing (PBKDF2)
- Token invalidation on password change

### Résultats QA (Lighthouse / SonarQube / OWASP ZAP)
- **Lighthouse:** Performance 99, Accessibility 100, SEO 100
- **SonarQube:** 0 bugs, Reliability A, Maintainability A
- **OWASP ZAP:** 0 FAIL, 53 PASS — aucune vulnérabilité exploitable

## Installation

### Prérequis
- Docker + Docker Compose
- Port 5011 disponible (ou modifier docker-compose.yml)

### Déploiement
```bash
git clone https://github.com/SlopVibe-org/nutri-food.git
cd nutri-food
cp .env.example .env  # Éditer avec vos valeurs
docker compose up -d
```

### Configuration (.env)
```
JWT_SECRET=votre_secret_long_et_aleatoire
DB_PATH=/data/nutrifood.db
```

## Données nutritionnelles

- **Aliments personnalisés:** ajoutés via l'interface admin
- **CNF (Canadian Nutrient File):** 5993 aliments de Santé Canada intégrés
- **Objectifs par défaut (hebdomadaires):** Protéines 350g, Fibres 175g, Fer 56mg, Vit C 280mg, Calcium 700mg, Oméga-3 3.5g, Calories 14000kcal

## Licence

GPL-3.0
