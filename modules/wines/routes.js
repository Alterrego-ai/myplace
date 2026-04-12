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

// Admin check — même logique que server.js (ADMIN_EMAILS env var)
const _ADMIN_RULES = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
function _isAdminEmail(email) {
  if (!email) return _ADMIN_RULES.length === 0;
  const lower = email.toLowerCase();
  return _ADMIN_RULES.some(rule => rule.startsWith('@') ? lower.endsWith(rule) : lower === rule);
}
const { identifyWine, identifyWineMulti, MODEL } = require('./claude');
const { computeCost } = require('./pricing');
const openfoodfacts = require('../../services/openfoodfacts');

// Cross-routing scan photo : si Claude Vision détecte que c'est en réalité
// un spiritueux, on relance identifySpirit sur la même photo, on insère
// automatiquement dans spirits.db (base de connaissance), et on renvoie
// une réponse compatible SpiritScanResponse pour que le frontend bascule
// sur l'onglet Spiritueux et affiche la fiche "Métier" riche avec bouton
// "Ajouter à mon bar" (qui crée une entrée user_bar).
const spiritsStorage = require('../spirits/storage');
const spiritsDistilleries = require('../spirits/distilleries');
const { identifySpirit, MODEL: SPIRIT_MODEL } = require('../spirits/claude');

