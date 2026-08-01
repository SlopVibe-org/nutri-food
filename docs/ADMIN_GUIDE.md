# 🔧 Guide administrateur — NutriFood

Guide pour les administrateurs NutriFood : gestion des aliments, des utilisateurs, et maintenance du système.

---

## 👑 Devenir administrateur

### Méthode 1 — Inscription + promotion

1. Créez un compte normalement via l'application
2. Accédez à la base SQLite et promouvez votre compte :

```bash
# Via Docker
docker exec -it nutrifood-api python3 -c "
import sqlite3
db = sqlite3.connect('/data/nutrifood.db')
db.execute('UPDATE users SET is_admin = 1 WHERE email = \"vous@exemple.com\"')
db.commit()
print('Admin créé!')
db.close()
"
```

### Méthode 2 — Vérifier qui est admin

```bash
docker exec nutrifood-api python3 -c "
import sqlite3
db = sqlite3.connect('/data/nutrifood.db')
for row in db.execute('SELECT id, email, name FROM users WHERE is_admin = 1'):
    print(row)
db.close()
"
```

---

## ✏️ Gérer les aliments

### Interface admin

Les administrateurs ont accès au menu **📦 Gérer les produits** qui permet de :
- **Ajouter** des aliments depuis la base CNF (recherche par nom)
- **Retirer** des aliments des listes NutriFood

Les modifications affectent les tables `nf_foods` et `nf_categories` dans SQLite.

### Aliments disponibles

NutriFood contient **160 aliments** répartis dans 26 catégories :

- **Protéines :** Poissons gras/blancs, fruits de mer, poulet, viande rouge, œufs, légumineuses, noix/graines, produits laitiers
- **Légumes :** Verts foncés (14), jaune/orange (8), rouges (5), blancs (8), mauves (7)
- **Fruits :** Petits fruits (7), protecteurs Vit C (11), autres fruits (11)
- **Féculents :** Très bons choix (10), bons choix (7), tubercules (3)
- **Habitudes :** Bons gras (8), fermentés (8), herbes/épices (13), boissons (2)

### Ajouter un aliment via l'interface

1. Menu **📦 Gérer** → onglet **Ajouter**
2. Recherche dans la base CNF (5993 aliments de Santé Canada)
3. Sélectionner la catégorie NutriFood
4. L'aliment est ajouté avec : densité auto-calculée, profil nutritionnel complet, aliases, saisonnalité

### Masquer un aliment via l'API

```bash
curl -X POST http://localhost:5011/api/admin/food/hide \
  -H "Authorization: Bearer <TOKEN_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"name": "Aliment à masquer"}'
```

### Afficher un aliment masqué

```bash
curl -X POST http://localhost:5011/api/admin/food/show \
  -H "Authorization: Bearer <TOKEN_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"name": "Aliment à afficher"}'
```

---

## 👥 Gestion des utilisateurs

### Lister tous les utilisateurs

```bash
docker exec nutrifood-api python3 -c "
import sqlite3
db = sqlite3.connect('/data/nutrifood.db')
for row in db.execute('SELECT id, email, name, is_admin, created_at FROM users ORDER BY created_at DESC'):
    print(row)
db.close()
"
```

### Promouvoir un utilisateur en admin

```bash
docker exec nutrifood-api python3 -c "
import sqlite3
db = sqlite3.connect('/data/nutrifood.db')
db.execute('UPDATE users SET is_admin = 1 WHERE email = \"usager@exemple.com\"')
db.commit()
db.close()
"
```

---

## 🔄 Rafraîchir le cache des spéciaux d'épicerie

Les spéciaux sont rafraîchis automatiquement (une fois par semaine). Pour forcer un rafraîchissement :

### Méthode 1 — Bouton admin (interface)

Dans le modal des spéciaux (🏷️), un bouton **🔄 Rafraîchir** est visible pour les admins.

### Méthode 2 — API

```bash
curl -X POST http://localhost:5011/api/deals/refresh \
  -H "Authorization: Bearer <TOKEN_JWT>"
```

---

## 📊 Surveillance et logs

### Logs du conteneur

```bash
# Temps réel
docker logs -f nutrifood-api

# Erreurs seulement
docker logs nutrifood-api 2>&1 | grep -i error

# Requêtes récentes
docker logs --tail 50 nutrifood-api
```

### Santé de l'API

```bash
curl -s http://localhost:5011/api/health
# {"status":"ok"}
```

