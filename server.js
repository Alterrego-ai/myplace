const express = require('express');
const session = require('express-session');
const Database = require('better-sqlite3');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const { authRoutes, requireAuth, injectUser, initOIDC } = require('./auth');
const { chatRoutes } = require('./chat');

// ── Stripe (Carte Cadeau) ──
const stripeEnabled = !!process.env.STRIPE_SECRET_KEY;
const stripe = stripeEnabled ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;
if (stripeEnabled) console.log('✓ Stripe initialisé');
else console.warn('⚠ Stripe désactivé (STRIPE_SECRET_KEY non défini)');

// Git commit hash pour le footer — Railway fournit RAILWAY_GIT_COMMIT_SHA
const pkg = require('./package.json');
let GIT_HASH = process.env.RAILWAY_GIT_COMMIT_SHA
  ? process.env.RAILWAY_GIT_COMMIT_SHA.substring(0, 7)
  : null;
if (!GIT_HASH) {
  try { GIT_HASH = fs.readFileSync(path.join(__dirname, '.commit-hash'), 'utf8').trim(); } catch(e) {}
}
if (!GIT_HASH || GIT_HASH === 'unknown') GIT_HASH = pkg.version;

const app = express();

// CORS — en mode unifié, la plupart des appels sont same-origin
// On garde les origines externes pour d'éventuels clients tiers
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
ALLOWED_ORIGINS.push('http://localhost:3000', 'http://localhost:5000');

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  } else if (!origin) {
    // Same-origin requests (no Origin header)
    res.header('Access-Control-Allow-Origin', '*');
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json());

// Trust Railway proxy for secure cookies
if (process.env.RAILWAY_ENVIRONMENT) {
  app.set('trust proxy', 1);
}