// Helper : auto-insert d'un vin dans wines.db (base de connaissance) à partir
// du résultat Claude, avec dedup (findWineByIdentity). Crée / récupère aussi
// le producer. Lie la photo au vin si photoId fourni. Retourne la fiche
// wine complète (hydratée).
function autoInsertWineFromScan({ result, photoId, userSub, source = 'scan' }) {
  if (!result || !result.name) return null;
  try {
    const existing = storage.findWineByIdentity({
      name: result.name,
      producer: result.producer,
      vintage: result.vintage,
    });
    if (existing) {
      // On lie quand même la nouvelle photo à la fiche existante (plusieurs
      // users peuvent contribuer une photo à une même cuvée).
      if (photoId) {
        try { storage.linkPhotoToWine(photoId, existing.id, 0); } catch {}
      }
      return { wine: existing, created: false };
    }
    let producerRow = null;
    if (result.producer) {
      producerRow = producers.findOrCreate(
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
    const inserted = storage.insertWine(
      { ...result, producer_id: producerRow?.id || null, source },
      userSub
    );
    if (photoId) {
      try { storage.linkPhotoToWine(photoId, inserted.id, 1); } catch {}
    }
    return { wine: storage.getWineById(inserted.id), created: true };
  } catch (e) {
    console.error('[wines] autoInsertWineFromScan failed:', e.message);
    return null;
  }
}

// Helper : auto-insert d'un spiritueux depuis le module wines (cross-routing).
// Dedup, création distillerie, insert dans spirits.db, liaison photo.
function autoInsertSpiritFromScan({ result, photoId, userSub, source = 'scan-cross-wine' }) {
  if (!result || !result.name) return null;
  try {
    const existing = spiritsStorage.findSpiritByIdentity({
      name: result.name,
      distillery: result.distillery,
      age: result.age,
    });
    if (existing) {
      if (photoId) {
        try { spiritsStorage.linkPhotoToSpirit(photoId, existing.id, 0); } catch {}
      }
      return { spirit: existing, created: false };
    }
    let distilleryRow = null;
    if (result.distillery) {
      distilleryRow = spiritsDistilleries.findOrCreate(
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
    const inserted = spiritsStorage.insertSpirit(
      { ...result, distillery_id: distilleryRow?.id || null, source },
      userSub
    );
    if (photoId) {
      try { spiritsStorage.linkPhotoToSpirit(photoId, inserted.id, 1); } catch {}
    }
    return { spirit: spiritsStorage.getSpiritById(inserted.id), created: true };
  } catch (e) {
    console.error('[wines→spirit] autoInsertSpiritFromScan failed:', e.message);
    return null;
  }
}

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
    // photo, auto-insert dans spirits.db (base de connaissance) et renvoie
    // une SpiritScanResponse pour que le front bascule sur l'onglet Spiritueux
    // et affiche la fiche "Métier" riche (bouton "Ajouter à mon bar" → user_bar).
    if (detectedCategory === 'spirit') {
      try {
        const spiritId = await identifySpirit(absPath, req.file.mimetype);
        const spiritCost = spiritId?.usage ? computeCost(spiritId.usage, SPIRIT_MODEL) : null;
        const spiritResult = spiritId?.result || {};
        const spiritStatus = spiritResult.status || 'unknown';

        if ((spiritStatus === 'identified' || spiritStatus === 'partial') && spiritResult.name) {
          // Copie la photo vers spirits/uploads et la persiste dans spirits DB
          let spiritPhoto = null;
          try {
            const spiritsPhotosDir = spiritsStorage.getPhotosDir();
            const destPath = path.join(spiritsPhotosDir, filename);
            fs.copyFileSync(absPath, destPath);
            spiritPhoto = spiritsStorage.savePhoto({ filename, uploadedBy: userSub });
          } catch (e) {
            console.warn('[wines→spirit] photo copy failed:', e.message);
          }

          // Auto-insert dans spirits.db (base de connaissance)
          const autoSpirit = autoInsertSpiritFromScan({
            result: spiritResult,
            photoId: spiritPhoto?.id || null,
            userSub,
            source: 'scan-cross-wine',
          });

          // Si un EAN est fourni, on peut l'associer au spiritueux créé
          if (ean && autoSpirit?.spirit) {
            try {
              spiritsStorage.upsertBarcode({
                ean,
                spiritId: autoSpirit.spirit.id,
                format: req.body?.barcodeFormat || null,
                userSub,
              });
              productsStorage.linkToSpirit(ean, autoSpirit.spirit.id);
            } catch (e) {
              console.warn('[wines→spirit] barcode link failed:', e.message);
            }
          }

          return res.json({
            redirectedTo: 'spirit',
            status: spiritStatus,
            suggestion: spiritResult,
            spirit: autoSpirit?.spirit || null,
            autoCreated: autoSpirit?.created || false,
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

    // CAS 2 : vin → auto-insert dans wines.db (base de connaissance) et
    // renvoie la fiche créée. Le front affiche la fiche "Métier" riche
    // et le bouton "Ajouter à ma cave" crée une entrée user_cellar.
    if (detectedCategory === 'wine') {
      let autoWine = null;
      if ((result.status === 'identified' || result.status === 'partial') && result.name) {
        autoWine = autoInsertWineFromScan({
          result,
          photoId: photo?.id || null,
          userSub,
          source: 'scan',
        });

        // Si un EAN est fourni, on l'associe au vin créé
        if (ean && autoWine?.wine) {
          try {
            storage.upsertBarcode({
              ean,
              wineId: autoWine.wine.id,
              format: req.body?.barcodeFormat || null,
              userSub,
            });
            productsStorage.linkToWine(ean, autoWine.wine.id);
          } catch (e) {
            console.warn('[wines] barcode link failed:', e.message);
          }
        }
      }

      return res.json({
        status: result.status || 'unknown',
        suggestion: result || null,
        wine: autoWine?.wine || null,
        autoCreated: autoWine?.created || false,
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

  // ─── POST /scan-multi ──────────────────────────────────────────────────────
  // Scan multi-bouteilles : identifie toutes les bouteilles visibles sur une photo.
  // Réservé super-admin (user_role === 'super_admin') ou contrôlé par fair use.
  router.post('/scan-multi', upload.single('photo'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'missing_photo', message: 'Aucune image reçue.' });
    }
    const userSub = req.user?.sub || req.body?.user || null;
    const filename = req.file.filename;
    const absPath = path.join(storage.getPhotosDir(), filename);

    // Fair use : TODO activer quand auth réelle en place
    // Pour l'instant ouvert à tous (POC)
    // const userRole = req.user?.role || req.body?.role || null;
    // const isSuperAdmin = userRole === 'super_admin';
    // if (!isSuperAdmin) {
    //   return res.status(403).json({ error: 'fair_use', message: 'Réservé aux administrateurs.' });
    // }

    // Persist photo
    const photo = storage.savePhoto({ filename, uploadedBy: userSub });

    if (req.file.size > MAX_CLAUDE_IMAGE_BYTES) {
      return res.status(413).json({
        error: 'image_too_large',
        message: `Image trop volumineuse (${(req.file.size / 1024 / 1024).toFixed(1)} Mo). Max : ${(MAX_CLAUDE_IMAGE_BYTES / 1024 / 1024).toFixed(1)} Mo.`,
        photo,
      });
    }

    // Appel Claude Vision multi
    let identification = null;
    try {
      identification = await identifyWineMulti(absPath, req.file.mimetype);
    } catch (e) {
      console.error('[wines] identifyWineMulti failed', e);
      return res.status(500).json({ error: 'ai_error', message: e.message, photo });
    }

    const cost = identification?.usage ? computeCost(identification.usage, MODEL) : null;
    const result = identification.result || {};
    const bottleCount = result.bottle_count || 0;
    const bottles = Array.isArray(result.bottles) ? result.bottles : [];

    // Géolocalisation
    const parseNum = (v) => { if (v == null || v === '') return null; const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
    const geo = {
      lat: parseNum(req.body?.lat),
      lon: parseNum(req.body?.lon),
      locationSource: req.body?.locationSource || null,
      locationAccuracyM: parseNum(req.body?.locationAccuracyM),
    };

    // Log
    storage.logScan({
      photoId: photo.id,
      aiRaw: { result, rawText: identification.rawText, parseError: identification.parseError, usage: identification.usage },
      aiStatus: `multi-${bottleCount}`,
      matchedWineId: null,
      userSub,
      durationMs: identification.durationMs,
      model: MODEL,
      inputTokens: cost?.inputTokens || null,
      outputTokens: cost?.outputTokens || null,
      costUsd: cost?.costUsd || null,
      ...geo,
    });

    // Auto-insert chaque bouteille (vin OU spiritueux) dans la base de connaissance
    const results = bottles.map((bottle, idx) => {
      const detCat = bottle.detected_category || 'wine';
      const isIdentified = (bottle.status === 'identified' || bottle.status === 'partial') && bottle.name;

      if (detCat === 'wine' && isIdentified) {
        const autoWine = autoInsertWineFromScan({
          result: bottle,
          photoId: photo?.id || null,
          userSub,
          source: 'scan-multi',
        });
        return { index: idx, status: bottle.status, detected_category: detCat, suggestion: bottle, wine: autoWine?.wine || null, spirit: null, autoCreated: autoWine?.created || false };
      }

      if (detCat === 'spirit' && isIdentified) {
        const autoSpirit = autoInsertSpiritFromScan({
          result: bottle,
          photoId: null, // photo wine, pas dupliquée dans spirits
          userSub,
          source: 'scan-multi',
        });
        return { index: idx, status: bottle.status, detected_category: detCat, suggestion: bottle, wine: null, spirit: autoSpirit?.spirit || null, autoCreated: autoSpirit?.created || false };
      }

      return { index: idx, status: bottle.status || 'unknown', detected_category: detCat, observed: bottle.observed, suggestion: bottle, wine: null, spirit: null, autoCreated: false };
    });

    return res.json({
      bottle_count: bottleCount,
      more_visible: result.more_visible || false,
      results,
      photo,
      parseError: identification.parseError || null,
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

  // ─── GET /source-stats ────────────────────────────────────────────────────
  // Diagnostic : breakdown de la colonne `source` dans la table wines.
  // Utilisé pour débugger les imports en masse (dédup par source).
  router.get('/source-stats', (req, res) => {
    try {
      const out = storage.getSourceStats();
      res.json(out);
    } catch (e) {
      res.status(500).json({ error: 'source_stats_failed', message: e.message });
    }
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

  // ─── POST /bulk-import ────────────────────────────────────────────────────
  // Import idempotent d'un lot de vins dans la base de connaissance.
  // Body : { wines: [{name, producer, appellation, region, country, vintage,
  //                   color, type, grapes, avg_price_eur, source?}, ...],
  //          dryRun?: bool, source?: string }
  // Dedup via findWineByIdentity(name, producer, vintage). Auto-création du
  // producer via producers.findOrCreate. Retourne un rapport détaillé.
  router.post('/bulk-import', express.json({ limit: '4mb' }), (req, res) => {
    const { wines, dryRun = false, source = 'bulk-import', replace = false } =
      req.body || {};
    if (!Array.isArray(wines) || wines.length === 0) {
      return res.status(400).json({ error: 'missing_wines_array' });
    }
    if (wines.length > 2000) {
      return res.status(400).json({ error: 'batch_too_large', max: 2000 });
    }
    const userSub = req.user?.sub || null;

    // replace=true → purge tous les vins existants avec ce source avant insert.
    // Utile pour ré-importer un parser corrigé qui a déjà laissé du garbage.
    let purged = 0;
    if (replace && !dryRun) {
      try {
        const r = storage.deleteWinesBySource(source);
        purged = r.deleted;
        console.log(`[wines] bulk-import replace=true purged ${purged} rows (source=${source})`);
      } catch (e) {
        return res.status(500).json({ error: 'purge_failed', message: e.message });
      }
    }

    const report = {
      total: wines.length,
      inserted: 0,
      skipped: 0,
      failed: 0,
      purged,
      dryRun: !!dryRun,
      details: [],
    };

    const runOne = (raw, idx) => {
      if (!raw || !raw.name) {
        report.failed += 1;
        report.details.push({ idx, status: 'failed', reason: 'missing_name' });
        return;
      }
      try {
        const existing = storage.findWineByIdentity({
          name: raw.name,
          producer: raw.producer,
          vintage: raw.vintage,
        });
        if (existing) {
          report.skipped += 1;
          report.details.push({
            idx,
            status: 'skipped',
            wine_id: existing.id,
            name: existing.name,
            producer: existing.producer,
            vintage: existing.vintage,
          });
          return;
        }
        if (dryRun) {
          report.inserted += 1;
          report.details.push({
            idx,
            status: 'would_insert',
            name: raw.name,
            producer: raw.producer || null,
            vintage: raw.vintage || null,
          });
          return;
        }
        let producerRow = null;
        if (raw.producer) {
          producerRow = producers.findOrCreate(
            {
              name: raw.producer,
              country: raw.country || null,
              region: raw.region || null,
              appellation_main: raw.appellation || null,
              source,
            },
            userSub
          );
        }
        const inserted = storage.insertWine(
          { ...raw, producer_id: producerRow?.id || null, source: raw.source || source },
          userSub
        );
        report.inserted += 1;
        report.details.push({
          idx,
          status: 'inserted',
          wine_id: inserted.id,
          name: inserted.name,
          producer: inserted.producer,
          vintage: inserted.vintage,
          producer_id: producerRow?.id || null,
        });
      } catch (e) {
        report.failed += 1;
        report.details.push({ idx, status: 'failed', reason: e.message, name: raw.name });
        console.error('[wines] bulk-import row failed', idx, e.message);
      }
    };

    try {
      if (dryRun) {
        wines.forEach(runOne);
      } else {
        // Transaction pour atomicité et perf
        const tx = storage.getDb().transaction((list) => {
          list.forEach(runOne);
        });
        tx(wines);
      }
      return res.json(report);
    } catch (e) {
      console.error('[wines] bulk-import failed', e);
      return res.status(500).json({ error: 'bulk_import_failed', message: e.message, report });
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
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 500);
    const results = storage.searchWines('', limit);
    res.json({ count: results.length, results });
  });

  // ─── Ma Cave (user_cellar) ─────────────────────────────────────────────────
  // POST /api/wine/cellar   → ajoute (ou incrémente) une entrée
  // GET  /api/wine/cellar   → liste les bouteilles en cave du user
  // DELETE /api/wine/cellar/:id → marque comme consommée
  router.post('/cellar', express.json({ limit: '256kb' }), (req, res) => {
    // POC : fallback sur un user 'anonymous' si non authentifié.
    // L'app Expo n'est pas encore câblée sur l'auth, donc on accepte
    // les scans anonymes qui alimentent un bucket partagé.
    const userSub = req.user?.sub || req.body?.user || 'anonymous';
    const {
      wine_id, quantity, acquired_at, acquired_price_eur,
      location, notes, photo_id, force_new,
    } = req.body || {};
    if (!wine_id) return res.status(400).json({ error: 'missing_wine_id' });
    try {
      const result = storage.addToCellar({
        userSub,
        wineId: parseInt(wine_id, 10),
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
      console.error('[wines] addToCellar failed', e);
      return res.status(500).json({ error: 'insert_failed', message: e.message });
    }
  });

  router.get('/cellar', (req, res) => {
    const userSub = req.user?.sub || req.query?.user || 'anonymous';
    const isAdmin = _isAdminEmail(req.user?.email);
    const status = (req.query.status || 'stock').toString();
    const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);
    const items = storage.listUserCellar(userSub, { status, limit, allUsers: isAdmin });
    const count = storage.countUserCellar(userSub, { allUsers: isAdmin });
    res.json({ items, count });
  });

  router.delete('/cellar/:id(\\d+)', (req, res) => {
    const userSub = req.user?.sub || req.query?.user || 'anonymous';
    const isAdmin = _isAdminEmail(req.user?.email);
    const cellarId = parseInt(req.params.id, 10);
    const result = storage.removeFromCellar(cellarId, userSub, { allUsers: isAdmin });
    if (!result?.updated) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
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

  // ─── POST /cellar/migrate-anonymous — Transfère les données anonymes vers l'user authentifié
  router.post('/cellar/migrate-anonymous', express.json(), (req, res) => {
    const userSub = req.user?.sub;
    if (!userSub || userSub === 'anonymous') {
      return res.status(401).json({ error: 'auth_required', message: 'Token Bearer requis' });
    }
    try {
      const db = storage.getDb();
      const cellarResult = db.prepare(
        `UPDATE user_cellar SET user_sub = ? WHERE user_sub = 'anonymous'`
      ).run(userSub);
      const scanResult = db.prepare(
        `UPDATE wine_scans SET user_sub = ? WHERE user_sub = 'anonymous' OR user_sub IS NULL`
      ).run(userSub);
      res.json({
        ok: true,
        migrated: {
          cellar_entries: cellarResult.changes,
          scans: scanResult.changes,
        },
      });
    } catch (e) {
      console.error('[wines] migrate-anonymous failed', e);
      res.status(500).json({ error: 'migration_failed', message: e.message });
    }
  });

  return router;
};
