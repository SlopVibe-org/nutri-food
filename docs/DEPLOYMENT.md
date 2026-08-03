# 🚀 Guide de déploiement — NutriFood

Ce guide couvre le déploiement complet de NutriFood avec Docker Compose.

---

## 📋 Prérequis serveur

| Composant | Version minimale | Notes |
|-----------|------------------|-------|
| **OS** | Debian 12+ / Ubuntu 22.04+ | Linux x64 |
| **Docker** | 24+ | Avec plugin Compose v2 |
| **Domaine** | — | Ex: `slopvibe.org` |
| **Cloudflare** | — | DNS + proxy (orange cloud) |
| **SMTP** | — | Compte Fastmail ou équivalent |

### Vérifier les prérequis

```bash
docker --version          # Docker version 24+
docker compose version    # Docker Compose v2+
```

---

## 🔧 Étape 1 — Cloner le dépôt

```bash
cd /opt
git clone https://github.com/SlopVibe-org/nutri-food.git nutrifood
cd nutrifood
```

---

## 🐳 Étape 2 — Configuration

### 2.1 Variables d'environnement

Copiez le fichier d'exemple et éditez-le :

```bash
cp .env.example .env
```

```env
JWT_SECRET=<générer_avec_openssl_rand_hex_32>
DB_PATH=/data/nutrifood.db
JWT_EXPIRY_HOURS=2160
SMTP_HOST=smtp.fastmail.com
SMTP_PORT=465
SMTP_USER=votre@email.com
SMTP_PASS=votre_mot_de_passe
MAIL_FROM=votre@email.com
APP_URL=https://votre-domaine.com/nutri-food/
```

### 2.2 Générer un JWT_SECRET sécurisé

```bash
openssl rand -hex 32
```

---

## 🐳 Étape 3 — Démarrer les conteneurs

