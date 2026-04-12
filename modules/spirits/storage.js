/**
 * Module spirits — Storage (SQLite + photos filesystem)
 * Architecture parallèle au module wines, DB dédiée : spirits.db
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

let db = null;
let photosDir = null;

function init({ dbDir, publicDir }) {
  const dbPath = path.join(dbDir || '.', 'spirits.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);

  // Migrations incrémentales (à étendre au fur et à mesure)
  const scanCols = db.prepare(`PRAGMA table_info(spirit_scans)`).all().map((c) => c.name);
  const migrations = [
    ['model',              `ALTER TABLE spirit_scans ADD COLUMN model TEXT`],
    ['input_tokens',       `ALTER TABLE spirit_scans ADD COLUMN input_tokens INTEGER`],
    ['output_tokens',      `ALTER TABLE spirit_scans ADD COLUMN output_tokens INTEGER`],
    ['cost_usd',           `ALTER TABLE spirit_scans ADD COLUMN cost_usd REAL`],
    ['lat',                `ALTER TABLE spirit_scans ADD COLUMN lat REAL`],
    ['lon',                `ALTER TABLE spirit_scans ADD COLUMN lon REAL`],
    ['location_source',    `ALTER TABLE spirit_scans ADD COLUMN location_source TEXT`],
    ['location_accuracy_m',`ALTER TABLE spirit_scans ADD COLUMN location_accuracy_m REAL`],
    ['location_at',        `ALTER TABLE spirit_scans ADD COLUMN location_at INTEGER`],
    ['place_name',         `ALTER TABLE spirit_scans ADD COLUMN place_name TEXT`],
    ['place_type',         `ALTER TABLE spirit_scans ADD COLUMN place_type TEXT`],
    ['matched_distillery_id', `ALTER TABLE spirit_scans ADD COLUMN matched_distillery_id INTEGER REFERENCES distilleries(id) ON DELETE SET NULL`],
  ];
  for (const [col, sql] of migrations) {
    if (!scanCols.includes(col)) {
      db.exec(sql);
      console.log(`🔧 migration spirit_scans: ${col} ajouté`);
    }
  }

  photosDir = path.join(publicDir, 'uploads', 'spirits');
  if (!fs.existsSync(photosDir)) fs.mkdirSync(photosDir, { recursive: true });

  console.log(`🥃 Module spirits initialisé : ${dbPath}`);
  return { db, photosDir };
}

function getDb() {
  if (!db) throw new Error('spirits storage not initialised — call init() first');
  return db;
}

function getPhotosDir() {
  if (!photosDir) throw new Error('spirits photosDir not initialised');
  return photosDir;
}

// ─── Photos ──────────────────────────────────────────────────────────────────

function savePhoto({ filename, uploadedBy }) {
  const now = Date.now();
  const relPath = `/uploads/spirits/${filename}`;
  const stmt = getDb().prepare(`
    INSERT INTO spirit_photos (path, uploaded_by, uploaded_at)
    VALUES (?, ?, ?)
  `);
  const result = stmt.run(relPath, uploadedBy || null, now);
  return { id: result.lastInsertRowid, path: relPath, uploaded_at: now };
}

function linkPhotoToSpirit(photoId, spiritId, isPrimary = 0) {
  getDb()
    .prepare(`UPDATE spirit_photos SET spirit_id = ?, is_primary = ? WHERE id = ?`)
    .run(spiritId, isPrimary ? 1 : 0, photoId);
}

// ─── Spirits ─────────────────────────────────────────────────────────────────

function insertSpirit(data, createdBy = null) {
  const now = Date.now();
  const stmt = getDb().prepare(`
    INSERT INTO spirits (
      name, distillery, distillery_id, bottler, type, subtype, age,
      cask_type, cask_finish, distillation_year, bottling_year,
      abv, volume_ml, cask_strength, chill_filtered, natural_color,
      batch_number, bottle_number, country, region,
      tasting_notes, food_pairings, serving, avg_price_eur,
      confidence, source, created_by, created_at, updated_at
    ) VALUES (
      @name, @distillery, @distillery_id, @bottler, @type, @subtype, @age,
      @cask_type, @cask_finish, @distillation_year, @bottling_year,
      @abv, @volume_ml, @cask_strength, @chill_filtered, @natural_color,
      @batch_number, @bottle_number, @country, @region,
      @tasting_notes, @food_pairings, @serving, @avg_price_eur,
      @confidence, @source, @created_by, @created_at, @updated_at
    )
  `);
  const payload = {
    name: data.name || 'Spiritueux inconnu',
    distillery: data.distillery || null,
    distillery_id: data.distillery_id || null,
    bottler: data.bottler || null,
    type: data.type || null,
    subtype: data.subtype || null,
    age: data.age || null,
    cask_type: data.cask_type || null,
    cask_finish: data.cask_finish || null,
    distillation_year: data.distillation_year || null,
    bottling_year: data.bottling_year || null,
    abv: data.abv || null,
    volume_ml: data.volume_ml || null,
    cask_strength: data.cask_strength ? 1 : 0,
    chill_filtered: typeof data.chill_filtered === 'boolean' ? (data.chill_filtered ? 1 : 0) : null,
    natural_color: typeof data.natural_color === 'boolean' ? (data.natural_color ? 1 : 0) : null,
    batch_number: data.batch_number || null,
    bottle_number: data.bottle_number || null,
    country: data.country || null,
    region: data.region || null,
    tasting_notes: data.tasting_notes || null,
    food_pairings: Array.isArray(data.food_pairings) ? JSON.stringify(data.food_pairings) : (data.food_pairings || null),
    serving: data.serving || null,
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
 * Cherche un spiritueux par identité approximative (name + distillery + age).
 * Utilisé pour déduper la base de connaissance lors d'un auto-insert scan.
 */