// ── Session store SQLite (persistant entre les redéploiements) ───────────────
const sessionDb = new Database(path.join(__dirname, 'data', 'sessions.db'));
sessionDb.pragma('journal_mode = WAL');
sessionDb.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expired INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_expired ON sessions(expired);
`);

// Nettoyage des sessions expirées toutes les 15 min
setInterval(() => {
  try { sessionDb.prepare('DELETE FROM sessions WHERE expired < ?').run(Date.now()); } catch(e) {}
}, 15 * 60 * 1000);

// Store compatible express-session
class SQLiteStore extends session.Store {
  get(sid, cb) {
    try {
      const row = sessionDb.prepare('SELECT sess FROM sessions WHERE sid = ? AND expired > ?').get(sid, Date.now());
      cb(null, row ? JSON.parse(row.sess) : null);
    } catch(e) { cb(e); }
  }
  set(sid, sess, cb) {
    try {
      const maxAge = (sess.cookie && sess.cookie.maxAge) || 86400000;
      const expired = Date.now() + maxAge;
      sessionDb.prepare('INSERT OR REPLACE INTO sessions (sid, sess, expired) VALUES (?, ?, ?)').run(sid, JSON.stringify(sess), expired);
      if (cb) cb(null);
    } catch(e) { if (cb) cb(e); }
  }
  destroy(sid, cb) {
    try {
      sessionDb.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
      if (cb) cb(null);
    } catch(e) { if (cb) cb(e); }
  }
  touch(sid, sess, cb) {
    this.set(sid, sess, cb);
  }
}

app.use(session({
  store: new SQLiteStore(),
  secret: process.env.OIDC_CLIENT_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_ENVIRONMENT,
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 jours (aligné sur le token)
    sameSite: 'lax',
  },
}));

// ── Auth OIDC mySafe ─────────────────────────────────────────────────────────
app.use(injectUser);
authRoutes(app);

// ── Sign in with Apple ───────────────────────────────────────────────────────
const { appleAuthRoutes } = require('./apple-auth');
appleAuthRoutes(app, sessionDb);
if (process.env.OIDC_CLIENT_ID) {
  initOIDC().then(() => console.log('✓ OIDC mySafe initialisé')).catch(e => console.warn('⚠ OIDC init:', e.message));
} else {
  console.warn('⚠ OIDC désactivé (OIDC_CLIENT_ID non défini)');
}

app.use(express.static(path.join(__dirname, 'public')));

// ── Stripe — Carte Cadeau Payment Intent ────────────────────────────────────
app.get('/api/stripe-config', (req, res) => {
  if (!stripeEnabled) return res.status(503).json({ error: 'Stripe non configuré' });
  res.json({ publishableKey: process.env.STRIPE_PUBLISHABLE_KEY });
});

app.post('/api/create-payment-intent', async (req, res) => {
  if (!stripeEnabled) return res.status(503).json({ error: 'Stripe non configuré' });
  try {
    const { amount, metadata } = req.body;
    const amountCents = Math.round(Number(amount) * 100);
    if (!amountCents || amountCents < 5000 || amountCents > 25000) {
      return res.status(400).json({ error: 'Montant invalide (50-250€)' });
    }
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'eur',
      automatic_payment_methods: { enabled: true },
      metadata: {
        type: 'carte_cadeau',
        recipient: metadata?.recipientName || '',
        sender: metadata?.senderName || '',
        occasion: metadata?.occasion || '',
        delivery: metadata?.delivery || '',
      },
    });
    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error('Stripe error:', err.message);
    res.status(500).json({ error: 'Erreur de paiement' });
  }
});

// ── Upload images ───────────────────────────────────────────────────────────
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadsDir),
  filename: (_, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'))
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// ═══════════════════════════════════════════════════════════════════════════════
// BASE DE DONNÉES — Persistance via volume Railway (/data) ou local
// ═══════════════════════════════════════════════════════════════════════════════
const DB_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.DB_DIR || '.';
if (DB_DIR !== '.') {
  try { fs.mkdirSync(DB_DIR, { recursive: true }); } catch(e) {}
  // Migration : copier les anciennes DBs si elles n'existent pas encore sur le volume
  for (const dbFile of ['carte.db', 'reservations.db']) {
    const volumePath = path.join(DB_DIR, dbFile);
    const localPath = path.join('.', dbFile);
    if (!fs.existsSync(volumePath) && fs.existsSync(localPath)) {
      fs.copyFileSync(localPath, volumePath);
      console.log(`📦 Migration : ${dbFile} copié vers ${DB_DIR}`);
    }
  }
  console.log(`📁 Bases de données dans : ${DB_DIR}`);
} else {
  console.warn(`⚠️  ATTENTION : pas de volume persistant ! RAILWAY_VOLUME_MOUNT_PATH non défini. Les données seront perdues au prochain déploiement.`);
}

const carteDb = new Database(path.join(DB_DIR, 'carte.db'));
carteDb.pragma('journal_mode = WAL');
carteDb.pragma('foreign_keys = ON');

carteDb.exec(`
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
  { slug: "sulfites", name: "Sulfites", category: "ALLERGEN", icon: "⚗️", color: "#4c1d95", bg: "#ede9fe", note: "Non protéique", description: "Anhydride sulfureux et sulfites > 10 mg/kg ou 10 mg/l" },
  { slug: "lupin", name: "Lupin", category: "ALLERGEN", icon: "🌸", color: "#831843", bg: "#fce7f3", description: "Lupin et produits à base de lupin" },
  { slug: "mollusques", name: "Mollusques", category: "ALLERGEN", icon: "🐚", color: "#075985", bg: "#e0f2fe", description: "Mollusques et produits à base de mollusques" },
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
  { slug: "sans-alcool", name: "Sans alcool", category: "BEVERAGE", icon: "🚫", color: "#166534", bg: "#dcfce7" },
  { slug: "contient-alcool", name: "Contient de l'alcool", category: "BEVERAGE", icon: "🍷", color: "#9f1239", bg: "#ffe4e6" },
  { slug: "vin-naturel", name: "Vin naturel", category: "BEVERAGE", icon: "🍇", color: "#7c3aed", bg: "#ede9fe" },
  { slug: "biodynamique", name: "Biodynamique", category: "BEVERAGE", icon: "🌙", color: "#4c1d95", bg: "#ede9fe" },
  { slug: "petillant", name: "Pétillant", category: "BEVERAGE", icon: "🫧", color: "#0369a1", bg: "#e0f2fe" },
  { slug: "sans-sucre-ajoute", name: "Sans sucre ajouté", category: "BEVERAGE", icon: "🍬", color: "#166534", bg: "#dcfce7" },
  { slug: "pression", name: "Pression", category: "BEVERAGE", icon: "🍺", color: "#78350f", bg: "#fef3c7" },
  { slug: "halal", name: "Halal", category: "CERTIFICATION", icon: "☪️", color: "#166534", bg: "#dcfce7", note: "Certification requise" },
  { slug: "casher", name: "Casher", category: "CERTIFICATION", icon: "✡️", color: "#1e40af", bg: "#dbeafe", note: "Certification requise" },
  { slug: "local", name: "Local", category: "ORIGIN", icon: "📍", color: "#14532d", bg: "#dcfce7" },
  { slug: "france", name: "France", category: "ORIGIN", icon: "🇫🇷", color: "#1e40af", bg: "#dbeafe" },
  { slug: "aoc", name: "AOC", category: "ORIGIN", icon: "🏷️", color: "#4c1d95", bg: "#ede9fe" },
  { slug: "aop", name: "AOP", category: "ORIGIN", icon: "🏷️", color: "#4c1d95", bg: "#ede9fe" },
  { slug: "igp", name: "IGP", category: "ORIGIN", icon: "🏷️", color: "#3d5a80", bg: "#e8edf4" },
  { slug: "circuit-court", name: "Circuit court", category: "ORIGIN", icon: "🌿", color: "#14532d", bg: "#dcfce7" },
  { slug: "menu-midi", name: "Menu midi", category: "OFFER", icon: "☀️", color: "#78350f", bg: "#fef3c7", system_role: "view" },
  { slug: "happy-hour", name: "Happy Hour", category: "OFFER", icon: "🍹", color: "#9f1239", bg: "#ffe4e6", system_role: "schedule" },
  { slug: "suggestion", name: "Suggestion", category: "OFFER", icon: "⭐", color: "#1e40af", bg: "#dbeafe", system_role: "view" },
  { slug: "menu-soir", name: "Menu du soir", category: "OFFER", icon: "🌙", color: "#4c1d95", bg: "#ede9fe", system_role: "view" },
  { slug: "nouveau", name: "Nouveau", category: "HIGHLIGHT", icon: "✨", color: "#78350f", bg: "#fef3c7", system_role: "badge" },
  { slug: "signature", name: "Signature", category: "HIGHLIGHT", icon: "👑", color: "#3d5a80", bg: "#e8edf4", system_role: "badge" },
  { slug: "coup-de-coeur", name: "Coup de cœur", category: "HIGHLIGHT", icon: "❤️", color: "#9f1239", bg: "#ffe4e6", system_role: "badge" },
  { slug: "saison", name: "Saison", category: "HIGHLIGHT", icon: "🍂", color: "#92400e", bg: "#fef3c7", system_role: "badge" },
];

