/**
 * Module wines — Routes Express
 * -----------------------------
 * Monté via : app.use('/api/wine', require('./modules/wines/routes')(deps))
 *
 * Routes :
 *   POST /api/wine/scan      → upload photo + identification Claude Vision
 *   POST /api/wine/confirm   → confirme une fiche (crée le vin en base)
 *   GET  /api/wine/:id       → récupère une fiche
 *   GET  /api/wine/search?q= → recherche textuelle
 *   GET  /api/wine/          → liste (les plus récents)
 */
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = require('./storage');
const producers = require('./producers');
const productsStorage = require('../products/storage');
const { identifyWine, MODEL } = require('./claude');
const { computeCost } = require('./pricing');
const openfoodfacts = require('../../services/openfoodfacts');

// Cross-routing scan photo : si Claude Vision détecte que c'est en réalité
// un spiritueux, on relance identifySpirit sur la même photo, on copie
// la photo dans spirits/uploads, et on renvoie une réponse compatible
// SpiritScanResponse (status, suggestion, photo) pour que le frontend
// bascule sur l'onglet Spiritueux et affiche la fiche "Métier" riche
// avec bouton "Ajouter à mon bar" (confirmSpirit).
const spiritsStorage = require('../spirits/storage');
const { identifySpirit, MODEL: SPIRIT_MODEL } = require('../spirits/claude');