Les images sont publiées sur [GitHub Container Registry](https://github.com/orgs/SlopVibe-org/packages) :

```bash
cd /opt/nutrifood
docker compose up -d    # Pull les images depuis ghcr.io
```

Cela démarre 2 conteneurs :

| Conteneur | Image | Port | Rôle |
|-----------|-------|------|------|
| `nutrifood-api` | `ghcr.io/slopvibe-org/nutrifood-backend:latest` | 5000 (interne) | API REST + SQLite |
| `nutrifood-web` | `ghcr.io/slopvibe-org/nutrifood-web:latest` | 5011 (hôte) | Frontend statique + reverse proxy |

### Vérifier

```bash
docker ps | grep nutrifood
# nutrifood-api   ...   Up
# nutrifood-web   ...   Up   0.0.0.0:5011->80/tcp

curl http://localhost:5011/api/health
# {"status":"ok"}
```

---

## 🌐 Étape 4 — Reverse proxy externe (optionnel)

Si vous utilisez un nginx externe ou Cloudflare pour terminer SSL :

```nginx
location /nutri-food/ {
    proxy_pass http://127.0.0.1:5011/nutri-food/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

### Architecture réseau

```
Internet → Cloudflare (DNS proxy, SSL) → Serveur:5011 (nutrifood-web/nginx)
                                         → /api/ proxy vers nutrifood-api:5000
```

Le conteneur nginx gère déjà :
- Headers de sécurité (CSP, HSTS, X-Frame-Options, etc.)
- Cache-Control (no-cache pour HTML/JS)
- Proxy inverse vers l'API

---

## ☁️ Étape 5 — Configuration Cloudflare

### DNS

| Type | Nom | Contenu | Proxy |
|------|-----|---------|-------|
| A | `votre-domaine.com` | IP du serveur | 🟠 Proxied |

### SSL/TLS

1. **SSL/TLS → Overview** → Mode : **Full (strict)**
2. **Edge Certificates** → Always Use HTTPS : ✅

### Purger le cache (après mise à jour)

```bash
curl -X POST "https://api.cloudflare.com/client/v4/zones/<ZONE_ID>/purge_cache" \
  -H "Authorization: Bearer <API_TOKEN>" \
  -H "Content-Type: application/json" \
  --data '{"purge_everything": true}'
```

---

## 👤 Étape 6 — Créer le premier administrateur

1. Allez sur `https://votre-domaine.com/nutri-food/` et créez un compte
2. Promouvez en admin :

```bash
docker exec nutrifood-api python3 -c "
import sqlite3
db = sqlite3.connect('/data/nutrifood.db')
db.execute('UPDATE users SET is_admin = 1 WHERE email = \"vous@exemple.com\"')
db.commit()
print('Admin créé!')
db.close()
"
```

---

## 📁 Structure de déploiement

```
/opt/nutrifood/
├── docker-compose.yml      # Orchestration 2 conteneurs (images ghcr.io)
├── .env                    # Variables (JWT_SECRET, SMTP, etc.)
├── data/                   # Volume → /data dans nutrifood-api
│   ├── nutrifood.db
│   ├── cnf.db
│   └── deals_raw.json
└── scripts/
    ├── deploy.sh           # Pull + restart
    ├── ci-local.sh         # CI local via Docker
    └── install-hooks.sh    # Hook pre-push
```

---

## 💾 Sauvegarde et restauration

### Sauvegarde manuelle

```bash
docker exec nutrifood-api sqlite3 /data/nutrifood.db ".backup '/data/backup.db'"
cp /opt/nutrifood/data/backup.db /opt/backups/nutrifood-$(date +%Y%m%d).db
```

### Sauvegarde automatique (cron)

```cron
# Sauvegarde quotidienne à 3h, rétention 30 jours
0 3 * * * docker exec nutrifood-api sqlite3 /data/nutrifood.db ".backup '/data/backup.db'" && cp /opt/nutrifood/data/backup.db /opt/backups/nutrifood-$(date +\%Y\%m\%d).db && find /opt/backups/ -name "nutrifood-*.db" -mtime +30 -delete
```

### Restauration

```bash
docker compose -f /opt/nutrifood/docker-compose.yml down
cp /opt/backups/nutrifood-20260115.db /opt/nutrifood/data/nutrifood.db
docker compose -f /opt/nutrifood/docker-compose.yml up -d
```

---

## 🔄 Mise à jour

### Méthode recommandée (images ghcr.io)

```bash
# Pull les dernières images + restart (~5s de downtime)
bash scripts/deploy.sh

# Ou manuellement
cd /opt/nutrifood
docker compose pull
docker compose up -d
docker image prune -f    # Nettoyer les anciennes images
```

### Rollback vers une version antérieure

```bash
# Éditer docker-compose.yml avec le tag désiré
# image: ghcr.io/slopvibe-org/nutrifood-backend:v1.0.0
docker compose up -d
```

### Sauvegarde avant mise à jour

```bash
docker exec nutrifood-api sqlite3 /data/nutrifood.db ".backup '/data/backup.db'"
```

### Workflow de release

Les images sont taggées automatiquement :
- **`latest`** — dernier push sur main (via `docker-publish.yml`)
- **`v1.0.0`** — sur GitHub Release (via `release.yml`)
- **`sha-xxxxx`** — par commit

Créer une release :
```bash
git tag v1.0.0
git push origin v1.0.0
# → GitHub Actions build & push les images taggées
# → Créer la release sur GitHub pour déclencher le workflow
```

---

## 🛠️ Dépannage

### Le conteneur ne démarre pas

```bash
docker logs nutrifood-api
docker logs nutrifood-web
```

### Erreur 502 Bad Gateway

- `nutrifood-api` tourne ? → `docker ps`
- Santé de l'API ? → `curl http://localhost:5011/api/health`

### Les courriels ne partent pas

```bash
docker exec nutrifood-api env | grep SMTP
docker logs nutrifood-api 2>&1 | grep -i smtp
```

### Base SQLite verrouillée

```bash
docker exec nutrifood-api sqlite3 /data/nutrifood.db "PRAGMA wal_checkpoint(TRUNCATE);"
```