const insertTag = carteDb.prepare(`
  INSERT INTO tags (name, slug, category, icon, color, bg, is_system, system_role, note, description)
  VALUES (@name, @slug, @category, @icon, @color, @bg, 1, @system_role, @note, @description)
  ON CONFLICT(slug) DO UPDATE SET
    name=excluded.name, icon=excluded.icon, color=excluded.color, bg=excluded.bg,
    description=excluded.description, note=excluded.note, system_role=excluded.system_role
`);

const seedTags = carteDb.transaction(() => {
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
const existingResto = carteDb.prepare(`SELECT id FROM restaurants WHERE slug = 'sauf-imprevu'`).get();
if (!existingResto) {
  const r = carteDb.prepare(`INSERT INTO restaurants (name, slug, tagline) VALUES (?, ?, ?)`).run(
    'Sauf Imprévu', 'sauf-imprevu', 'Cuisine de saison · Bordeaux'
  );
  const rid = r.lastInsertRowid;
  const f1 = carteDb.prepare(`INSERT INTO families (name, "order", restaurant_id) VALUES (?, ?, ?)`).run('Cuisine', 0, rid);
  const f2 = carteDb.prepare(`INSERT INTO families (name, "order", restaurant_id) VALUES (?, ?, ?)`).run('Boissons', 1, rid);
  const c1 = carteDb.prepare(`INSERT INTO categories (name, "order", visible, family_id, restaurant_id) VALUES (?, ?, 1, ?, ?)`).run('Entrées', 0, f1.lastInsertRowid, rid);
  const c2 = carteDb.prepare(`INSERT INTO categories (name, "order", visible, family_id, restaurant_id) VALUES (?, ?, 1, ?, ?)`).run('Plats', 1, f1.lastInsertRowid, rid);
  const c3 = carteDb.prepare(`INSERT INTO categories (name, "order", visible, family_id, restaurant_id) VALUES (?, ?, 1, ?, ?)`).run('Desserts', 2, f1.lastInsertRowid, rid);
  const c4 = carteDb.prepare(`INSERT INTO categories (name, "order", visible, family_id, restaurant_id) VALUES (?, ?, 1, ?, ?)`).run('Vins rouges', 0, f2.lastInsertRowid, rid);
  const c5 = carteDb.prepare(`INSERT INTO categories (name, "order", visible, family_id, restaurant_id) VALUES (?, ?, 1, ?, ?)`).run('Softs', 1, f2.lastInsertRowid, rid);

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

  const insertItem = carteDb.prepare(`INSERT INTO items (name, description, price, available, category_id) VALUES (?, ?, ?, ?, ?)`);
  const insertItemTag = carteDb.prepare(`INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (?, ?)`);
  const getTagBySlug = carteDb.prepare(`SELECT id FROM tags WHERE slug = ?`);

  const seedItems = carteDb.transaction(() => {
    for (const item of demoItems) {
      const res = insertItem.run(item.name, item.desc, item.price, item.available ?? 1, item.catId);
      for (const tagSlug of item.tags) {
        const tag = getTagBySlug.get(tagSlug);
        if (tag) insertItemTag.run(res.lastInsertRowid, tag.id);
      }
    }
  });
  seedItems();
  console.log('✓ Données de démo Carte créées');
}

// ═══════════════════════════════════════════════════════════════════════════════
// BASE DE DONNÉES — RÉSERVATIONS
// ═══════════════════════════════════════════════════════════════════════════════
const resaDb = new Database(path.join(DB_DIR, 'reservations.db'));

resaDb.exec(`
  CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL,
    telephone TEXT,
    date TEXT NOT NULL,
    heure TEXT NOT NULL,
    couverts INTEGER NOT NULL,
    notes TEXT,
    service TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

// ── Seed données réelles (carte uniquement — ne touche JAMAIS aux réservations)
try {
  const { seedRealData } = require('./seed-data');
  seedRealData(carteDb);
} catch (e) {
  console.log('⚠ Seed données réelles:', e.message);
}

try { resaDb.exec('ALTER TABLE reservations ADD COLUMN service TEXT'); } catch(e) {}
try { resaDb.exec("ALTER TABLE reservations ADD COLUMN source TEXT DEFAULT 'backoffice'"); } catch(e) {}
try { resaDb.exec("ALTER TABLE reservations ADD COLUMN statut TEXT DEFAULT 'confirmee'"); } catch(e) {}

// ── Chat IA (assistant via Anthropic Claude) ────────────────────────────────
if (process.env.ANTHROPIC_API_KEY) {
  chatRoutes(app, carteDb, resaDb);
  console.log('✓ Chat IA activé (Claude Sonnet) — réservations connectées');
} else {
  console.warn('⚠ Chat IA désactivé (ANTHROPIC_API_KEY non définie)');
}

const CAPACITE_TOTALE = 42;

function getService(heure) {
  const h = parseInt(heure.replace('h', ':').split(':')[0]);
  if (h >= 12 && h < 16) return 'midi';
  if (h >= 17) return 'soir';
  return null;
}

function getTotalService(date, service) {
  const row = resaDb.prepare(`
    SELECT COALESCE(SUM(couverts), 0) as total
    FROM reservations WHERE date = ? AND service = ?
  `).get(date, service);
  return row.total;
}

// Migration : recalcule le service pour les reservations existantes
const orphans = resaDb.prepare(`SELECT id, heure FROM reservations WHERE service IS NULL`).all();
for (const r of orphans) {
  const service = getService(r.heure);
  if (service) resaDb.prepare(`UPDATE reservations SET service = ? WHERE id = ?`).run(service, r.id);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES API — CARTE
// ═══════════════════════════════════════════════════════════════════════════════

app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ erreur: 'Aucun fichier' });
  res.json({ url: '/uploads/' + req.file.filename });
});

app.get('/api/menu/:slug', (req, res) => {
  const resto = carteDb.prepare(`SELECT * FROM restaurants WHERE slug = ?`).get(req.params.slug);
  if (!resto) return res.status(404).json({ erreur: 'Restaurant introuvable' });
  const families = carteDb.prepare(`SELECT * FROM families WHERE restaurant_id = ? ORDER BY "order"`).all(resto.id);
  const categories = carteDb.prepare(`SELECT * FROM categories WHERE restaurant_id = ? AND visible = 1 ORDER BY "order"`).all(resto.id);
  const items = carteDb.prepare(`
    SELECT i.*, GROUP_CONCAT(t.slug) as tag_slugs
    FROM items i LEFT JOIN item_tags it ON it.item_id = i.id LEFT JOIN tags t ON t.id = it.tag_id
    WHERE i.category_id IN (SELECT id FROM categories WHERE restaurant_id = ? AND visible = 1)
    GROUP BY i.id ORDER BY i.name
  `).all(resto.id);
  const tags = carteDb.prepare(`SELECT * FROM tags ORDER BY category, name`).all();
  res.json({ restaurant: resto, families, categories, items, tags });
});

app.get('/api/restaurants', (_, res) => {
  res.json(carteDb.prepare(`SELECT * FROM restaurants`).all());
});

app.get('/api/families', (req, res) => {
  const rid = req.query.restaurant_id;
  if (!rid) return res.status(400).json({ erreur: 'restaurant_id requis' });
  res.json(carteDb.prepare(`SELECT * FROM families WHERE restaurant_id = ? ORDER BY "order"`).all(rid));
});

app.post('/api/families', (req, res) => {
  const { name, restaurant_id } = req.body;
  if (!name || !restaurant_id) return res.status(400).json({ erreur: 'name et restaurant_id requis' });
  const last = carteDb.prepare(`SELECT MAX("order") as mx FROM families WHERE restaurant_id = ?`).get(restaurant_id);
  const result = carteDb.prepare(`INSERT INTO families (name, "order", restaurant_id) VALUES (?, ?, ?)`).run(name, (last.mx ?? -1) + 1, restaurant_id);
  res.status(201).json(carteDb.prepare(`SELECT * FROM families WHERE id = ?`).get(result.lastInsertRowid));
});

app.put('/api/families/:id', (req, res) => {
  const { name, image_url } = req.body;
  const fields = [], values = [];
  if (name !== undefined) { fields.push('name = ?'); values.push(name); }
  if (image_url !== undefined) { fields.push('image_url = ?'); values.push(image_url); }
  if (!fields.length) return res.status(400).json({ erreur: 'Rien à modifier' });
  values.push(req.params.id);
  carteDb.prepare(`UPDATE families SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  res.json(carteDb.prepare(`SELECT * FROM families WHERE id = ?`).get(req.params.id));
});

app.delete('/api/families/:id', (req, res) => {
  carteDb.prepare(`UPDATE categories SET family_id = NULL WHERE family_id = ?`).run(req.params.id);
  const r = carteDb.prepare(`DELETE FROM families WHERE id = ?`).run(req.params.id);
  if (r.changes === 0) return res.status(404).json({ erreur: 'Famille introuvable' });
  res.json({ success: true });
});

app.put('/api/families/reorder', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ erreur: 'ids requis' });
  const stmt = carteDb.prepare(`UPDATE families SET "order" = ? WHERE id = ?`);
  carteDb.transaction(() => { ids.forEach((id, i) => stmt.run(i, id)); })();
  res.json({ success: true });
});

