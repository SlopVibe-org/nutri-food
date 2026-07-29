# 🔧 Guide administrateur — NutriFood

Guide pour les administrateurs NutriFood : gestion des aliments, des utilisateurs, et maintenance du système.

---

## 👑 Devenir administrateur

### Méthode 1 — Inscription + promotion

1. Créez un compte normalement via l'application
2. Accédez à la base SQLite et promouvez votre compte :

```bash
# Via sqlite3 sur l'hôte
sqlite3 /opt/nutrifood/backend/data/nutrifood.db \
  "UPDATE users SET is_admin = 1 WHERE email = 'vous@exemple.com';"

# Ou via Docker
docker exec -it nutrifood-api sqlite3 /data/nutrifood.db \
  "UPDATE users SET is_admin = 1 WHERE email = 'vous@exemple.com';"
```

### Méthode 2 — Vérifier qui est admin

```bash
sqlite3 /opt/nutrifood/backend/data/nutrifood.db \
  "SELECT id, email, name, is_admin FROM users WHERE is_admin = 1;"
```

---

## ✏️ Mode édition des aliments

### Activer le mode édition

En tant qu'admin, un bouton **✏️ Édition** apparaît en haut de l'application.

- Cliquez dessus pour **activer/désactiver** le mode édition
- En mode édition, chaque catégorie affiche des contrôles pour **ajouter** ou **retirer** des aliments

### Ajouter un aliment

1. Activez le mode édition (✏️)
2. Naviguez vers la catégorie souhaitée
3. Cliquez sur **+ Ajouter un aliment**
4. Remplissez les champs (nom, densité, nutriments, saisonnalité...)
5. Sauvegardez — l'aliment est ajouté à `foods.json` via l'API `POST /api/admin/foods`

### Retirer un aliment

1. Mode édition actif (✏️)
2. Survolez l'aliment à retirer
3. Cliquez sur l'icône **🗑️**
4. Confirmez la suppression

⚠️ **Note :** Les modifications affectent `foods.json` dans le volume Docker (`/data/foods.json`). Tout utilisateur connecté verra les changements après rechargement.

---

## 📄 Structure de foods.json

Le fichier `foods.json` est la **source de vérité** pour tous les aliments. Voici la structure complète :

```json
{
  "sections": [
    {
      "id": "viandes-laitiers",
      "name": "Viandes & Produits Laitiers",
      "icon": "🥩"
    }
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
      "portion_hint": "1 portion = paume de la main (≈100g)",
      "foods": [...]
    }
  ]
}
```

### Champs d'un aliment

| Champ | Type | Description |
|-------|------|-------------|
| `name` | string | Nom affiché (ex: « Sardines ») |
| `density` | number | Score de densité nutritionnelle (0-100) |
| `nutrients` | string | Liste des nutriments clés (texte court) |
| `nutrition` | object | Valeurs par portion |
| `nutrition.protein` | number | Protéines (g) |
| `nutrition.fiber` | number | Fibres (g) |
| `nutrition.iron` | number | Fer (mg) |
| `nutrition.vit_c` | number | Vitamine C (mg) |
| `nutrition.calcium` | number | Calcium (mg) |
| `nutrition.omega3` | number | Ω-3 (g) |
| `season` | array | Mois de saisonnalité locale (1-12), fruits/légumes seulement |
| `import_season` | array | Mois de disponibilité en importation (1-12) |
| `absorption` | string | Conseil d'absorption optionnel |
| `epiceries_query` | string | Terme de recherche pour epiceries.ca (optionnel) |

### Exemple complet

```json
{
  "name": "Épinards",
  "density": 95,
  "nutrients": "Fer, Calcium, Vit K, Folates",
  "nutrition": {
    "protein": 2.9,
    "fiber": 2.2,
    "iron": 2.7,
    "vit_c": 28.0,
    "calcium": 99.0,
    "omega3": 0.0
  },
  "season": [5, 6, 7, 8, 9, 10],
  "import_season": [1, 2, 3, 4, 11, 12],
  "absorption": "Le fer est mieux absorbé avec de la vitamine C. Cuire légèrement pour augmenter la biodisponibilité du fer.",
  "epiceries_query": "épinards frais"
}
```

### Éditer foods.json manuellement

```bash
# Éditer directement dans le volume
nano /opt/nutrifood/backend/data/foods.json

# Ou via Docker
docker exec -it nutrifood-api sh -c "vi /data/foods.json"

# Valider le JSON
python3 -c "import json; json.load(open('/opt/nutrifood/backend/data/foods.json')); print('JSON valide')"

# Redémarrer pour appliquer
docker restart nutrifood-api
```

---

## 👥 Gestion des utilisateurs

### Lister tous les utilisateurs

```bash
sqlite3 /opt/nutrifood/backend/data/nutrifood.db \
  "SELECT id, email, name, is_admin, created_at FROM users ORDER BY created_at DESC;"
```

### Promouvoir un utilisateur en admin

