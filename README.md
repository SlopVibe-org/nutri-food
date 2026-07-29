# NutriFood

App de planification de repas et suivi nutritionnel basée sur le Guide alimentaire canadien.

## Architecture

Deux containers Docker:

| Container | Rôle | Port |
|-----------|------|------|
| `nutrifood-api` | Backend Flask/Gunicorn (API + auth + DB SQLite) | 5000 (interne) |
| `nutrifood-web` | Frontend nginx (fichiers statiques + proxy API) | 5011→80 |

```
Utilisateur → nginx (reverse proxy) → nutrifood-web:5011
                                        ├── /        → fichiers statiques
                                        └── /api/    → nutrifood-api:5000
```

### Structure des dossiers

```
nutrifood/
├── docker-compose.yml       ← Stack complet
├── .env                     ← Vos secrets (NON commité)
├── .env.example             ← Template des variables
├── backend/
│   ├── Dockerfile
│   ├── app.py               ← API Flask
│   └── requirements.txt
├── web/
│   ├── Dockerfile           ← nginx + entrypoint
│   ├── entrypoint.sh        ← Seed les fichiers au premier run
│   ├── nginx.conf           ← Config nginx (static + proxy)
│   └── defaults/            ← Fichiers par défaut (baked dans l'image)
│       ├── index.html
│       ├── favicon.svg
│       └── foods.json
├── config/                  ← Fichiers vivants (bind mount, créé au 1er run)
└── data/                    ← DB + données persistantes (bind mount)
    └── nutrifood.db         ← SQLite: CNF + aliments + sélections + objectifs
```

## Fonctionnalités

### Planification hebdomadaire
- Aliments classés par densité nutritionnelle (score sur 100)
- 5 sections: Viandes & Laitiers, Féculents, Légumes, Fruits, Habitudes
- 24 catégories, ~154 aliments visibles
- Sélection par semaine (reset le lundi)
- Contrôle des portions par catégorie (minimums/max hebdomadaires)

### Base de données nutritionnelles (CNF)
- **Source:** Fichier canadien sur les éléments nutritifs (FCÉN), Santé Canada 2026
- 5993 aliments dans la base, 154 visibles dans l'app
- 36 nutriments suivis (protéines, fibres, fer, vitamine C, calcium, oméga-3, calories)
- Recherche et ajout d'aliments via la modale "Gérer les produits"
- Alias multi-langues (FR, EN, scientifique)

### Suivi nutritionnel
- Calcul automatique des totaux nutritionnels (par semaine + moyenne journalière)
- Objectifs personnalisables (défaut: valeurs hebdomadaires DRIs Canada)
  - Protéines: 350g/sem · Fibres: 175g/sem · Fer: 56mg/sem
  - Vitamine C: 280mg/sem · Calcium: 700mg/sem · Oméga-3: 3.5g/sem
  - Calories: 14 000 kcal/sem (2000/jour — moyenne adulte DRIs)
