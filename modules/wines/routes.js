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
const { identifyWine, MODEL } = require('./claude');

module.exports = function createWinesRouter() {
  const router = express.Router();

  // ─── Upload config (photos bouteilles) ────────────────────────────────────
  const diskStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, storage.getPhotosDir()),
    filename: (_req, file, cb) => {
      const safe = (file.originalname || 'photo').replace(/\s+/g, '_').replace(/[^\w.\-]/g, '');
      cb(null, `${Date.now()}-${safe}`);
    },
  });
  const upload = multer({
    storage: diskStorage,
    limits: { fileSize: 8 * 1024 * 1024 }, // 8 Mo
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

    // 2) Appel Claude Vision
    let identification = null;
    let error = null;
    try {
      identification = await identifyWine(absPath, req.file.mimetype);
    } catch (e) {
      console.error('[wines] identifyWine failed', e);
      error = e.message || 'identification_failed';
    }

    // 3) Log du scan
    const aiStatus = identification?.result?.status
      || (error ? 'error' : 'unknown');
    storage.logScan({
      photoId: photo.id,
      aiRaw: identification ? { result: identification.result, rawText: identification.rawText, parseError: identification.parseError, usage: identification.usage } : { error },
      aiStatus,
      matchedWineId: null,
      userSub,
      durationMs: identification?.durationMs || null,
    });

    if (error) {
      return res.status(500).json({
        error: 'ai_error',
        message: error,
        photo,
      });
    }

    return res.json({
      status: identification.result?.status || 'unknown',
      suggestion: identification.result || null,
      photo,
      parseError: identification.parseError || null,
      model: MODEL,
      durationMs: identification.durationMs,
    });
  });

  // ─── POST /confirm ────────────────────────────────────────────────────────
  // Body : { wine: {...}, photoId?: number, primary?: boolean }
  router.post('/confirm', express.json({ limit: '1mb' }), (req, res) => {
    const { wine, photoId, primary } = req.body || {};
    if (!wine || typeof wine !== 'object') {
      return res.status(400).json({ error: 'missing_wine' });
    }
    try {
      const userSub = req.user?.sub || null;
      const inserted = storage.insertWine({ ...wine, source: wine.source || 'scan' }, userSub);
      if (photoId) {
        storage.linkPhotoToWine(photoId, inserted.id, primary ? 1 : 1);
      }
      return res.json({ wine: storage.getWineById(inserted.id), photos: storage.getWinePhotos(inserted.id) });
    } catch (e) {
      console.error('[wines] confirm failed', e);
      return res.status(500).json({ error: 'insert_failed', message: e.message });
    }
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
    res.json({ wine, photos });
  });

  return router;
};
