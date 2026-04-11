/**
 * Module wines — Storage (SQLite + photos filesystem)
 * ---------------------------------------------------
 * Dossier autonome : le jour où on déplace ce module vers Sauf Imprévu,
 * il suffit de copier `modules/wines/` et d'adapter les 2-3 chemins ici.
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

let db = null;
let photosDir = null;

function init({ dbDir, publicDir }) {
  // DB vins séparée pour un split facile plus tard
  const dbPath = path.join(dbDir || '.', 'wines.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);

  // ─── Migrations incrémentales (idempotentes) ──────────────────────────────
  // Ajout de producer_id sur wines si absent
  const wineCols = db.prepare(`PRAGMA table_info(wines)`).all().map((c) => c.name);
  if (!wineCols.includes('producer_id')) {
    db.exec(`ALTER TABLE wines ADD COLUMN producer_id INTEGER REFERENCES producers(id) ON DELETE SET NULL`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_wines_producer_id ON wines(producer_id)`);
    console.log('🔧 migration wines: producer_id ajouté');
  }

  // Ajout des colonnes token/cost sur wine_scans si absentes
  const scanCols = db.prepare(`PRAGMA table_info(wine_scans)`).all().map((c) => c.name);
  const scanMigrations = [
    ['model',              `ALTER TABLE wine_scans ADD COLUMN model TEXT`],
    ['input_tokens',       `ALTER TABLE wine_scans ADD COLUMN input_tokens INTEGER`],
    ['output_tokens',      `ALTER TABLE wine_scans ADD COLUMN output_tokens INTEGER`],
    ['cost_usd',           `ALTER TABLE wine_scans ADD COLUMN cost_usd REAL`],
    // Géolocalisation
    ['lat',                `ALTER TABLE wine_scans ADD COLUMN lat REAL`],
    ['lon',                `ALTER TABLE wine_scans ADD COLUMN lon REAL`],
    ['location_source',    `ALTER TABLE wine_scans ADD COLUMN location_source TEXT`],     // 'gps' | 'exif' | null
    ['location_accuracy_m',`ALTER TABLE wine_scans ADD COLUMN location_accuracy_m REAL`],
    ['location_at',        `ALTER TABLE wine_scans ADD COLUMN location_at INTEGER`],       // timestamp de la capture
    ['place_name',         `ALTER TABLE wine_scans ADD COLUMN place_name TEXT`],           // reverse geocode
    ['place_type',         `ALTER TABLE wine_scans ADD COLUMN place_type TEXT`],           // 'vigneron'|'commerce'|'restaurant'|'particulier'|'inconnu'
    ['matched_producer_id',`ALTER TABLE wine_scans ADD COLUMN matched_producer_id INTEGER REFERENCES producers(id) ON DELETE SET NULL`],
  ];
  for (const [col, sql] of scanMigrations) {
    if (!scanCols.includes(col)) {
      db.exec(sql);
      console.log(`🔧 migration wine_scans: ${col} ajouté`);
    }
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_wine_scans_created ON wine_scans(created_at)`);

  // Dossier photos sous /public/uploads/wines/ (servi par express.static)
  photosDir = path.join(publicDir, 'uploads', 'wines');
  if (!fs.existsSync(photosDir)) fs.mkdirSync(photosDir, { recursive: true });

  console.log(`🍷 Module wines initialisé : ${dbPath}`);
  return { db, photosDir };
}

function getDb() {
  if (!db) throw new Error('wines storage not initialised — call init() first');
  return db;
}

function getPhotosDir() {
  if (!photosDir) throw new Error('wines photosDir not initialised');
  return photosDir;
}

// ─── Photos ──────────────────────────────────────────────────────────────────

function savePhoto({ filename, uploadedBy }) {
  const now = Date.now();
  // Chemin relatif (tel qu'il sera servi publiquement)
  const relPath = `/uploads/wines/${filename}`;
  const stmt = getDb().prepare(`
    INSERT INTO wine_photos (path, uploaded_by, uploaded_at)
    VALUES (?, ?, ?)
  `);
  const result = stmt.run(relPath, uploadedBy || null, now);
  return { id: result.lastInsertRowid, path: relPath, uploaded_at: now };
}

function linkPhotoToWine(photoId, wineId, isPrimary = 0) {
  getDb()
    .prepare(`UPDATE wine_photos SET wine_id = ?, is_primary = ? WHERE id = ?`)
    .run(wineId, isPrimary ? 1 : 0, photoId);
}

// ─── Wines ───────────────────────────────────────────────────────────────────

function insertWine(data, createdBy = null) {
  const now = Date.now();
  const stmt = getDb().prepare(`
    INSERT INTO wines (
      name, producer, producer_id, appellation, region, country, vintage, type, color,
      grapes, alcohol, volume_ml, tasting_notes, food_pairings,
      aging_potential, service_temp, avg_price_eur, confidence, source,
      created_by, created_at, updated_at
    ) VALUES (
      @name, @producer, @producer_id, @appellation, @region, @country, @vintage, @type, @color,
      @grapes, @alcohol, @volume_ml, @tasting_notes, @food_pairings,
      @aging_potential, @service_temp, @avg_price_eur, @confidence, @source,
      @created_by, @created_at, @updated_at
    )
  `);
  const payload = {
    name: data.name || 'Vin inconnu',
    producer: data.producer || null,
    producer_id: data.producer_id || null,
    appellation: data.appellation || null,
    region: data.region || null,
    country: data.country || null,
    vintage: data.vintage || null,
    type: data.type || null,
    color: data.color || null,
    grapes: Array.isArray(data.grapes) ? JSON.stringify(data.grapes) : (data.grapes || null),
    alcohol: data.alcohol || null,
    volume_ml: data.volume_ml || null,
    tasting_notes: data.tasting_notes || null,
    food_pairings: Array.isArray(data.food_pairings) ? JSON.stringify(data.food_pairings) : (data.food_pairings || null),
    aging_potential: data.aging_potential || null,
    service_temp: data.service_temp || null,
    avg_price_eur: data.avg_price_eur || null,
    confidence: data.confidence ?? null,
    source: data.source || 'scan',
    created_by: createdBy,
    created_at: now,
    updated_at: now,
  };
  const result = stmt.run(payload);
  return { id: result.lastInsertRowid, ...payload };
}

/**
 * Cherche un vin par identité approximative (name + producer + vintage).
 * Utilisé pour déduper la base de connaissance lors d'un auto-insert scan.
 * Retourne le premier match (hydraté) ou null.
 */
