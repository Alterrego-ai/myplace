/**
 * Module spirits — Routes Express
 * --------------------------------
 * Monté via : app.use('/api/spirit', require('./modules/spirits/routes')(deps))
 *
 * Routes :
 *   POST /api/spirit/scan             → upload photo + identification Claude Vision
 *   POST /api/spirit/confirm          → confirme une fiche (crée le spiritueux en base)
 *   GET  /api/spirit/by-barcode/:ean  → cache gratuit EAN → fiche
 *   GET  /api/spirit/stats            → stats scans + tokens
 *   GET  /api/spirit/search?q=        → recherche textuelle
 *   GET  /api/spirit/                 → liste récente
 *   GET  /api/spirit/:id              → fiche + photos + distillerie
 */
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = require('./storage');
const distilleries = require('./distilleries');
const productsStorage = require('../products/storage');
const { identifySpirit, MODEL } = require('./claude');
const { computeCost } = require('../wines/pricing'); // réutilise le helper tokens/coût
const openfoodfacts = require('../../services/openfoodfacts');

// Cross-routing scan photo : si Claude Vision détecte que c'est en réalité
// un vin, on relance identifyWine sur la même photo, on auto-insert dans
// wines.db (base de connaissance), et on renvoie une réponse compatible
// ScanResponse pour que le frontend bascule sur l'onglet Vin et affiche
// la fiche "Métier" riche avec bouton "Ajouter à ma cave" (user_cellar).
const winesStorage = require('../wines/storage');
const winesProducers = require('../wines/producers');
const { identifyWine, MODEL: WINE_MODEL } = require('../wines/claude');

// Helper : auto-insert d'un spiritueux dans spirits.db (base de connaissance)
// à partir du résultat Claude, avec dedup (findSpiritByIdentity). Crée /
// récupère aussi la distillerie. Lie la photo si photoId fourni. Retourne
// la fiche spirit complète (hydratée).
function autoInsertSpiritFromScan({ result, photoId, userSub, source = 'scan' }) {
  if (!result || !result.name) return null;
  try {
    const existing = storage.findSpiritByIdentity({
      name: result.name,
      distillery: result.distillery,
      age: result.age,
    });
    if (existing) {
      if (photoId) {
        try { storage.linkPhotoToSpirit(photoId, existing.id, 0); } catch {}
      }
      return { spirit: existing, created: false };
    }
    let distilleryRow = null;
    if (result.distillery) {
      distilleryRow = distilleries.findOrCreate(
        {
          name: result.distillery,
          country: result.country || null,
          region: result.region || null,
          category: result.type || null,
          source,
        },
        userSub
      );
    }
    const inserted = storage.insertSpirit(
      { ...result, distillery_id: distilleryRow?.id || null, source },
      userSub
    );
    if (photoId) {
      try { storage.linkPhotoToSpirit(photoId, inserted.id, 1); } catch {}
    }
    return { spirit: storage.getSpiritById(inserted.id), created: true };
  } catch (e) {
    console.error('[spirits] autoInsertSpiritFromScan failed:', e.message);
    return null;
  }
}

// Helper : auto-insert d'un vin depuis le module spirits (cross-routing).
// Dedup, création producer, insert dans wines.db, liaison photo.
function autoInsertWineFromScan({ result, photoId, userSub, source = 'scan-cross-spirit' }) {
  if (!result || !result.name) return null;
  try {
    const existing = winesStorage.findWineByIdentity({
      name: result.name,
      producer: result.producer,
      vintage: result.vintage,
    });
    if (existing) {
      if (photoId) {
        try { winesStorage.linkPhotoToWine(photoId, existing.id, 0); } catch {}
      }
      return { wine: existing, created: false };
    }
    let producerRow = null;
    if (result.producer) {
      producerRow = winesProducers.findOrCreate(
        {
          name: result.producer,
          country: result.country || null,
          region: result.region || null,
          appellation_main: result.appellation || null,
          source,
        },
        userSub
      );
    }
    const inserted = winesStorage.insertWine(
      { ...result, producer_id: producerRow?.id || null, source },
      userSub
    );
    if (photoId) {
      try { winesStorage.linkPhotoToWine(photoId, inserted.id, 1); } catch {}
    }
    return { wine: winesStorage.getWineById(inserted.id), created: true };
  } catch (e) {
    console.error('[spirits→wine] autoInsertWineFromScan failed:', e.message);
    return null;
  }
}

