const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();

// CORS — permet au back-office unifié d'appeler l'API depuis un autre domaine
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Upload images ───────────────────────────────────────────────────────────
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadsDir),
  filename: (_, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'))
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// ── Init DB ─────────────────────────────────────────────────────────────────
const db = new Database('carte.db');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
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
`);

// ── Seed tags système ───────────────────────────────────────────────────────
const SYSTEM_TAGS = [
  // ALLERGEN (14 réglementaires EU — Règlement 1169/2011)
  { slug: "gluten", name: "Gluten", category: "ALLERGEN", icon: "🌾", color: "#92400e", bg: "#fef3c7", description: "Céréales contenant du gluten : blé, seigle, orge, avoine, épeautre, kamut" },
  { slug: "crustaces", name: "Crustacés", category: "ALLERGEN", icon: "🦐", color: "#9f1239", bg: "#ffe4e6", description: "Crustacés et produits à base de crustacés" },
  { slug: "oeufs", name: "Œufs", category: "ALLERGEN", icon: "🥚", color: "#78350f", bg: "#fef9c3", description: "Œufs et produits à base d'œufs" },
  { slug: "poisson", name: "Poissons", category: "ALLERGEN", icon: "🐟", color: "#075985", bg: "#e0f2fe", description: "Poissons et produits à base de poissons" },
  { slug: "arachides", name: "Arachides", category: "ALLERGEN", icon: "🥜", color: "#78350f", bg: "#fef3c7", description: "Arachides et produits à base d'arachides" },
  { slug: "soja", name: "Soja", category: "ALLERGEN", icon: "🫘", color: "#14532d", bg: "#dcfce7", description: "Soja et produits à base de soja" },
  { slug: "lait", name: "Lait", category: "ALLERGEN", icon: "🥛", color: "#1e40af", bg: "#dbeafe", description: "Lait et produits à base de lait (y compris lactose)" },
  { slug: "fruits-a-coque", name: "Fruits à coque", category: "ALLERGEN", icon: "🌰", color: "#92400e", bg: "#fef3c7", description: "Amandes, noisettes, noix, cajou, pécan, macadamia, Brésil, Queensland, pistaches" },
  { slug: "celeri", name: "Céleri", category: "ALLERGEN", icon: "🌿", color: "#166534", bg: "#f0fdf4", description: "Céleri et produits à base de céleri" },
  { slug: "moutarde", name: "Moutarde", category: "ALLERGEN", icon: "🟡", color: "#854d0e", bg: "#fef9c3", description: "Moutarde et produits à base de moutarde" },
  { slug: "sesame", name: "Sésame", category: "ALLERGEN", icon: "🌱", color: "#78350f", bg: "#fef3c7", description: "Graines de sésame et produits à base de graines de sésame" },
  { slug: "sulfites", name: "Sulfites", category: "ALLERGEN", icon: "⚗️", color: "#4c1d95", bg: "#ede9fe", note: "Non protéique", description: "Anhydride sulfureux et sulfites > 10 mg/kg ou 10 mg/l — additif chimique" },
  { slug: "lupin", name: "Lupin", category: "ALLERGEN", icon: "🌸", color: "#831843", bg: "#fce7f3", description: "Lupin et produits à base de lupin" },
  { slug: "mollusques", name: "Mollusques", category: "ALLERGEN", icon: "🐚", color: "#075985", bg: "#e0f2fe", description: "Mollusques et produits à base de mollusques" },
  // PRODUCT_TYPE
  { slug: "vegan", name: "Vegan", category: "PRODUCT_TYPE", icon: "🌱", color: "#14532d", bg: "#dcfce7" },
  { slug: "vegetarien", name: "Végétarien", category: "PRODUCT_TYPE", icon: "🥗", color: "#166534", bg: "#f0fdf4" },
  { slug: "sans-gluten", name: "Sans gluten", category: "PRODUCT_TYPE", icon: "✓", color: "#14532d", bg: "#dcfce7" },
  { slug: "sans-lactose", name: "Sans lactose", category: "PRODUCT_TYPE", icon: "🥛", color: "#1e40af", bg: "#dbeafe" },
  { slug: "sans-porc", name: "Sans porc", category: "PRODUCT_TYPE", icon: "🐷", color: "#9f1239", bg: "#ffe4e6" },
  { slug: "adapte-enfants", name: "Adapté enfants", category: "PRODUCT_TYPE", icon: "👶", color: "#0369a1", bg: "#e0f2fe" },
  { slug: "bio", name: "Bio", category: "PRODUCT_TYPE", icon: "♻️", color: "#14532d", bg: "#dcfce7" },
  { slug: "nature", name: "Nature", category: "PRODUCT_TYPE", icon: "🍃", color: "#166534", bg: "#f0fdf4" },
  { slug: "fait-maison", name: "Fait maison", category: "PRODUCT_TYPE", icon: "👨‍🍳", color: "#4c1d95", bg: "#ede9fe" },
  { slug: "label-rouge", name: "Label Rouge", category: "PRODUCT_TYPE", icon: "🔴", color: "#be123c", bg: "#ffe4e6" },
  { slug: "plein-air", name: "Élevage plein air", category: "PRODUCT_TYPE", icon: "🌾", color: "#166534", bg: "#f0fdf4" },
  { slug: "cru", name: "Cru / non cuit", category: "PRODUCT_TYPE", icon: "⚠️", color: "#b45309", bg: "#fef3c7", note: "Info sécurité" },
  { slug: "surgele", name: "Surgelé", category: "PRODUCT_TYPE", icon: "❄️", color: "#0369a1", bg: "#e0f2fe", note: "Mention légale" },
  { slug: "epice", name: "Épicé", category: "PRODUCT_TYPE", icon: "🌶️", color: "#b45309", bg: "#fef3c7" },
  { slug: "tres-epice", name: "Très épicé", category: "PRODUCT_TYPE", icon: "🌶️🌶️", color: "#be123c", bg: "#ffe4e6" },
  // BEVERAGE
  { slug: "sans-alcool", name: "Sans alcool", category: "BEVERAGE", icon: "🚫", color: "#166534", bg: "#dcfce7" },
  { slug: "contient-alcool", name: "Contient de l'alcool", category: "BEVERAGE", icon: "🍷", color: "#9f1239", bg: "#ffe4e6" },
  { slug: "vin-naturel", name: "Vin naturel", category: "BEVERAGE", icon: "🍇", color: "#7c3aed", bg: "#ede9fe" },
  { slug: "biodynamique", name: "Biodynamique", category: "BEVERAGE", icon: "🌙", color: "#4c1d95", bg: "#ede9fe" },
  { slug: "petillant", name: "Pétillant", category: "BEVERAGE", icon: "🫧", color: "#0369a1", bg: "#e0f2fe" },
  { slug: "sans-sucre-ajoute", name: "Sans sucre ajouté", category: "BEVERAGE", icon: "🍬", color: "#166534", bg: "#dcfce7" },
  { slug: "pression", name: "Pression", category: "BEVERAGE", icon: "🍺", color: "#78350f", bg: "#fef3c7" },
  // CERTIFICATION
  { slug: "halal", name: "Halal", category: "CERTIFICATION", icon: "☪️", color: "#166534", bg: "#dcfce7", note: "Certification requise" },
  { slug: "casher", name: "Casher", category: "CERTIFICATION", icon: "✡️", color: "#1e40af", bg: "#dbeafe", note: "Certification requise" },
  // ORIGIN
  { slug: "local", name: "Local", category: "ORIGIN", icon: "📍", color: "#14532d", bg: "#dcfce7" },
  { slug: "france", name: "France", category: "ORIGIN", icon: "🇫🇷", color: "#1e40af", bg: "#dbeafe" },
  { slug: "aoc", name: "AOC", category: "ORIGIN", icon: "🏷️", color: "#4c1d95", bg: "#ede9fe" },
  { slug: "aop", name: "AOP", category: "ORIGIN", icon: "🏷️", color: "#4c1d95", bg: "#ede9fe" },
  { slug: "igp", name: "IGP", category: "ORIGIN", icon: "🏷️", color: "#3d5a80", bg: "#e8edf4" },
  { slug: "circuit-court", name: "Circuit court", category: "ORIGIN", icon: "🌿", color: "#14532d", bg: "#dcfce7" },
  // OFFER
  { slug: "menu-midi", name: "Menu midi", category: "OFFER", icon: "☀️", color: "#78350f", bg: "#fef3c7", system_role: "view" },
  { slug: "happy-hour", name: "Happy Hour", category: "OFFER", icon: "🍹", color: "#9f1239", bg: "#ffe4e6", system_role: "schedule" },
  { slug: "suggestion", name: "Suggestion", category: "OFFER", icon: "⭐", color: "#1e40af", bg: "#dbeafe", system_role: "view" },
  { slug: "menu-soir", name: "Menu du soir", category: "OFFER", icon: "🌙", color: "#4c1d95", bg: "#ede9fe", system_role: "view" },
  // HIGHLIGHT
  { slug: "nouveau", name: "Nouveau", category: "HIGHLIGHT", icon: "✨", color: "#78350f", bg: "#fef3c7", system_role: "badge" },
  { slug: "signature", name: "Signature", category: "HIGHLIGHT", icon: "👑", color: "#3d5a80", bg: "#e8edf4", system_role: "badge" },
  { slug: "coup-de-coeur", name: "Coup de cœur", category: "HIGHLIGHT", icon: "❤️", color: "#9f1239", bg: "#ffe4e6", system_role: "badge" },
  { slug: "saison", name: "Saison", category: "HIGHLIGHT", icon: "🍂", color: "#92400e", bg: "#fef3c7", system_role: "badge" },
];

// Upsert system tags
const insertTag = db.prepare(`
  INSERT INTO tags (name, slug, category, icon, color, bg, is_system, system_role, note, description)
  VALUES (@name, @slug, @category, @icon, @color, @bg, 1, @system_role, @note, @description)
  ON CONFLICT(slug) DO UPDATE SET
    name=excluded.name, icon=excluded.icon, color=excluded.color, bg=excluded.bg,
    description=excluded.description, note=excluded.note, system_role=excluded.system_role
`);

const seedTags = db.transaction(() => {
  for (const tag of SYSTEM_TAGS) {
    insertTag.run({
      name: tag.name, slug: tag.slug, category: tag.category,
      icon: tag.icon || null, color: tag.color || null, bg: tag.bg || null,
      system_role: tag.system_role || null, note: tag.note || null,
      description: tag.description || null,
    });
  }
});
seedTags();

// ── Seed restaurant de démo ─────────────────────────────────────────────────
const existingResto = db.prepare(`SELECT id FROM restaurants WHERE slug = 'sauf-imprevu'`).get();
if (!existingResto) {
  const r = db.prepare(`INSERT INTO restaurants (name, slug, tagline) VALUES (?, ?, ?)`).run(
    'Sauf Imprévu', 'sauf-imprevu', 'Cuisine de saison · Bordeaux'
  );
  const rid = r.lastInsertRowid;

  // Familles
  const f1 = db.prepare(`INSERT INTO families (name, "order", restaurant_id) VALUES (?, ?, ?)`).run('Cuisine', 0, rid);
  const f2 = db.prepare(`INSERT INTO families (name, "order", restaurant_id) VALUES (?, ?, ?)`).run('Boissons', 1, rid);

  // Catégories
  const c1 = db.prepare(`INSERT INTO categories (name, "order", visible, family_id, restaurant_id) VALUES (?, ?, 1, ?, ?)`).run('Entrées', 0, f1.lastInsertRowid, rid);
  const c2 = db.prepare(`INSERT INTO categories (name, "order", visible, family_id, restaurant_id) VALUES (?, ?, 1, ?, ?)`).run('Plats', 1, f1.lastInsertRowid, rid);
  const c3 = db.prepare(`INSERT INTO categories (name, "order", visible, family_id, restaurant_id) VALUES (?, ?, 1, ?, ?)`).run('Desserts', 2, f1.lastInsertRowid, rid);
  const c4 = db.prepare(`INSERT INTO categories (name, "order", visible, family_id, restaurant_id) VALUES (?, ?, 1, ?, ?)`).run('Vins rouges', 0, f2.lastInsertRowid, rid);
  const c5 = db.prepare(`INSERT INTO categories (name, "order", visible, family_id, restaurant_id) VALUES (?, ?, 1, ?, ?)`).run('Softs', 1, f2.lastInsertRowid, rid);

  // Items de démo
  const demoItems = [
    { catId: c1.lastInsertRowid, name: 'Carpaccio de bœuf', desc: 'Roquette, parmesan 24 mois, huile de truffe', price: 18, tags: ['signature','fait-maison','cru'] },
    { catId: c1.lastInsertRowid, name: 'Velouté de butternut', desc: 'Crème de coco, graines de courge torréfiées', price: 12, tags: ['vegan','fait-maison','saison'] },
    { catId: c1.lastInsertRowid, name: 'Foie gras maison', desc: 'Chutney de figues, brioche toastée', price: 24, tags: ['fait-maison','gluten','oeufs'], available: 0 },
    { catId: c2.lastInsertRowid, name: 'Filet de sole meunière', desc: 'Beurre noisette, câpres, citron confit', price: 32, tags: ['poisson','lait','menu-midi','local'] },
    { catId: c2.lastInsertRowid, name: 'Côte de veau rôtie', desc: 'Jus corsé, gratin dauphinois, haricots verts', price: 38, tags: ['lait','france'] },
    { catId: c2.lastInsertRowid, name: 'Risotto aux cèpes', desc: 'Parmesan AOP, huile de truffe blanche', price: 26, tags: ['vegetarien','aoc','coup-de-coeur','lait'] },
    { catId: c3.lastInsertRowid, name: 'Soufflé Grand Marnier', desc: 'Crème anglaise vanille Bourbon', price: 14, tags: ['fait-maison','oeufs','gluten','lait','sulfites'] },
    { catId: c3.lastInsertRowid, name: 'Cheese-cake yuzu', desc: 'Coulis de fruits de la passion', price: 12, tags: ['nouveau','fait-maison','gluten','oeufs','lait'] },
    { catId: c4.lastInsertRowid, name: 'Chablis Premier Cru', desc: 'Domaine Laroche, 2021', price: 11, tags: ['aoc','france','sulfites','contient-alcool'] },
    { catId: c4.lastInsertRowid, name: 'Côtes du Rhône', desc: 'Château Beauchêne, 2020', price: 8, tags: ['france','sulfites','contient-alcool'] },
    { catId: c5.lastInsertRowid, name: 'Limonade maison', desc: 'Citron, gingembre, menthe fraîche', price: 5, tags: ['fait-maison','vegan','sans-alcool'] },
  ];

  const insertItem = db.prepare(`INSERT INTO items (name, description, price, available, category_id) VALUES (?, ?, ?, ?, ?)`);
  const insertItemTag = db.prepare(`INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (?, ?)`);
  const getTagBySlug = db.prepare(`SELECT id FROM tags WHERE slug = ?`);

  const seedItems = db.transaction(() => {
    for (const item of demoItems) {
      const res = insertItem.run(item.name, item.desc, item.price, item.available ?? 1, item.catId);
      for (const tagSlug of item.tags) {
        const tag = getTagBySlug.get(tagSlug);
        if (tag) insertItemTag.run(res.lastInsertRowid, tag.id);
      }
    }
  });
  seedItems();
  console.log('✓ Données de démo créées');
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES API
// ═══════════════════════════════════════════════════════════════════════════════

// ── Upload image ────────────────────────────────────────────────────────────
app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ erreur: 'Aucun fichier' });
  res.json({ url: '/uploads/' + req.file.filename });
});

// ── Menu public (vue client) ────────────────────────────────────────────────
app.get('/api/menu/:slug', (req, res) => {
  const resto = db.prepare(`SELECT * FROM restaurants WHERE slug = ?`).get(req.params.slug);
  if (!resto) return res.status(404).json({ erreur: 'Restaurant introuvable' });

  const families = db.prepare(`SELECT * FROM families WHERE restaurant_id = ? ORDER BY "order"`).all(resto.id);
  const categories = db.prepare(`
    SELECT * FROM categories WHERE restaurant_id = ? AND visible = 1 ORDER BY "order"
  `).all(resto.id);

  const items = db.prepare(`
    SELECT i.*, GROUP_CONCAT(t.slug) as tag_slugs
    FROM items i
    LEFT JOIN item_tags it ON it.item_id = i.id
    LEFT JOIN tags t ON t.id = it.tag_id
    WHERE i.category_id IN (SELECT id FROM categories WHERE restaurant_id = ? AND visible = 1)
    GROUP BY i.id
    ORDER BY i.name
  `).all(resto.id);

  const tags = db.prepare(`SELECT * FROM tags ORDER BY category, name`).all();

  res.json({ restaurant: resto, families, categories, items, tags });
});

// ── Restaurants ─────────────────────────────────────────────────────────────
app.get('/api/restaurants', (_, res) => {
  res.json(db.prepare(`SELECT * FROM restaurants`).all());
});

// ── Families ────────────────────────────────────────────────────────────────
app.get('/api/families', (req, res) => {
  const rid = req.query.restaurant_id;
  if (!rid) return res.status(400).json({ erreur: 'restaurant_id requis' });
  res.json(db.prepare(`SELECT * FROM families WHERE restaurant_id = ? ORDER BY "order"`).all(rid));
});

app.post('/api/families', (req, res) => {
  const { name, restaurant_id } = req.body;
  if (!name || !restaurant_id) return res.status(400).json({ erreur: 'name et restaurant_id requis' });
  const last = db.prepare(`SELECT MAX("order") as mx FROM families WHERE restaurant_id = ?`).get(restaurant_id);
  const result = db.prepare(`INSERT INTO families (name, "order", restaurant_id) VALUES (?, ?, ?)`).run(name, (last.mx ?? -1) + 1, restaurant_id);
  const family = db.prepare(`SELECT * FROM families WHERE id = ?`).get(result.lastInsertRowid);
  res.status(201).json(family);
});

app.put('/api/families/:id', (req, res) => {
  const { name, image_url } = req.body;
  const fields = [];
  const values = [];
  if (name !== undefined) { fields.push('name = ?'); values.push(name); }
  if (image_url !== undefined) { fields.push('image_url = ?'); values.push(image_url); }
  if (!fields.length) return res.status(400).json({ erreur: 'Rien à modifier' });
  values.push(req.params.id);
  db.prepare(`UPDATE families SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  res.json(db.prepare(`SELECT * FROM families WHERE id = ?`).get(req.params.id));
});

