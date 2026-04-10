/**
 * Module products — Storage (SQLite standalone)
 * ----------------------------------------------
 * Table pivot universelle : tout EAN scanné y atterrit, qu'il soit vin,
 * spiritueux, bière, eau, soda, alimentaire. Alimente le POS des
 * supérettes et le scan app.
 *
 * Les tables spécialisées `wines` / `spirits` vivent dans d'autres DB ;
 * les liens wine_id / spirit_id sont donc des soft FK (pas de contrainte
 * cross-database en SQLite).
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

let db = null;

function init({ dbDir }) {
  const dbPath = path.join(dbDir || '.', 'products.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);

  console.log(`📦 Module products initialisé : ${dbPath}`);
  return { db };
}

function getDb() {
  if (!db) throw new Error('products storage not initialised — call init() first');
  return db;
}

// ─── Helpers internes ────────────────────────────────────────────────────────

function normalizeEan(ean) {
  return String(ean || '').trim();
}

function nowTs() {
  return Date.now();
}

function toJson(value) {
  if (value == null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function fromJson(value) {
  if (value == null || value === '') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function hydrate(row) {
  if (!row) return null;
  return {
    ...row,
    category_tags: fromJson(row.category_tags),
    labels: fromJson(row.labels),
    off_raw: fromJson(row.off_raw),
  };
}

// ─── Lookup ──────────────────────────────────────────────────────────────────

/**
 * Récupère un produit par EAN. Ne change rien en base.
 * Renvoie la ligne hydratée ou null.
 */
function findByBarcode(ean) {
  const e = normalizeEan(ean);
  if (!e) return null;
  const row = db.prepare(`SELECT * FROM products WHERE ean = ?`).get(e);
  return hydrate(row);
}

function getById(id) {
  const row = db.prepare(`SELECT * FROM products WHERE id = ?`).get(id);
  return hydrate(row);
}

// ─── Upsert depuis OFF ───────────────────────────────────────────────────────

/**
 * Crée ou met à jour un produit à partir d'un mapping générique OFF.
 * @param {object} mapped  Sortie de openfoodfacts.mapToGenericProduct()
 * @param {object} opts    { userSub, offRaw, wineId, spiritId }
 * @returns {object}       Produit hydraté
 */
function upsertFromOff(mapped, opts = {}) {
  if (!mapped || !mapped.ean) throw new Error('upsertFromOff: ean manquant');
  const ean = normalizeEan(mapped.ean);
  const now = nowTs();
  const existing = db.prepare(`SELECT id, scan_count, first_seen_at FROM products WHERE ean = ?`).get(ean);

  const payload = {
    ean,
    name: mapped.name || null,
    name_fr: mapped.name_fr || null,
    brand: mapped.brand || null,
    brand_owner: mapped.brand_owner || null,
    category_main: mapped.category_main || 'other',
    category_tags: toJson(mapped.category_tags || null),
    quantity: mapped.quantity || null,
    volume_ml: mapped.volume_ml != null ? Math.round(mapped.volume_ml) : null,
    weight_g: mapped.weight_g != null ? Math.round(mapped.weight_g) : null,
    abv: mapped.abv != null ? Number(mapped.abv) : null,
    country_origin: mapped.country_origin || null,
    origins: mapped.origins || null,
    labels: toJson(mapped.labels || null),
    image_url: mapped.image_url || null,
    source: mapped.source || 'openfoodfacts',
    off_raw: toJson(opts.offRaw || null),
    wine_id: opts.wineId || null,
    spirit_id: opts.spiritId || null,
  };

  if (existing) {
    // UPDATE : on incrémente scan_count et on rafraîchit les champs non vides.
    // Règle : on n'écrase jamais un champ existant par du vide (on conserve
    // les enrichissements manuels éventuels).
    const keepCoalesce = (col) => `${col} = COALESCE(@${col}, ${col})`;
    const sql = `
      UPDATE products SET
        ${keepCoalesce('name')},
        ${keepCoalesce('name_fr')},
        ${keepCoalesce('brand')},
        ${keepCoalesce('brand_owner')},
        ${keepCoalesce('category_main')},
        ${keepCoalesce('category_tags')},
        ${keepCoalesce('quantity')},
        ${keepCoalesce('volume_ml')},
        ${keepCoalesce('weight_g')},
        ${keepCoalesce('abv')},
        ${keepCoalesce('country_origin')},
        ${keepCoalesce('origins')},
        ${keepCoalesce('labels')},
        ${keepCoalesce('image_url')},
        source = COALESCE(@source, source),
        off_raw = COALESCE(@off_raw, off_raw),
        wine_id = COALESCE(@wine_id, wine_id),
        spirit_id = COALESCE(@spirit_id, spirit_id),
        scan_count = scan_count + 1,
        last_seen_at = @now,
        updated_at = @now
      WHERE ean = @ean
    `;
    db.prepare(sql).run({ ...payload, now });
    return hydrate(db.prepare(`SELECT * FROM products WHERE ean = ?`).get(ean));
  }

  // INSERT
  const sql = `
    INSERT INTO products (
      ean, name, name_fr, brand, brand_owner, category_main, category_tags,
      quantity, volume_ml, weight_g, abv, country_origin, origins, labels,
      image_url, source, off_raw, wine_id, spirit_id,
      scan_count, first_seen_at, last_seen_at, created_by, created_at, updated_at
    ) VALUES (
      @ean, @name, @name_fr, @brand, @brand_owner, @category_main, @category_tags,
      @quantity, @volume_ml, @weight_g, @abv, @country_origin, @origins, @labels,
      @image_url, @source, @off_raw, @wine_id, @spirit_id,
      1, @now, @now, @created_by, @now, @now
    )
  `;
  db.prepare(sql).run({ ...payload, now, created_by: opts.userSub || null });
  return hydrate(db.prepare(`SELECT * FROM products WHERE ean = ?`).get(ean));
}