app.get('/api/categories', (req, res) => {
  const rid = req.query.restaurant_id;
  if (!rid) return res.status(400).json({ erreur: 'restaurant_id requis' });
  res.json(carteDb.prepare(`
    SELECT c.*, f.name as family_name,
      (SELECT COUNT(*) FROM items WHERE category_id = c.id) as item_count
    FROM categories c LEFT JOIN families f ON f.id = c.family_id
    WHERE c.restaurant_id = ? ORDER BY c."order"
  `).all(rid));
});

app.post('/api/categories', (req, res) => {
  const { name, restaurant_id, family_id, image_url, visible } = req.body;
  if (!name || !restaurant_id) return res.status(400).json({ erreur: 'name et restaurant_id requis' });
  const last = carteDb.prepare(`SELECT MAX("order") as mx FROM categories WHERE restaurant_id = ?`).get(restaurant_id);
  const result = carteDb.prepare(`
    INSERT INTO categories (name, "order", visible, image_url, family_id, restaurant_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(name, (last.mx ?? -1) + 1, visible ?? 1, image_url || null, family_id || null, restaurant_id);
  res.status(201).json(carteDb.prepare(`SELECT * FROM categories WHERE id = ?`).get(result.lastInsertRowid));
});

app.put('/api/categories/:id', (req, res) => {
  const { name, visible, image_url, family_id } = req.body;
  const fields = [], values = [];
  if (name !== undefined) { fields.push('name = ?'); values.push(name); }
  if (visible !== undefined) { fields.push('visible = ?'); values.push(visible ? 1 : 0); }
  if (image_url !== undefined) { fields.push('image_url = ?'); values.push(image_url); }
  if (family_id !== undefined) { fields.push('family_id = ?'); values.push(family_id || null); }
  if (!fields.length) return res.status(400).json({ erreur: 'Rien à modifier' });
  values.push(req.params.id);
  carteDb.prepare(`UPDATE categories SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  res.json(carteDb.prepare(`SELECT * FROM categories WHERE id = ?`).get(req.params.id));
});

app.delete('/api/categories/:id', (req, res) => {
  const r = carteDb.prepare(`DELETE FROM categories WHERE id = ?`).run(req.params.id);
  if (r.changes === 0) return res.status(404).json({ erreur: 'Catégorie introuvable' });
  res.json({ success: true });
});

app.put('/api/categories/reorder', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ erreur: 'ids requis' });
  const stmt = carteDb.prepare(`UPDATE categories SET "order" = ? WHERE id = ?`);
  carteDb.transaction(() => { ids.forEach((id, i) => stmt.run(i, id)); })();
  res.json({ success: true });
});