```bash
sqlite3 /opt/nutrifood/backend/data/nutrifood.db \
  "UPDATE users SET is_admin = 1 WHERE email = 'usager@exemple.com';"
```

### Rétrograder un admin

```bash
sqlite3 /opt/nutrifood/backend/data/nutrifood.db \
  "UPDATE users SET is_admin = 0 WHERE email = 'usager@exemple.com';"
```

### Supprimer un utilisateur

```bash
sqlite3 /opt/nutrifood/backend/data/nutrifood.db \
  "DELETE FROM users WHERE email = 'usager@exemple.com';"
```

⚠️ La suppression en cascade efface aussi : sélections, plans de repas, journal, historique, objectifs et liens de partage.

### Compter les utilisateurs actifs

```bash
sqlite3 /opt/nutrifood/backend/data/nutrifood.db \
  "SELECT COUNT(*) FROM users;"
```

---

## 🔄 Rafraîchir le cache des spéciaux d'épicerie

Les spéciaux sont mis en cache avec un TTL de **6 heures**. Pour forcer un rafraîchissement :

### Méthode 1 — Bouton admin (interface)

Un bouton **🔄** est visible en mode admin dans l'en-tête de l'application. Cliquez dessus pour rafraîchir immédiatement.

### Méthode 2 — API

```bash
curl -X POST https://slopvibe.org/nutri-food/api/deals/refresh \
  -H "Authorization: Bearer <VOTRE_TOKEN_JWT>"
```

Réponse attendue :

```json
{
  "status": "ok",
  "deals": 42,
  "cached_at": "2026-07-29T12:00:00"
}
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
curl -s http://localhost:5010/api/health
# {"status": "ok"}
```

### Vérifier la base de données

```bash
# Taille du fichier
ls -lh /opt/nutrifood/backend/data/nutrifood.db

# Intégrité
sqlite3 /opt/nutrifood/backend/data/nutrifood.db "PRAGMA integrity_check;"

# Statistiques rapides
sqlite3 /opt/nutrifood/backend/data/nutrifood.db <<EOF
.mode column
.headers on
SELECT 'Utilisateurs' AS table_name, COUNT(*) AS count FROM users
UNION ALL
SELECT 'Sélections', COUNT(*) FROM selections
UNION ALL
SELECT 'Journal', COUNT(*) FROM journal_entries
UNION ALL
SELECT 'Plans de repas', COUNT(*) FROM meal_plans
UNION ALL
SELECT 'Historique', COUNT(*) FROM history_snapshots;
EOF
```

---

## 💾 Sauvegarde manuelle

```bash
# Méthode recommandée (gère le WAL)
docker exec nutrifood-api sqlite3 /data/nutrifood.db ".backup '/data/backup.db'"

# Copier la sauvegarde hors du conteneur
cp /opt/nutrifood/backend/data/backup.db \
   /opt/backups/nutrifood-manuel-$(date +%Y%m%d-%H%M%S).db

# Sauvegarder aussi foods.json
cp /opt/nutrifood/backend/data/foods.json \
   /opt/backups/foods-$(date +%Y%m%d).json
```

---

## 🎯 Gestion des objectifs par défaut

Les objectifs par défaut sont définis dans la table `user_goals`. Chaque utilisateur a ses propres valeurs, mais les valeurs initiales sont :

| Nutriment | Défaut hebdo |
|-----------|-------------|
| Protéines | 350 g |
| Fibres | 175 g |
| Fer | 56 mg |
| Vitamine C | 280 mg |
| Calcium | 700 mg |
| Ω-3 | 3.5 g |

### Modifier les valeurs par défaut pour un utilisateur

```bash
sqlite3 /opt/nutrifood/backend/data/nutrifood.db <<EOF
UPDATE user_goals 
SET protein = 400, fiber = 200, iron = 60, vitamin_c = 300, calcium = 800, omega3 = 4.0
WHERE user_id = (SELECT id FROM users WHERE email = 'usager@exemple.com');
EOF
```

### Réinitialiser pour tous les utilisateurs (à utiliser avec prudence)

```bash
sqlite3 /opt/nutrifood/backend/data/nutrifood.db <<EOF
UPDATE user_goals 
SET protein = 350, fiber = 175, iron = 56, vitamin_c = 280, calcium = 700, omega3 = 3.5;
EOF
```

---

## 🗄️ Structure de la base de données

### Schéma complet

#### `users`
| Colonne | Type | Description |
|---------|------|-------------|
| `id` | INTEGER PK | Identifiant unique |
| `email` | TEXT UNIQUE | Courriel (connexion) |
| `name` | TEXT | Nom affiché |
| `password_hash` | TEXT | Hash PBKDF2-SHA256 |
| `salt` | TEXT | Sel unique par utilisateur |
| `is_admin` | INTEGER | 0 = normal, 1 = admin |
| `created_at` | TEXT | Date de création |
| `updated_at` | TEXT | Dernière modification |

