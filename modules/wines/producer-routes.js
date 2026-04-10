/**
 * Module wines — Routes producteurs
 * -----------------------------------
 * Monté via : app.use('/api/producer', require('./modules/wines/producer-routes')())
 *
 * Routes :
 *   GET  /api/producer               → liste (récents)
 *   GET  /api/producer/search?q=     → recherche FTS
 *   GET  /api/producer/pending       → producteurs en attente d'enrichissement
 *   GET  /api/producer/stats         → stats d'enrichissement
 *   GET  /api/producer/:id           → fiche + vins liés
 *   GET  /api/producer/:id/history   → historique enrichissements
 *   POST /api/producer               → création manuelle
 *   PATCH /api/producer/:id          → édition manuelle
 *   POST /api/producer/:id/enrich    → enrichit une fiche
 *   POST /api/producer/enrich-pending → enrichit N producteurs en parallèle
 */
const express = require('express');
const producers = require('./producers');
const { enrichProducer, MODEL } = require('./claude');
const { computeCost } = require('./pricing');

// ─── Helper : limiteur de concurrence simple, sans dépendance ──────────────
async function runWithConcurrency(items, worker, concurrency = 5) {
  const results = [];
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const i = index++;
      try {
        results[i] = { ok: true, value: await worker(items[i], i) };
      } catch (e) {
        results[i] = { ok: false, error: e.message || 'worker_failed' };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Enrichit un producteur donné. Extrait pour réutilisation batch.
 * Effets : update producer, marque enrichment_status, log dans producer_enrichments.
 */
async function enrichOneProducer(existing, userSub = null) {
  const id = existing.id;
  producers.markEnrichmentStatus(id, 'enriching');

  try {
    const { result, rawText, parseError, durationMs, usage } = await enrichProducer({
      name: existing.name,
      region: existing.region,
      country: existing.country,
      appellation_main: existing.appellation_main,
    });

    const cost = usage ? computeCost(usage, MODEL) : null;

    if (!result || result.status === 'unknown' || parseError) {
      producers.markEnrichmentStatus(id, 'failed');
      producers.logEnrichment({
        producerId: id,
        status: parseError ? 'error' : (result?.status || 'unknown'),
        aiRaw: { result, rawText, parseError, usage },
        fieldsUpdated: [],
        model: MODEL,
        inputTokens: cost?.inputTokens || null,
        outputTokens: cost?.outputTokens || null,
        costUsd: cost?.costUsd || null,
        durationMs,
        userSub,
      });
      return { producerId: id, name: existing.name, enriched: false, cost, durationMs, reason: parseError || result?.reason || 'unknown' };
    }

    // Patch : on ne remplace pas les champs déjà remplis
    const patch = {};
    const fields = [
      'legal_name', 'country', 'region', 'appellation_main',
      'address', 'latitude', 'longitude', 'website',
      'owner', 'founded_year', 'area_ha', 'farming',
      'description', 'wikipedia_url',
    ];
    for (const f of fields) {
      if (result[f] != null && result[f] !== '' && !existing[f]) {
        patch[f] = result[f];
      }
    }
    producers.update(id, patch);
    producers.markEnrichmentStatus(id, 'enriched');

    producers.logEnrichment({
      producerId: id,
      status: result.status || 'identified',
      aiRaw: { result, usage },
      fieldsUpdated: Object.keys(patch),
      model: MODEL,
      inputTokens: cost?.inputTokens || null,
      outputTokens: cost?.outputTokens || null,
      costUsd: cost?.costUsd || null,
      durationMs,
      userSub,
    });

    return {
      producerId: id,
      name: existing.name,
      enriched: true,
      fieldsUpdated: Object.keys(patch),
      cost,
      durationMs,
    };
  } catch (e) {
    console.error(`[producers] enrich ${id} failed`, e);
    producers.markEnrichmentStatus(id, 'failed');
    producers.logEnrichment({
      producerId: id,
      status: 'error',
      aiRaw: { error: e.message },
      fieldsUpdated: [],
      model: MODEL,
      userSub,
    });
    return { producerId: id, name: existing.name, enriched: false, error: e.message };
  }
}

module.exports = function createProducersRouter() {
  const router = express.Router();

  // ─── GET /search ──────────────────────────────────────────────────────────
  router.get('/search', (req, res) => {
    const q = (req.query.q || '').toString();
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const results = producers.search(q, limit);
    res.json({ query: q, count: results.length, results });
  });

  // ─── GET /stats ───────────────────────────────────────────────────────────
  router.get('/stats', (req, res) => {
    const since = req.query.since ? parseInt(req.query.since, 10) : null;
    res.json({ stats: producers.getEnrichmentStats({ since }), model: MODEL });
  });

  // ─── GET / (liste) ────────────────────────────────────────────────────────
  router.get('/', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    res.json({ results: producers.search('', limit) });
  });

  // ─── POST / (création manuelle) ──────────────────────────────────────────
  router.post('/', express.json({ limit: '1mb' }), (req, res) => {
    const data = req.body || {};
    if (!data.name) return res.status(400).json({ error: 'missing_name' });
    try {
      const p = producers.findOrCreate({ ...data, source: data.source || 'manual' }, req.user?.sub || null);
      res.json({ producer: p });
    } catch (e) {
      console.error('[producers] create failed', e);
      res.status(500).json({ error: 'create_failed', message: e.message });
    }
  });

  // ─── GET /:id ─────────────────────────────────────────────────────────────
  router.get('/:id(\\d+)', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const p = producers.getById(id);
    if (!p) return res.status(404).json({ error: 'not_found' });
    const wines = producers.listWinesByProducer(id);
    res.json({ producer: p, wines });
  });

  // ─── PATCH /:id ───────────────────────────────────────────────────────────
  router.patch('/:id(\\d+)', express.json({ limit: '1mb' }), (req, res) => {
    const id = parseInt(req.params.id, 10);
    const existing = producers.getById(id);
    if (!existing) return res.status(404).json({ error: 'not_found' });
    try {
      const updated = producers.update(id, req.body || {});
      res.json({ producer: updated });
    } catch (e) {
      console.error('[producers] update failed', e);
      res.status(500).json({ error: 'update_failed', message: e.message });
    }
  });

  // ─── GET /pending ─────────────────────────────────────────────────────────
  router.get('/pending', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const items = producers.listPending(limit);
    res.json({
      count: items.length,
      stats: producers.countByStatus(),
      items,
    });
  });

  // ─── POST /:id/enrich ─────────────────────────────────────────────────────
  // Lance l'enrichissement Claude sur la fiche producteur.
  // Idempotent : si déjà "enriched", on retourne la fiche telle quelle sauf ?force=1.
  router.post('/:id(\\d+)/enrich', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const existing = producers.getById(id);
    if (!existing) return res.status(404).json({ error: 'not_found' });

    const force = req.query.force === '1' || req.body?.force === true;
    if (existing.enrichment_status === 'enriched' && !force) {
      return res.json({ producer: existing, skipped: true });
    }
    if (existing.enrichment_status === 'enriching') {
      return res.status(409).json({ error: 'already_enriching', producer: existing });
    }

    const outcome = await enrichOneProducer(existing, req.user?.sub || null);
    return res.json({ ...outcome, producer: producers.getById(id) });
  });

  // ─── POST /enrich-pending ─────────────────────────────────────────────────
  // Lance en parallèle l'enrichissement de tous les producteurs "pending"
  // Body : { limit?: number = 20, concurrency?: number = 4 }
  router.post('/enrich-pending', express.json({ limit: '64kb' }), async (req, res) => {
    const limit = Math.min(parseInt(req.body?.limit, 10) || 20, 100);
    const concurrency = Math.max(1, Math.min(parseInt(req.body?.concurrency, 10) || 4, 10));
    const items = producers.listPending(limit);
    if (items.length === 0) {
      return res.json({
        message: 'no_pending_producers',
        stats: producers.countByStatus(),
        results: [],
      });
    }

    const t0 = Date.now();
    const userSub = req.user?.sub || null;
    const outcomes = await runWithConcurrency(
      items,
      (p) => enrichOneProducer(p, userSub),
      concurrency
    );

    // Agrégats
    const results = outcomes.map((o, i) =>
      o.ok ? o.value : { producerId: items[i].id, name: items[i].name, enriched: false, error: o.error }
    );
    const totalCostUsd = results.reduce((s, r) => s + (r.cost?.costUsd || 0), 0);
    const totalCostEur = results.reduce((s, r) => s + (r.cost?.costEur || 0), 0);
    const totalInputTokens = results.reduce((s, r) => s + (r.cost?.inputTokens || 0), 0);
    const totalOutputTokens = results.reduce((s, r) => s + (r.cost?.outputTokens || 0), 0);
    const successes = results.filter((r) => r.enriched).length;

    res.json({
      total: results.length,
      successes,
      failures: results.length - successes,
      concurrency,
      totalDurationMs: Date.now() - t0,
      totalInputTokens,
      totalOutputTokens,
      totalCostUsd,
      totalCostEur,
      model: MODEL,
      stats: producers.countByStatus(),
      results,
    });
  });

  // ─── GET /:id/history ─────────────────────────────────────────────────────
  router.get('/:id(\\d+)/history', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const history = producers.getEnrichmentHistory(id, parseInt(req.query.limit, 10) || 20);
    res.json({ history });
  });

  return router;
};