function findSpiritByIdentity({ name, distillery, age }) {
  if (!name) return null;
  const db = getDb();
  const normName = String(name).trim().toLowerCase();
  let row;
  if (distillery && age != null) {
    row = db
      .prepare(
        `SELECT * FROM spirits
         WHERE lower(name) = ? AND lower(COALESCE(distillery, '')) = ? AND COALESCE(age, -1) = ?
         ORDER BY updated_at DESC LIMIT 1`
      )
      .get(normName, String(distillery).trim().toLowerCase(), age);
  } else if (distillery) {
    row = db
      .prepare(
        `SELECT * FROM spirits
         WHERE lower(name) = ? AND lower(COALESCE(distillery, '')) = ?
         ORDER BY updated_at DESC LIMIT 1`
      )
      .get(normName, String(distillery).trim().toLowerCase());
  } else {
    row = db
      .prepare(
        `SELECT * FROM spirits WHERE lower(name) = ?
         ORDER BY updated_at DESC LIMIT 1`
      )
      .get(normName);
  }
  return row ? hydrateSpirit(row) : null;
}

function getSpiritById(id) {
  const row = getDb().prepare(`SELECT * FROM spirits WHERE id = ?`).get(id);
  if (!row) return null;
  return hydrateSpirit(row);
}

function getSpiritPhotos(spiritId) {
  return getDb()
    .prepare(`SELECT id, path, is_primary, uploaded_at FROM spirit_photos WHERE spirit_id = ? ORDER BY is_primary DESC, uploaded_at DESC`)
    .all(spiritId);
}

