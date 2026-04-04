# Base de données Produits — Sauf Imprévu

## Architecture

### Entités (schema.json)

```
FOURNISSEUR (suppliers)
  └─ qui tu paies, conditions de commande (franco, minimum, suppléments)

PRODUCTEUR (producers)
  └─ qui fait le produit (peut ≠ fournisseur)
  └─ ex: Domaine de Bila-Haut, Maison Trénel, Dominio del Soto...

MARQUE (brands)
  └─ ligne commerciale du producteur
  └─ ex: "Marius by Michel Chapoutier", "Mathilde Chapoutier Sélection"

PRODUIT (products)
  └─ socle générique (extensible à mode, livres, etc.)
  └─ type: wine / spirit / liqueur / beer / book / fashion...

EXTENSION VIN (wine_attributes)  — 1:1 avec produit type=wine
  └─ appellation, cuvée, couleur, cépage(s), gamme, certifications, note Parker

VARIANTE (variants)  — N par produit
  └─ millésime × format × prix par palier (36/78/156 btl)
  └─ disponibilité: in_stock / sold_out / on_hold / pre_order

STOCK (stock)  — ton inventaire propre
  └─ quantité en cave, seuil de réappro, prochaine livraison estimée
```

### Relations

```
Fournisseur ──1:N──> Produit
Producteur  ──1:N──> Produit
Marque      ──1:N──> Produit
Produit     ──1:1──> Extension Vin (si type=wine)
Produit     ──1:N──> Variante
Variante    ──1:1──> Stock
```

## Données extraites

### chapoutier-catalog-2026.json

Source : 2 catalogues PDF M. Chapoutier 2026
- **134 produits**, **417 variantes** (millésime × format × prix)
- **11 producteurs** : M. Chapoutier, Bila-Haut, Schieferkopf, Château des Ferrages, Saint-Étienne, Tournon, Dos Lusíadas, Dominio del Soto, Maison Trénel, Mathilde Chapoutier, + collaborations (Pic, Alléno, Viola)
- **12 marques** commerciales

#### Répartition par gamme

| Gamme | Produits | Description |
|-------|----------|-------------|
| Fac & Spera (Sélections Parcellaires) | 29 | Raretés, vieilles vignes, biodynamie |
| Excellence | 11 | Crus sublimes des domaines |
| Prestige | 21 | Grands crus classiques |
| Tradition | 73 | Vins de dégustation quotidienne |

#### Fournisseur

```
M. Chapoutier S.A.
18 Avenue Docteur Paul Durand, 26600 Tain l'Hermitage
Tél: 04.75.08.28.65

Conditions:
- Franco à partir de 36 bouteilles, 18 magnums ou 500€ HT
- Forfait livraison: 30€ HT France Métropolitaine
- Corse: +0.39€/col à partir de 36 cols
- Tarifs valables jusqu'au 31/12/2026
```

## Prochaines étapes

1. **Catalogue Vinothèque** : Extraire les verticales (millésimes depuis 1990, notes Parker, "à la garde")
2. **Interface vitrine** : Bottom sheet catalogue filtrable (couleur, région, prix, gamme)
3. **Fiche produit** : Détail avec photo, description, accords mets-vins
4. **Tunnel d'achat** : Panier, commande, mode de retrait (sur place / livraison)
5. **Couche stock** : Distinguer stock propre (cave) vs. commande fournisseur (délai)
6. **Intégration Maïa** : Conseil vin basé sur la base de connaissance
