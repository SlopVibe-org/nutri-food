# 🚀 Guide de déploiement — NutriFood

Ce guide couvre le déploiement complet de NutriFood sur un serveur Linux avec Docker, Nginx et Cloudflare.

---

## 📋 Prérequis serveur

| Composant | Version minimale | Notes |
|-----------|------------------|-------|
| **OS** | Debian 12+ / Ubuntu 22.04+ | Linux x64 |
| **Docker** | 24+ | Avec plugin Compose v2 |
| **Nginx** | 1.18+ | Reverse proxy |
| **Python** | 3.13+ | Uniquement pour tests locaux hors Docker |
| **Domaine** | — | Ex: `slopvibe.org` |
| **Cloudflare** | — | DNS + proxy (orange cloud) |
| **SMTP** | — | Compte Fastmail ou équivalent |

### Vérifier les prérequis

```bash
docker --version          # Docker version 24+
docker compose version    # Docker Compose v2+
nginx -v                  # nginx version: nginx/1.18+
```

---

## 🔧 Étape 1 — Cloner le dépôt

```bash
cd /opt
git clone https://github.com/SlopVibe-org/nutri-food.git nutrifood
cd nutrifood
```

Si le repo est privé, configurez votre clé SSH ou un token d'accès GitHub.

---

## 🐳 Étape 2 — Configurer le backend Docker

### 2.1 Variables d'environnement

Éditez `backend/docker-compose.yml` :

```yaml
services:
  nutrifood-api:
    build: .
    container_name: nutrifood-api
    restart: unless-stopped
    ports:
      - "5010:5000"
    volumes:
      - ./data:/data
    dns:
      - 8.8.8.8
      - 1.1.1.1
    environment:
      - DB_PATH=/data/nutrifood.db
      - JWT_SECRET=<REMPLACER_PAR_UN_SECRET_ALÉATOIRE_64_CHARS>
      - JWT_EXPIRY_HOURS=2160
      - SMTP_HOST=smtp.fastmail.com
      - SMTP_PORT=465
      - SMTP_USER=ai@slopvibe.org
      - SMTP_PASS=<MOT_DE_PASSE_SMTP>
      - MAIL_FROM=ai@slopvibe.org
      - APP_URL=https://votre-domaine.com/nutri-food/
```

### 2.2 Générer un JWT_SECRET sécurisé

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
# ou
openssl rand -hex 32
```

⚠️ **Important :** Ne réutilisez jamais le JWT_SECRET par défaut du dépôt. Chaque déploiement doit avoir le sien.

### 2.3 Démarrer le conteneur

```bash
cd /opt/nutrifood/backend
docker compose up -d --build
```

Vérifier que le conteneur tourne :

```bash
docker ps | grep nutrifood
# nutrifood-api   ...   Up   0.0.0.0:5010->5000/tcp
```

### 2.4 Tester l'API

```bash
curl http://localhost:5010/api/health
# {"status":"ok"}
```

---

## 🌐 Étape 3 — Configuration Nginx

### 3.1 Frontend statique

Copiez les fichiers frontend :

```bash
mkdir -p /var/www/nutri-food
cp /opt/nutrifood/index.html /var/www/nutri-food/
cp /opt/nutrifood/favicon.svg /var/www/nutri-food/
# foods.json est servi par l'API — ne pas copier
```

### 3.2 Configuration du reverse proxy

Ajoutez dans votre configuration Nginx (ex: `/etc/nginx/sites-available/default`) :

```nginx
# Frontend statique
location /nutri-food/ {
    alias /var/www/nutri-food/;
    index index.html;
    add_header Cache-Control "no-cache, no-store, must-revalidate";

    # Support du routing par hash (#share=, #reset=)
    try_files $uri $uri/ /nutri-food/index.html;
}

# API backend (proxy vers Docker)
location /nutri-food/api/ {
    proxy_pass http://127.0.0.1:5010/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_pass_request_headers on;

    # Timeouts pour requêtes SMTP (reset password)
    proxy_read_timeout 60s;
    proxy_connect_timeout 10s;
}
```

### 3.3 Valider et recharger

```bash
sudo nginx -t          # Test de configuration
sudo systemctl reload nginx
```

---

## ☁️ Étape 4 — Configuration Cloudflare

### 4.1 DNS

| Type | Nom | Contenu | Proxy |
|------|-----|---------|-------|
| A | `votre-domaine.com` | IP du serveur | 🟠 Proxied |
| CNAME | `www` | `votre-domaine.com` | 🟠 Proxied |

### 4.2 SSL/TLS

1. **SSL/TLS → Overview** → Mode : **Full (strict)**
2. **Edge Certificates** → Activer :
   - Always Use HTTPS : ✅
   - Minimum TLS Version : 1.2
   - Automatic HTTPS Rewrites : ✅

### 4.3 Purger le cache

Après une mise à jour du frontend :

```bash
# Via l'API Cloudflare
curl -X POST "https://api.cloudflare.com/client/v4/zones/<ZONE_ID>/purge_cache" \
  -H "Authorization: Bearer <API_TOKEN>" \
  -H "Content-Type: application/json" \
  --data '{"purge_everything": true}'