function searchSpirits(query, limit = 20) {
  if (!query || !query.trim()) {
    return getDb()
      .prepare(`SELECT * FROM spirits ORDER BY updated_at DESC LIMIT ?`)
      .all(limit)
      .map(hydrateSpirit);
  }
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
        SELECT s.* FROM spirits s
        JOIN spirits_fts f ON f.rowid = s.id
        WHERE spirits_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `)
      .all(q, limit)
      .map(hydrateSpirit);
  } catch (e) {
    console.error('[spirits] FTS search failed, fallback LIKE', e.message);
    const like = `%${query}%`;
    return getDb()
      .prepare(`
        SELECT * FROM spirits
        WHERE name LIKE ? OR distillery LIKE ? OR region LIKE ? OR type LIKE ?
        ORDER BY updated_at DESC LIMIT ?
      `)
      .all(like, like, like, like, limit)
      .map(hydrateSpirit);
  }
}

// ─── Scans ───────────────────────────────────────────────────────────────────

function logScan({
  photoId,
  aiRaw,
  aiStatus,
  matchedSpiritId,
  userSub,
  durationMs,
  model,
  inputTokens,
  outputTokens,
  costUsd,
  lat,
  lon,
  locationSource,
  locationAccuracyM,
  locationAt,
  placeName,
  placeType,
  matchedDistilleryId,
}) {
  const stmt = getDb().prepare(`
    INSERT INTO spirit_scans (
      photo_id, ai_raw, ai_status, matched_spirit_id, user_sub, duration_ms,
      model, input_tokens, output_tokens, cost_usd,
      lat, lon, location_source, location_accuracy_m, location_at,
      place_name, place_type, matched_distillery_id,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const r = stmt.run(
    photoId || null,
    aiRaw ? JSON.stringify(aiRaw) : null,
    aiStatus || null,
    matchedSpiritId || null,
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
    matchedDistilleryId || null,
    Date.now()
  );
  return r.lastInsertRowid;
}

// ─── Code-barres EAN ─────────────────────────────────────────────────────────

function findSpiritByBarcode(ean) {
  if (!ean) return null;
  const now = Date.now();
  const db = getDb();
  const row = db.prepare(`SELECT * FROM spirit_barcodes WHERE ean = ?`).get(ean);
  if (!row) return null;

  db.prepare(
    `UPDATE spirit_barcodes SET scan_count = scan_count + 1, last_seen = ? WHERE ean = ?`
  ).run(now, ean);

  const spirit = getSpiritById(row.spirit_id);
  if (!spirit) return null;
  const photos = getSpiritPhotos(row.spirit_id);
  return { spirit, photos, barcode: { ...row, scan_count: row.scan_count + 1, last_seen: now } };
}

function upsertBarcode({ ean, spiritId, format, userSub }) {
  if (!ean || !spiritId) return null;
  const now = Date.now();
  const db = getDb();
  const existing = db.prepare(`SELECT * FROM spirit_barcodes WHERE ean = ?`).get(ean);

  if (existing) {
    if (existing.spirit_id !== spiritId) {
      console.warn(`[spirit-barcodes] conflit EAN=${ean} déjà sur spirit#${existing.spirit_id}, refusé pour spirit#${spiritId}`);
      return { status: 'conflict', existing };
    }
    db.prepare(
      `UPDATE spirit_barcodes SET scan_count = scan_count + 1, last_seen = ? WHERE ean = ?`
    ).run(now, ean);
    return { status: 'updated', ean, spirit_id: spiritId };
  }

  db.prepare(
    `INSERT INTO spirit_barcodes (ean, spirit_id, format, first_seen, last_seen, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(ean, spiritId, format || null, now, now, userSub || null);
  return { status: 'created', ean, spirit_id: spiritId };
}

// ─── User bar (inventaire perso) ─────────────────────────────────────────────

function addToBar({
  userSub,
  spiritId,
  quantity = 1,
  acquiredAt = null,
  acquiredPriceEur = null,
  location = null,
  notes = null,
  photoId = null,
  forceNew = false,
}) {
  if (!userSub) throw new Error('userSub required');
  if (!spiritId) throw new Error('spiritId required');
  const now = Date.now();
  const db = getDb();

  if (!forceNew) {
    const existing = db
      .prepare(
        `SELECT * FROM user_bar
         WHERE user_sub = ? AND spirit_id = ? AND status = 'stock'
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(userSub, spiritId);
    if (existing) {
      db.prepare(
        `UPDATE user_bar SET quantity = quantity + ?, updated_at = ? WHERE id = ?`
      ).run(quantity, now, existing.id);
      return { id: existing.id, status: 'incremented', quantity: existing.quantity + quantity };
    }
  }

  const r = db
    .prepare(
      `INSERT INTO user_bar (
         user_sub, spirit_id, quantity, acquired_at, acquired_price_eur,
         location, notes, photo_id, status, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'stock', ?, ?)`
    )
    .run(
      userSub,
      spiritId,
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

function listUserBar(userSub, { status = 'stock', limit = 200, allUsers = false } = {}) {
  if (!userSub && !allUsers) return [];
  const db = getDb();
  const rows = allUsers
    ? db.prepare(
        `SELECT
           ub.id          AS bar_id,
           ub.quantity,
           ub.acquired_at,
           ub.acquired_price_eur,
           ub.location,
           ub.notes,
           ub.status      AS bar_status,
           ub.opened_at,
           ub.created_at  AS bar_created_at,
           s.*
         FROM user_bar ub
         JOIN spirits s ON s.id = ub.spirit_id
         WHERE ub.status = ?
         ORDER BY ub.created_at DESC
         LIMIT ?`
      ).all(status, limit)
    : db.prepare(
        `SELECT
           ub.id          AS bar_id,
           ub.quantity,
           ub.acquired_at,
           ub.acquired_price_eur,
           ub.location,
           ub.notes,
           ub.status      AS bar_status,
           ub.opened_at,
           ub.created_at  AS bar_created_at,
           s.*
         FROM user_bar ub
         JOIN spirits s ON s.id = ub.spirit_id
         WHERE ub.user_sub = ? AND ub.status = ?
         ORDER BY ub.created_at DESC
         LIMIT ?`
      ).all(userSub, status, limit);
  return rows.map((row) => ({
    barId: row.bar_id,
    quantity: row.quantity,
    acquiredAt: row.acquired_at,
    acquiredPriceEur: row.acquired_price_eur,
    location: row.location,
    notes: row.notes,
    status: row.bar_status,
    openedAt: row.opened_at,
    spirit: hydrateSpirit(row),
  }));
}

function countUserBar(userSub, { allUsers = false } = {}) {
  if (!userSub && !allUsers) return { total: 0, entries: 0 };
  const db = getDb();
  const row = allUsers
    ? db.prepare(
        `SELECT COALESCE(SUM(quantity), 0) AS total, COUNT(*) AS entries
         FROM user_bar WHERE status = 'stock'`
      ).get()
    : db.prepare(
        `SELECT COALESCE(SUM(quantity), 0) AS total, COUNT(*) AS entries
         FROM user_bar WHERE user_sub = ? AND status = 'stock'`
      ).get(userSub);
  return { total: row.total, entries: row.entries };
}

function removeFromBar(barId, userSub, { allUsers = false } = {}) {
  if ((!userSub && !allUsers) || !barId) return null;
  const now = Date.now();
  const db = getDb();
  const r = allUsers
    ? db.prepare(
        `UPDATE user_bar SET status = 'consumed', consumed_at = ?, updated_at = ?
         WHERE id = ?`
      ).run(now, now, barId)
    : db.prepare(
        `UPDATE user_bar SET status = 'consumed', consumed_at = ?, updated_at = ?
         WHERE id = ? AND user_sub = ?`
      ).run(now, now, barId, userSub);
  return { updated: r.changes };
}

function listBarcodesForSpirit(spiritId) {
  return getDb()
    .prepare(`SELECT ean, format, scan_count, first_seen, last_seen FROM spirit_barcodes WHERE spirit_id = ? ORDER BY scan_count DESC`)
    .all(spiritId);
}

// ─── Stats ──────────────────────────────────────────────────────────────────

function getScanStats({ since } = {}) {
  const where = since ? `WHERE created_at >= ?` : '';
  const params = since ? [since] : [];
  return getDb()
    .prepare(`
      SELECT
        COUNT(*)                       AS scans,
        COALESCE(SUM(input_tokens), 0)  AS input_tokens,
        COALESCE(SUM(output_tokens), 0) AS output_tokens,
        COALESCE(SUM(cost_usd), 0)      AS cost_usd,
        COALESCE(AVG(duration_ms), 0)   AS avg_duration_ms
      FROM spirit_scans ${where}
    `)
    .get(...params);
}

function listRecentScans(limit = 20) {
  return getDb()
    .prepare(`
      SELECT id, photo_id, ai_status, model, input_tokens, output_tokens,
             cost_usd, duration_ms, matched_spirit_id, matched_distillery_id,
             lat, lon, location_source, place_name, place_type, location_at,
             created_at
      FROM spirit_scans
      ORDER BY created_at DESC
      LIMIT ?
    `)
    .all(limit);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hydrateSpirit(row) {
  if (!row) return null;
  return {
    ...row,
    food_pairings: safeJsonParse(row.food_pairings, []),
    cask_strength: !!row.cask_strength,
    chill_filtered: row.chill_filtered == null ? null : !!row.chill_filtered,
    natural_color: row.natural_color == null ? null : !!row.natural_color,
  };
}

function safeJsonParse(str, fallback) {
  if (!str) return fallback;
  try {
    const v = JSON.parse(str);
    return v ?? fallback;
  } catch {
    return typeof str === 'string' ? [str] : fallback;
  }
}

module.exports = {
  init,
  getDb,
  getPhotosDir,
  savePhoto,
  linkPhotoToSpirit,
  insertSpirit,
  findSpiritByIdentity,
  getSpiritById,
  getSpiritPhotos,
  searchSpirits,
  logScan,
  getScanStats,
  listRecentScans,
  findSpiritByBarcode,
  upsertBarcode,
  listBarcodesForSpirit,
  // User bar
  addToBar,
  listUserBar,
  countUserBar,
  removeFromBar,
};