module.exports = function createWinesRouter() {
  const router = express.Router();

  // ─── Upload config (photos bouteilles) ────────────────────────────────────
  // Claude Vision accepte max ~5 Mo base64 → on limite le upload raw à 4.5 Mo
  // pour rester safe (base64 = +33%).
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
    limits: { fileSize: 8 * 1024 * 1024 }, // 8 Mo (raw, avant refus applicatif)
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

    // 1) Persist la photo en base (pas encore liée à un vin)
    const photo = storage.savePhoto({ filename, uploadedBy: userSub });

    // 2) Vérification de taille avant Claude (5 Mo base64 max côté API)
    if (req.file.size > MAX_CLAUDE_IMAGE_BYTES) {
      console.warn(`[wines] image trop grande : ${req.file.size} bytes`);
      return res.status(413).json({
        error: 'image_too_large',
        message: `Image trop volumineuse pour Claude Vision (${(req.file.size / 1024 / 1024).toFixed(1)} Mo). Maximum : ${(MAX_CLAUDE_IMAGE_BYTES / 1024 / 1024).toFixed(1)} Mo. Retente avec une photo plus petite.`,
        photo,
        sizeBytes: req.file.size,
        maxBytes: MAX_CLAUDE_IMAGE_BYTES,
      });
    }

    // 3) Appel Claude Vision
    let identification = null;
    let error = null;
    try {
      identification = await identifyWine(absPath, req.file.mimetype);
    } catch (e) {
      console.error('[wines] identifyWine failed', e);
      error = e.message || 'identification_failed';
    }

    // 3) Calcul du coût
    const cost = identification?.usage
      ? computeCost(identification.usage, MODEL)
      : null;

    // 4) Géolocalisation (optionnelle, multipart form fields)
    const parseNum = (v) => {
      if (v == null || v === '') return null;
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : null;
    };
    const geo = {
      lat: parseNum(req.body?.lat),
      lon: parseNum(req.body?.lon),
      locationSource: req.body?.locationSource || null, // 'gps' | 'exif'
      locationAccuracyM: parseNum(req.body?.locationAccuracyM),
      locationAt: req.body?.locationAt ? parseInt(req.body.locationAt, 10) || null : null,
    };

    // 5) Log du scan
    const aiStatus = identification?.result?.status
      || (error ? 'error' : 'unknown');
    storage.logScan({
      photoId: photo.id,
      aiRaw: identification ? { result: identification.result, rawText: identification.rawText, parseError: identification.parseError, usage: identification.usage } : { error },
      aiStatus,
      matchedWineId: null,
      userSub,
      durationMs: identification?.durationMs || null,
      model: MODEL,
      inputTokens: cost?.inputTokens || null,
      outputTokens: cost?.outputTokens || null,
      costUsd: cost?.costUsd || null,
      ...geo,
    });

    if (error) {
      return res.status(500).json({
        error: 'ai_error',
        message: error,
        photo,
      });
    }

    // ── Cross-routing selon detected_category ─────────────────────────────
    const result = identification.result || {};
    const detectedCategory = result.detected_category || 'wine';
    const observed = result.observed || null;
    const ean = (req.body?.ean || '').toString().trim() || null;

    // CAS 1 : Claude voit un spiritueux → relance identifySpirit sur la même
    // photo et renvoie une SpiritScanResponse pour que le front affiche la
    // fiche "Métier" riche sur l'onglet Spiritueux (confirmation explicite
    // via confirmSpirit lors du tap "Ajouter à mon bar").
    if (detectedCategory === 'spirit') {
      try {
        const spiritId = await identifySpirit(absPath, req.file.mimetype);
        const spiritCost = spiritId?.usage ? computeCost(spiritId.usage, SPIRIT_MODEL) : null;
        const spiritResult = spiritId?.result || {};
        const spiritStatus = spiritResult.status || 'unknown';

        if ((spiritStatus === 'identified' || spiritStatus === 'partial') && spiritResult.name) {
          // Copie la photo vers spirits/uploads et la persiste dans spirits DB
          // pour que confirmSpirit puisse la lier à la fiche créée.
          let spiritPhoto = null;
          try {
            const spiritsPhotosDir = spiritsStorage.getPhotosDir();
            const destPath = path.join(spiritsPhotosDir, filename);
            fs.copyFileSync(absPath, destPath);
            spiritPhoto = spiritsStorage.savePhoto({ filename, uploadedBy: userSub });
          } catch (e) {
            console.warn('[wines→spirit] photo copy failed:', e.message);
          }

          return res.json({
            redirectedTo: 'spirit',
            status: spiritStatus,
            suggestion: spiritResult,
            photo: spiritPhoto,
            model: SPIRIT_MODEL,
            durationMs: spiritId.durationMs,
            cost: spiritCost,
            costBreakdown: { wineDetect: cost, spiritIdentify: spiritCost },
            observed,
            location: geo.lat != null && geo.lon != null ? geo : null,
          });
        }
        console.warn('[wines→spirit] identifySpirit status:', spiritStatus);
      } catch (e) {
        console.warn('[wines→spirit] cross-retry failed:', e.message);
      }
    }

    // CAS 2 : vin → flow normal (suggestion à confirmer côté frontend)
    if (detectedCategory === 'wine') {
      return res.json({
        status: result.status || 'unknown',
        suggestion: result || null,
        photo,
        parseError: identification.parseError || null,
        model: MODEL,
        durationMs: identification.durationMs,
        cost,
        observed,
        location: geo.lat != null && geo.lon != null ? geo : null,
      });
    }

    // CAS 3 : ni vin ni spiritueux (bière, soda, eau, food, other…)
    // → on ne crée pas de fiche. Juste on log l'EAN dans products.db si fourni
    //   (trace "un user a été intéressé par cet EAN"), et on renvoie un
    //   écran neutre avec la description Claude.
    if (ean) {
      try {
        productsStorage.upsertFromOff(
          {
            ean,
            category_main: detectedCategory || 'other',
            source: 'scan-interest-wine',
          },
          { userSub }
        );
      } catch (e) {
        console.warn('[wines] products interest log failed:', e.message);
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
  // Body : { wine: {...}, photoId?: number, primary?: boolean, ean?: string, barcodeFormat?: string }
  router.post('/confirm', express.json({ limit: '1mb' }), (req, res) => {
    const { wine, photoId, primary, ean, barcodeFormat } = req.body || {};
    if (!wine || typeof wine !== 'object') {
      return res.status(400).json({ error: 'missing_wine' });
    }
    try {
      const userSub = req.user?.sub || null;

      // 1) Auto-création / récupération du producteur (si Claude l'a identifié)
      let producerRow = null;
      if (wine.producer) {
        producerRow = producers.findOrCreate(
          {
            name: wine.producer,
            country: wine.country || null,
            region: wine.region || null,
            appellation_main: wine.appellation || null,
            source: 'scan',
          },
          userSub
        );
      }

      // 2) Insert du vin avec producer_id
      const inserted = storage.insertWine(
        {
          ...wine,
          producer_id: producerRow?.id || null,
          source: wine.source || 'scan',
        },
        userSub
      );

      if (photoId) {
        storage.linkPhotoToWine(photoId, inserted.id, primary ? 1 : 1);
      }

      // 3) Si un EAN est fourni à la confirmation, on l'associe au vin
      //    (alimente le cache "code-barres → vin" pour les scans suivants)
      let barcodeResult = null;
      if (ean) {
        barcodeResult = storage.upsertBarcode({
          ean,
          wineId: inserted.id,
          format: barcodeFormat || null,
          userSub,
        });
      }

      return res.json({
        wine: storage.getWineById(inserted.id),
        photos: storage.getWinePhotos(inserted.id),
        producer: producerRow || null,
        barcode: barcodeResult,
      });
    } catch (e) {
      console.error('[wines] confirm failed', e);
      return res.status(500).json({ error: 'insert_failed', message: e.message });
    }
  });

  // ─── GET /by-barcode/:ean ────────────────────────────────────────────────
  // Cascade 3 tiers :
  //   1) Cache local wine_barcodes → fiche complète (source='cache', gratuit)
  //   2) Open Food Facts → suggestion à confirmer (source='openfoodfacts', gratuit)
  //   3) Miss → le front propose photo étiquette (Claude Vision, payant)
  router.get('/by-barcode/:ean', async (req, res) => {
    const ean = (req.params.ean || '').toString().trim();
    if (!ean || !/^[0-9]{6,14}$/.test(ean)) {
      return res.status(400).json({ error: 'invalid_ean' });
    }

    // Tier 1 : cache local
    const hit = storage.findWineByBarcode(ean);
    if (hit) {
      const producer = hit.wine.producer_id
        ? producers.getById(hit.wine.producer_id)
        : null;
      return res.json({
        hit: true,
        source: 'cache',
        ean,
        wine: hit.wine,
        photos: hit.photos,
        producer,
        barcode: hit.barcode,
      });
    }

    // Tier 2 : Open Food Facts (désactivable via ?off=0)
    if (req.query.off !== '0') {
      try {
        const product = await openfoodfacts.fetchProduct(ean);
        if (product) {
          // Auto-ingest dans la table pivot products (catalogue universel POS)
          // — on stocke TOUJOURS, même si ce n'est pas un vin.
          try {
            const mapped = openfoodfacts.mapToGenericProduct(product, ean);
            if (mapped) {
              productsStorage.upsertFromOff(mapped, {
                userSub: req.user?.sub || null,
                offRaw: product,
              });
            }
          } catch (e) {
            console.warn('[wines] products auto-ingest failed:', e.message);
          }

          const suggestion = openfoodfacts.mapToWineSuggestion(product);
          if (suggestion) {
            return res.json({
              hit: true,
              source: 'openfoodfacts',
              ean,
              suggestion,
              attribution: '© Open Food Facts contributors (ODbL)',
            });
          }
        }
      } catch (e) {
        console.warn('[wines] OFF lookup failed, fallthrough:', e.message);
      }
    }

    // Tier 3 : miss complet
    return res.json({ hit: false, ean });
  });

  // ─── GET /search ──────────────────────────────────────────────────────────
  router.get('/search', (req, res) => {
    const q = (req.query.q || '').toString();
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const results = storage.searchWines(q, limit);
    res.json({ query: q, count: results.length, results });
  });

  // ─── GET / (liste récente) ────────────────────────────────────────────────
  router.get('/', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const results = storage.searchWines('', limit);
    res.json({ count: results.length, results });
  });

  // ─── GET /:id ─────────────────────────────────────────────────────────────
  router.get('/:id(\\d+)', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const wine = storage.getWineById(id);
    if (!wine) return res.status(404).json({ error: 'not_found' });
    const photos = storage.getWinePhotos(id);
    const producer = wine.producer_id ? producers.getById(wine.producer_id) : null;
    res.json({ wine, photos, producer });
  });

  return router;
};