module.exports = function createSpiritsRouter() {
  const router = express.Router();

  const MAX_CLAUDE_IMAGE_BYTES = 4.5 * 1024 * 1024;
  const diskStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, storage.getPhotosDir()),
    filename: (_req, file, cb) => {
      const safe = (file.originalname || 'photo').replace(/\s+/g, '_').replace(/[^\w.\-]/g, '');
      cb(null, `${Date.now()}-${safe}`);
    },
  });
  const upload = multer({
    storage: diskStorage,
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (/^image\//.test(file.mimetype)) return cb(null, true);
      cb(new Error('Only image files allowed'));
    },
  });

  // ─── POST /scan ───────────────────────────────────────────────────────────
  router.post('/scan', upload.single('photo'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'missing_photo', message: 'Aucune image reçue.' });
    }
    const userSub = req.user?.sub || req.body?.user || null;
    const filename = req.file.filename;
    const absPath = path.join(storage.getPhotosDir(), filename);

    const photo = storage.savePhoto({ filename, uploadedBy: userSub });

    if (req.file.size > MAX_CLAUDE_IMAGE_BYTES) {
      console.warn(`[spirits] image trop grande : ${req.file.size} bytes`);
      return res.status(413).json({
        error: 'image_too_large',
        message: `Image trop volumineuse pour Claude Vision (${(req.file.size / 1024 / 1024).toFixed(1)} Mo). Maximum : ${(MAX_CLAUDE_IMAGE_BYTES / 1024 / 1024).toFixed(1)} Mo.`,
        photo,
        sizeBytes: req.file.size,
        maxBytes: MAX_CLAUDE_IMAGE_BYTES,
      });
    }

    let identification = null;
    let error = null;
    try {
      identification = await identifySpirit(absPath, req.file.mimetype);
    } catch (e) {
      console.error('[spirits] identifySpirit failed', e);
      error = e.message || 'identification_failed';
    }

    const cost = identification?.usage
      ? computeCost(identification.usage, MODEL)
      : null;

    // Géolocalisation
    const parseNum = (v) => {
      if (v == null || v === '') return null;
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : null;
    };
    const geo = {
      lat: parseNum(req.body?.lat),
      lon: parseNum(req.body?.lon),
      locationSource: req.body?.locationSource || null,
      locationAccuracyM: parseNum(req.body?.locationAccuracyM),
      locationAt: req.body?.locationAt ? parseInt(req.body.locationAt, 10) || null : null,
    };

    const aiStatus = identification?.result?.status || (error ? 'error' : 'unknown');
    storage.logScan({
      photoId: photo.id,
      aiRaw: identification
        ? { result: identification.result, rawText: identification.rawText, parseError: identification.parseError, usage: identification.usage }
        : { error },
      aiStatus,
      matchedSpiritId: null,
      userSub,
      durationMs: identification?.durationMs || null,
      model: MODEL,
      inputTokens: cost?.inputTokens || null,
      outputTokens: cost?.outputTokens || null,
      costUsd: cost?.costUsd || null,
      ...geo,
    });

    if (error) {
      return res.status(500).json({ error: 'ai_error', message: error, photo });
    }

    // ── Cross-routing selon detected_category ─────────────────────────────
    const result = identification.result || {};
    const detectedCategory = result.detected_category || 'spirit';
    const observed = result.observed || null;
    const ean = (req.body?.ean || '').toString().trim() || null;

    // CAS 1 : Claude voit un vin → relance identifyWine sur la même photo,
    // auto-insert dans wines.db (base de connaissance) et renvoie une
    // ScanResponse pour que le front bascule sur l'onglet Vin et affiche la
    // fiche "Métier" riche (bouton "Ajouter à ma cave" → user_cellar).
    if (detectedCategory === 'wine') {
      try {
        const wineId = await identifyWine(absPath, req.file.mimetype);
        const wineCost = wineId?.usage ? computeCost(wineId.usage, WINE_MODEL) : null;
        const wineResult = wineId?.result || {};
        const wineStatus = wineResult.status || 'unknown';

        if ((wineStatus === 'identified' || wineStatus === 'partial') && wineResult.name) {
          // Copie la photo vers wines/uploads et la persiste dans wines DB
          let winePhoto = null;
          try {
            const winesPhotosDir = winesStorage.getPhotosDir();
            const destPath = path.join(winesPhotosDir, filename);
            fs.copyFileSync(absPath, destPath);
            winePhoto = winesStorage.savePhoto({ filename, uploadedBy: userSub });
          } catch (e) {
            console.warn('[spirit→wine] photo copy failed:', e.message);
          }

          // Auto-insert dans wines.db (base de connaissance)
          const autoWine = autoInsertWineFromScan({
            result: wineResult,
            photoId: winePhoto?.id || null,
            userSub,
            source: 'scan-cross-spirit',
          });

          // EAN : associe au vin créé
          if (ean && autoWine?.wine) {
            try {
              winesStorage.upsertBarcode({
                ean,
                wineId: autoWine.wine.id,
                format: req.body?.barcodeFormat || null,
                userSub,
              });
              productsStorage.linkToWine(ean, autoWine.wine.id);
            } catch (e) {
              console.warn('[spirit→wine] barcode link failed:', e.message);
            }
          }

          return res.json({
            redirectedTo: 'wine',
            status: wineStatus,
            suggestion: wineResult,
            wine: autoWine?.wine || null,
            autoCreated: autoWine?.created || false,
            photo: winePhoto,
            model: WINE_MODEL,
            durationMs: wineId.durationMs,
            cost: wineCost,
            costBreakdown: { spiritDetect: cost, wineIdentify: wineCost },
            observed,
            location: geo.lat != null && geo.lon != null ? geo : null,
          });
        }
        console.warn('[spirit→wine] identifyWine status:', wineStatus);
      } catch (e) {
        console.warn('[spirit→wine] cross-retry failed:', e.message);
      }
    }

    // CAS 2 : spiritueux → auto-insert dans spirits.db (base de connaissance)
    // et renvoie la fiche créée. Le front affiche la fiche "Métier" riche et
    // le bouton "Ajouter à mon bar" crée une entrée user_bar.
    if (detectedCategory === 'spirit') {
      let autoSpirit = null;
      if ((result.status === 'identified' || result.status === 'partial') && result.name) {
        autoSpirit = autoInsertSpiritFromScan({
          result,
          photoId: photo?.id || null,
          userSub,
          source: 'scan',
        });

        // EAN : associe au spiritueux créé
        if (ean && autoSpirit?.spirit) {
          try {
            storage.upsertBarcode({
              ean,
              spiritId: autoSpirit.spirit.id,
              format: req.body?.barcodeFormat || null,
              userSub,
            });
            productsStorage.linkToSpirit(ean, autoSpirit.spirit.id);
          } catch (e) {
            console.warn('[spirits] barcode link failed:', e.message);
          }
        }
      }

      return res.json({
        status: result.status || 'unknown',
        suggestion: result || null,
        spirit: autoSpirit?.spirit || null,
        autoCreated: autoSpirit?.created || false,
        photo,
        parseError: identification.parseError || null,
        model: MODEL,
        durationMs: identification.durationMs,
        cost,
        observed,
        location: geo.lat != null && geo.lon != null ? geo : null,
      });
    }

    // CAS 3 : ni vin ni spiritueux → trace EAN seul, écran neutre
    if (ean) {
      try {
        productsStorage.upsertFromOff(
          {
            ean,
            category_main: detectedCategory || 'other',
            source: 'scan-interest-spirit',
          },
          { userSub }
        );
      } catch (e) {
        console.warn('[spirits] products interest log failed:', e.message);
      }
    }

    return res.json({
      status: 'observed',
      detected_category: detectedCategory,
      observed,
      reason: result.reason || null,
      photo,
      model: MODEL,
      durationMs: identification.durationMs,
      cost,
      location: geo.lat != null && geo.lon != null ? geo : null,
    });
  });

  // ─── GET /stats ───────────────────────────────────────────────────────────
  router.get('/stats', (req, res) => {
    const since = req.query.since ? parseInt(req.query.since, 10) : null;
    const stats = storage.getScanStats({ since });
    const recent = storage.listRecentScans(parseInt(req.query.limit, 10) || 20);
    res.json({ stats, recent, model: MODEL });
  });

  // ─── POST /confirm ────────────────────────────────────────────────────────
  router.post('/confirm', express.json({ limit: '1mb' }), (req, res) => {
    const { spirit, photoId, primary, ean, barcodeFormat } = req.body || {};
    if (!spirit || typeof spirit !== 'object') {
      return res.status(400).json({ error: 'missing_spirit' });
    }
    try {
      const userSub = req.user?.sub || null;

      // 1) Distillerie auto-créée / récupérée si Claude l'a identifiée
      let distilleryRow = null;
      if (spirit.distillery) {
        distilleryRow = distilleries.findOrCreate(
          {
            name: spirit.distillery,
            country: spirit.country || null,
            region: spirit.region || null,
            category: spirit.type || null,
            source: 'scan',
          },
          userSub
        );
      }

      // 2) Insert du spiritueux avec distillery_id
      const inserted = storage.insertSpirit(
        {
          ...spirit,
          distillery_id: distilleryRow?.id || null,
          source: spirit.source || 'scan',
        },
        userSub
      );

      if (photoId) {
        storage.linkPhotoToSpirit(photoId, inserted.id, primary ? 1 : 1);
      }

      let barcodeResult = null;
      if (ean) {
        barcodeResult = storage.upsertBarcode({
          ean,
          spiritId: inserted.id,
          format: barcodeFormat || null,
          userSub,
        });
      }

      return res.json({
        spirit: storage.getSpiritById(inserted.id),
        photos: storage.getSpiritPhotos(inserted.id),
        distillery: distilleryRow || null,
        barcode: barcodeResult,
      });
    } catch (e) {
      console.error('[spirits] confirm failed', e);
      return res.status(500).json({ error: 'insert_failed', message: e.message });
    }
  });

  // ─── GET /by-barcode/:ean ────────────────────────────────────────────────
  // Cascade 3 tiers :
  //   1) Cache local spirit_barcodes → fiche complète (source='cache', gratuit)
  //   2) Open Food Facts → suggestion à confirmer (source='openfoodfacts', gratuit)
  //   3) Miss → le front propose photo étiquette (Claude Vision, payant)
  router.get('/by-barcode/:ean', async (req, res) => {
    const ean = (req.params.ean || '').toString().trim();
    if (!ean || !/^[0-9]{6,14}$/.test(ean)) {
      return res.status(400).json({ error: 'invalid_ean' });
    }

    // Tier 1 : cache local
    const hit = storage.findSpiritByBarcode(ean);
    if (hit) {
      const distillery = hit.spirit.distillery_id
        ? distilleries.getById(hit.spirit.distillery_id)
        : null;
      return res.json({
        hit: true,
        source: 'cache',
        ean,
        spirit: hit.spirit,
        photos: hit.photos,
        distillery,
        barcode: hit.barcode,
      });
    }

    // Tier 2 : Open Food Facts (désactivable via ?off=0)
    if (req.query.off !== '0') {
      try {
        const product = await openfoodfacts.fetchProduct(ean);
        if (product) {
          // Auto-ingest dans la table pivot products (catalogue universel POS)
          // — on stocke TOUJOURS, même si ce n'est pas un spiritueux.
          try {
            const mapped = openfoodfacts.mapToGenericProduct(product, ean);
            if (mapped) {
              productsStorage.upsertFromOff(mapped, {
                userSub: req.user?.sub || null,
                offRaw: product,
              });
            }
          } catch (e) {
            console.warn('[spirits] products auto-ingest failed:', e.message);
          }

          const suggestion = openfoodfacts.mapToSpiritSuggestion(product);
          if (suggestion) {
            // Auto-promotion silencieuse : OFF nous a donné un spiritueux
            // reconnu, on l'insère direct comme si l'utilisateur avait
            // confirmé la fiche. Prochain scan = cache hit natif.
            try {
              let distilleryRow = null;
              if (suggestion.distillery) {
                distilleryRow = distilleries.findOrCreate(
                  {
                    name: suggestion.distillery,
                    country: suggestion.country || null,
                    region: suggestion.region || null,
                    category: suggestion.type || null,
                    source: 'openfoodfacts',
                  },
                  req.user?.sub || null
                );
              }
              const inserted = storage.insertSpirit(
                {
                  ...suggestion,
                  distillery_id: distilleryRow?.id || null,
                  source: 'openfoodfacts',
                },
                req.user?.sub || null
              );
              const barcode = storage.upsertBarcode({
                ean,
                spiritId: inserted.id,
                format: null,
                userSub: req.user?.sub || null,
              });
              // Lien croisé products.spirit_id pour le back-office
              try { productsStorage.linkToSpirit(ean, inserted.id); } catch {}
              return res.json({
                hit: true,
                source: 'cache',
                ean,
                spirit: storage.getSpiritById(inserted.id),
                photos: storage.getSpiritPhotos(inserted.id),
                distillery: distilleryRow || null,
                barcode,
                attribution: '© Open Food Facts contributors (ODbL)',
                autoPromoted: true,
              });
            } catch (e) {
              console.warn('[spirits] auto-promotion OFF failed, fallback suggestion:', e.message);
              return res.json({
                hit: true,
                source: 'openfoodfacts',
                ean,
                suggestion,
                attribution: '© Open Food Facts contributors (ODbL)',
              });
            }
          }
        }
      } catch (e) {
        console.warn('[spirits] OFF lookup failed, fallthrough:', e.message);
      }
    }

    // Tier 3 : miss complet
    return res.json({ hit: false, ean });
  });

  // ─── GET /search ──────────────────────────────────────────────────────────
  router.get('/search', (req, res) => {
    const q = (req.query.q || '').toString();
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const results = storage.searchSpirits(q, limit);
    res.json({ query: q, count: results.length, results });
  });

  // ─── GET / (liste récente) ────────────────────────────────────────────────
  router.get('/', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const results = storage.searchSpirits('', limit);
    res.json({ count: results.length, results });
  });

  // ─── Mon Bar (user_bar) ────────────────────────────────────────────────────
  // POST /api/spirit/bar   → ajoute (ou incrémente) une entrée
  // GET  /api/spirit/bar   → liste les bouteilles au bar du user
  // DELETE /api/spirit/bar/:id → marque comme consommée
  router.post('/bar', express.json({ limit: '256kb' }), (req, res) => {
    // POC : fallback sur un user 'anonymous' si non authentifié.
    const userSub = req.user?.sub || req.body?.user || 'anonymous';
    const {
      spirit_id, quantity, acquired_at, acquired_price_eur,
      location, notes, photo_id, force_new,
    } = req.body || {};
    if (!spirit_id) return res.status(400).json({ error: 'missing_spirit_id' });
    try {
      const result = storage.addToBar({
        userSub,
        spiritId: parseInt(spirit_id, 10),
        quantity: parseInt(quantity, 10) || 1,
        acquiredAt: acquired_at || null,
        acquiredPriceEur: acquired_price_eur != null ? parseFloat(acquired_price_eur) : null,
        location: location || null,
        notes: notes || null,
        photoId: photo_id || null,
        forceNew: !!force_new,
      });
      return res.json({ ok: true, ...result });
    } catch (e) {
      console.error('[spirits] addToBar failed', e);
      return res.status(500).json({ error: 'insert_failed', message: e.message });
    }
  });

  router.get('/bar', (req, res) => {
    const userSub = req.user?.sub || req.query?.user || 'anonymous';
    const status = (req.query.status || 'stock').toString();
    const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);
    const items = storage.listUserBar(userSub, { status, limit });
    const count = storage.countUserBar(userSub);
    res.json({ items, count });
  });

  router.delete('/bar/:id(\\d+)', (req, res) => {
    const userSub = req.user?.sub || req.query?.user || 'anonymous';
    const barId = parseInt(req.params.id, 10);
    const result = storage.removeFromBar(barId, userSub);
    if (!result?.updated) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
  });

  // ─── GET /:id ─────────────────────────────────────────────────────────────
  router.get('/:id(\\d+)', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const spirit = storage.getSpiritById(id);
    if (!spirit) return res.status(404).json({ error: 'not_found' });
    const photos = storage.getSpiritPhotos(id);
    const distillery = spirit.distillery_id ? distilleries.getById(spirit.distillery_id) : null;
    res.json({ spirit, photos, distillery });
  });

  // ─── POST /bar/migrate-anonymous — Transfère les données anonymes vers l'user authentifié
  router.post('/bar/migrate-anonymous', express.json(), (req, res) => {
    const userSub = req.user?.sub;
    if (!userSub || userSub === 'anonymous') {
      return res.status(401).json({ error: 'auth_required', message: 'Token Bearer requis' });
    }
    try {
      const db = storage.getDb();
      const barResult = db.prepare(
        `UPDATE user_bar SET user_sub = ? WHERE user_sub = 'anonymous'`
      ).run(userSub);
      const scanResult = db.prepare(
        `UPDATE spirit_scans SET user_sub = ? WHERE user_sub = 'anonymous' OR user_sub IS NULL`
      ).run(userSub);
      res.json({
        ok: true,
        migrated: {
          bar_entries: barResult.changes,
          scans: scanResult.changes,
        },
      });
    } catch (e) {
      console.error('[spirits] migrate-anonymous failed', e);
      res.status(500).json({ error: 'migration_failed', message: e.message });
    }
  });

  return router;
};