- Barres de progression par nutriment (% de l'objectif)
- Suggestions intelligentes basées sur les carences + portions manquantes

### Suggestions nutritionnelles
- Détection des carences (< 80% de l'objectif)
- Vérification des portions par catégorie (vs minimums hebdomadaires)
- Recommandations d'aliments non sélectionnés (NOVA 1 seulement)
- Aliments de saison affichés dans le panneau de suggestions

### Spéciaux d'épicerie (aubaines)
- Intégration avec l'API epiceries.ca
- Affichage des spéciaux en vigueur par aliment
- Filtrage automatique:
  - Exclut la nourriture pour animaux (chat, chien, etc.)
  - Exclut les produits transformés/transformés (saveur, nouilles, sauce, etc.)
  - Le mot-clé de l'aliment doit apparaître dans le nom du produit
- Badges 🏷️ sur les chips + détails dans la modale aliment
- Cache partagé entre workers (TTL 6h, refresh automatique)

### Gestion des produits (admin)
- Modale à onglets: **Ajouter** | **Retirer**
- **Ajouter:** Recherche dans la base CNF → sélection → ajout à une catégorie
- **Retirer:** Liste de tous les aliments → clic pour masquer (visible=0)
- Auto-détection de catégorie selon le groupe CNF
- Calcul automatique du score de densité

### Modale aliment (clic sur un chip)
- Informations nutritionnelles complètes (par 100g)
- Badge de saison (🌱 de saison / ✈️ importé)
- Conseils d'absorption et mises en garde
- Spéciaux d'épicerie (section repliable)
- Aliments apparentés dans d'autres catégories

### Autres fonctionnalités
- 🔐 Authentification JWT (login/inscription/reset password)
- 📋 Liste d'épicerie générée depuis les sélections
- 📅 Planificateur de repas
- 📝 Journal alimentaire quotidien
- 📊 Historique des semaines précédentes
- 🔗 Partage de sélections (liens temporaires 30 jours)
- 📱 Interface mobile (PWA-friendly)

## Installation

### 1. Cloner et configurer

```bash
git clone https://github.com/SlopVibe-org/nutri-food.git
cd nutri-food
cp .env.example .env
```

### 2. Éditer `.env`

```bash
# Obligatoire: générer un JWT secret
python3 -c "import secrets; print(secrets.token_hex(32))"
# Coller la valeur dans JWT_SECRET

# Configurer le SMTP pour les emails (reset password, welcome)
# Voir .env.example pour tous les paramètres
```

### 3. Démarrer

```bash
docker compose up -d
```

Au premier démarrage, l'entrypoint du container web copie automatiquement les fichiers par défaut (`index.html`, `favicon.svg`) depuis l'image vers le volume `config/`.

### 4. Accéder

L'app est disponible sur `http://localhost:5011/`.

## Variables d'environnement

Voir [`.env.example`](.env.example) pour le template complet.

| Variable | Description | Défaut |
|----------|-------------|--------|
| `JWT_SECRET` | Secret pour signer les tokens d'auth | **Requis** |
| `JWT_EXPIRY_HOURS` | Durée de validité des tokens | 2160 (90 jours) |
| `SMTP_HOST` | Serveur SMTP pour les emails | — |
| `SMTP_PORT` | Port SMTP | 465 |
| `SMTP_USER` | Utilisateur SMTP | — |
| `SMTP_PASS` | Mot de passe SMTP | — |
| `MAIL_FROM` | Adresse d'envoi | — |
| `APP_URL` | URL publique (pour liens email) | — |

## Base de données

### SQLite (`data/nutrifood.db`)

| Table | Description |
|-------|-------------|
| `users` | Comptes utilisateurs (id, email, name, password, is_admin, token_version) |
| `selections` | Sélections hebdomadaires par utilisateur |
| `user_goals` | Objectifs nutritionnels personnalisés (prot, fib, fer, vit C, calcium, oméga-3, calories) |
| `history_snapshots` | Instantanés des semaines précédentes |
| `share_links` | Liens de partage temporaires (30j TTL) |
| `meal_plans` | Planificateur de repas |
| `journal_entries` | Journal alimentaire quotidien |
| `nf_sections` | 5 sections principales |
| `nf_categories` | 24 catégories (avec tips d'absorption) |
| `nf_foods` | Aliments (154 visibles, source_type: 0=custom/1=CNF) |
| `nf_foods_aliases` | Alias de recherche (1292 entrées) |
| `nf_foods_nutrients` | Valeurs nutritionnelles par 100g |

### Migrations automatiques
- Ajout de colonnes (ex: `calories` dans `user_goals`) géré par `ALTER TABLE` au démarrage
- Pas besoin de migration manuelle

## Persistance

- **`config/`** — Fichiers statiques servis par nginx. Survivent aux rebuilds.
- **`data/`** — Base de données SQLite (`nutrifood.db`). Survit aux rebuilds.

Pour modifier le frontend: éditer les fichiers dans `config/` directement sur le host. Pas besoin de rebuild.

## Développement

```bash
# Rebuild après changement de code backend
docker compose build nutrifood-api && docker compose up -d

# Voir les logs
docker compose logs -f

# Modifier le frontend (pas besoin de rebuild)
# Éditer config/index.html → refresh du navigateur

# Accéder à la DB SQLite
sqlite3 data/nutrifood.db

# Commandes utiles (dans le container API)
docker exec nutrifood-api python3 -c "import sqlite3; ..."
```

## Sécurité

- JWT signé avec secret (fail-fast si manquant)
- Invalidation des tokens au changement de mot de passe (token_version)
- Mots de passe hachés (PBKDF2-SHA256, 100k iterations)
- En-têtes de sécurité nginx (X-Frame-Options, CSP, etc.)
- Liens de partage avec TTL de 30 jours
- Noms d'utilisateur dupliqués bloqués à l'inscription

## Licence

GPL-3.0

## Source de données nutritionnelles

Les données nutritionnelles proviennent du **Fichier canadien sur les éléments nutritifs (FCÉN)** de Santé Canada, mis à jour en 2026.

🔗 [Fichier canadien sur les éléments nutritifs — Santé Canada](https://www.canada.ca/fr/sante-canada/services/aliments-nutrition/saine-alimentation/donnees-nutritionnelles/fichier-canadien-elements-nutritifs-propos-nous.html)

Licence: [Licence du gouvernement ouvert — Canada](https://open.canada.ca/fr/licence-du-gouvernement-ouvert-canada)

## Spéciaux d'épicerie

Données fournies par [epiceries.ca](https://epiceries.ca) — API publique de spéciaux alimentaires.