app.delete('/api/families/:id', (req, res) => {
  // Détacher les catégories de cette famille
  db.prepare(`UPDATE categories SET family_id = NULL WHERE family_id = ?`).run(req.params.id);
  const r = db.prepare(`DELETE FROM families WHERE id = ?`).run(req.params.id);
  if (r.changes === 0) return res.status(404).json({ erreur: 'Famille introuvable' });
  res.json({ success: true });
});

app.put('/api/families/reorder', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ erreur: 'ids requis' });
  const stmt = db.prepare(`UPDATE families SET "order" = ? WHERE id = ?`);
  const reorder = db.transaction(() => { ids.forEach((id, i) => stmt.run(i, id)); });
  reorder();
  res.json({ success: true });
});

// ── Categories ──────────────────────────────────────────────────────────────
app.get('/api/categories', (req, res) => {
  const rid = req.query.restaurant_id;
  if (!rid) return res.status(400).json({ erreur: 'restaurant_id requis' });
  const cats = db.prepare(`
    SELECT c.*, f.name as family_name,
      (SELECT COUNT(*) FROM items WHERE category_id = c.id) as item_count
    FROM categories c
    LEFT JOIN families f ON f.id = c.family_id
    WHERE c.restaurant_id = ?
    ORDER BY c."order"
  `).all(rid);
  res.json(cats);
});

