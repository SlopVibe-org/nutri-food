# 🍎 NutriFood

Outil de planification nutritionnelle pour sélectionner et suivre ses choix d'aliments hebdomadaires, classés par densité nutritionnelle.

## Aperçu

NutriFood permet de:
- **Visualiser** les aliments classés par densité nutritionnelle (du plus nutritif au moins nutritif)
- **Sélectionner** les aliments consommés dans une semaine
- **Suivre** les portions recommandées par catégorie via des compteurs couleur
- **Sauvegarder** ses sélections (localStorage + endpoint serveur optionnel)

## Démo

🔗 https://slopvibe.org/nutri-food/

## Fonctionnement

### Architecture

- **100% frontend** — HTML/CSS/JS vanilla, zéro dépendance, zéro build
- **`foods.json`** — Base de données nutritionnelle (read-only, partagée)
- **`index.html`** — Application complète (UI + logique)
- **Persistance:** `localStorage` (auto-save) + endpoint serveur optionnel (`save-selections.php`)

### Structure des données

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
        { "name": "Sardines", "density": 100, "nutrients": "Ω-3, B12, D, Calcium" }
      ]
    }
  ]
}
```

### Types de catégories

| Type | Utilisation | Comportement |
|------|-------------|--------------|
| `select` | Liste d'aliments (multi-sélection) | Dropdown pour ajouter, chips avec bouton [+] pour augmenter la quantité |
| `checkbox` | Catégorie à un seul élément (ex: œufs) | Case à cocher |

### Compteurs hebdomadaires

Chaque catégorie affiche un compteur `X / min-max sem.`:
- 🔴 **Rouge** — Sous l'objectif minimal
- 🟢 **Vert** — Dans la cible
- 🟡 **Jaune** — Au-dessus du maximum

Les onglets affichent aussi un point coloré indiquant le statut global de chaque section.

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

## Déploiement

### Serveur web statique

```bash
# Copier les fichiers dans un répertoire web
cp index.html foods.json /var/www/nutri-food/

# Nginx
location /nutri-food/ {
    alias /var/www/nutri-food/;
    index index.html;
}
```

### Persistance serveur (optionnel)

Créer un endpoint `save-selections.php` qui reçoit les sélections en POST JSON et les stocke (par utilisateur/session). Sans cet endpoint, l'application utilise automatiquement `localStorage` en fallback.

## Roadmap

- [ ] Sessions utilisateur
- [ ] Sections: Légumes, Fruits, Huiles & Condiments
- [ ] Génération de liste d'épicerie
- [ ] Calcul automatique des apports nutritionnels
- [ ] Export/import des sélections

## Licence

MIT
