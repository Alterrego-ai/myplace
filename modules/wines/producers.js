/**
 * Module wines — Sous-module producers
 * -------------------------------------
 * Storage + helpers pour la table `producers`.
 * Partage la même DB que le reste du module wines (wines.db).
 */
const { getDb } = require('./storage');

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Normalise un nom de producteur en slug stable pour le matching.
 *   "Maison Chandesais"  → "maison-chandesais"
 *   "Dom. de la Romanée" → "dom-de-la-romanee"
 */
function slugify(name) {
  if (!name) return null;
  return String(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')       // retire accents
    .toLowerCase()
    .replace(/['’`]/g, '')                  // apostrophes
    .replace(/&/g, ' et ')
    .replace(/[^a-z0-9]+/g, '-')            // non-alphanum → tiret
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function hydrate(row) {
  if (!row) return null;
  return { ...row };
}

// ─── Lookups ────────────────────────────────────────────────────────────────

function getById(id) {
  return hydrate(getDb().prepare(`SELECT * FROM producers WHERE id = ?`).get(id));
}

function getBySlug(slug) {
  if (!slug) return null;
  return hydrate(getDb().prepare(`SELECT * FROM producers WHERE slug = ?`).get(slug));
}

function getByName(name) {
  const slug = slugify(name);
  return getBySlug(slug);
}

// ─── Upsert (auto-création pendant le scan) ────────────────────────────────

/**
 * Trouve ou crée un producteur à partir d'un nom.
 * Renvoie la fiche producteur (existante ou nouvellement créée).
 *
 * @param {object} data - au minimum { name }, optionnellement region/country/appellation_main…
 * @param {string} createdBy - user sub (optionnel)
 */
function findOrCreate(data, createdBy = null) {
  if (!data || !data.name) return null;
  const slug = slugify(data.name);
  if (!slug) return null;

  const existing = getBySlug(slug);
  if (existing) {
    // Best-effort enrichment : on complète les champs manquants
    const patch = {};
    for (const k of ['country', 'region', 'appellation_main']) {
      if (!existing[k] && data[k]) patch[k] = data[k];
    }
    if (Object.keys(patch).length > 0) {
      update(existing.id, patch);
      return getById(existing.id);
    }
    return existing;
  }

  const now = Date.now();
  const stmt = getDb().prepare(`
    INSERT INTO producers (
      slug, name, legal_name, country, region, appellation_main,
      address, latitude, longitude, website, phone, email,
      owner, founded_year, area_ha, farming, description, wikipedia_url,
      enrichment_status, source, created_by, created_at, updated_at
    ) VALUES (
      @slug, @name, @legal_name, @country, @region, @appellation_main,
      @address, @latitude, @longitude, @website, @phone, @email,
      @owner, @founded_year, @area_ha, @farming, @description, @wikipedia_url,
      @enrichment_status, @source, @created_by, @created_at, @updated_at
    )
  `);

  const payload = {
    slug,
    name: data.name,
    legal_name: data.legal_name || null,
    country: data.country || null,
    region: data.region || null,
    appellation_main: data.appellation_main || null,
    address: data.address || null,
    latitude: data.latitude || null,
    longitude: data.longitude || null,
    website: data.website || null,
    phone: data.phone || null,
    email: data.email || null,
    owner: data.owner || null,
    founded_year: data.founded_year || null,
    area_ha: data.area_ha || null,
    farming: data.farming || null,
    description: data.description || null,
    wikipedia_url: data.wikipedia_url || null,
    enrichment_status: 'pending',
    source: data.source || 'scan',
    created_by: createdBy,
    created_at: now,
    updated_at: now,
  };

  const result = stmt.run(payload);
  return { id: result.lastInsertRowid, ...payload };
}

// ─── Update ─────────────────────────────────────────────────────────────────

const UPDATABLE = [
  'name', 'legal_name', 'country', 'region', 'appellation_main',
  'address', 'latitude', 'longitude', 'website', 'phone', 'email',
  'owner', 'founded_year', 'area_ha', 'farming', 'description', 'wikipedia_url',
  'enrichment_status', 'enriched_at',
];

function update(id, patch) {
  if (!patch) return getById(id);
  const keys = Object.keys(patch).filter((k) => UPDATABLE.includes(k));
  if (keys.length === 0) return getById(id);

  const setClause = keys.map((k) => `${k} = @${k}`).join(', ');
  const payload = { id, updated_at: Date.now() };
  for (const k of keys) payload[k] = patch[k];

  getDb()
    .prepare(`UPDATE producers SET ${setClause}, updated_at = @updated_at WHERE id = @id`)
    .run(payload);

  return getById(id);
}

function markEnrichmentStatus(id, status) {
  const patch = { enrichment_status: status };
  if (status === 'enriched') patch.enriched_at = Date.now();
  return update(id, patch);
}

// ─── Search ─────────────────────────────────────────────────────────────────

function search(query, limit = 20) {
  if (!query || !query.trim()) {
    return getDb()
      .prepare(`SELECT * FROM producers ORDER BY updated_at DESC LIMIT ?`)
      .all(limit)
      .map(hydrate);
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
        SELECT p.* FROM producers p
        JOIN producers_fts f ON f.rowid = p.id
        WHERE producers_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `)
      .all(q, limit)
      .map(hydrate);
  } catch (e) {
    console.error('[producers] FTS search failed, fallback LIKE', e.message);
    const like = `%${query}%`;
    return getDb()
      .prepare(`
        SELECT * FROM producers
        WHERE name LIKE ? OR legal_name LIKE ? OR region LIKE ?
        ORDER BY updated_at DESC LIMIT ?
      `)
      .all(like, like, like, limit)
      .map(hydrate);
  }
}

function listPending(limit = 50) {
  return getDb()
    .prepare(`
      SELECT * FROM producers
      WHERE enrichment_status = 'pending' OR enrichment_status IS NULL
      ORDER BY created_at ASC
      LIMIT ?
    `)
    .all(limit)
    .map(hydrate);
}

function countByStatus() {
  const rows = getDb()
    .prepare(`SELECT enrichment_status AS status, COUNT(*) AS n FROM producers GROUP BY enrichment_status`)
    .all();
  const out = { pending: 0, enriching: 0, enriched: 0, failed: 0, total: 0 };
  for (const r of rows) {
    const key = r.status || 'pending';
    out[key] = (out[key] || 0) + r.n;
    out.total += r.n;
  }
  return out;
}

function listWinesByProducer(producerId, limit = 50) {
  return getDb()
    .prepare(`
      SELECT * FROM wines
      WHERE producer_id = ?
      ORDER BY vintage DESC, name ASC
      LIMIT ?
    `)
    .all(producerId, limit);
}

// ─── Historique des enrichissements (tokens + coût) ────────────────────────

function logEnrichment({
  producerId,
  status,
  aiRaw,
  fieldsUpdated,
  model,
  inputTokens,
  outputTokens,
  costUsd,
  durationMs,
  userSub,
}) {
  const stmt = getDb().prepare(`
    INSERT INTO producer_enrichments (
      producer_id, status, ai_raw, fields_updated, model,
      input_tokens, output_tokens, cost_usd, duration_ms, user_sub, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const r = stmt.run(
    producerId,
    status || null,
    aiRaw ? JSON.stringify(aiRaw) : null,
    fieldsUpdated ? JSON.stringify(fieldsUpdated) : null,
    model || null,
    inputTokens || null,
    outputTokens || null,
    costUsd != null ? costUsd : null,
    durationMs || null,
    userSub || null,
    Date.now()
  );
  return r.lastInsertRowid;
}

function getEnrichmentHistory(producerId, limit = 20) {
  return getDb()
    .prepare(`
      SELECT * FROM producer_enrichments
      WHERE producer_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `)
    .all(producerId, limit)
    .map((r) => ({
      ...r,
      fields_updated: r.fields_updated ? JSON.parse(r.fields_updated) : [],
    }));
}

function getEnrichmentStats({ since } = {}) {
  const where = since ? `WHERE created_at >= ?` : '';
  const params = since ? [since] : [];
  return getDb()
    .prepare(`
      SELECT
        COUNT(*)                        AS enrichments,
        COALESCE(SUM(input_tokens), 0)  AS input_tokens,
        COALESCE(SUM(output_tokens), 0) AS output_tokens,
        COALESCE(SUM(cost_usd), 0)      AS cost_usd,
        COALESCE(AVG(duration_ms), 0)   AS avg_duration_ms
      FROM producer_enrichments ${where}
    `)
    .get(...params);
}

module.exports = {
  slugify,
  getById,
  getBySlug,
  getByName,
  findOrCreate,
  update,
  markEnrichmentStatus,
  search,
  listPending,
  countByStatus,
  listWinesByProducer,
  logEnrichment,
  getEnrichmentHistory,
  getEnrichmentStats,
};