app.get('/api/items', (req, res) => {
  const catId = req.query.category_id;
  const rid = req.query.restaurant_id;
  let query = `
    SELECT i.*, c.name as category_name, GROUP_CONCAT(t.slug) as tag_slugs
    FROM items i LEFT JOIN categories c ON c.id = i.category_id
    LEFT JOIN item_tags it ON it.item_id = i.id LEFT JOIN tags t ON t.id = it.tag_id
  `;
  const conditions = [], params = [];
  if (catId) { conditions.push('i.category_id = ?'); params.push(catId); }
  if (rid) { conditions.push('c.restaurant_id = ?'); params.push(rid); }
  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
  query += ' GROUP BY i.id ORDER BY c."order", i.name';
  res.json(carteDb.prepare(query).all(...params));
});

app.post('/api/items', (req, res) => {
  const { name, description, price, category_id, image_url, tag_slugs } = req.body;
  if (!name || price === undefined || !category_id) return res.status(400).json({ erreur: 'name, price et category_id requis' });
  const result = carteDb.prepare(`INSERT INTO items (name, description, price, available, image_url, category_id) VALUES (?, ?, ?, 1, ?, ?)`).run(name, description || null, price, image_url || null, category_id);
  const itemId = result.lastInsertRowid;
  if (tag_slugs && tag_slugs.length) {
    const insertIT = carteDb.prepare(`INSERT OR IGNORE INTO item_tags (item_id, tag_id) SELECT ?, id FROM tags WHERE slug = ?`);
    carteDb.transaction(() => { tag_slugs.forEach(s => insertIT.run(itemId, s)); })();
  }
  const item = carteDb.prepare(`
    SELECT i.*, GROUP_CONCAT(t.slug) as tag_slugs
    FROM items i LEFT JOIN item_tags it ON it.item_id = i.id LEFT JOIN tags t ON t.id = it.tag_id
    WHERE i.id = ? GROUP BY i.id
  `).get(itemId);
  res.status(201).json(item);
});

