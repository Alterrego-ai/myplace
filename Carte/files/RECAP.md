# Carte Restaurant — Récap projet

## Ce qu'on a produit

| Fichier | Description |
|---|---|
| `admin.jsx` | Interface admin complète (React) |
| `menu.jsx` | Vue client PWA (React) |
| `schema.prisma` | Schéma base de données complet |
| `seed.ts` | Seed des tags système (57 tags) |
| `api-routes.ts` | Toutes les routes API Next.js |

---

## Stack décidée

- **Frontend** — Next.js + React + TailwindCSS (ou inline styles)
- **Base de données** — PostgreSQL sur **Railway**
- **ORM** — Prisma
- **Auth** — NextAuth (multi-employés, rôles ADMIN / STAFF)
- **PWA** — next-pwa (installable, offline)
- **Police** — DM Sans partout
- **Couleur primaire** — `#3d5a80` (slate/steel bleu-gris)

---

## Architecture de données

```
Restaurant
  └── Family (Cuisine, Boissons)
        └── Category (Entrées, Plats, Desserts, Vins...)
              └── Item (plat, prix, dispo, photo)
                    └── ItemTag → Tag
```

### Hiérarchie
- **Restaurant** → multi-établissements prévu
- **Family** → regroupe les catégories (optionnel, nullable)
- **Category** → ordonnée, visible/masquée, photo d'ambiance
- **Item** → disponible/indisponible, photo, prix, tags
- **Tag** → 7 catégories, 57 tags système + tags custom libres

---

## Système de tags (7 catégories)

| Catégorie | Rôle | Exemples |
|---|---|---|
| `ALLERGEN` | 14 allergènes réglementaires EU | Gluten, Lait, Sulfites* |
| `PRODUCT_TYPE` | Régimes, qualité, préparation | Vegan, Bio, Fait maison, Surgelé |
| `BEVERAGE` | Boissons | Sans alcool, Pétillant, Vin naturel |
| `CERTIFICATION` | Certifications (⚠️ requises) | Halal, Casher |
| `ORIGIN` | Origine & labels | Local, AOC, AOP, Circuit court |
| `OFFER` | Menus & offres | Menu midi, Happy Hour |
| `HIGHLIGHT` | Mise en avant éditoriale | Nouveau, Signature, Saison |

*Sulfites : seul allergène non protéique (additif chimique)

---

## Interface admin — fonctionnalités

### Onglet Carte
- KPIs discrets inline (familles · catégories · plats · prix moyen)
- Filtre par famille (pills)
- Cards catégories avec réordonnage ▲▼
- Photo miniature par catégorie (upload + URL)
- Toggle visible/masquée par catégorie
- Sélecteur famille inline
- Lignes plats avec photo, tags, prix, toggle dispo
- Modal édition plat : nom, description, prix, photo (upload/URL), tags

### Onglet Organisation
- Familles avec catégories imbriquées
- Création/modification famille et catégorie
- Réordonnage des catégories par famille
- Section "Sans famille" pour les catégories non rattachées

### Onglet Tags
- Vue de tous les tags par catégorie
- Allergènes en grille 2 colonnes avec description complète
- Rappel légal Règlement EU 1169/2011
- Avertissement certification pour Halal/Casher
- Compteur d'utilisation par tag

### Topbar
- Bouton 👁 "Voir la carte" → ouvre la vue client
- Navigation Carte / Organisation / Tags
- Icône 💾 sauvegarde collée au bouton radio

---

## Vue client PWA — fonctionnalités

### Deux modes toggle ⊞/☰
- **Navigation** : pills familles → onglets catégories → grille de cartes
- **Carte papier** : scroll continu, séparateurs famille, sections typographiques

### Recherche & filtres
- Recherche texte (nom + description)
- Panel filtres bottom sheet :
  - **Exclure** les allergènes → masque les plats concernés
  - **Inclure** les tags (vegan, local...) → n'affiche que ces plats
- Chips filtres actifs cliquables (retrait rapide)

### Affichage contextuel des tags ⭐
- **Par défaut** — carte épurée : nom, description, prix
  - HIGHLIGHT : un mot en italique gris discret
  - ALLERGEN : icônes seules grises, sans texte
- **Si filtre actif** — tags concernés mis en couleur
- **Au tap** — tous les détails s'affichent

### Footer fixe
- Mention légale allergènes
- Accès rapide aux filtres avec badge compteur

---

## Ce qui reste à faire

### Court terme
- [ ] Brancher admin et vue client sur l'API Railway
- [ ] Implémenter NextAuth (login employés)
- [ ] Configurer next-pwa (manifest, service worker)
- [ ] Upload images → stockage (S3, Cloudinary ou Railway volumes)

### Intégrations prévues
- [ ] Intégration service réservations (déjà développé séparément)
- [ ] Bouton "Réserver" sur la vue client → lien configurable par resto

### Évolutions possibles
- [ ] QR codes multiples par tag (menu midi, carte cocktails...)
- [ ] Logique horaire pour tags OFFER (happy-hour automatique)
- [ ] Page "Nos producteurs" générée depuis les tags ORIGIN
- [ ] Analytics (plats les plus consultés)
- [ ] Multi-langue

---

## Setup Railway

```bash
# 1. Installer les dépendances
npm install prisma @prisma/client next-pwa next-auth bcryptjs
npm install -D @types/bcryptjs

# 2. Configurer l'environnement
# .env
DATABASE_URL="postgresql://..."   # fourni par Railway
NEXTAUTH_SECRET="..."
NEXTAUTH_URL="https://ton-domaine.com"

# 3. Initialiser la base
npx prisma migrate dev --name init
npx prisma generate

# 4. Seeder les tags système
npx ts-node prisma/seed.ts
```

---

## Structure de fichiers cible

```
/app
  /menu/[slug]          → vue client PWA publique
  /admin                → interface admin (protégée)
  /api
    /auth/[...nextauth]
    /menu/[slug]
    /families/...
    /categories/...
    /items/...
    /tags/...
/prisma
  schema.prisma
  seed.ts
/components
  admin/
    AdminMenu.tsx       → admin.jsx
  client/
    MenuClient.tsx      → menu.jsx
```
