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
- Onglet "Suivi" pour enregistrer ce que vous mangez réellement
- Navigation par jour (‹ ›) pour consulter l'historique
- Dashboard double : totaux du jour (instantané) + cumul de la semaine (API)
- Données préservées entre les deux modes (planification ↔ suivi)

### Spéciaux (deals)
- Liste des spéciaux hebdomadaires d'épiceries.ca
- Regroupés par catégorie, classés du meilleur rabais en bas
- Logos des chaînes (IGA, Metro, Super C, Maxi, Provigo, Walmart)
- Bouton "+" pour ajouter directement à la sélection
- Clic sur une ligne → fiche produit sur le site du marchand

## Architecture

### Stack
- **Frontend:** HTML/CSS/JS vanilla (single file, ~3300 lignes)
- **Backend:** Python Flask (API REST)
- **DB:** SQLite (nutrifood.db)
- **Déploiement:** Docker Compose sur ai-docker-01 (10.81.69.110)

### Docker
```
ai-docker-01 (10.81.69.110)
├── nutrifood-api   (Flask/Gunicorn, port 5000 interne)
└── nutrifood-web   (Nginx, port 5011 → proxy vers API)
```

### Données persistantes (volume `./data:/data`)
- `nutrifood.db` — base de données SQLite (users, selections, tracking, history, goals, journal)
- `deals_raw.json` — données brutes des spéciaux (fetch hebdomadaire depuis epiceries.ca)

### Schéma DB
- `users` — comptes utilisateurs (email, password_hash, is_admin)
- `selections` — planification hebdomadaire par utilisateur
- `tracking` — suivi quotidien (user_id, date, data JSON)
- `history_snapshots` — snapshots des semaines passées
- `goals` — objectifs nutritionnels personnalisés
- `journal_entries` — journal alimentaire (legacy, non utilisé dans l'UI)

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
- `GET /api/tracking/week` — toutes les entrées de la semaine
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

## Installation

### Prérequis
- Docker + Docker Compose
- Port 5011 disponible (ou modifier docker-compose.yml)

### Déployement
```bash
git clone https://github.com/SlopVibe-org/nutri-food.git
cd nutri-food
cp .env.example .env  # Éditer avec vos valeurs
docker compose up -d
```

Le site sera accessible sur le port 5011.

### Configuration (.env)
```
JWT_SECRET=votre_secret_jwt_tres_long
DB_PATH=/data/nutrifood.db
```

## Données nutritionnelles

- **Aliments personnalisés:** ajoutés via l'interface admin
- **CNF (Canadian Nutrient File):** 5993 aliments de Santé Canada intégrés
- **Objectifs par défaut (hebdomadaires):** Protéines 350g, Fibres 175g, Fer 56mg, Vit C 280mg, Calcium 700mg, Oméga-3 3.5g, Calories 14000kcal

## Licence

GPL-3.0
