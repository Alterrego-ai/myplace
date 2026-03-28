#!/usr/bin/env python3
"""Sauf Imprévu — Service Carte (Python natif, aucune dépendance externe)"""

import json, os, sqlite3, uuid, mimetypes
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from pathlib import Path

PORT = int(os.environ.get("PORT", 3001))
BASE_DIR = Path(__file__).parent
PUBLIC_DIR = BASE_DIR / "public"
UPLOADS_DIR = PUBLIC_DIR / "uploads"
DB_PATH = BASE_DIR / "carte.db"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

# ══════════════════════════════════════════════════════════════════════════════
# DATABASE
# ══════════════════════════════════════════════════════════════════════════════

def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn

def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS restaurants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            tagline TEXT
        );
        CREATE TABLE IF NOT EXISTS families (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            "order" INTEGER NOT NULL DEFAULT 0,
            image_url TEXT,
            restaurant_id INTEGER NOT NULL,
            FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
        );
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            "order" INTEGER NOT NULL DEFAULT 0,
            visible INTEGER NOT NULL DEFAULT 1,
            image_url TEXT,
            family_id INTEGER,
            restaurant_id INTEGER NOT NULL,
            FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE SET NULL,
            FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
        );
        CREATE TABLE IF NOT EXISTS items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            price REAL NOT NULL,
            available INTEGER NOT NULL DEFAULT 1,
            image_url TEXT,
            category_id INTEGER NOT NULL,
            FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            category TEXT NOT NULL,
            icon TEXT,
            color TEXT,
            bg TEXT,
            is_system INTEGER NOT NULL DEFAULT 0,
            system_role TEXT,
            note TEXT,
            description TEXT
        );
        CREATE TABLE IF NOT EXISTS item_tags (
            item_id INTEGER NOT NULL,
            tag_id INTEGER NOT NULL,
            PRIMARY KEY (item_id, tag_id),
            FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        );
    """)
    conn.commit()
    conn.close()

def dict_row(row):
    return dict(row) if row else None

def dict_rows(rows):
    return [dict(r) for r in rows]

# ── Seed tags ────────────────────────────────────────────────────────────────
SYSTEM_TAGS = [
    {"slug":"gluten","name":"Gluten","category":"ALLERGEN","icon":"🌾","color":"#92400e","bg":"#fef3c7","description":"Céréales contenant du gluten : blé, seigle, orge, avoine, épeautre, kamut"},
    {"slug":"crustaces","name":"Crustacés","category":"ALLERGEN","icon":"🦐","color":"#9f1239","bg":"#ffe4e6","description":"Crustacés et produits à base de crustacés"},
    {"slug":"oeufs","name":"Œufs","category":"ALLERGEN","icon":"🥚","color":"#78350f","bg":"#fef9c3","description":"Œufs et produits à base d'œufs"},
    {"slug":"poisson","name":"Poissons","category":"ALLERGEN","icon":"🐟","color":"#075985","bg":"#e0f2fe","description":"Poissons et produits à base de poissons"},
    {"slug":"arachides","name":"Arachides","category":"ALLERGEN","icon":"🥜","color":"#78350f","bg":"#fef3c7","description":"Arachides et produits à base d'arachides"},
    {"slug":"soja","name":"Soja","category":"ALLERGEN","icon":"🫘","color":"#14532d","bg":"#dcfce7","description":"Soja et produits à base de soja"},
    {"slug":"lait","name":"Lait","category":"ALLERGEN","icon":"🥛","color":"#1e40af","bg":"#dbeafe","description":"Lait et produits à base de lait (y compris lactose)"},
    {"slug":"fruits-a-coque","name":"Fruits à coque","category":"ALLERGEN","icon":"🌰","color":"#92400e","bg":"#fef3c7","description":"Amandes, noisettes, noix, cajou, pécan, macadamia, Brésil, Queensland, pistaches"},
    {"slug":"celeri","name":"Céleri","category":"ALLERGEN","icon":"🌿","color":"#166534","bg":"#f0fdf4","description":"Céleri et produits à base de céleri"},
    {"slug":"moutarde","name":"Moutarde","category":"ALLERGEN","icon":"🟡","color":"#854d0e","bg":"#fef9c3","description":"Moutarde et produits à base de moutarde"},
    {"slug":"sesame","name":"Sésame","category":"ALLERGEN","icon":"🌱","color":"#78350f","bg":"#fef3c7","description":"Graines de sésame et produits à base de graines de sésame"},
    {"slug":"sulfites","name":"Sulfites","category":"ALLERGEN","icon":"⚗️","color":"#4c1d95","bg":"#ede9fe","note":"Non protéique","description":"Anhydride sulfureux et sulfites > 10 mg/kg ou 10 mg/l — additif chimique"},
    {"slug":"lupin","name":"Lupin","category":"ALLERGEN","icon":"🌸","color":"#831843","bg":"#fce7f3","description":"Lupin et produits à base de lupin"},
    {"slug":"mollusques","name":"Mollusques","category":"ALLERGEN","icon":"🐚","color":"#075985","bg":"#e0f2fe","description":"Mollusques et produits à base de mollusques"},
    {"slug":"vegan","name":"Vegan","category":"PRODUCT_TYPE","icon":"🌱","color":"#14532d","bg":"#dcfce7"},
    {"slug":"vegetarien","name":"Végétarien","category":"PRODUCT_TYPE","icon":"🥗","color":"#166534","bg":"#f0fdf4"},
    {"slug":"sans-gluten","name":"Sans gluten","category":"PRODUCT_TYPE","icon":"✓","color":"#14532d","bg":"#dcfce7"},
    {"slug":"sans-lactose","name":"Sans lactose","category":"PRODUCT_TYPE","icon":"🥛","color":"#1e40af","bg":"#dbeafe"},
    {"slug":"sans-porc","name":"Sans porc","category":"PRODUCT_TYPE","icon":"🐷","color":"#9f1239","bg":"#ffe4e6"},
    {"slug":"adapte-enfants","name":"Adapté enfants","category":"PRODUCT_TYPE","icon":"👶","color":"#0369a1","bg":"#e0f2fe"},
    {"slug":"bio","name":"Bio","category":"PRODUCT_TYPE","icon":"♻️","color":"#14532d","bg":"#dcfce7"},
    {"slug":"nature","name":"Nature","category":"PRODUCT_TYPE","icon":"🍃","color":"#166534","bg":"#f0fdf4"},
    {"slug":"fait-maison","name":"Fait maison","category":"PRODUCT_TYPE","icon":"👨‍🍳","color":"#4c1d95","bg":"#ede9fe"},
    {"slug":"label-rouge","name":"Label Rouge","category":"PRODUCT_TYPE","icon":"🔴","color":"#be123c","bg":"#ffe4e6"},
    {"slug":"plein-air","name":"Élevage plein air","category":"PRODUCT_TYPE","icon":"🌾","color":"#166534","bg":"#f0fdf4"},
    {"slug":"cru","name":"Cru / non cuit","category":"PRODUCT_TYPE","icon":"⚠️","color":"#b45309","bg":"#fef3c7","note":"Info sécurité"},
    {"slug":"surgele","name":"Surgelé","category":"PRODUCT_TYPE","icon":"❄️","color":"#0369a1","bg":"#e0f2fe","note":"Mention légale"},
    {"slug":"epice","name":"Épicé","category":"PRODUCT_TYPE","icon":"🌶️","color":"#b45309","bg":"#fef3c7"},
    {"slug":"tres-epice","name":"Très épicé","category":"PRODUCT_TYPE","icon":"🌶️🌶️","color":"#be123c","bg":"#ffe4e6"},
    {"slug":"sans-alcool","name":"Sans alcool","category":"BEVERAGE","icon":"🚫","color":"#166534","bg":"#dcfce7"},
    {"slug":"contient-alcool","name":"Contient de l'alcool","category":"BEVERAGE","icon":"🍷","color":"#9f1239","bg":"#ffe4e6"},
    {"slug":"vin-naturel","name":"Vin naturel","category":"BEVERAGE","icon":"🍇","color":"#7c3aed","bg":"#ede9fe"},
    {"slug":"biodynamique","name":"Biodynamique","category":"BEVERAGE","icon":"🌙","color":"#4c1d95","bg":"#ede9fe"},
    {"slug":"petillant","name":"Pétillant","category":"BEVERAGE","icon":"🫧","color":"#0369a1","bg":"#e0f2fe"},
    {"slug":"sans-sucre-ajoute","name":"Sans sucre ajouté","category":"BEVERAGE","icon":"🍬","color":"#166534","bg":"#dcfce7"},
    {"slug":"pression","name":"Pression","category":"BEVERAGE","icon":"🍺","color":"#78350f","bg":"#fef3c7"},
    {"slug":"halal","name":"Halal","category":"CERTIFICATION","icon":"☪️","color":"#166534","bg":"#dcfce7","note":"Certification requise"},
    {"slug":"casher","name":"Casher","category":"CERTIFICATION","icon":"✡️","color":"#1e40af","bg":"#dbeafe","note":"Certification requise"},
    {"slug":"local","name":"Local","category":"ORIGIN","icon":"📍","color":"#14532d","bg":"#dcfce7"},
    {"slug":"france","name":"France","category":"ORIGIN","icon":"🇫🇷","color":"#1e40af","bg":"#dbeafe"},
    {"slug":"aoc","name":"AOC","category":"ORIGIN","icon":"🏷️","color":"#4c1d95","bg":"#ede9fe"},
    {"slug":"aop","name":"AOP","category":"ORIGIN","icon":"🏷️","color":"#4c1d95","bg":"#ede9fe"},
    {"slug":"igp","name":"IGP","category":"ORIGIN","icon":"🏷️","color":"#3d5a80","bg":"#e8edf4"},
    {"slug":"circuit-court","name":"Circuit court","category":"ORIGIN","icon":"🌿","color":"#14532d","bg":"#dcfce7"},
    {"slug":"menu-midi","name":"Menu midi","category":"OFFER","icon":"☀️","color":"#78350f","bg":"#fef3c7","system_role":"view"},
    {"slug":"happy-hour","name":"Happy Hour","category":"OFFER","icon":"🍹","color":"#9f1239","bg":"#ffe4e6","system_role":"schedule"},
    {"slug":"suggestion","name":"Suggestion","category":"OFFER","icon":"⭐","color":"#1e40af","bg":"#dbeafe","system_role":"view"},
    {"slug":"menu-soir","name":"Menu du soir","category":"OFFER","icon":"🌙","color":"#4c1d95","bg":"#ede9fe","system_role":"view"},
    {"slug":"nouveau","name":"Nouveau","category":"HIGHLIGHT","icon":"✨","color":"#78350f","bg":"#fef3c7","system_role":"badge"},
    {"slug":"signature","name":"Signature","category":"HIGHLIGHT","icon":"👑","color":"#3d5a80","bg":"#e8edf4","system_role":"badge"},
    {"slug":"coup-de-coeur","name":"Coup de cœur","category":"HIGHLIGHT","icon":"❤️","color":"#9f1239","bg":"#ffe4e6","system_role":"badge"},
    {"slug":"saison","name":"Saison","category":"HIGHLIGHT","icon":"🍂","color":"#92400e","bg":"#fef3c7","system_role":"badge"},
]

def seed_tags():
    conn = get_db()
    for t in SYSTEM_TAGS:
        conn.execute("""
            INSERT INTO tags (name, slug, category, icon, color, bg, is_system, system_role, note, description)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
            ON CONFLICT(slug) DO UPDATE SET
                name=excluded.name, icon=excluded.icon, color=excluded.color, bg=excluded.bg,
                description=excluded.description, note=excluded.note, system_role=excluded.system_role
        """, (t["name"], t["slug"], t["category"], t.get("icon"), t.get("color"), t.get("bg"),
              t.get("system_role"), t.get("note"), t.get("description")))
    conn.commit()
    conn.close()

def seed_demo():
    conn = get_db()
    row = conn.execute("SELECT id FROM restaurants WHERE slug='sauf-imprevu'").fetchone()
    if row:
        conn.close()
        return
    cur = conn.execute("INSERT INTO restaurants (name, slug, tagline) VALUES (?, ?, ?)",
                       ("Sauf Imprévu", "sauf-imprevu", "Cuisine de saison · Bordeaux"))
    rid = cur.lastrowid
    f1 = conn.execute('INSERT INTO families (name, "order", restaurant_id) VALUES (?,?,?)', ("Cuisine", 0, rid)).lastrowid
    f2 = conn.execute('INSERT INTO families (name, "order", restaurant_id) VALUES (?,?,?)', ("Boissons", 1, rid)).lastrowid
    cats = {}
    for name, order, fid in [("Entrées",0,f1),("Plats",1,f1),("Desserts",2,f1),("Vins rouges",0,f2),("Softs",1,f2)]:
        cats[name] = conn.execute('INSERT INTO categories (name, "order", visible, family_id, restaurant_id) VALUES (?,?,1,?,?)',
                                  (name, order, fid, rid)).lastrowid
    demo_items = [
        (cats["Entrées"], "Carpaccio de bœuf", "Roquette, parmesan 24 mois, huile de truffe", 18, 1, ["signature","fait-maison","cru"]),
        (cats["Entrées"], "Velouté de butternut", "Crème de coco, graines de courge torréfiées", 12, 1, ["vegan","fait-maison","saison"]),
        (cats["Entrées"], "Foie gras maison", "Chutney de figues, brioche toastée", 24, 0, ["fait-maison","gluten","oeufs"]),
        (cats["Plats"], "Filet de sole meunière", "Beurre noisette, câpres, citron confit", 32, 1, ["poisson","lait","menu-midi","local"]),
        (cats["Plats"], "Côte de veau rôtie", "Jus corsé, gratin dauphinois, haricots verts", 38, 1, ["lait","france"]),
        (cats["Plats"], "Risotto aux cèpes", "Parmesan AOP, huile de truffe blanche", 26, 1, ["vegetarien","aoc","coup-de-coeur","lait"]),
        (cats["Desserts"], "Soufflé Grand Marnier", "Crème anglaise vanille Bourbon", 14, 1, ["fait-maison","oeufs","gluten","lait","sulfites"]),
        (cats["Desserts"], "Cheese-cake yuzu", "Coulis de fruits de la passion", 12, 1, ["nouveau","fait-maison","gluten","oeufs","lait"]),
        (cats["Vins rouges"], "Chablis Premier Cru", "Domaine Laroche, 2021", 11, 1, ["aoc","france","sulfites","contient-alcool"]),
        (cats["Vins rouges"], "Côtes du Rhône", "Château Beauchêne, 2020", 8, 1, ["france","sulfites","contient-alcool"]),
        (cats["Softs"], "Limonade maison", "Citron, gingembre, menthe fraîche", 5, 1, ["fait-maison","vegan","sans-alcool"]),
    ]
    for cat_id, name, desc, price, avail, tag_slugs in demo_items:
        item_id = conn.execute("INSERT INTO items (name, description, price, available, category_id) VALUES (?,?,?,?,?)",
                               (name, desc, price, avail, cat_id)).lastrowid
        for slug in tag_slugs:
            tag = conn.execute("SELECT id FROM tags WHERE slug=?", (slug,)).fetchone()
            if tag:
                conn.execute("INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (?,?)", (item_id, tag["id"]))
    conn.commit()
    conn.close()
    print("✓ Données de démo créées")

# ══════════════════════════════════════════════════════════════════════════════
# HTTP HANDLER
# ══════════════════════════════════════════════════════════════════════════════

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC_DIR), **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)

        # API routes
        if path.startswith("/api/"):
            return self._handle_api_get(path, qs)

        # SPA routes
        if path == "/admin":
            return self._serve_file("admin.html")
        if path.startswith("/menu"):
            return self._serve_file("menu.html")

        # Static files
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/upload":
            return self._handle_upload()

        body = self._read_json()
        if body is None:
            body = {}

        if path == "/api/families":
            return self._handle_create_family(body)
        if path == "/api/categories":
            return self._handle_create_category(body)
        if path == "/api/items":
            return self._handle_create_item(body)
        if path == "/api/tags/custom":
            return self._handle_create_custom_tag(body)

        # /api/categories/:id/reorder  (direction-based)
        parts = path.split("/")
        if len(parts) == 5 and parts[2] == "categories" and parts[4] == "reorder":
            return self._handle_reorder_direction("categories", int(parts[3]), body)

        # /api/items/:id/toggle
        if len(parts) == 5 and parts[2] == "items" and parts[4] == "toggle":
            return self._handle_toggle_item(int(parts[3]))

        self._json_response({"erreur": "Route inconnue"}, 404)

    def do_PUT(self):
        parsed = urlparse(self.path)
        path = parsed.path
        body = self._read_json() or {}

        if path == "/api/families/reorder":
            return self._handle_reorder("families", body)
        if path == "/api/categories/reorder":
            return self._handle_reorder("categories", body)

        # /api/families/:id
        parts = path.split("/")
        if len(parts) == 4 and parts[2] == "families":
            return self._handle_update_family(int(parts[3]), body)
        if len(parts) == 4 and parts[2] == "categories":
            return self._handle_update_category(int(parts[3]), body)
        if len(parts) == 4 and parts[2] == "items":
            return self._handle_update_item(int(parts[3]), body)
        if len(parts) == 5 and parts[2] == "items" and parts[4] == "toggle":
            return self._handle_toggle_item(int(parts[3]))

        self._json_response({"erreur": "Route inconnue"}, 404)

    def do_DELETE(self):
        parsed = urlparse(self.path)
        parts = parsed.path.split("/")

        if len(parts) == 4 and parts[2] == "families":
            return self._handle_delete("families", "families", int(parts[3]))
        if len(parts) == 4 and parts[2] == "categories":
            return self._handle_delete("categories", "categories", int(parts[3]))
        if len(parts) == 4 and parts[2] == "items":
            return self._handle_delete("items", "items", int(parts[3]))

        self._json_response({"erreur": "Route inconnue"}, 404)

    # ── API GET handlers ─────────────────────────────────────────────────────

    def _handle_api_get(self, path, qs):
        conn = get_db()
        try:
            if path == "/api/restaurants":
                rows = conn.execute("SELECT * FROM restaurants").fetchall()
                return self._json_response(dict_rows(rows))

            if path == "/api/families":
                rid = qs.get("restaurant_id", [None])[0]
                if not rid:
                    return self._json_response({"erreur": "restaurant_id requis"}, 400)
                rows = conn.execute('SELECT * FROM families WHERE restaurant_id=? ORDER BY "order"', (rid,)).fetchall()
                return self._json_response(dict_rows(rows))

            if path == "/api/categories":
                rid = qs.get("restaurant_id", [None])[0]
                if not rid:
                    return self._json_response({"erreur": "restaurant_id requis"}, 400)
                rows = conn.execute('''
                    SELECT c.*, f.name as family_name,
                        (SELECT COUNT(*) FROM items WHERE category_id = c.id) as item_count
                    FROM categories c
                    LEFT JOIN families f ON f.id = c.family_id
                    WHERE c.restaurant_id = ?
                    ORDER BY c."order"
                ''', (rid,)).fetchall()
                return self._json_response(dict_rows(rows))

            if path == "/api/items":
                rid = qs.get("restaurant_id", [None])[0]
                cat_id = qs.get("category_id", [None])[0]
                query = '''
                    SELECT i.*, c.name as category_name,
                        GROUP_CONCAT(t.slug) as tag_slugs
                    FROM items i
                    LEFT JOIN categories c ON c.id = i.category_id
                    LEFT JOIN item_tags it ON it.item_id = i.id
                    LEFT JOIN tags t ON t.id = it.tag_id
                '''
                conditions = []
                params = []
                if cat_id:
                    conditions.append("i.category_id = ?")
                    params.append(cat_id)
                if rid:
                    conditions.append("c.restaurant_id = ?")
                    params.append(rid)
                if conditions:
                    query += " WHERE " + " AND ".join(conditions)
                query += ' GROUP BY i.id ORDER BY c."order", i.name'
                rows = conn.execute(query, params).fetchall()
                return self._json_response(dict_rows(rows))

            if path == "/api/tags":
                cat = qs.get("category", [None])[0]
                if cat:
                    rows = conn.execute("SELECT * FROM tags WHERE category=? ORDER BY name", (cat,)).fetchall()
                else:
                    rows = conn.execute("SELECT * FROM tags ORDER BY category, name").fetchall()
                return self._json_response(dict_rows(rows))

            # /api/menu/:slug
            if path.startswith("/api/menu/"):
                slug = path.split("/")[-1]
                resto = conn.execute("SELECT * FROM restaurants WHERE slug=?", (slug,)).fetchone()
                if not resto:
                    return self._json_response({"erreur": "Restaurant introuvable"}, 404)
                rid = resto["id"]
                families = conn.execute('SELECT * FROM families WHERE restaurant_id=? ORDER BY "order"', (rid,)).fetchall()
                categories = conn.execute('SELECT * FROM categories WHERE restaurant_id=? AND visible=1 ORDER BY "order"', (rid,)).fetchall()
                items = conn.execute('''
                    SELECT i.*, GROUP_CONCAT(t.slug) as tag_slugs
                    FROM items i
                    LEFT JOIN item_tags it ON it.item_id = i.id
                    LEFT JOIN tags t ON t.id = it.tag_id
                    WHERE i.category_id IN (SELECT id FROM categories WHERE restaurant_id=? AND visible=1)
                    GROUP BY i.id ORDER BY i.name
                ''', (rid,)).fetchall()
                tags = conn.execute("SELECT * FROM tags ORDER BY category, name").fetchall()
                return self._json_response({
                    "restaurant": dict_row(resto),
                    "families": dict_rows(families),
                    "categories": dict_rows(categories),
                    "items": dict_rows(items),
                    "tags": dict_rows(tags),
                })

            return self._json_response({"erreur": "Route inconnue"}, 404)
        finally:
            conn.close()

    # ── POST handlers ────────────────────────────────────────────────────────

    def _handle_create_family(self, body):
        name = body.get("name")
        rid = body.get("restaurant_id")
        if not name or not rid:
            return self._json_response({"erreur": "name et restaurant_id requis"}, 400)
        conn = get_db()
        last = conn.execute('SELECT MAX("order") as mx FROM families WHERE restaurant_id=?', (rid,)).fetchone()
        mx = last["mx"] if last["mx"] is not None else -1
        cur = conn.execute('INSERT INTO families (name, "order", restaurant_id) VALUES (?,?,?)', (name, mx+1, rid))
        row = conn.execute("SELECT * FROM families WHERE id=?", (cur.lastrowid,)).fetchone()
        conn.commit()
        conn.close()
        self._json_response(dict_row(row), 201)

    def _handle_create_category(self, body):
        name = body.get("name")
        rid = body.get("restaurant_id")
        if not name or not rid:
            return self._json_response({"erreur": "name et restaurant_id requis"}, 400)
        conn = get_db()
        last = conn.execute('SELECT MAX("order") as mx FROM categories WHERE restaurant_id=?', (rid,)).fetchone()
        mx = last["mx"] if last["mx"] is not None else -1
        fid = body.get("family_id")
        cur = conn.execute('''INSERT INTO categories (name, "order", visible, image_url, family_id, restaurant_id)
            VALUES (?,?,?,?,?,?)''', (name, mx+1, 1 if body.get("visible", True) else 0, body.get("image_url"), fid, rid))
        row = conn.execute("SELECT * FROM categories WHERE id=?", (cur.lastrowid,)).fetchone()
        conn.commit()
        conn.close()
        self._json_response(dict_row(row), 201)

    def _handle_create_item(self, body):
        name = body.get("name")
        price = body.get("price")
        cat_id = body.get("category_id")
        if not name or price is None or not cat_id:
            return self._json_response({"erreur": "name, price et category_id requis"}, 400)
        conn = get_db()
        cur = conn.execute("INSERT INTO items (name, description, price, available, image_url, category_id) VALUES (?,?,?,1,?,?)",
                           (name, body.get("description"), price, body.get("image_url"), cat_id))
        item_id = cur.lastrowid
        tag_slugs = body.get("tag_slugs", [])
        for slug in tag_slugs:
            tag = conn.execute("SELECT id FROM tags WHERE slug=?", (slug,)).fetchone()
            if tag:
                conn.execute("INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (?,?)", (item_id, tag["id"]))
        conn.commit()
        row = conn.execute('''
            SELECT i.*, GROUP_CONCAT(t.slug) as tag_slugs
            FROM items i LEFT JOIN item_tags it ON it.item_id=i.id LEFT JOIN tags t ON t.id=it.tag_id
            WHERE i.id=? GROUP BY i.id
        ''', (item_id,)).fetchone()
        conn.close()
        self._json_response(dict_row(row), 201)

    def _handle_create_custom_tag(self, body):
        name = body.get("name")
        slug = body.get("slug")
        if not name or not slug:
            return self._json_response({"erreur": "name et slug requis"}, 400)
        conn = get_db()
        try:
            cur = conn.execute("INSERT INTO tags (name, slug, category, icon, color, bg, is_system) VALUES (?,?,'CUSTOM',?,?,?,0)",
                               (name, slug, body.get("icon"), body.get("color"), body.get("bg")))
            conn.commit()
            row = conn.execute("SELECT * FROM tags WHERE id=?", (cur.lastrowid,)).fetchone()
            conn.close()
            self._json_response(dict_row(row), 201)
        except sqlite3.IntegrityError:
            conn.close()
            self._json_response({"erreur": "Tag déjà existant"}, 409)

    # ── PUT handlers ─────────────────────────────────────────────────────────

    def _handle_update_family(self, fid, body):
        conn = get_db()
        fields, values = [], []
        if "name" in body: fields.append("name=?"); values.append(body["name"])
        if "image_url" in body: fields.append("image_url=?"); values.append(body["image_url"])
        if not fields:
            conn.close()
            return self._json_response({"erreur": "Rien à modifier"}, 400)
        values.append(fid)
        conn.execute(f"UPDATE families SET {', '.join(fields)} WHERE id=?", values)
        conn.commit()
        row = conn.execute("SELECT * FROM families WHERE id=?", (fid,)).fetchone()
        conn.close()
        self._json_response(dict_row(row))

    def _handle_update_category(self, cid, body):
        conn = get_db()
        fields, values = [], []
        if "name" in body: fields.append("name=?"); values.append(body["name"])
        if "visible" in body: fields.append("visible=?"); values.append(1 if body["visible"] else 0)
        if "image_url" in body: fields.append("image_url=?"); values.append(body["image_url"])
        if "family_id" in body: fields.append("family_id=?"); values.append(body["family_id"])
        if not fields:
            conn.close()
            return self._json_response({"erreur": "Rien à modifier"}, 400)
        values.append(cid)
        conn.execute(f"UPDATE categories SET {', '.join(fields)} WHERE id=?", values)
        conn.commit()
        row = conn.execute("SELECT * FROM categories WHERE id=?", (cid,)).fetchone()
        conn.close()
        self._json_response(dict_row(row))

    def _handle_update_item(self, item_id, body):
        conn = get_db()
        fields, values = [], []
        for key in ["name", "description", "price", "image_url", "category_id"]:
            if key in body: fields.append(f"{key}=?"); values.append(body[key])
        if "available" in body: fields.append("available=?"); values.append(1 if body["available"] else 0)
        if fields:
            values.append(item_id)
            conn.execute(f"UPDATE items SET {', '.join(fields)} WHERE id=?", values)
        if "tag_slugs" in body:
            conn.execute("DELETE FROM item_tags WHERE item_id=?", (item_id,))
            for slug in body["tag_slugs"]:
                tag = conn.execute("SELECT id FROM tags WHERE slug=?", (slug,)).fetchone()
                if tag:
                    conn.execute("INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (?,?)", (item_id, tag["id"]))
        conn.commit()
        row = conn.execute('''
            SELECT i.*, GROUP_CONCAT(t.slug) as tag_slugs
            FROM items i LEFT JOIN item_tags it ON it.item_id=i.id LEFT JOIN tags t ON t.id=it.tag_id
            WHERE i.id=? GROUP BY i.id
        ''', (item_id,)).fetchone()
        conn.close()
        if not row:
            return self._json_response({"erreur": "Plat introuvable"}, 404)
        self._json_response(dict_row(row))

    def _handle_toggle_item(self, item_id):
        conn = get_db()
        item = conn.execute("SELECT available FROM items WHERE id=?", (item_id,)).fetchone()
        if not item:
            conn.close()
            return self._json_response({"erreur": "Plat introuvable"}, 404)
        conn.execute("UPDATE items SET available=? WHERE id=?", (0 if item["available"] else 1, item_id))
        conn.commit()
        row = conn.execute("SELECT * FROM items WHERE id=?", (item_id,)).fetchone()
        conn.close()
        self._json_response(dict_row(row))

    def _handle_reorder(self, table, body):
        ids = body.get("ids", [])
        if not isinstance(ids, list):
            return self._json_response({"erreur": "ids requis"}, 400)
        conn = get_db()
        for i, fid in enumerate(ids):
            conn.execute(f'UPDATE {table} SET "order"=? WHERE id=?', (i, fid))
        conn.commit()
        conn.close()
        self._json_response({"success": True})

    def _handle_reorder_direction(self, table, item_id, body):
        """Swap order of an item with its neighbor (direction: -1 or +1)"""
        direction = body.get("direction", 0)
        if direction not in (-1, 1):
            return self._json_response({"erreur": "direction -1 ou 1 requis"}, 400)
        conn = get_db()
        # Get all items ordered
        if table == "categories":
            rows = conn.execute('SELECT id, "order" FROM categories ORDER BY "order"').fetchall()
        else:
            rows = conn.execute(f'SELECT id, "order" FROM {table} ORDER BY "order"').fetchall()
        items = [dict_row(r) for r in rows]
        idx = next((i for i, r in enumerate(items) if r["id"] == item_id), None)
        if idx is None:
            conn.close()
            return self._json_response({"erreur": "introuvable"}, 404)
        new_idx = idx + direction
        if new_idx < 0 or new_idx >= len(items):
            conn.close()
            return self._json_response({"success": True})  # nothing to do
        # Swap orders
        order_a = items[idx].get("order", idx)
        order_b = items[new_idx].get("order", new_idx)
        conn.execute(f'UPDATE {table} SET "order"=? WHERE id=?', (order_b, items[idx]["id"]))
        conn.execute(f'UPDATE {table} SET "order"=? WHERE id=?', (order_a, items[new_idx]["id"]))
        conn.commit()
        conn.close()
        self._json_response({"success": True})

    # ── DELETE handler ───────────────────────────────────────────────────────

    def _handle_delete(self, table, label, rid):
        conn = get_db()
        if table == "families":
            conn.execute("UPDATE categories SET family_id=NULL WHERE family_id=?", (rid,))
        r = conn.execute(f"DELETE FROM {table} WHERE id=?", (rid,))
        conn.commit()
        conn.close()
        if r.rowcount == 0:
            return self._json_response({"erreur": f"{label} introuvable"}, 404)
        self._json_response({"success": True})

    # ── Upload handler ───────────────────────────────────────────────────────

    def _handle_upload(self):
        content_type = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in content_type:
            return self._json_response({"erreur": "Content-Type multipart requis"}, 400)

        boundary = content_type.split("boundary=")[-1].strip()
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length)

        # Simple multipart parser
        parts = body.split(f"--{boundary}".encode())
        for part in parts:
            if b"filename=" in part:
                header_end = part.find(b"\r\n\r\n")
                if header_end == -1:
                    continue
                headers_raw = part[:header_end].decode("utf-8", errors="replace")
                file_data = part[header_end+4:]
                if file_data.endswith(b"\r\n"):
                    file_data = file_data[:-2]

                # Extract filename
                fn = "upload"
                for line in headers_raw.split("\r\n"):
                    if "filename=" in line:
                        fn = line.split('filename="')[-1].split('"')[0]
                        break

                ext = Path(fn).suffix or ".bin"
                safe_name = f"{uuid.uuid4().hex[:8]}{ext}"
                filepath = UPLOADS_DIR / safe_name
                filepath.write_bytes(file_data)
                return self._json_response({"url": f"/uploads/{safe_name}"})

        self._json_response({"erreur": "Aucun fichier"}, 400)

    # ── Utilities ────────────────────────────────────────────────────────────

    def _read_json(self):
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length == 0:
            return None
        try:
            return json.loads(self.rfile.read(content_length))
        except:
            return None

    def _json_response(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _serve_file(self, filename):
        filepath = PUBLIC_DIR / filename
        if not filepath.exists():
            self.send_error(404)
            return
        content = filepath.read_bytes()
        self.send_response(200)
        mime = mimetypes.guess_type(str(filepath))[0] or "text/html"
        self.send_header("Content-Type", f"{mime}; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def log_message(self, format, *args):
        # Cleaner logging
        print(f"  {args[0]}" if args else "")

# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    init_db()
    seed_tags()
    seed_demo()
    print(f"Sauf Imprévu — service carte actif sur le port {PORT}")
    print(f"  Admin : http://localhost:{PORT}/admin")
    print(f"  Menu  : http://localhost:{PORT}/menu/sauf-imprevu")
    server = HTTPServer(("0.0.0.0", PORT), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nArrêt du service carte.")
        server.server_close()