// ─── Lien a posteriori vers wine / spirit ───────────────────────────────────

function linkToWine(ean, wineId) {
  const e = normalizeEan(ean);
  if (!e || !wineId) return null;
  db.prepare(`UPDATE products SET wine_id = ?, updated_at = ? WHERE ean = ?`)
    .run(wineId, nowTs(), e);
  return findByBarcode(e);
}

function linkToSpirit(ean, spiritId) {
  const e = normalizeEan(ean);
  if (!e || !spiritId) return null;
  db.prepare(`UPDATE products SET spirit_id = ?, updated_at = ? WHERE ean = ?`)
    .run(spiritId, nowTs(), e);
  return findByBarcode(e);
}

// ─── Journal des scans ──────────────────────────────────────────────────────

function logScan({
  productId = null,
  ean,
  source = null,
  userSub = null,
  deviceId = null,
  poiId = null,
  lat = null,
  lon = null,
  locationSource = null,
  locationAccuracyM = null,
  locationAt = null,
}) {
  db.prepare(`
    INSERT INTO product_scans (
      product_id, ean, source, user_sub, device_id, poi_id,
      lat, lon, location_source, location_accuracy_m, location_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    productId, normalizeEan(ean), source, userSub, deviceId, poiId,
    lat, lon, locationSource, locationAccuracyM, locationAt, nowTs()
  );
}

// ─── Recherche ──────────────────────────────────────────────────────────────

function search(query, limit = 20) {
  const q = String(query || '').trim();
  const lim = Math.max(1, Math.min(parseInt(limit, 10) || 20, 100));
  if (!q) {
    // liste récente
    const rows = db.prepare(`
      SELECT * FROM products ORDER BY last_seen_at DESC LIMIT ?
    `).all(lim);
    return rows.map(hydrate);
  }
  // FTS5 avec fallback LIKE si pas de match
  try {
    const fts = db.prepare(`
      SELECT p.* FROM products p
      JOIN products_fts f ON f.rowid = p.id
      WHERE products_fts MATCH ?
      ORDER BY bm25(products_fts) LIMIT ?
    `).all(q + '*', lim);
    if (fts.length) return fts.map(hydrate);
  } catch {
    // FTS indisponible ou requête invalide → fallback
  }
  const like = `%${q}%`;
  const rows = db.prepare(`
    SELECT * FROM products
    WHERE name LIKE ? OR name_fr LIKE ? OR brand LIKE ?
    ORDER BY last_seen_at DESC LIMIT ?
  `).all(like, like, like, lim);
  return rows.map(hydrate);
}

function listByCategory(category, limit = 50) {
  const rows = db.prepare(`
    SELECT * FROM products WHERE category_main = ? ORDER BY last_seen_at DESC LIMIT ?
  `).all(category, Math.max(1, Math.min(parseInt(limit, 10) || 50, 200)));
  return rows.map(hydrate);
}

// ─── Stats ──────────────────────────────────────────────────────────────────

function getStats({ since = null } = {}) {
  const row = db.prepare(`
    SELECT
      COUNT(*) AS total_products,
      SUM(CASE WHEN category_main = 'wine'   THEN 1 ELSE 0 END) AS wines,
      SUM(CASE WHEN category_main = 'spirit' THEN 1 ELSE 0 END) AS spirits,
      SUM(CASE WHEN category_main = 'beer'   THEN 1 ELSE 0 END) AS beers,
      SUM(CASE WHEN category_main = 'soda'   THEN 1 ELSE 0 END) AS sodas,
      SUM(CASE WHEN category_main = 'water'  THEN 1 ELSE 0 END) AS waters,
      SUM(CASE WHEN category_main = 'food'   THEN 1 ELSE 0 END) AS foods,
      SUM(CASE WHEN category_main = 'other'  THEN 1 ELSE 0 END) AS others,
      SUM(scan_count) AS total_scans
    FROM products
  `).get();

  const scanQuery = since
    ? db.prepare(`SELECT COUNT(*) AS c, COUNT(DISTINCT ean) AS unique_eans FROM product_scans WHERE created_at >= ?`).get(since)
    : db.prepare(`SELECT COUNT(*) AS c, COUNT(DISTINCT ean) AS unique_eans FROM product_scans`).get();

  const topRows = db.prepare(`
    SELECT ean, name, brand, category_main, scan_count
    FROM products ORDER BY scan_count DESC LIMIT 10
  `).all();

  return {
    counts: row || {},
    scans: { total: scanQuery?.c || 0, uniqueEans: scanQuery?.unique_eans || 0 },
    top: topRows,
  };
}

function listRecentScans(limit = 20) {
  return db.prepare(`
    SELECT s.*, p.name, p.brand, p.category_main
    FROM product_scans s
    LEFT JOIN products p ON p.id = s.product_id
    ORDER BY s.created_at DESC LIMIT ?
  `).all(Math.max(1, Math.min(parseInt(limit, 10) || 20, 200)));
}

module.exports = {
  init,
  getDb,
  findByBarcode,
  getById,
  upsertFromOff,
  linkToWine,
  linkToSpirit,
  logScan,
  search,
  listByCategory,
  getStats,
  listRecentScans,
};