#### `selections`
| Colonne | Type | Description |
|---------|------|-------------|
| `id` | INTEGER PK | — |
| `user_id` | INTEGER FK → users | — |
| `data` | TEXT (JSON) | Sélections hebdomadaires actuelles |
| `updated_at` | TEXT | — |

#### `reset_tokens`
| Colonne | Type | Description |
|---------|------|-------------|
| `id` | INTEGER PK | — |
| `user_id` | INTEGER FK → users | — |
| `token` | TEXT UNIQUE | Token de reset (magic link) |
| `expires_at` | TEXT | Expiration (1h) |
| `used` | INTEGER | 0 = disponible, 1 = consommé |
| `created_at` | TEXT | — |

#### `meal_plans`
| Colonne | Type | Description |
|---------|------|-------------|
| `id` | INTEGER PK | — |
| `user_id` | INTEGER FK → users | — |
| `week_key` | TEXT | Semaine ISO (ex: `2026-W30`) |
| `data` | TEXT (JSON) | Repas par jour/créneau |
| `updated_at` | TEXT | — |

#### `history_snapshots`
| Colonne | Type | Description |
|---------|------|-------------|
| `id` | INTEGER PK | — |
| `user_id` | INTEGER FK → users | — |
| `week_key` | TEXT | Semaine ISO |
| `selections_data` | TEXT (JSON) | Sélections au moment du snapshot |
| `created_at` | TEXT | — |

#### `share_links`
| Colonne | Type | Description |
|---------|------|-------------|
| `id` | INTEGER PK | — |
| `user_id` | INTEGER FK → users | — |
| `token` | TEXT UNIQUE | Token du lien de partage |
| `created_at` | TEXT | — |

#### `user_goals`
| Colonne | Type | Défaut |
|---------|------|---------|
| `id` | INTEGER PK | — |
| `user_id` | INTEGER FK → users | — |
| `protein` | REAL | 350 |
| `fiber` | REAL | 175 |
| `iron` | REAL | 56 |
| `vitamin_c` | REAL | 280 |
| `calcium` | REAL | 700 |
| `omega3` | REAL | 3.5 |

#### `journal_entries`
| Colonne | Type | Description |
|---------|------|-------------|
| `id` | INTEGER PK | — |
| `user_id` | INTEGER FK → users | — |
| `date` | TEXT | Date (YYYY-MM-DD) |
| `food_name` | TEXT | Nom de l'aliment |
| `cat_id` | TEXT | ID de catégorie (optionnel) |
| `qty` | INTEGER | Quantité (défaut: 1) |
| `nutrition` | TEXT (JSON) | Valeurs nutritionnelles |
| `created_at` | TEXT | — |

---

## 🔄 Procédure de mise à jour complète

### 1. Sauvegarder

```bash
# Backup complet
docker exec nutrifood-api sqlite3 /data/nutrifood.db ".backup '/data/backup.db'"
cp /opt/nutrifood/backend/data/backup.db /opt/backups/nutrifood-pre-update-$(date +%Y%m%d-%H%M%S).db
cp /opt/nutrifood/backend/data/foods.json /opt/backups/foods-pre-update-$(date +%Y%m%d).json
```

### 2. Mettre à jour le code

```bash
cd /opt/nutrifood
git pull origin main
```

### 3. Reconstruire le backend

```bash
cd /opt/nutrifood/backend
docker compose up -d --build
```

### 4. Mettre à jour le frontend

```bash
cp /opt/nutrifood/index.html /var/www/nutri-food/
cp /opt/nutrifood/favicon.svg /var/www/nutri-food/
```

### 5. Mettre à jour foods.json (si modifié)

```bash
# Copier le nouveau foods.json dans le volume Docker
cp /opt/nutrifood/foods.json /opt/nutrifood/backend/data/foods.json
docker restart nutrifood-api
```

### 6. Vérifier

```bash
# Health check
curl -s http://localhost:5010/api/health

# Logs
docker logs --tail 20 nutrifood-api

# Interface web
# Ouvrez https://slopvibe.org/nutri-food/ dans le navigateur
```

### 7. Purger le cache Cloudflare

```bash
curl -X POST "https://api.cloudflare.com/client/v4/zones/<ZONE_ID>/purge_cache" \
  -H "Authorization: Bearer <API_TOKEN>" \
  -H "Content-Type: application/json" \
  --data '{"purge_everything": true}'
```

---

## ⚠️ Notes importantes

- **Ne jamais supprimer** `/data/foods.json` — c'est la seule source d'aliments
- **Toujours sauvegarder** avant une mise à jour ou modification manuelle
- **Le mode édition** modifie directement `foods.json` — les changements sont immédiats pour tous les utilisateurs
- **Les tokens JWT** sont valides 90 jours (2160h) par défaut
- **Les reset tokens** expirent après 1 heure
- **Le rate limiting** est de 10 requêtes/minute par IP pour les endpoints sensibles
