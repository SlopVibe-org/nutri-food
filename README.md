# 🍎 NutriFood

Outil de planification nutritionnelle pour sélectionner et suivre ses choix d'aliments hebdomadaires, classés par densité nutritionnelle.

## Aperçu

NutriFood permet de:
- **Visualiser** les aliments classés par densité nutritionnelle (du plus nutritif au moins nutritif)
- **Sélectionner** les aliments consommés dans une semaine avec compteurs de portions
- **Suivre** les apports nutritionnels (protéines, fibres, fer, vitamine C, calcium, Ω-3)
- **Voir la saisonnalité** des fruits et légumes (Québec)
- **Générer et partager** des listes d'épicerie
- **Rechercher** rapidement un aliment
- **Administrer** les listes d'aliments (admins)

## Démo

🔗 https://slopvibe.org/nutri-food/

## Architecture

- **Frontend:** HTML/CSS/JS vanilla — zéro dépendance, zéro build
- **Backend:** Python Flask + SQLite dans Docker
- **Persistance:** SQLite sur volume Docker + `localStorage` pour cache navigateur
- **Email:** SMTP via Fastmail (bienvenue, reset mot de passe)

### Structure des fichiers

```
nutri-food/
├── index.html          # Application frontend complète
├── foods.json          # Base de données nutritionnelle (sections + catégories + aliments)
├── favicon.svg         # Favicon
├── README.md
└── backend/
    ├── app.py          # API Flask (auth, selections, admin, share, email)
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
- `season` — mois (1-12) de saisonnalité au Québec (fruits/légumes seulement)

## API Endpoints

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/api/health` | GET | Health check |
| `/api/register` | POST | Inscription + email bienvenue |
| `/api/login` | POST | Connexion (email ou nom, case-insensitive) |
| `/api/forgot-password` | POST | Envoie magic link par courriel |
| `/api/reset-password` | POST | Reset via token |
| `/api/change-password` | POST | Changer mot de passe (loggué) |
| `/api/me` | GET | Info utilisateur courant |
| `/api/selections` | GET/POST | Sélections de l'utilisateur |
| `/api/share` | POST | Crée un lien de partage (liste d'épicerie) |
| `/api/shared/<token>` | GET | Récupère la liste d'épicerie partagée |
| `/api/admin/foods` | POST | Modifier foods.json (admin only) |

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
- Mauves — aubergines, chou violet, carottes mauves... (7/sem)

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

## Roadmap

- [x] Favicon
- [x] Score global (anneau de progression)
- [x] Recherche d'aliments
- [x] Liste d'épicerie (modal + copier + partage)
- [x] Détection de doublons entre catégories
- [x] Détail nutritif au survol (tooltip)
- [x] Partage de liste d'épicerie (lien cochable)
- [x] Mode édition admin (ajouter/retirer des aliments)
- [x] Calcul automatique des apports nutritionnels
- [x] Indicateurs de saisonnalité (Québec)
- [ ] Planificateur de repas (drag vers jours de la semaine)
- [ ] Historique (snapshots semaine par semaine)

## Licence

MIT
