/**
 * Module products — Routes Express
 * --------------------------------
 * Catalogue universel pour le POS (caisse supérette) et le scan app.
 * Monté via : app.use('/api/product', require('./modules/products/routes')())
 *
 * Routes :
 *   GET  /api/product/by-barcode/:ean   → cache → OFF → miss (ingest auto)
 *   GET  /api/product/search?q=         → recherche FTS5 + LIKE fallback
 *   GET  /api/product/category/:cat     → liste par catégorie
 *   GET  /api/product/stats             → counts par catégorie + top scans
 *   GET  /api/product/recent-scans      → journal des scans récents
 *   GET  /api/product/:id(\\d+)           → fiche par id
 *
 *   POST /api/product/confirm           → création/MAJ manuelle (saisie app ou POS)
 *   POST /api/product/:id/link-wine     → rattachement a posteriori à une fiche wine
 *   POST /api/product/:id/link-spirit   → idem pour spiritueux
 */
const express = require('express');

const storage = require('./storage');
const openfoodfacts = require('../../services/openfoodfacts');

module.exports = function createProductsRouter() {
  const router = express.Router();

  // Parser JSON local pour les POST
  const jsonParser = express.json({ limit: '1mb' });

  // Helper : extrait les infos de géoloc depuis le body/query
  function parseGeo(src = {}) {
    const num = (v) => {
      if (v == null || v === '') return null;
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : null;
    };
    const lat = num(src.lat);
    const lon = num(src.lon);
    if (lat == null || lon == null) return null;
    return {
      lat,
      lon,
      locationSource: src.locationSource || null,
      locationAccuracyM: num(src.locationAccuracyM),
      locationAt: src.locationAt ? parseInt(src.locationAt, 10) || null : null,
    };
  }

  // ─── GET /by-barcode/:ean ────────────────────────────────────────────────
  // Cascade :
  //   1) Cache products.db (source='cache')
  //   2) Open Food Facts → upsertFromOff (source='openfoodfacts')
  //   3) Miss complet
  // Loggue toujours un scan avec la géoloc si fournie en query.
  router.get('/by-barcode/:ean', async (req, res) => {
    const ean = (req.params.ean || '').toString().trim();
    if (!ean || !/^[0-9]{6,14}$/.test(ean)) {
      return res.status(400).json({ error: 'invalid_ean' });
    }

    const userSub = req.user?.sub || null;
    const geo = parseGeo(req.query || {});
    const poiId = (req.query?.poiId || null) || null;
    const deviceId = (req.query?.deviceId || null) || null;

    // Tier 1 : cache local
    const hit = storage.findByBarcode(ean);
    if (hit) {
      storage.logScan({
        productId: hit.id,
        ean,
        source: 'cache',
        userSub,
        poiId,
        deviceId,
        ...(geo || {}),
      });
      return res.json({ hit: true, source: 'cache', ean, product: hit });
    }

    // Tier 2 : OFF
    if (req.query.off !== '0') {
      try {
        const offProduct = await openfoodfacts.fetchProduct(ean);
        if (offProduct) {
          const mapped = openfoodfacts.mapToGenericProduct(offProduct, ean);
          if (mapped) {
            const product = storage.upsertFromOff(mapped, {
              userSub,
              offRaw: offProduct,
            });
            storage.logScan({
              productId: product.id,
              ean,
              source: 'openfoodfacts',
              userSub,
              poiId,
              deviceId,
              ...(geo || {}),
            });
            return res.json({
              hit: true,
              source: 'openfoodfacts',
              ean,
              product,
              attribution: '© Open Food Facts contributors (ODbL)',
            });
          }
        }
      } catch (e) {
        console.warn('[products] OFF lookup failed, fallthrough:', e.message);
      }
    }

    // Tier 3 : miss
    storage.logScan({
      productId: null,
      ean,
      source: 'miss',
      userSub,
      poiId,
      deviceId,
      ...(geo || {}),
    });
    return res.json({ hit: false, ean });
  });

  // ─── GET /search ─────────────────────────────────────────────────────────
  router.get('/search', (req, res) => {
    const q = (req.query.q || '').toString();
    const limit = parseInt(req.query.limit, 10) || 20;
    const results = storage.search(q, limit);
    res.json({ query: q, count: results.length, results });
  });

  // ─── GET /category/:cat ──────────────────────────────────────────────────
  router.get('/category/:cat', (req, res) => {
    const cat = (req.params.cat || '').toString();
    const limit = parseInt(req.query.limit, 10) || 50;
    const results = storage.listByCategory(cat, limit);
    res.json({ category: cat, count: results.length, results });
  });

  // ─── GET /stats ──────────────────────────────────────────────────────────
  router.get('/stats', (req, res) => {
    const since = req.query.since ? parseInt(req.query.since, 10) : null;
    const stats = storage.getStats({ since });
    res.json(stats);
  });

  // ─── GET /recent-scans ───────────────────────────────────────────────────
  router.get('/recent-scans', (req, res) => {
    const limit = parseInt(req.query.limit, 10) || 20;
    res.json({ scans: storage.listRecentScans(limit) });
  });

  // ─── POST /confirm ───────────────────────────────────────────────────────
  // Création/MAJ manuelle d'un produit (app mobile ou POS).
  // Body : { ean, name, brand, category_main, quantity, volume_ml, ... }
  router.post('/confirm', jsonParser, (req, res) => {
    const body = req.body || {};
    const ean = (body.ean || '').toString().trim();
    if (!ean || !/^[0-9]{6,14}$/.test(ean)) {
      return res.status(400).json({ error: 'invalid_ean' });
    }
    try {
      const userSub = req.user?.sub || null;
      // On réutilise upsertFromOff avec source='manual' : même logique de merge
      const mapped = {
        ean,
        name: body.name || null,
        name_fr: body.name_fr || null,
        brand: body.brand || null,
        brand_owner: body.brand_owner || null,
        category_main: body.category_main || 'other',
        category_tags: body.category_tags || null,
        quantity: body.quantity || null,
        volume_ml: body.volume_ml != null ? Number(body.volume_ml) : null,
        weight_g: body.weight_g != null ? Number(body.weight_g) : null,
        abv: body.abv != null ? Number(body.abv) : null,
        country_origin: body.country_origin || null,
        origins: body.origins || null,
        labels: body.labels || null,
        image_url: body.image_url || null,
        source: 'manual',
      };
      const product = storage.upsertFromOff(mapped, {
        userSub,
        wineId: body.wine_id || null,
        spiritId: body.spirit_id || null,
      });
      return res.json({ product });
    } catch (e) {
      console.error('[products] confirm failed', e);
      return res.status(500).json({ error: 'confirm_failed', message: e.message });
    }
  });

  // ─── POST /:id/link-wine ─────────────────────────────────────────────────
  router.post('/:id(\\d+)/link-wine', jsonParser, (req, res) => {
    const id = parseInt(req.params.id, 10);
    const wineId = parseInt(req.body?.wine_id, 10);
    if (!id || !wineId) return res.status(400).json({ error: 'missing_ids' });
    const product = storage.getById(id);
    if (!product) return res.status(404).json({ error: 'not_found' });
    const updated = storage.linkToWine(product.ean, wineId);
    return res.json({ product: updated });
  });

  // ─── POST /:id/link-spirit ───────────────────────────────────────────────
  router.post('/:id(\\d+)/link-spirit', jsonParser, (req, res) => {
    const id = parseInt(req.params.id, 10);
    const spiritId = parseInt(req.body?.spirit_id, 10);
    if (!id || !spiritId) return res.status(400).json({ error: 'missing_ids' });
    const product = storage.getById(id);
    if (!product) return res.status(404).json({ error: 'not_found' });
    const updated = storage.linkToSpirit(product.ean, spiritId);
    return res.json({ product: updated });
  });

  // ─── GET /:id ────────────────────────────────────────────────────────────
  router.get('/:id(\\d+)', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const product = storage.getById(id);
    if (!product) return res.status(404).json({ error: 'not_found' });
    res.json({ product });
  });

  return router;
};
