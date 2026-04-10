/**
 * Module spirits — Routes distilleries (basique)
 * -----------------------------------------------
 * Monté via : app.use('/api/distillery', require('./modules/spirits/distillery-routes')())
 *
 * Routes :
 *   GET  /api/distillery              → liste récente
 *   GET  /api/distillery/search?q=    → recherche FTS
 *   GET  /api/distillery/pending      → en attente d'enrichissement
 *   GET  /api/distillery/stats        → stats globales
 *   GET  /api/distillery/:id          → fiche + spiritueux liés
 *   GET  /api/distillery/:id/history  → historique enrichissements
 *   POST /api/distillery              → création manuelle
 *   PATCH /api/distillery/:id         → édition manuelle
 *   POST /api/distillery/:id/enrich   → enrichit via Claude
 *   POST /api/distillery/enrich-pending → batch parallèle
 */
const express = require('express');
const distilleries = require('./distilleries');
const { enrichDistillery, MODEL } = require('./claude');
const { computeCost } = require('../wines/pricing');

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

async function enrichOneDistillery(existing, userSub = null) {
  const id = existing.id;
  distilleries.markEnrichmentStatus(id, 'enriching');

  try {
    const { result, rawText, parseError, durationMs, usage } = await enrichDistillery({
      name: existing.name,
      region: existing.region,
      country: existing.country,
      category: existing.category,
    });

    const cost = usage ? computeCost(usage, MODEL) : null;

    if (!result || result.status === 'unknown' || parseError) {
      distilleries.markEnrichmentStatus(id, 'failed');
      distilleries.logEnrichment({
        distilleryId: id,
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
      return {
        distilleryId: id,
        name: existing.name,
        enriched: false,
        cost,
        durationMs,
        reason: parseError || result?.reason || 'unknown',
      };
    }

    const patch = {};
    const fields = [
      'legal_name', 'country', 'region', 'category',
      'address', 'latitude', 'longitude', 'website',
      'owner', 'founded_year', 'closed_year',
      'capacity_lpa', 'stills_count', 'water_source',
      'description', 'wikipedia_url',
    ];
    for (const f of fields) {
      if (result[f] != null && result[f] !== '' && !existing[f]) {
        patch[f] = result[f];
      }
    }
    distilleries.update(id, patch);
    distilleries.markEnrichmentStatus(id, 'enriched');

    distilleries.logEnrichment({
      distilleryId: id,
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
      distilleryId: id,
      name: existing.name,
      enriched: true,
      fieldsUpdated: Object.keys(patch),
      cost,
      durationMs,
    };
  } catch (e) {
    console.error(`[distilleries] enrich ${id} failed`, e);
    distilleries.markEnrichmentStatus(id, 'failed');
    distilleries.logEnrichment({
      distilleryId: id,
      status: 'error',
      aiRaw: { error: e.message },
      fieldsUpdated: [],
      model: MODEL,
      userSub,
    });
    return { distilleryId: id, name: existing.name, enriched: false, error: e.message };
  }
}

module.exports = function createDistilleriesRouter() {
  const router = express.Router();

  router.get('/search', (req, res) => {
    const q = (req.query.q || '').toString();
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const results = distilleries.search(q, limit);
    res.json({ query: q, count: results.length, results });
  });

  router.get('/stats', (req, res) => {
    const since = req.query.since ? parseInt(req.query.since, 10) : null;
    res.json({
      counts: distilleries.countByStatus(),
      enrichment: distilleries.getEnrichmentStats({ since }),
      model: MODEL,
    });
  });

  router.get('/', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    res.json({ results: distilleries.search('', limit) });
  });

  router.post('/', express.json({ limit: '1mb' }), (req, res) => {
    const data = req.body || {};
    if (!data.name) return res.status(400).json({ error: 'missing_name' });
    try {
      const d = distilleries.findOrCreate({ ...data, source: data.source || 'manual' }, req.user?.sub || null);
      res.json({ distillery: d });
    } catch (e) {
      console.error('[distilleries] create failed', e);
      res.status(500).json({ error: 'create_failed', message: e.message });
    }
  });

  router.get('/pending', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const items = distilleries.listPending(limit);
    res.json({
      count: items.length,
      stats: distilleries.countByStatus(),
      items,
    });
  });

  router.get('/:id(\\d+)', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const d = distilleries.getById(id);
    if (!d) return res.status(404).json({ error: 'not_found' });
    const spirits = distilleries.listSpiritsByDistillery(id);
    res.json({ distillery: d, spirits });
  });

  router.patch('/:id(\\d+)', express.json({ limit: '1mb' }), (req, res) => {
    const id = parseInt(req.params.id, 10);
    const existing = distilleries.getById(id);
    if (!existing) return res.status(404).json({ error: 'not_found' });
    try {
      const updated = distilleries.update(id, req.body || {});
      res.json({ distillery: updated });
    } catch (e) {
      res.status(500).json({ error: 'update_failed', message: e.message });
    }
  });

  router.post('/:id(\\d+)/enrich', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const existing = distilleries.getById(id);
    if (!existing) return res.status(404).json({ error: 'not_found' });

    const force = req.query.force === '1' || req.body?.force === true;
    if (existing.enrichment_status === 'enriched' && !force) {
      return res.json({ distillery: existing, skipped: true });
    }
    if (existing.enrichment_status === 'enriching') {
      return res.status(409).json({ error: 'already_enriching', distillery: existing });
    }

    const outcome = await enrichOneDistillery(existing, req.user?.sub || null);
    return res.json({ ...outcome, distillery: distilleries.getById(id) });
  });

  router.post('/enrich-pending', express.json({ limit: '64kb' }), async (req, res) => {
    const limit = Math.min(parseInt(req.body?.limit, 10) || 20, 100);
    const concurrency = Math.max(1, Math.min(parseInt(req.body?.concurrency, 10) || 4, 10));
    const items = distilleries.listPending(limit);
    if (items.length === 0) {
      return res.json({
        message: 'no_pending_distilleries',
        stats: distilleries.countByStatus(),
        results: [],
      });
    }

    const t0 = Date.now();
    const userSub = req.user?.sub || null;
    const outcomes = await runWithConcurrency(
      items,
      (d) => enrichOneDistillery(d, userSub),
      concurrency
    );

    const results = outcomes.map((o, i) =>
      o.ok ? o.value : { distilleryId: items[i].id, name: items[i].name, enriched: false, error: o.error }
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
      stats: distilleries.countByStatus(),
      results,
    });
  });

  router.get('/:id(\\d+)/history', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const history = distilleries.getEnrichmentHistory(id, parseInt(req.query.limit, 10) || 20);
    res.json({ history });
  });

  return router;
};