```

Ou via le dashboard : **Caching → Configuration → Purge Everything**.

### 4.4 Page Rules (optionnel)

| URL | Setting |
|-----|---------|
| `votre-domaine.com/nutri-food/*` | Cache Level: Bypass |

---

## 🔒 Étape 5 — Configuration SSL/TLS côté serveur

Si vous utilisez Cloudflare en mode **Full (strict)**, générez un certificat Origin :

```bash
# Option A: Certbot (Let's Encrypt)
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d votre-domaine.com

# Option B: Cloudflare Origin Certificate
# Dashboard → SSL/TLS → Origin Server → Create Certificate
# Copiez la clé et le certificat dans :
# /etc/ssl/cloudflare/cert.pem
# /etc/ssl/cloudflare/key.pem
```

Configuration Nginx avec SSL :

```nginx
server {
    listen 443 ssl http2;
    server_name votre-domaine.com;

    ssl_certificate     /etc/ssl/cloudflare/cert.pem;
    ssl_certificate_key /etc/ssl/cloudflare/key.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;
}
```

---

## 👤 Étape 6 — Créer le premier administrateur

### 6.1 Inscrire un compte normalement

Allez sur `https://votre-domaine.com/nutri-food/` et créez un compte via le formulaire d'inscription.

### 6.2 Promouvoir en admin via SQLite

```bash
# Ouvrir la base de données
docker exec -it nutrifood-api python3 -c "
import sqlite3
conn = sqlite3.connect('/data/nutrifood.db')
conn.execute('UPDATE users SET is_admin = 1 WHERE email = \"vous@exemple.com\"')
conn.commit()
print('Admin créé avec succès!')
conn.close()
"
```

Ou directement avec sqlite3 si installé sur l'hôte :

```bash
sqlite3 /opt/nutrifood/backend/data/nutrifood.db \
  "UPDATE users SET is_admin = 1 WHERE email = 'vous@exemple.com';"
```

Vérifier :

```bash
sqlite3 /opt/nutrifood/backend/data/nutrifood.db \
  "SELECT id, email, name, is_admin FROM users WHERE is_admin = 1;"
```

---

## 💾 Étape 7 — Volume Docker pour les données

Le volume `./data` dans `docker-compose.yml` correspond à `/opt/nutrifood/backend/data/` sur l'hôte, mappé vers `/data` dans le conteneur.

```
/opt/nutrifood/backend/data/
├── nutrifood.db      # Base SQLite (utilisateurs, sélections, journal...)
├── nutrifood.db-wal  # Write-ahead log (auto)
├── nutrifood.db-shm  # Shared memory (auto)
└── foods.json        # Base d'aliments (source de vérité)
```

Vérifier le contenu :

```bash
ls -la /opt/nutrifood/backend/data/
```

---

## 📊 Étape 8 — Logs et monitoring

### Logs du conteneur

```bash
# Logs en temps réel
docker logs -f nutrifood-api

# 100 dernières lignes
docker logs --tail 100 nutrifood-api

# Logs depuis 1h
docker logs --since 1h nutrifood-api
```

### Health check

```bash
curl -s http://localhost:5010/api/health | jq
# {"status": "ok"}
```

Configurer un health check dans Docker :

```yaml
services:
  nutrifood-api:
    # ...
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5000/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3
```

### Monitoring de l'espace disque

```bash
# Taille de la base SQLite
du -h /opt/nutrifood/backend/data/nutrifood.db

# Espace disque du conteneur
docker system df
```

---

## 💾 Étape 9 — Sauvegarde et restauration

### Sauvegarde manuelle

```bash
# Backup avec timestamp
cp /opt/nutrifood/backend/data/nutrifood.db \
   /opt/backups/nutrifood-$(date +%Y%m%d-%H%M%S).db

# Backup via Docker (plus sûr — gère le WAL)
docker exec nutrifood-api sqlite3 /data/nutrifood.db ".backup '/data/backup.db'"
cp /opt/nutrifood/backend/data/backup.db /opt/backups/nutrifood-$(date +%Y%m%d).db
```

### Sauvegarde automatique (cron)

```bash
# Crontab
crontab -e
```

```cron
# Sauvegarde quotidienne à 3h du matin
0 3 * * * docker exec nutrifood-api sqlite3 /data/nutrifood.db ".backup '/data/backup.db'" && cp /opt/nutrifood/backend/data/backup.db /opt/backups/nutrifood-$(date +\%Y\%m\%d).db && find /opt/backups/ -name "nutrifood-*.db" -mtime +30 -delete
```

### Restauration

```bash
# 1. Arrêter le conteneur
docker compose -f /opt/nutrifood/backend/docker-compose.yml down

# 2. Remplacer la base
cp /opt/backups/nutrifood-20260115.db /opt/nutrifood/backend/data/nutrifood.db

# 3. Redémarrer
docker compose -f /opt/nutrifood/backend/docker-compose.yml up -d
```

---

## 🔄 Étape 10 — Mise à jour

```bash
cd /opt/nutrifood

# 1. Récupérer le nouveau code
git pull origin main

# 2. Reconstruire et redémarrer le backend
cd backend
docker compose up -d --build

# 3. Mettre à jour le frontend
cp /opt/nutrifood/index.html /var/www/nutri-food/
cp /opt/nutrifood/favicon.svg /var/www/nutri-food/

# 4. Purger le cache Cloudflare
curl -X POST "https://api.cloudflare.com/client/v4/zones/<ZONE_ID>/purge_cache" \
  -H "Authorization: Bearer <API_TOKEN>" \
  -H "Content-Type: application/json" \
  --data '{"purge_everything": true}'
```

### Mise à jour du foods.json (base d'aliments)

```bash
# Copier le nouveau foods.json dans le volume
cp /opt/nutrifood/foods.json /opt/nutrifood/backend/data/foods.json

# Redémarrer pour recharger
docker restart nutrifood-api
```

---

## 🛠️ Dépannage

### Le conteneur ne démarre pas

```bash
# Voir les logs
docker logs nutrifood-api

# Vérifier le port
sudo lsof -i :5010

# Reconstruire sans cache
docker compose build --no-cache && docker compose up -d
```

### Erreur 502 Bad Gateway

- Le conteneur Docker est-il en cours d'exécution ? → `docker ps`
- Le port 5010 est-il accessible ? → `curl http://localhost:5010/api/health`
- Nginx pointe-t-il vers le bon port ? → Vérifiez `proxy_pass`

### Les courriels ne partent pas (reset password, bienvenue)

```bash
# Vérifier les variables SMTP dans le conteneur
docker exec nutrifood-api env | grep SMTP

# Tester SMTP manuellement
docker exec nutrifood-api python3 -c "
import smtplib
with smtplib.SMTP_SSL('smtp.fastmail.com', 465) as s:
    s.login('ai@slopvibe.org', 'VOTRE_MOT_DE_PASSE')
    print('SMTP OK')
"
```

### La base SQLite est verrouillée

```bash
# Vérifier les connexions
docker exec nutrifood-api sqlite3 /data/nutrifood.db "PRAGMA journal_mode;"

# Si besoin, forcer un checkpoint
docker exec nutrifood-api sqlite3 /data/nutrifood.db "PRAGMA wal_checkpoint(TRUNCATE);"
```

### Le frontend charge mais l'API ne répond pas

1. Vérifier le path Nginx : `/nutri-food/api/` → `http://127.0.0.1:5010/api/`
2. Vérifier les en-têtes CORS dans `app.py`
3. Vérifier que `APP_URL` correspond au domaine réel

### Le cache navigateur affiche une ancienne version

- `Ctrl+Shift+R` (hard refresh)
- Vider le `localStorage` : DevTools → Application → Local Storage → Clear
- L'en-tête `Cache-Control: no-cache` devrait prévenir cela côté serveur

---

## 📁 Structure de déploiement finale

```
/opt/nutrifood/              # Dépôt git
├── index.html
├── foods.json
├── favicon.svg
├── backend/
│   ├── app.py
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── data/                # Volume Docker
│       ├── nutrifood.db
│       └── foods.json
└── docs/

/var/www/nutri-food/         # Frontend statique (servi par Nginx)
├── index.html
└── favicon.svg

/opt/backups/                # Sauvegardes SQLite
└── nutrifood-YYYYMMDD.db
```