app.post('/api/categories', (req, res) => {
  const { name, restaurant_id, family_id, image_url, visible } = req.body;
  if (!name || !restaurant_id) return res.status(400).json({ erreur: 'name et restaurant_id requis' });
  const last = db.prepare(`SELECT MAX("order") as mx FROM categories WHERE restaurant_id = ?`).get(restaurant_id);
  const result = db.prepare(`
    INSERT INTO categories (name, "order", visible, image_url, family_id, restaurant_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(name, (last.mx ?? -1) + 1, visible ?? 1, image_url || null, family_id || null, restaurant_id);
  const cat = db.prepare(`SELECT * FROM categories WHERE id = ?`).get(result.lastInsertRowid);
  res.status(201).json(cat);
});

app.put('/api/categories/:id', (req, res) => {
  const { name, visible, image_url, family_id } = req.body;
  const fields = [];
  const values = [];
  if (name !== undefined) { fields.push('name = ?'); values.push(name); }
  if (visible !== undefined) { fields.push('visible = ?'); values.push(visible ? 1 : 0); }
  if (image_url !== undefined) { fields.push('image_url = ?'); values.push(image_url); }
  if (family_id !== undefined) { fields.push('family_id = ?'); values.push(family_id || null); }
  if (!fields.length) return res.status(400).json({ erreur: 'Rien à modifier' });
  values.push(req.params.id);
  db.prepare(`UPDATE categories SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  res.json(db.prepare(`SELECT * FROM categories WHERE id = ?`).get(req.params.id));
});

app.delete('/api/categories/:id', (req, res) => {
  const r = db.prepare(`DELETE FROM categories WHERE id = ?`).run(req.params.id);
  if (r.changes === 0) return res.status(404).json({ erreur: 'Catégorie introuvable' });
  res.json({ success: true });
});

app.put('/api/categories/reorder', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ erreur: 'ids requis' });
  const stmt = db.prepare(`UPDATE categories SET "order" = ? WHERE id = ?`);
  const reorder = db.transaction(() => { ids.forEach((id, i) => stmt.run(i, id)); });
  reorder();
  res.json({ success: true });
});