app.put('/api/items/:id', (req, res) => {
  const id = req.params.id;
  const { name, description, price, image_url, category_id, available, tag_slugs } = req.body;
  const fields = [], values = [];
  if (name !== undefined) { fields.push('name = ?'); values.push(name); }
  if (description !== undefined) { fields.push('description = ?'); values.push(description); }
  if (price !== undefined) { fields.push('price = ?'); values.push(price); }
  if (image_url !== undefined) { fields.push('image_url = ?'); values.push(image_url); }
  if (category_id !== undefined) { fields.push('category_id = ?'); values.push(category_id); }
  if (available !== undefined) { fields.push('available = ?'); values.push(available ? 1 : 0); }
  if (fields.length) { values.push(id); carteDb.prepare(`UPDATE items SET ${fields.join(', ')} WHERE id = ?`).run(...values); }
  if (tag_slugs !== undefined) {
    carteDb.prepare(`DELETE FROM item_tags WHERE item_id = ?`).run(id);
    if (tag_slugs.length) {
      const insertIT = carteDb.prepare(`INSERT OR IGNORE INTO item_tags (item_id, tag_id) SELECT ?, id FROM tags WHERE slug = ?`);
      carteDb.transaction(() => { tag_slugs.forEach(s => insertIT.run(id, s)); })();
    }
  }
  const item = carteDb.prepare(`
    SELECT i.*, GROUP_CONCAT(t.slug) as tag_slugs
    FROM items i LEFT JOIN item_tags it ON it.item_id = i.id LEFT JOIN tags t ON t.id = it.tag_id
    WHERE i.id = ? GROUP BY i.id
  `).get(id);
  if (!item) return res.status(404).json({ erreur: 'Plat introuvable' });
  res.json(item);
});

