# 👤 Guide utilisateur — NutriFood

Guide complet pour utiliser NutriFood, votre outil de planification nutritionnelle hebdomadaire.

---

## 📝 Création de compte et connexion

### S'inscrire

1. Cliquez sur **S'inscrire** en haut à droite
2. Entrez votre **courriel**, votre **nom** et un **mot de passe**
3. Cliquez sur **Créer mon compte**
4. Un courriel de bienvenue vous sera envoyé

### Se connecter

1. Cliquez sur **Connexion**
2. Entrez votre **courriel** (ou votre nom d'utilisateur) et votre **mot de passe**
3. L'identifiant n'est pas sensible à la casse : `Jean@exemple.com` = `jean@exemple.com`

### Mot de passe oublié (magic link)

1. Cliquez sur **Connexion** → **Mot de passe oublié ?**
2. Entrez votre courriel
3. Un lien de réinitialisation est envoyé par courriel (valide 1h)
4. Cliquez sur le lien dans le courriel → vous serez redirigé avec un nouveau mot de passe à choisir

---

## 📊 Les deux modes : Suivi et Planification

NutriFood a deux modes indépendants, accessibles via les onglets en haut de page :

### Mode Suivi (par défaut)
- Enregistre ce que vous avez **réellement mangé** jour par jour
- Navigation par jour (‹ ›) pour consulter l'historique
- Dashboard double : totaux du jour (instantané) + cumul de la semaine (API)
- Données préservées quand vous changez d'onglet

### Mode Planification
- Planifiez vos sélections pour la **semaine**
- Tableau de bord nutritionnel avec objectifs hebdomadaires
- Le badge "🔄 Reset dans Xj" indique quand la semaine se réinitialise

Le mode actif est mémorisé dans votre navigateur (localStorage).

### Vue Simplifiée

Le bouton **Simplifié** (à côté d'Avancé) bascule vers une vue compacte :

- Une ligne par catégorie avec des cases □□□□□□□
- Les portions sont distribuées par **jour de semaine** (L M M J V S D)
- Cases pleines = aliments suivis (hover = nom, click = détails)
- Cases vides = cliquez pour ajouter un aliment (recherche)
- Bouton **🔄 Reset** en haut à droite
- Idéal sur mobile — plus rapide à consulter

La vue **Avancée** affiche les cartes détaillées avec nutriments et icônes. Les deux vues partagent les mêmes données en temps réel.

---

## 🧭 Navigation — Les 5 sections

NutriFood organise les aliments en 5 sections nutritionnelles :

| Section | Description | Exemples |
|---------|-------------|----------|
| 🥩 **Viandes & Laitiers** | Protéines animales et végétales, produits laitiers | Poissons, œufs, poulet, légumineuses, noix |
| 🥔 **Féculents** | Glucides complexes et céréales | Quinoa, riz brun, patates douces, avoine |
| 🥬 **Légumes** | Légumes classés par couleur | Kale, carottes, tomates, brocoli |
| 🍎 **Fruits** | Fruits classés par type | Bleuets, kiwi, agrumes, avocat |
| 🌱 **Habitudes** | Bons gras, fermentés, herbes, boissons | Huile d'olive, kéfir, curcuma, thé vert |

---

## 🖱️ Sélectionner des aliments

### Dropdown (sélection unique)

Certaines catégories ont un **menu déroulant** — vous choisissez un aliment dans la liste.

### Checkboxes (sélection multiple)

D'autres catégories proposent des **cases à cocher** — sélectionnez plusieurs aliments à la fois.

### Compteurs de portions (+ / −)

Chaque catégorie affiche un compteur avec son objectif hebdomadaire :

```
▮▮▮ 3 / 2-4 portions    ← dans la zone (vert)
```

- Cliquez **+** ou **−** pour ajuster la quantité
- Le compteur est lié à la catégorie entière, pas à chaque aliment individuellement

---

## 🚦 Code couleur des compteurs

| Couleur | Signification |
|---------|---------------|
| 🔴 **Rouge** | Sous l'objectif — il manque des portions |
| 🟢 **Vert** | Dans la zone — objectif atteint |
| 🟡 **Ambre** | Excès — vous dépassez le maximum recommandé |

L'objectif est de garder le plus de compteurs possible en **vert**.

---

## 🔄 Réinitialiser les données

### Mode Planification

Cliquez sur le badge **🔄 Reset dans Xj** dans le tableau de bord nutritionnel pour vider toutes vos sélections de la semaine.

- Un modal de confirmation s'ouvre avant l'effacement
- Les données sont immédiatement effacées du serveur

### Mode Suivi

Cliquez sur le badge **🔄 Reset** dans le tableau de bord pour choisir :

- **📅 Journée** — efface seulement les données du jour affiché
- **📋 Semaine complète** — efface toutes les entrées de la semaine (lundi→dimanche)
- **Annuler** — ferme sans rien effacer

---

## 🔍 Barre de recherche

La recherche est **normalisée** — elle gère les accents et ligatures automatiquement :

| Vous tapez | Résultat |
|------------|----------|
| `boeuf` | ✅ Trouve « Bœuf » |
| `BŒUF` | ✅ Trouvre « Bœuf » |
| `bleuet` | ✅ Trouve « Bleuets » |
| `kale` | ✅ Trouve « Kale » |

💡 **Aucune besoin de gérer les accents.** Tapez naturellement.

---

## 💡 Info-bulles (tooltips)

Survolez un aliment pour voir :

- **Valeurs nutritionnelles** — protéines, fibres, fer, vitamine C, calcium, Ω-3 par portion
- **Conseils d'absorption** — comment maximiser l'absorption des nutriments
- **Combinaisons** — quels aliments manger ensemble (ex: « Fer + vitamine C = meilleure absorption »)
- **À éviter** — mises en garde (ex: « Riche en oxalates, limiter en cas de calculs rénaux »)

---

## 🌱 Badges de saisonnalité

Sur les fruits et légumes, vous verrez deux badges :

| Badge | Signification |
|-------|---------------|
| 🌱 **Local** | De saison au Québec ce mois-ci |
| ✈️ **Importé** | Disponible en importation seulement |

La saisonnalité s'adapte automatiquement au mois courant.

---

## 🏷️ Badges de spéciaux d'épicerie

Les aliments peuvent afficher des badges de prix colorés correspondant aux marchands :

| Couleur | Marchand |
|---------|----------|
| 🟡 | Maxi |
| 🔴 | IGA |
| 🟠 | Super C |
| 🔵 | Métro |
| 🟢 | Provigo |
| 🟣 | Walmart |

Survolez un badge pour voir :
- Le **produit** exact en spécial
- Le **prix** et le **format**
- Le **prix unitaire** ($/100g, etc.)
- Un **lien** direct vers le flyer

Cliquez sur 🏷️ dans la liste des spéciaux pour ouvrir le modal comparatif.

---

## 🎯 Objectifs nutritionnels personnalisés

Vos objectifs par défaut sont des valeurs hebdomadaires. Pour les personnaliser :

1. Ouvrez le **menu** (avatar en haut à droite)
2. Cliquez sur **🎯 Mes objectifs**
3. Ajustez les valeurs pour chaque nutriment :
   - Protéines (défaut: 350g/sem)
   - Fibres (défaut: 175g/sem)
   - Fer (défaut: 56mg/sem)
   - Vitamine C (défaut: 280mg/sem)
   - Calcium (défaut: 700mg/sem)
   - Oméga-3 (défaut: 3.5g/sem)
   - Calories (défaut: 14000kcal/sem)
4. **Sauvegarder**

Les barres de progression du tableau de bord utiliseront ces nouvelles valeurs.

---

## 🛒 Liste d'épicerie

### Générer la liste

**Menu** → **🛒 Liste d'épicerie**

La liste est générée à partir de vos sélections. Elle inclut :
- Tous les aliments sélectionnés
- Les **meilleurs prix** trouvés chez les marchands partenaires
- Le **total estimé** de votre panier

### Partager la liste

1. Cliquez sur **Partager**
2. Copiez le **lien** généré
3. Envoyez-le — le destinataire obtient une version **cochable** (il peut cocher les items en magasin)

### Imprimer

1. Cliquez sur **Imprimer**
2. Une version **noir sur blanc** s'ouvre (texte seul, cases à cocher)
3. `Ctrl+P` pour imprimer

---

## 📊 Historique

**Menu** → **📊 Historique**

Consultez vos **snapshots hebdomadaires** — NutriFood enregistre automatiquement vos sélections à chaque semaine (numéro ISO).

- Cliquez sur une semaine pour voir le détail
- Comparez vos semaines entre elles
- Les snapshots sont uniques par utilisateur

---

## 🔗 Doublons entre catégories (« aussi dans »)

Certains aliments apparaissent dans **plusieurs catégories** (ex: les noix peuvent être dans « Viandes & Laitiers » et « Habitudes »).

Quand c'est le cas, vous verrez un badge **« aussi dans [catégorie] »**. Sélectionner l'aliment dans une catégorie le compte aussi dans l'autre.

---

## ✨ Suggestions automatiques

NutriFood analyse vos sélections et suggère des aliments pour :

- **Combler des carences** nutritionnelles détectées
- **Varier** votre alimentation
- **Atteindre** vos objectifs plus rapidement

Un bouton flottant 💡 apparaît quand des suggestions sont disponibles.

---

## 💡 Astuces

- **Deux modes indépendants** — Planification (semaine) et Suivi (par jour) ont chacun leurs données, préservées quand vous changez d'onglet
- **Tout est sauvegardé automatiquement** — pas de bouton « sauvegarder »
- **Fonctionne hors ligne** — vos données sont en cache navigateur (localStorage), synchronisées au retour de la connexion
- **Recherche rapide** — tapez quelques lettres, pas besoin de mot complet
- **Reset rapide** — cliquez le badge 🔄 pour repartir à zéro (jour ou semaine)