// ── Items ───────────────────────────────────────────────────────────────────
app.get('/api/items', (req, res) => {
  const catId = req.query.category_id;
  const rid = req.query.restaurant_id;

  let query = `
    SELECT i.*, c.name as category_name,
      GROUP_CONCAT(t.slug) as tag_slugs
    FROM items i
    LEFT JOIN categories c ON c.id = i.category_id
    LEFT JOIN item_tags it ON it.item_id = i.id
    LEFT JOIN tags t ON t.id = it.tag_id
  `;
  const conditions = [];
  const params = [];

  if (catId) { conditions.push('i.category_id = ?'); params.push(catId); }
  if (rid) { conditions.push('c.restaurant_id = ?'); params.push(rid); }
  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
  query += ' GROUP BY i.id ORDER BY c."order", i.name';

  res.json(db.prepare(query).all(...params));
});

app.post('/api/items', (req, res) => {
  const { name, description, price, category_id, image_url, tag_slugs } = req.body;
  if (!name || price === undefined || !category_id) {
    return res.status(400).json({ erreur: 'name, price et category_id requis' });
  }
  const result = db.prepare(`
    INSERT INTO items (name, description, price, available, image_url, category_id)
    VALUES (?, ?, ?, 1, ?, ?)
  `).run(name, description || null, price, image_url || null, category_id);

  const itemId = result.lastInsertRowid;
  if (tag_slugs && tag_slugs.length) {
    const insertIT = db.prepare(`INSERT OR IGNORE INTO item_tags (item_id, tag_id) SELECT ?, id FROM tags WHERE slug = ?`);
    const addTags = db.transaction(() => { tag_slugs.forEach(s => insertIT.run(itemId, s)); });
    addTags();
  }

  const item = db.prepare(`
    SELECT i.*, GROUP_CONCAT(t.slug) as tag_slugs
    FROM items i LEFT JOIN item_tags it ON it.item_id = i.id LEFT JOIN tags t ON t.id = it.tag_id
    WHERE i.id = ? GROUP BY i.id
  `).get(itemId);
  res.status(201).json(item);
});

