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
      name, producer, appellation, region, country, vintage, type, color,
      grapes, alcohol, volume_ml, tasting_notes, food_pairings,
      aging_potential, service_temp, avg_price_eur, confidence, source,
      created_by, created_at, updated_at
    ) VALUES (
      @name, @producer, @appellation, @region, @country, @vintage, @type, @color,
      @grapes, @alcohol, @volume_ml, @tasting_notes, @food_pairings,
      @aging_potential, @service_temp, @avg_price_eur, @confidence, @source,
      @created_by, @created_at, @updated_at
    )
  `);
  const payload = {
    name: data.name || 'Vin inconnu',
    producer: data.producer || null,
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

function logScan({ photoId, aiRaw, aiStatus, matchedWineId, userSub, durationMs }) {
  const stmt = getDb().prepare(`
    INSERT INTO wine_scans (photo_id, ai_raw, ai_status, matched_wine_id, user_sub, duration_ms, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const r = stmt.run(
    photoId || null,
    aiRaw ? JSON.stringify(aiRaw) : null,
    aiStatus || null,
    matchedWineId || null,
    userSub || null,
    durationMs || null,
    Date.now()
  );
  return r.lastInsertRowid;
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

module.exports = {
  init,
  getDb,
  getPhotosDir,
  savePhoto,
  linkPhotoToWine,
  insertWine,
  getWineById,
  getWinePhotos,
  searchWines,
  logScan,
};