function findWineByIdentity({ name, producer, vintage }) {
  if (!name) return null;
  const db = getDb();
  const normName = String(name).trim().toLowerCase();
  // On accepte les matches même sans producer/vintage pour éviter les doublons
  // sur des cuvées où Claude ne détecte pas toujours tous les champs.
  let row;
  if (producer && vintage) {
    row = db
      .prepare(
        `SELECT * FROM wines
         WHERE lower(name) = ? AND lower(COALESCE(producer, '')) = ? AND COALESCE(vintage, -1) = ?
         ORDER BY updated_at DESC LIMIT 1`
      )
      .get(normName, String(producer).trim().toLowerCase(), vintage);
  } else if (producer) {
    row = db
      .prepare(
        `SELECT * FROM wines
         WHERE lower(name) = ? AND lower(COALESCE(producer, '')) = ?
         ORDER BY updated_at DESC LIMIT 1`
      )
      .get(normName, String(producer).trim().toLowerCase());
  } else {
    row = db
      .prepare(
        `SELECT * FROM wines WHERE lower(name) = ?
         ORDER BY updated_at DESC LIMIT 1`
      )
      .get(normName);
  }
  return row ? hydrateWine(row) : null;
}

function getWineById(id) {
  const row = getDb().prepare(`SELECT * FROM wines WHERE id = ?`).get(id);
  if (!row) return null;
  return hydrateWine(row);
}

