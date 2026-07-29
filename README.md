# 🍎 NutriFood

Outil de planification nutritionnelle pour sélectionner et suivre ses choix d'aliments hebdomadaires, classés par densité nutritionnelle.

## Aperçu

NutriFood permet de:
- **Visualiser** les aliments classés par densité nutritionnelle (du plus nutritif au moins nutritif)
- **Sélectionner** les aliments consommés dans une semaine avec compteurs de portions
- **Suivre** les apports nutritionnels (protéines, fibres, fer, vitamine C, calcium, Ω-3)
- **Journal quotidien** — logger ce que vous avez réellement mangé, voir les carences et suggestions
- **Voir la saisonnalité** des fruits et légumes (Québec) — 🌱 de saison, ✈️ importé
- **Planifier** les repas de la semaine (matin, midi, soir, collation)
- **Générer et partager** des listes d'épicerie
- **Comparer les spéciaux** — intégration epiceries.ca (badges par marchand, meilleurs prix)
- **Imprimer** listes d'épicerie et plans de repas
- **Rechercher** rapidement un aliment (recherche normalisée: accents, ligatures œ→oe)
- **Administrer** les listes d'aliments (admins)

## Démo

🔗 https://slopvibe.org/nutri-food/

## Architecture

- **Frontend:** HTML/CSS/JS vanilla — zéro dépendance, zéro build
- **Backend:** Python Flask + SQLite dans Docker
- **Source unique:** Le frontend charge les données via `GET /api/foods` (une seule source de vérité)
- **Persistance:** SQLite sur volume Docker + `localStorage` pour cache navigateur
- **Email:** SMTP via Fastmail (bienvenue, reset mot de passe)

### Structure des fichiers

```
nutri-food/
├── index.html          # Application frontend complète
├── foods.json          # Base de données nutritionnelle (source de vérité → /data/foods.json dans le container)
├── favicon.svg         # Favicon
├── README.md
└── backend/
    ├── app.py          # API Flask (auth, selections, journal, deals, admin, share, email)
    ├── Dockerfile      # Image Docker Python
    ├── docker-compose.yml
    └── requirements.txt
```

### Structure des données (foods.json)

```json
{
  "sections": [
    { "id": "viandes-laitiers", "name": "Viandes & Produits Laitiers", "icon": "🥩" }
  ],
  "categories": [
    {
      "id": "poissons-gras",
      "name": "Poissons Gras",
      "icon": "🐟",
      "section": "viandes-laitiers",
      "type": "select",
      "weekly_min": 2,
      "weekly_max": 4,
      "foods": [
        {
          "name": "Sardines",
          "density": 100,
          "nutrients": "Ω-3, B12, D, Calcium",
          "nutrition": {
            "protein": 24.6,
            "fiber": 0.0,
            "iron": 2.9,
            "vit_c": 0.0,
            "calcium": 382.0,
            "omega3": 1.48
          },
          "season": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
        }
      ]
    }
  ]
}
```

**Champs:**
- `nutrition` — valeurs par portion (protéine, fibres, fer, vitamine C, calcium, Ω-3)
- `season` — mois (1-12) de saisonnalité locale au Québec (fruits/légumes seulement)
- `import_season` — mois (1-12) de disponibilité en importation (fruits/légumes seulement)
- `absorption` — conseil optionnel d'absorption des nutriments (ex: "Cuire légèrement pour le lycopène")