app.put('/api/items/:id/toggle', (req, res) => {
  const item = carteDb.prepare(`SELECT available FROM items WHERE id = ?`).get(req.params.id);
  if (!item) return res.status(404).json({ erreur: 'Plat introuvable' });
  carteDb.prepare(`UPDATE items SET available = ? WHERE id = ?`).run(item.available ? 0 : 1, req.params.id);
  res.json(carteDb.prepare(`SELECT * FROM items WHERE id = ?`).get(req.params.id));
});

app.delete('/api/items/:id', (req, res) => {
  const r = carteDb.prepare(`DELETE FROM items WHERE id = ?`).run(req.params.id);
  if (r.changes === 0) return res.status(404).json({ erreur: 'Plat introuvable' });
  res.json({ success: true });
});

app.get('/api/tags', (req, res) => {
  const cat = req.query.category;
  if (cat) res.json(carteDb.prepare(`SELECT * FROM tags WHERE category = ? ORDER BY name`).all(cat));
  else res.json(carteDb.prepare(`SELECT * FROM tags ORDER BY category, name`).all());
});

app.post('/api/tags/custom', (req, res) => {
  const { name, slug, icon, color, bg } = req.body;
  if (!name || !slug) return res.status(400).json({ erreur: 'name et slug requis' });
  try {
    const result = carteDb.prepare(`INSERT INTO tags (name, slug, category, icon, color, bg, is_system) VALUES (?, ?, 'CUSTOM', ?, ?, ?, 0)`).run(name, slug, icon || null, color || null, bg || null);
    res.status(201).json(carteDb.prepare(`SELECT * FROM tags WHERE id = ?`).get(result.lastInsertRowid));
  } catch (e) { res.status(409).json({ erreur: 'Tag déjà existant' }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES API — RÉSERVATIONS
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/disponibilites', (req, res) => {
  const { date, heure, couverts } = req.query;
  if (!date || !heure || !couverts) return res.status(400).json({ erreur: 'Parametres manquants : date, heure, couverts' });
  const demande = parseInt(couverts);
  if (demande >= 10) return res.json({ disponible: false, message: "Les groupes de 10 personnes et plus necessitent une privatisation. Merci de nous contacter directement." });
  const service = getService(heure);
  if (!service) return res.json({ disponible: false, message: "Cet horaire ne correspond pas a un service. Le midi nous accueillons de 12h a 14h, le soir de 17h a minuit." });
  const total = getTotalService(date, service);
  const couverts_restants = CAPACITE_TOTALE - total;
  if (couverts_restants >= demande) {
    return res.json({ disponible: true, couverts_restants, service, message: `Oui, nous avons de la place pour ${demande} personne(s) le ${date} a ${heure} (service du ${service}).` });
  } else {
    return res.json({ disponible: false, couverts_restants, service, message: `Desole, le service du ${service} est complet ce jour-la. Il ne reste que ${couverts_restants} place(s).` });
  }
});

function createReservation(req, res, defaultSource) {
  const { nom, telephone, date, heure, couverts, notes, source } = req.body;
  console.log(`📥 POST /reservations — nom=${nom}, date=${date}, heure=${heure}, couverts=${couverts}, source=${source || defaultSource}`);
  if (!nom || !date || !heure || !couverts) {
    console.log('❌ Champs manquants');
    return res.status(400).json({ erreur: 'Champs manquants : nom, date, heure, couverts' });
  }
  const service = getService(heure);
  if (!service) {
    console.log(`❌ Horaire hors service: ${heure}`);
    return res.status(400).json({ erreur: 'Horaire hors service.' });
  }
  const demande = parseInt(couverts);
  const total = getTotalService(date, service);
  const couverts_restants = CAPACITE_TOTALE - total;
  if (demande > couverts_restants) {
    console.log(`❌ Capacité dépassée: demande=${demande}, restants=${couverts_restants}`);
    return res.status(409).json({ erreur: `Plus assez de places pour le service du ${service}. Il reste ${couverts_restants} place(s).`, couverts_restants });
  }
  const src = source || defaultSource;
  const statut = 'confirmee';
  const result = resaDb.prepare(`INSERT INTO reservations (nom, telephone, date, heure, couverts, notes, service, source, statut) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(nom, telephone || null, date, heure, demande, notes || null, service, src, statut);
  console.log(`✅ Résa #${result.lastInsertRowid} créée (${src}, ${service})`);
  res.status(201).json({ id: result.lastInsertRowid, service, message: `Reservation confirmee pour ${nom}, le ${date} a ${heure} pour ${couverts} personne(s).` });
}

// ── Admin middleware ─────────────────────────────────────────────────────────
// Liste des emails/domaines autorisés (séparés par des virgules)
// Supporte les emails exacts (rriquoir@me.com) et les domaines (@sauf-imprevu.fr)
const ADMIN_RULES = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
console.log('🔑 ADMIN_RULES:', ADMIN_RULES);

function isAdminEmail(email) {
  if (!email || ADMIN_RULES.length === 0) return ADMIN_RULES.length === 0;
  const lower = email.toLowerCase();
  return ADMIN_RULES.some(rule =>
    rule.startsWith('@') ? lower.endsWith(rule) : lower === rule
  );
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ erreur: 'Non connecté' });
  }
  if (!isAdminEmail(req.session.user.email)) {
    return res.status(403).json({ erreur: 'Accès réservé aux administrateurs' });
  }
  next();
}