function getWinePhotos(wineId) {
  return getDb()
    .prepare(`SELECT id, path, is_primary, uploaded_at FROM wine_photos WHERE wine_id = ? ORDER BY is_primary DESC, uploaded_at DESC`)
    .all(wineId);
}

function searchWines(query, limit = 20) {
  if (!query || !query.trim()) {
    return getDb()
      .prepare(`SELECT * FROM wines ORDER BY updated_at DESC LIMIT ?`)
      .all(limit)
      .map(hydrateWine);
  }
  // Recherche FTS5 simple
  const q = query
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean)
    .map((w) => `${w}*`)
    .join(' OR ');
  if (!q) return [];
  try {
    return getDb()
      .prepare(`
        SELECT w.* FROM wines w
        JOIN wines_fts f ON f.rowid = w.id
        WHERE wines_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `)
      .all(q, limit)
      .map(hydrateWine);
  } catch (e) {
    console.error('[wines] FTS search failed, fallback LIKE', e.message);
    const like = `%${query}%`;
    return getDb()
      .prepare(`
        SELECT * FROM wines
        WHERE name LIKE ? OR producer LIKE ? OR appellation LIKE ? OR region LIKE ?
        ORDER BY updated_at DESC LIMIT ?
      `)
      .all(like, like, like, like, limit)
      .map(hydrateWine);
  }
}

// ─── Scans ───────────────────────────────────────────────────────────────────

function logScan({
  photoId,
  aiRaw,
  aiStatus,
  matchedWineId,
  userSub,
  durationMs,
  model,
  inputTokens,
  outputTokens,
  costUsd,
  // Géoloc (tous optionnels)
  lat,
  lon,
  locationSource,
  locationAccuracyM,
  locationAt,
  placeName,
  placeType,
  matchedProducerId,
}) {
  const stmt = getDb().prepare(`
    INSERT INTO wine_scans (
      photo_id, ai_raw, ai_status, matched_wine_id, user_sub, duration_ms,
      model, input_tokens, output_tokens, cost_usd,
      lat, lon, location_source, location_accuracy_m, location_at,
      place_name, place_type, matched_producer_id,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const r = stmt.run(
    photoId || null,
    aiRaw ? JSON.stringify(aiRaw) : null,
    aiStatus || null,
    matchedWineId || null,
    userSub || null,
    durationMs || null,
    model || null,
    inputTokens || null,
    outputTokens || null,
    costUsd != null ? costUsd : null,
    lat != null ? lat : null,
    lon != null ? lon : null,
    locationSource || null,
    locationAccuracyM != null ? locationAccuracyM : null,
    locationAt || null,
    placeName || null,
    placeType || null,
    matchedProducerId || null,
    Date.now()
  );
  return r.lastInsertRowid;
}

// ─── Code-barres EAN ─────────────────────────────────────────────────────────

/**
 * Cherche un vin par code-barres. Si trouvé, incrémente scan_count & last_seen
 * et retourne la fiche vin complète + photos. Sinon retourne null.
 */
function findWineByBarcode(ean) {
  if (!ean) return null;
  const now = Date.now();
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM wine_barcodes WHERE ean = ?`)
    .get(ean);
  if (!row) return null;

  db.prepare(
    `UPDATE wine_barcodes SET scan_count = scan_count + 1, last_seen = ? WHERE ean = ?`
  ).run(now, ean);

  const wine = getWineById(row.wine_id);
  if (!wine) return null;
  const photos = getWinePhotos(row.wine_id);
  return { wine, photos, barcode: { ...row, scan_count: row.scan_count + 1, last_seen: now } };
}

/**
 * Upsert d'un mapping EAN → wine_id. Incrémente scan_count si existe déjà
 * pour le même vin, crée sinon. Si l'EAN existe déjà pour un AUTRE vin,
 * on ne l'écrase pas (on retourne un conflit silencieux).
 */