app.put('/api/items/:id', (req, res) => {
  const id = req.params.id;
  const { name, description, price, image_url, category_id, available, tag_slugs } = req.body;

  const fields = [];
  const values = [];
  if (name !== undefined) { fields.push('name = ?'); values.push(name); }
  if (description !== undefined) { fields.push('description = ?'); values.push(description); }
  if (price !== undefined) { fields.push('price = ?'); values.push(price); }
  if (image_url !== undefined) { fields.push('image_url = ?'); values.push(image_url); }
  if (category_id !== undefined) { fields.push('category_id = ?'); values.push(category_id); }
  if (available !== undefined) { fields.push('available = ?'); values.push(available ? 1 : 0); }

  if (fields.length) {
    values.push(id);
    db.prepare(`UPDATE items SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  // Replace tags
  if (tag_slugs !== undefined) {
    db.prepare(`DELETE FROM item_tags WHERE item_id = ?`).run(id);
    if (tag_slugs.length) {
      const insertIT = db.prepare(`INSERT OR IGNORE INTO item_tags (item_id, tag_id) SELECT ?, id FROM tags WHERE slug = ?`);
      const addTags = db.transaction(() => { tag_slugs.forEach(s => insertIT.run(id, s)); });
      addTags();
    }
  }

  const item = db.prepare(`
    SELECT i.*, GROUP_CONCAT(t.slug) as tag_slugs
    FROM items i LEFT JOIN item_tags it ON it.item_id = i.id LEFT JOIN tags t ON t.id = it.tag_id
    WHERE i.id = ? GROUP BY i.id
  `).get(id);
  if (!item) return res.status(404).json({ erreur: 'Plat introuvable' });
  res.json(item);
});

app.put('/api/items/:id/toggle', (req, res) => {
  const item = db.prepare(`SELECT available FROM items WHERE id = ?`).get(req.params.id);
  if (!item) return res.status(404).json({ erreur: 'Plat introuvable' });
  db.prepare(`UPDATE items SET available = ? WHERE id = ?`).run(item.available ? 0 : 1, req.params.id);
  res.json(db.prepare(`SELECT * FROM items WHERE id = ?`).get(req.params.id));
});

app.delete('/api/items/:id', (req, res) => {
  const r = db.prepare(`DELETE FROM items WHERE id = ?`).run(req.params.id);
  if (r.changes === 0) return res.status(404).json({ erreur: 'Plat introuvable' });
  res.json({ success: true });
});

// ── Tags ────────────────────────────────────────────────────────────────────
app.get('/api/tags', (req, res) => {
  const cat = req.query.category;
  if (cat) {
    res.json(db.prepare(`SELECT * FROM tags WHERE category = ? ORDER BY name`).all(cat));
  } else {
    res.json(db.prepare(`SELECT * FROM tags ORDER BY category, name`).all());
  }
});

app.post('/api/tags/custom', (req, res) => {
  const { name, slug, icon, color, bg } = req.body;
  if (!name || !slug) return res.status(400).json({ erreur: 'name et slug requis' });
  try {
    const result = db.prepare(`
      INSERT INTO tags (name, slug, category, icon, color, bg, is_system) VALUES (?, ?, 'CUSTOM', ?, ?, ?, 0)
    `).run(name, slug, icon || null, color || null, bg || null);
    res.status(201).json(db.prepare(`SELECT * FROM tags WHERE id = ?`).get(result.lastInsertRowid));
  } catch (e) {
    res.status(409).json({ erreur: 'Tag déjà existant' });
  }
});

// ── SPA fallback ────────────────────────────────────────────────────────────
app.get('/admin', (_, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/menu', (_, res) => res.sendFile(path.join(__dirname, 'public', 'menu.html')));
app.get('/menu/:slug', (_, res) => res.sendFile(path.join(__dirname, 'public', 'menu.html')));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Sauf Imprévu — service carte actif sur le port ${PORT}`));
