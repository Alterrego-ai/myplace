/**
 * Module wines — Routes producteurs
 * -----------------------------------
 * Monté via : app.use('/api/producer', require('./modules/wines/producer-routes')())
 *
 * Routes :
 *   GET  /api/producer           → liste (récents)
 *   GET  /api/producer/search?q= → recherche FTS
 *   GET  /api/producer/:id       → fiche + vins liés
 *   POST /api/producer           → création manuelle
 *   PATCH /api/producer/:id      → édition manuelle
 *   POST /api/producer/:id/enrich → lance l'enrichissement via Claude
 */
const express = require('express');
const producers = require('./producers');
const { enrichProducer } = require('./claude');

module.exports = function createProducersRouter() {
  const router = express.Router();

  // ─── GET /search ──────────────────────────────────────────────────────────
  router.get('/search', (req, res) => {
    const q = (req.query.q || '').toString();
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const results = producers.search(q, limit);
    res.json({ query: q, count: results.length, results });
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

  // ─── POST /:id/enrich ─────────────────────────────────────────────────────
  // Lance l'enrichissement Claude sur la fiche producteur.
  // Idempotent : si déjà "enriched", on retourne la fiche telle quelle sauf ?force=1.
  router.post('/:id/enrich', async (req, res) => {
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

    producers.markEnrichmentStatus(id, 'enriching');
    try {
      const { result, rawText, parseError, durationMs } = await enrichProducer({
        name: existing.name,
        region: existing.region,
        country: existing.country,
        appellation_main: existing.appellation_main,
      });

      if (!result || result.status === 'unknown' || parseError) {
        producers.markEnrichmentStatus(id, 'failed');
        return res.status(200).json({
          producer: producers.getById(id),
          enriched: false,
          reason: parseError || result?.reason || 'unknown',
          durationMs,
        });
      }

      // Patch : on ne remplace PAS les champs déjà remplis manuellement
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

      res.json({
        producer: producers.getById(id),
        enriched: true,
        fieldsUpdated: Object.keys(patch),
        durationMs,
      });
    } catch (e) {
      console.error('[producers] enrich failed', e);
      producers.markEnrichmentStatus(id, 'failed');
      res.status(500).json({ error: 'enrich_failed', message: e.message });
    }
  });

  return router;
};