function upsertBarcode({ ean, wineId, format, userSub }) {
  if (!ean || !wineId) return null;
  const now = Date.now();
  const db = getDb();
  const existing = db.prepare(`SELECT * FROM wine_barcodes WHERE ean = ?`).get(ean);

  if (existing) {
    if (existing.wine_id !== wineId) {
      // Conflit : même EAN déjà mappé à un autre vin → on ignore mais on log
      console.warn(`[barcodes] conflit EAN=${ean} déjà sur wine#${existing.wine_id}, refusé pour wine#${wineId}`);
      return { status: 'conflict', existing };
    }
    db.prepare(
      `UPDATE wine_barcodes SET scan_count = scan_count + 1, last_seen = ? WHERE ean = ?`
    ).run(now, ean);
    return { status: 'updated', ean, wine_id: wineId };
  }

  db.prepare(
    `INSERT INTO wine_barcodes (ean, wine_id, format, first_seen, last_seen, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(ean, wineId, format || null, now, now, userSub || null);
  return { status: 'created', ean, wine_id: wineId };
}

// ─── User cellar (inventaire perso) ──────────────────────────────────────────

/**
 * Ajoute une bouteille à la cave de l'utilisateur. Si l'utilisateur possède
 * déjà ce wine_id (même user_sub), on incrémente la quantité au lieu de créer
 * une nouvelle entrée — sauf si `forceNew:true` (pour distinguer deux achats
 * de la même cuvée à des prix/dates différents).
 */
function addToCellar({
  userSub,
  wineId,
  quantity = 1,
  acquiredAt = null,
  acquiredPriceEur = null,
  location = null,
  notes = null,
  photoId = null,
  forceNew = false,
}) {
  if (!userSub) throw new Error('userSub required');
  if (!wineId) throw new Error('wineId required');
  const now = Date.now();
  const db = getDb();

  if (!forceNew) {
    const existing = db
      .prepare(
        `SELECT * FROM user_cellar
         WHERE user_sub = ? AND wine_id = ? AND status = 'stock'
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(userSub, wineId);
    if (existing) {
      db.prepare(
        `UPDATE user_cellar SET quantity = quantity + ?, updated_at = ? WHERE id = ?`
      ).run(quantity, now, existing.id);
      return { id: existing.id, status: 'incremented', quantity: existing.quantity + quantity };
    }
  }

  const r = db
    .prepare(
      `INSERT INTO user_cellar (
         user_sub, wine_id, quantity, acquired_at, acquired_price_eur,
         location, notes, photo_id, status, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'stock', ?, ?)`
    )
    .run(
      userSub,
      wineId,
      quantity,
      acquiredAt,
      acquiredPriceEur,
      location,
      notes,
      photoId,
      now,
      now
    );
  return { id: r.lastInsertRowid, status: 'created', quantity };
}

/** Liste la cave d'un user (join avec wines pour la fiche complète). */
function listUserCellar(userSub, { status = 'stock', limit = 200 } = {}) {
  if (!userSub) return [];
  const rows = getDb()
    .prepare(
      `SELECT
         uc.id          AS cellar_id,
         uc.quantity,
         uc.acquired_at,
         uc.acquired_price_eur,
         uc.location,
         uc.notes,
         uc.status      AS cellar_status,
         uc.created_at  AS cellar_created_at,
         w.*
       FROM user_cellar uc
       JOIN wines w ON w.id = uc.wine_id
       WHERE uc.user_sub = ? AND uc.status = ?
       ORDER BY uc.created_at DESC
       LIMIT ?`
    )
    .all(userSub, status, limit);
  return rows.map((row) => ({
    cellarId: row.cellar_id,
    quantity: row.quantity,
    acquiredAt: row.acquired_at,
    acquiredPriceEur: row.acquired_price_eur,
    location: row.location,
    notes: row.notes,
    status: row.cellar_status,
    wine: hydrateWine(row),
  }));
}