## API Endpoints

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/api/health` | GET | Health check |
| `/api/foods` | GET | Base de données des aliments (source unique) |
| `/api/register` | POST | Inscription + email bienvenue |
| `/api/login` | POST | Connexion (email ou nom, case-insensitive) |
| `/api/forgot-password` | POST | Envoie magic link par courriel |
| `/api/reset-password` | POST | Reset via token |
| `/api/change-password` | POST | Changer mot de passe (loggué) |
| `/api/me` | GET | Info utilisateur courant |
| `/api/selections` | GET/POST | Sélections hebdomadaires de l'utilisateur |
| `/api/share` | POST | Crée un lien de partage (liste d'épicerie) |
| `/api/shared/<token>` | GET | Récupère la liste d'épicerie partagée |
| `/api/meal-plan` | GET/POST | Planificateur de repas par semaine (ISO) |
| `/api/history` | GET | Liste des snapshots hebdomadaires |
| `/api/history/<week>` | GET | Détail d'une semaine spécifique |
| `/api/nutrition-summary` | GET | Totaux nutritionnels de la semaine |
| `/api/suggestions` | GET | Suggestions d'aliments pour carences |
| `/api/seasonal` | GET | Aliments de saison (mois courant) |
| `/api/goals` | GET/POST | Objectifs nutritionnels personnalisés |
| `/api/journal` | GET | Journal du jour (param `?date=YYYY-MM-DD`) |
| `/api/journal` | POST | Ajouter/modifier entrée du journal |
| `/api/journal` | DELETE | Supprimer entrée du journal |
| `/api/journal/summary` | GET | Résumé des 7 derniers jours |
| `/api/deals` | GET | Spéciaux epiceries.ca (cache 6h) |
| `/api/deals/refresh` | POST | Rafraîchir le cache des spéciaux (admin) |
| `/api/admin/foods` | POST | Modifier foods.json (admin only) |

## Fonctionnalités

### Planification hebdomadaire
- 5 sections nutritionnelles, 24 catégories, ~45 aliments
- Compteurs de portions avec code couleur (sous/dans/excès)
- Anneau de progression basé sur les nutriments réels vs objectifs
- Conseils d'absorption, combinaisons nutritionnelles et mises en garde dans les tooltips
- Indication de portions simples par catégorie (paume de la main, tasse, poignée...)

### Journal nutritionnel quotidien
- Log indépendant de ce que vous avez mangé (n'impacte pas la planification)
- Navigation entre jours (7 jours en arrière)
- Totaux du jour vs objectifs journaliers avec barres de progression
- Suggestions automatiques pour combler les carences

### Spéciaux d'épicerie (epiceries.ca)
- Badges de marchands colorés sur les aliments (partout: dropdowns, checkboxes, chips)
- Tooltip détaillé: produit, prix, format, prix unitaire, lien
- Filtrage de la nourriture pour animaux
- Cache partagé entre workers Gunicorn (fichier JSON, TTL 6h)
- Marchands: Maxi, IGA, Super C, Métro, Provigo, Walmart

### Listes et partage
- Liste d'épicerie avec meilleurs prix et total estimé
- Partage par lien (liste cochable)
- Impression noir sur blanc (texte seul, cases à cocher)

## Sections nutritionnelles

### 🥩 Viandes & Produits Laitiers
- Poissons gras (2-4/sem)
- Poissons blancs (2-3/sem)
- Fruits de mer (1-2/sem)
- Poulet (2-3/sem)
- Œufs (3-6/sem)
- Viande rouge (1/sem)
- Légumineuses (2-4/sem)
- Noix & graines (4-7/sem)
- Lait & produits laitiers (10/sem)

### 🥔 Féculents
- Très bons choix — quinoa, sarrasin, avoine, amarante... (16/sem)
- Bons choix — riz brun/noir/rouge, pâtes complètes, pain au levain... (7/sem)
- Tubercules — patates douces, pommes de terre, topinambours (4/sem)

### 🥬 Légumes
- Verts foncés — kale, brocoli, épinards, asperges... (21/sem)
- Jaune/Orange — carottes, courge, maïs, citrouille... (14/sem)
- Rouges — tomates, betteraves, poivrons rouges, chou rouge... (14/sem)
- Blancs — ail, oignons, chou-fleur, champignons, poireaux... (7/sem)
- Mauves — aubergines, chou violet, carottes mauves, oignons rouges... (7/sem)

### 🍎 Fruits
- Petits fruits — bleuets, framboises, camerises, canneberges... (7/sem)
- Protecteurs (Vit C) — argousier, cassis, kiwi, agrumes, grenade... (7/sem)
- Autres fruits — avocat, mangue, pommes, bananes, litchi... (7/sem)

### 🌱 Habitudes
- Bons gras — huile d'olive, avocat, olives... (14-28/sem)
- Aliments fermentés — kéfir, yaourt, choucroute, kimchi... (7/sem)
- Herbes & épices — persil, curcuma, gingembre, cannelle, ail... (7-21/sem)
- Boissons — eau, thé vert, thé noir, tisanes, lait... (suivi quotidien)

## Déploiement

### Frontend (statique)

```nginx
location /nutri-food/ {
    alias /var/www/nutri-food/;
    index index.html;
    add_header Cache-Control "no-cache, no-store, must-revalidate";
}

location /nutri-food/api/ {
    proxy_pass http://backend:5010/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_pass_request_headers on;
}
```

### Backend (Docker)

```bash
cd backend
docker compose up -d
```

Le backend utilise SQLite (volume `./data/`), JWT pour l'auth, et Fastmail SMTP pour les courriels.

### Données nutritionnelles

Les aliments sont définis dans `foods.json`, stocké dans le container à `/data/foods.json` (volume Docker). Le backend sert ces données via `GET /api/foods`. Une seule source de vérité — le frontend ne lit jamais un fichier statique.

## Roadmap

- [x] Favicon
- [x] Score global basé sur les nutriments (anneau de progression)
- [x] Recherche d'aliments (normalisée: œ→oe, accents, majuscules)
- [x] Liste d'épicerie (modal + copier + partage + impression)
- [x] Détection de doublons entre catégories
- [x] Détail nutritif au survol (tooltip avec absorption, combinaisons, à éviter)
- [x] Partage de liste d'épicerie (lien cochable)
- [x] Mode édition admin (ajouter/retirer des aliments)
- [x] Calcul automatique des apports nutritionnels
- [x] Indicateurs de saisonnalité (🌱 local, ✈️ importé)
- [x] Planificateur de repas (7 jours, 4 repas/jour)
- [x] Historique (snapshots automatiques par semaine ISO)
- [x] Impression (liste d'épicerie et planificateur, noir sur blanc)
- [x] Objectifs nutritionnels personnalisés
- [x] Journal nutritionnel quotidien (indépendant de la planification)
- [x] Spéciaux d'épicerie (epiceries.ca — badges, tooltips, meilleurs prix)
- [x] Conseils d'absorption et combinaisons nutritionnelles
- [x] Portions simples par catégorie (paume, tasse, poignée)
- [x] Source unique de vérité (/api/foods)

## Licence

MIT