app.post('/reservations', requireAdmin, (req, res) => createReservation(req, res, 'backoffice'));
app.post('/reservations/phone', requireAdmin, (req, res) => createReservation(req, res, 'phone'));

// Public reservation API (from app agenda)
app.post('/api/reservations', (req, res) => createReservation(req, res, 'app'));

app.get('/reservations', requireAdmin, (req, res) => {
  const { date } = req.query;
  if (date) res.json(resaDb.prepare(`SELECT * FROM reservations WHERE date = ? ORDER BY heure`).all(date));
  else res.json(resaDb.prepare(`SELECT * FROM reservations ORDER BY date, heure`).all());
});

app.put('/reservations/:id', requireAdmin, (req, res) => {
  const { nom, telephone, date, heure, couverts, notes } = req.body;
  if (!nom || !date || !heure || !couverts) return res.status(400).json({ erreur: 'Champs manquants' });
  const service = getService(heure);
  if (!service) return res.status(400).json({ erreur: 'Horaire hors service.' });
  const result = resaDb.prepare(`UPDATE reservations SET nom=?, telephone=?, date=?, heure=?, couverts=?, notes=?, service=? WHERE id=?`).run(nom, telephone || null, date, heure, parseInt(couverts), notes || null, service, req.params.id);
  if (result.changes === 0) return res.status(404).json({ erreur: 'Reservation introuvable.' });
  res.json({ message: 'Reservation modifiee.' });
});

app.delete('/reservations/:id', requireAdmin, (req, res) => {
  const result = resaDb.prepare(`DELETE FROM reservations WHERE id = ?`).run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ erreur: 'Reservation introuvable.' });
  res.json({ message: 'Reservation annulee.' });
});

// ═══════════════════════════════════════════════════════════════════════════════
// VERSION & SPA ROUTES
// ═══════════════════════════════════════════════════════════════════════════════
app.get('/api/version', (_, res) => res.json({ hash: GIT_HASH }));

// Vérifie si l'utilisateur connecté est admin (session OU token Bearer)
app.get('/api/me', (req, res) => {
  // Essayer d'abord la session cookie
  if (req.session && req.session.user) {
    const email = req.session.user.email || req.session.user.name;
    return res.json({
      authenticated: true,
      isAdmin: isAdminEmail(email),
      name: req.session.user.name,
      email: email,
    });
  }
  // Sinon essayer le token Bearer (même auth que le chat)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const { verifyUserToken } = require('./auth');
    const user = verifyUserToken(authHeader.substring(7));
    if (user) {
      const email = user.email || user.name; // fallback: certains OIDC mettent l'email dans name
      return res.json({
        authenticated: true,
        isAdmin: isAdminEmail(email),
        name: user.name,
        email: email,
      });
    }
  }
  res.json({ authenticated: false, isAdmin: false });
});

app.get('/admin', requireAuth, (req, res) => {
  if (!isAdminEmail(req.session.user?.email)) {
    return res.status(403).send('Accès réservé aux administrateurs.');
  }
  res.sendFile(path.join(__dirname, 'public', 'backoffice', 'index.html'));
});
app.get('/menu', (_, res) => res.sendFile(path.join(__dirname, 'public', 'menu.html')));
app.get('/menu/:slug', (_, res) => res.sendFile(path.join(__dirname, 'public', 'menu.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`myPlace — serveur unifié actif sur le port ${PORT}`));
