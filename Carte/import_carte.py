#!/usr/bin/env python3
"""Import de la carte complète Sauf Imprévu — à lancer une seule fois."""

import sqlite3, os
from pathlib import Path

DB_PATH = Path(__file__).parent / "carte.db"

def main():
    if not DB_PATH.exists():
        print("❌ Base introuvable. Lance d'abord: python3 server.py (puis Ctrl+C)")
        return

    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")

    rid = conn.execute("SELECT id FROM restaurants WHERE slug='sauf-imprevu'").fetchone()
    if not rid:
        print("❌ Restaurant 'sauf-imprevu' introuvable. Lance d'abord server.py")
        return
    rid = rid["id"]

    fam_cuisine = conn.execute("SELECT id FROM families WHERE name='Cuisine' AND restaurant_id=?", (rid,)).fetchone()["id"]
    fam_boissons = conn.execute("SELECT id FROM families WHERE name='Boissons' AND restaurant_id=?", (rid,)).fetchone()["id"]

    def tag_id(slug):
        row = conn.execute("SELECT id FROM tags WHERE slug=?", (slug,)).fetchone()
        return row["id"] if row else None

    def add_cat(name, order, fam_id):
        cur = conn.execute('INSERT INTO categories (name, "order", visible, family_id, restaurant_id) VALUES (?,?,1,?,?)',
                           (name, order, fam_id, rid))
        return cur.lastrowid

    def add_item(cat_id, name, desc, price, tags=None, available=1):
        cur = conn.execute("INSERT INTO items (name, description, price, available, category_id) VALUES (?,?,?,?,?)",
                           (name, desc, price, available, cat_id))
        item_id = cur.lastrowid
        if tags:
            for slug in tags:
                tid = tag_id(slug)
                if tid:
                    conn.execute("INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (?,?)", (item_id, tid))
        return item_id

    # ── Nettoyage des données de démo ────────────────────────────────────
    old_cats = conn.execute("SELECT id FROM categories WHERE restaurant_id=?", (rid,)).fetchall()
    for c in old_cats:
        conn.execute("DELETE FROM items WHERE category_id=?", (c["id"],))
    conn.execute("DELETE FROM categories WHERE restaurant_id=?", (rid,))
    print("Anciennes données supprimées")

    # ═════════════════════════════════════════════════════════════════════
    # CUISINE
    # ═════════════════════════════════════════════════════════════════════

    # Formules du midi
    cat = add_cat("Formules du midi", 0, fam_cuisine)
    add_item(cat, "Entrée + Plat ou Plat + Dessert", "Formule midi", 22.0, ["menu-midi"])
    add_item(cat, "Entrée + Plat + Fromage ou Dessert", "Formule midi", 26.0, ["menu-midi"])
    add_item(cat, "Entrée + Plat + Fromage et Dessert", "Formule midi complète", 29.0, ["menu-midi"])
    print("✓ Formules du midi (3)")

    # Entrées 8€
    cat = add_cat("Entrées", 1, fam_cuisine)
    add_item(cat, "Assiette de melon et jambon cru serrano 18 mois", None, 8.0, ["menu-midi"])
    add_item(cat, "Salade de tomates, pesto maison", None, 8.0, ["menu-midi", "fait-maison", "vegetarien"])
    add_item(cat, "Foccacia à l'italienne", None, 8.0, ["menu-midi", "gluten"])
    print("✓ Entrées (3)")

    # Plats 16€
    cat = add_cat("Plats", 2, fam_cuisine)
    add_item(cat, "Filet de poulet, jus au thym, légumes de saison", None, 16.0, ["menu-midi", "saison"])
    add_item(cat, "Fish and chips maison", None, 16.0, ["menu-midi", "fait-maison", "poisson", "gluten"])
    add_item(cat, "Tartare de bœuf, frites salade", None, 16.0, ["menu-midi", "cru"])
    add_item(cat, "Salade de tomates, concombres, pesto, Burrata", None, 16.0, ["menu-midi", "vegetarien", "lait"])
    add_item(cat, "Boudin noir, purée de pomme de terre et pomme au four", "Supplément 4€", 16.0, ["menu-midi"])
    print("✓ Plats (5)")

    # Fromages 5€
    cat = add_cat("Fromages", 3, fam_cuisine)
    add_item(cat, "Demi Saint-Marcellin", None, 5.0, ["menu-midi", "lait", "local"])
    add_item(cat, "Assiette de fromages", "Supplément 3€ dans la formule", 5.0, ["menu-midi", "lait"])
    print("✓ Fromages (2)")

    # Desserts 8€
    cat = add_cat("Desserts", 4, fam_cuisine)
    add_item(cat, "Mousse de citron jaune", None, 8.0, ["menu-midi", "fait-maison"])
    add_item(cat, "Salade de fruits", None, 8.0, ["menu-midi", "vegan"])
    print("✓ Desserts (2)")

    # ═════════════════════════════════════════════════════════════════════
    # BOISSONS
    # ═════════════════════════════════════════════════════════════════════

    # Eaux, softs & sodas
    cat = add_cat("Eaux, softs & sodas", 0, fam_boissons)
    add_item(cat, "½ Eau plate", "35cl", 2.5, ["sans-alcool"])
    add_item(cat, "½ Eau pétillante", "35cl", 3.5, ["sans-alcool", "petillant"])
    add_item(cat, "Eau plate", "75cl", 4.0, ["sans-alcool"])
    add_item(cat, "Eau pétillante", "75cl", 5.0, ["sans-alcool", "petillant"])
    add_item(cat, "Sirop bio", "35cl", 3.5, ["sans-alcool", "bio"])
    add_item(cat, "Limonade bio", "25cl", 4.0, ["sans-alcool", "bio"])
    add_item(cat, "Diabolo bio", "35cl", 4.5, ["sans-alcool", "bio"])
    add_item(cat, "Tonic", "35cl", 4.5, ["sans-alcool"])
    add_item(cat, "Coca / Coca Zéro / Fuzz tea", "33cl", 4.5, ["sans-alcool"])
    add_item(cat, "Jus de fruits bio", "20cl", 6.0, ["sans-alcool", "bio"])
    print("✓ Eaux, softs & sodas (10)")

    # Sans alcool
    cat = add_cat("Sans alcool", 1, fam_boissons)
    add_item(cat, "Ginger beer", "35cl", 5.0, ["sans-alcool"])
    add_item(cat, "Virgin Spritz / Mojito", "35cl", 9.0, ["sans-alcool"])
    add_item(cat, "Martini blanc ou rouge", "6cl", 7.0, ["sans-alcool"])
    add_item(cat, "Martini tonic", "35cl", 8.0, ["sans-alcool"])
    print("✓ Sans alcool (4)")

    # Boissons chaudes
    cat = add_cat("Boissons chaudes", 2, fam_boissons)
    add_item(cat, "Espresso / Ristretto / Allongé / Déca", None, 2.0, ["sans-alcool"])
    add_item(cat, "Noisette", None, 2.2, ["sans-alcool", "lait"])
    add_item(cat, "Café crème", None, 3.5, ["sans-alcool", "lait"])
    add_item(cat, "Americano", None, 3.5, ["sans-alcool"])
    add_item(cat, "Double expresso", None, 4.0, ["sans-alcool"])
    add_item(cat, "Thé noir", None, 4.5, ["sans-alcool"])
    add_item(cat, "Thé vert", None, 4.5, ["sans-alcool"])
    add_item(cat, "Thé blanc", None, 4.5, ["sans-alcool"])
    add_item(cat, "Infusion", None, 4.5, ["sans-alcool"])
    add_item(cat, "Tchaï tea", None, 4.5, ["sans-alcool"])
    add_item(cat, "Rooibos", None, 4.5, ["sans-alcool"])
    add_item(cat, "BB Detox", None, 4.5, ["sans-alcool"])
    print("✓ Boissons chaudes (12)")

    # Bières pression
    cat = add_cat("Bières pression", 3, fam_boissons)
    add_item(cat, "Bière blonde", "25cl : 4,00€ · 50cl : 7,00€", 4.0, ["contient-alcool", "pression"])
    add_item(cat, "Indian Pale Ale (IPA)", "25cl : 4,50€ · 50cl : 8,00€", 4.5, ["contient-alcool", "pression"])
    add_item(cat, "Bière du moment", "25cl : 4,50€ · 50cl : 8,00€", 4.5, ["contient-alcool", "pression"])
    add_item(cat, "Panaché / Monaco / Sirop", "25cl : 4,00€ · 50cl : 7,00€", 4.0, ["contient-alcool", "pression"])
    add_item(cat, "Picon bière", "25cl : 4,50€ · 50cl : 8,00€", 4.5, ["contient-alcool", "pression"])
    add_item(cat, "Happy Hour 17h-19h", "Pinte", 6.0, ["contient-alcool", "pression", "happy-hour"])
    print("✓ Bières pression (6)")

    # Cocktails
    cat = add_cat("Cocktails", 4, fam_boissons)
    add_item(cat, "Spritz Apérol", "50cl", 10.0, ["contient-alcool"])
    add_item(cat, "Spritz Saint Germain", "50cl", 14.0, ["contient-alcool"])
    add_item(cat, "Gin tonic", "50cl", 12.0, ["contient-alcool"])
    add_item(cat, "Chartreuse Mule / Vodka Mule", "50cl", 12.0, ["contient-alcool"])
    add_item(cat, "Espresso Martini", "50cl", 12.0, ["contient-alcool"])
    print("✓ Cocktails (5)")

    # Spiritueux
    cat = add_cat("Spiritueux", 5, fam_boissons)
    add_item(cat, "Ricard", "4cl", 3.5, ["contient-alcool"])
    add_item(cat, "Liqueurs \"la petite merveille\"", "4cl", 10.0, ["contient-alcool", "local"])
    add_item(cat, "Gentiane / Limoncello / Génépi", "4cl", 8.0, ["contient-alcool"])
    add_item(cat, "Grande sapinette", "4cl", 12.0, ["contient-alcool", "local"])
    add_item(cat, "Tequila", "4cl", 9.0, ["contient-alcool"])
    add_item(cat, "Gin", "4cl", 9.0, ["contient-alcool"])
    add_item(cat, "Calvados", "4cl", 9.0, ["contient-alcool", "france"])
    add_item(cat, "Chartreuse jaune / Chartreuse verte", "4cl", 12.0, ["contient-alcool", "local"])
    add_item(cat, "Whisky Single Malt", "4cl", 9.0, ["contient-alcool"])
    add_item(cat, "Hudson Bourbon", "4cl", 14.0, ["contient-alcool"])
    add_item(cat, "Whisky Isaly Storm", "4cl", 10.0, ["contient-alcool"])
    add_item(cat, "Rhum XO Overseas", "4cl", 10.0, ["contient-alcool"])
    add_item(cat, "Cognac / Armagnac", "4cl", 12.0, ["contient-alcool", "france"])
    print("✓ Spiritueux (13)")

    # Vins blancs
    cat = add_cat("Vins blancs", 6, fam_boissons)
    add_item(cat, "Côtes du Rhône Villages", "2021 · AOP · Collection VIP — 12cl : 6€ · 75cl : 29€", 6.0, ["contient-alcool", "france", "aop", "sulfites"])
    add_item(cat, "Cool of the Wine", "2023 · Coteaux du Lyonnais AOC — 12cl : 7€ · 75cl : 35€", 7.0, ["contient-alcool", "france", "aoc", "sulfites"])
    add_item(cat, "Saint Bris", "2023 · AOP · Bourgogne, sauvignon blanc — 12cl : 7€ · 75cl : 35€", 7.0, ["contient-alcool", "france", "aop", "sulfites"])
    add_item(cat, "Viognier, Les Vignes d'à Côté", "2023 · IGP · Yves Cuilleron — 12cl : 8€ · 75cl : 39€", 8.0, ["contient-alcool", "france", "igp", "sulfites"])
    add_item(cat, "Costières de Nîmes", "2023 · AOP · Mas des Bressades — 12cl : 8€ · 75cl : 39€", 8.0, ["contient-alcool", "france", "aop", "sulfites"])
    add_item(cat, "Beaujolais Village", "2021 · AOP · Château de Poncié — 12cl : 8€ · 75cl : 39€", 8.0, ["contient-alcool", "france", "aop", "sulfites"])
    add_item(cat, "Pinot d'Alsace", "2022 · Assemblage Alsace · Vignoble du Rêveur — 12cl : 8€ · 75cl : 39€", 8.0, ["contient-alcool", "france", "sulfites"])
    add_item(cat, "Viré-Clessé", "2022 · AOC · Maison Rophéau — 12cl : 9€ · 75cl : 45€", 9.0, ["contient-alcool", "france", "aoc", "sulfites"])
    add_item(cat, "Vacqueyras", "2023 · AOP · Côtes du Rhône septentrionale — 12cl : 9€ · 75cl : 45€", 9.0, ["contient-alcool", "france", "aop", "sulfites"])
    add_item(cat, "Crozes-Hermitage", "2022 · AOP · Côtes du Rhône septentrionale — 12cl : 9€ · 75cl : 45€", 9.0, ["contient-alcool", "france", "aop", "sulfites"])
    add_item(cat, "Rully Les Cailloux", "2020 · AOC · Bourgogne — 12cl : 10€ · 75cl : 49€", 10.0, ["contient-alcool", "france", "aoc", "sulfites"])
    add_item(cat, "Saint Joseph", "2023 · AOP · Domaine Stéphane Montez — 12cl : 10€ · 75cl : 49€", 10.0, ["contient-alcool", "france", "aop", "sulfites"])
    add_item(cat, "Saint-Peray", "2023 · AOP · Yves Cuilleron — 12cl : 10€ · 75cl : 49€", 10.0, ["contient-alcool", "france", "aop", "sulfites"])
    add_item(cat, "Saint Véran", "2022 · AOC · Bourgogne, Maison Rophéau — 12cl : 10€ · 75cl : 49€", 10.0, ["contient-alcool", "france", "aoc", "sulfites"])
    add_item(cat, "Ronceray", "2023 · AOC · Loire, chenin sec, Ch. de plaisance — 12cl : 12€ · 75cl : 59€", 12.0, ["contient-alcool", "france", "aoc", "sulfites"])
    print("✓ Vins blancs (15)")

    # Vins rouges
    cat = add_cat("Vins rouges", 7, fam_boissons)
    add_item(cat, "Côtes du Rhône Villages", "2022 · AOP · Collection VIP — 12cl : 6€ · 75cl : 29€", 6.0, ["contient-alcool", "france", "aop", "sulfites"])
    add_item(cat, "Syrah", "2023 · Les Vignes du Côté, Yves Cuilleron — 12cl : 7€ · 75cl : 35€", 7.0, ["contient-alcool", "france", "sulfites"])
    add_item(cat, "Brouilly", "2022 · AOP · Beaujolais, château de Pierreux — 12cl : 8€ · 75cl : 39€", 8.0, ["contient-alcool", "france", "aop", "sulfites"])
    add_item(cat, "Beaujolais rouge", "2023 · Beaujolais AOP · Domaine Desvignes — 12cl : 8€ · 75cl : 39€", 8.0, ["contient-alcool", "france", "aop", "sulfites"])
    add_item(cat, "Costières de Nîmes", "2022 · AOP · Mas des Bressades — 12cl : 8€ · 75cl : 39€", 8.0, ["contient-alcool", "france", "aop", "sulfites"])
    add_item(cat, "Crozes-Hermitage", "2022 · AOP · Côtes du Rhône septentrionale — 12cl : 8€ · 75cl : 45€", 8.0, ["contient-alcool", "france", "aop", "sulfites"])
    add_item(cat, "Vacqueyras", "2022 · AOP · Côtes du Rhône septentrionale — 12cl : 9€ · 75cl : 45€", 9.0, ["contient-alcool", "france", "aop", "sulfites"])
    add_item(cat, "La Syrah de Lyon !", "2024 · Vin de France · Plein Soleil de Culture — 12cl : 9€ · 75cl : 45€", 9.0, ["contient-alcool", "france", "sulfites"])
    add_item(cat, "Bivouac - Vin nature", "2023 · Vin de France · Jérémy Bricka — 12cl : 9€ · 75cl : 45€", 9.0, ["contient-alcool", "france", "vin-naturel", "sulfites"])
    add_item(cat, "Gigondas", "2020 · AOP · Côtes du Rhône · Collection VIP — 12cl : 10€ · 75cl : 49€", 10.0, ["contient-alcool", "france", "aop", "sulfites"])
    add_item(cat, "Saint Joseph", "2020 · AOP · Domaine Stéphane Montez — 12cl : 10€ · 75cl : 49€", 10.0, ["contient-alcool", "france", "aop", "sulfites"])
    add_item(cat, "Auxey-Duresse", "2018 · AOC · Bourgogne — 12cl : 12€ · 75cl : 59€", 12.0, ["contient-alcool", "france", "aoc", "sulfites"])
    print("✓ Vins rouges (12)")

    # Crémant & Champagne
    cat = add_cat("Crémant & Champagne", 8, fam_boissons)
    add_item(cat, "Vionnier, mousseux", "2021 · Yves Cuilleron — 12cl : 9€ · 75cl : 45€", 9.0, ["contient-alcool", "france", "petillant", "sulfites"])
    add_item(cat, "Champagne Tradition", "AOC · Collection VIP — 12cl : 12€ · 75cl : 59€", 12.0, ["contient-alcool", "france", "aoc", "petillant", "sulfites"])
    add_item(cat, "Champagne Blanc de Blanc / Rosé / Prestige", "AOC · Collection VIP — 75cl : 69€", 69.0, ["contient-alcool", "france", "aoc", "petillant", "sulfites"])
    print("✓ Crémant & Champagne (3)")

    # Vins rosés
    cat = add_cat("Vins rosés", 9, fam_boissons)
    add_item(cat, "Côtes du Rhône", "2022 · AOP · Collection VIP — 12cl : 6€ · 75cl : 29€", 6.0, ["contient-alcool", "france", "aop", "sulfites"])
    add_item(cat, "Puech-Haut", "2024 · IGP · Argali — 12cl : 9€ · 75cl : 45€", 9.0, ["contient-alcool", "france", "igp", "sulfites"])
    print("✓ Vins rosés (2)")

    conn.commit()

    # ── Vérification ─────────────────────────────────────────────────────
    cats = conn.execute('''
        SELECT c.name, f.name as famille, COUNT(i.id) as n
        FROM categories c
        LEFT JOIN items i ON i.category_id = c.id
        LEFT JOIN families f ON f.id = c.family_id
        WHERE c.restaurant_id = ?
        GROUP BY c.id ORDER BY c.family_id, c."order"
    ''', (rid,)).fetchall()

    print(f"\n{'═'*50}")
    print(f"CARTE SAUF IMPRÉVU — {sum(c['n'] for c in cats)} items dans {len(cats)} catégories")
    print(f"{'═'*50}")
    current_fam = None
    for c in cats:
        if c["famille"] != current_fam:
            current_fam = c["famille"]
            print(f"\n  {current_fam}")
        print(f"    {c['name']} : {c['n']} items")

    conn.close()
    print(f"\n✅ Import terminé !")

if __name__ == "__main__":
    main()