/** Compte le nombre total de bouteilles en cave pour un user. */
function countUserCellar(userSub) {
  if (!userSub) return 0;
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(quantity), 0) AS total, COUNT(*) AS entries
       FROM user_cellar WHERE user_sub = ? AND status = 'stock'`
    )
    .get(userSub);
  return { total: row.total, entries: row.entries };
}

function removeFromCellar(cellarId, userSub) {
  if (!userSub || !cellarId) return null;
  const now = Date.now();
  const r = getDb()
    .prepare(
      `UPDATE user_cellar SET status = 'consumed', consumed_at = ?, updated_at = ?
       WHERE id = ? AND user_sub = ?`
    )
    .run(now, now, cellarId, userSub);
  return { updated: r.changes };
}

function listBarcodesForWine(wineId) {
  return getDb()
    .prepare(`SELECT ean, format, scan_count, first_seen, last_seen FROM wine_barcodes WHERE wine_id = ? ORDER BY scan_count DESC`)
    .all(wineId);
}

// ─── Stats (agrégats tokens/coût) ───────────────────────────────────────────

function getScanStats({ since } = {}) {
  const where = since ? `WHERE created_at >= ?` : '';
  const params = since ? [since] : [];
  const row = getDb()
    .prepare(`
      SELECT
        COUNT(*)                       AS scans,
        COALESCE(SUM(input_tokens), 0)  AS input_tokens,
        COALESCE(SUM(output_tokens), 0) AS output_tokens,
        COALESCE(SUM(cost_usd), 0)      AS cost_usd,
        COALESCE(AVG(duration_ms), 0)   AS avg_duration_ms
      FROM wine_scans ${where}
    `)
    .get(...params);
  return row;
}

function listRecentScans(limit = 20) {
  return getDb()
    .prepare(`
      SELECT id, photo_id, ai_status, model, input_tokens, output_tokens,
             cost_usd, duration_ms, matched_wine_id, matched_producer_id,
             lat, lon, location_source, place_name, place_type, location_at,
             created_at
      FROM wine_scans
      ORDER BY created_at DESC
      LIMIT ?
    `)
    .all(limit);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hydrateWine(row) {
  if (!row) return null;
  return {
    ...row,
    grapes: safeJsonParse(row.grapes, []),
    food_pairings: safeJsonParse(row.food_pairings, []),
  };
}

function safeJsonParse(str, fallback) {
  if (!str) return fallback;
  try {
    const v = JSON.parse(str);
    return v ?? fallback;
  } catch {
    // Ancien format : simple chaîne
    return typeof str === 'string' ? [str] : fallback;
  }
}

/**
 * Supprime tous les vins dont la colonne `source` correspond exactement.
 * Retourne { deleted: n }. Utilisé par /bulk-import?replace=true pour purger
 * une source de la base de connaissance avant un ré-import.
 *
 * NOTE : les wine_scans / user_cellar référencent wine_id via ON DELETE SET NULL
 * ou CASCADE selon la table, donc la suppression est safe pour les scans, mais
 * videra les entrées user_cellar. À n'utiliser que sur des sources auto-insérées
 * (chapoutier-tarif-2026, bulk-import, etc.), JAMAIS sur une source utilisateur.
 */
function deleteWinesBySource(source) {
  if (!source || typeof source !== 'string') return { deleted: 0 };
  const db = getDb();
  const info = db.prepare(`DELETE FROM wines WHERE source = ?`).run(source);
  return { deleted: info.changes || 0 };
}

module.exports = {
  init,
  getDb,
  getPhotosDir,
  savePhoto,
  linkPhotoToWine,
  insertWine,
  findWineByIdentity,
  deleteWinesBySource,
  getWineById,
  getWinePhotos,
  searchWines,
  logScan,
  getScanStats,
  listRecentScans,
  findWineByBarcode,
  upsertBarcode,
  listBarcodesForWine,
  // User cellar
  addToCellar,
  listUserCellar,
  countUserCellar,
  removeFromCellar,
};
