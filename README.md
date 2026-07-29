# NutriFood

App de planification de repas et suivi nutritionnel.

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
```

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

Au premier démarrage, l'entrypoint du container web copie automatiquement les fichiers par défaut (`index.html`, `favicon.svg`, `foods.json`) depuis l'image vers le volume `config/`.

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
```

## Licence

Privé — SlopVibe-org