### Vérifier la base de données

```bash
# Taille du fichier
ls -lh /opt/nutrifood/data/nutrifood.db

# Intégrité
docker exec nutrifood-api sqlite3 /data/nutrifood.db "PRAGMA integrity_check;"

# Statistiques
docker exec nutrifood-api python3 -c "
import sqlite3
db = sqlite3.connect('/data/nutrifood.db')
for t in ['users', 'selections', 'tracking', 'history_snapshots', 'nf_foods', 'food']:
    count = db.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0]
    print(f'{t}: {count}')
db.close()
"
```

---

## 💾 Sauvegarde manuelle

```bash
# Méthode recommandée (gère le WAL)
docker exec nutrifood-api sqlite3 /data/nutrifood.db ".backup '/data/backup.db'"

# Copier la sauvegarde hors du conteneur
cp /opt/nutrifood/data/backup.db /opt/backups/nutrifood-manuel-$(date +%Y%m%d-%H%M%S).db
```

---

## 🎯 Objectifs par défaut

Les objectifs par défaut sont définis dans la table `user_goals` :

| Nutriment | Défaut hebdo |
|-----------|-------------|
| Protéines | 350 g |
| Fibres | 175 g |
| Fer | 56 mg |
| Vitamine C | 280 mg |
| Calcium | 700 mg |
| Ω-3 | 3.5 g |
| Calories | 14000 kcal |

---

## 🗄️ Structure de la base de données

### Tables NutriFood

| Table | Description |
|-------|-------------|
| `users` | Comptes (id, email, name, password_hash, salt, is_admin, token_version) |
| `selections` | Planification hebdomadaire (user_id, data JSON) |
| `tracking` | Suivi quotidien (user_id, date, data JSON) |
| `history_snapshots` | Snapshots hebdomadaires |
| `user_goals` | Objectifs nutritionnels personnalisés |
| `share_links` | Liens de partage avec expiration |
| `reset_tokens` | Tokens magic link (expiration 1h) |
| `meal_plans` | Plans de repas hebdomadaires |
| `journal_entries` | Journal nutritionnel quotidien |

### Tables des aliments

| Table | Description |
|-------|-------------|
| `nf_sections` | 5 sections nutritionnelles |
| `nf_categories` | Catégories d'aliments (section, type, weekly_min/max) |
| `nf_foods` | Aliments NutriFood (densité, saisonnalité, visibilité) |
| `nf_foods_aliases` | Alias de recherche |
| `nf_foods_nutrients` | Valeurs nutritionnelles par aliment |

### Tables CNF (Canadian Nutrient File)

| Table | Description |
|-------|-------------|
| `food` | 5993 aliments de Santé Canada |
| `food_group` | Groupes d'aliments CNF |
| `food_aliases` | Alias de recherche |
| `nutrient_name` | 150+ nutriments (code, unit, nom) |
| `nutrient_amount` | Valeurs nutritionnelles CNF |
| `food_search` | Index FTS5 (recherche full-text) |

---

## 🔄 Procédure de mise à jour

### 1. Sauvegarder

```bash
docker exec nutrifood-api sqlite3 /data/nutrifood.db ".backup '/data/backup.db'"
cp /opt/nutrifood/data/backup.db /opt/backups/nutrifood-pre-update-$(date +%Y%m%d).db
```

### 2. Mettre à jour le code

```bash
cd /opt/nutrifood
git pull origin main
```

### 3. Reconstruire

```bash
cd /opt/nutrifood
docker compose up -d --build
```

### 4. Purger le cache Cloudflare

```bash
curl -X POST "https://api.cloudflare.com/client/v4/zones/<ZONE_ID>/purge_cache" \
  -H "Authorization: Bearer <API_TOKEN>" \
  -H "Content-Type: application/json" \
  --data '{"purge_everything": true}'
```

---

## ⚠️ Notes importantes

- **Ne jamais supprimer** `/data/nutrifood.db` — c'est la seule source de données
- **Toujours sauvegarder** avant une mise à jour
- **Les tokens JWT** sont valides 90 jours (2160h) par défaut
- **Les reset tokens** expirent après 1 heure
- **Le rate limiting** est de 10 requêtes/minute par IP pour les endpoints sensibles
- **L'architecture 2 conteneurs** (api + web/nginx) signifie que les fichiers frontend sont servis par nginx, pas par un serveur web externe
