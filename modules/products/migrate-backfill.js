/**
 * Migration one-shot : backfill products.db depuis wine_barcodes + spirit_barcodes.
 * -----------------------------------------------------------------------------
 * But : pour chaque EAN déjà connu dans les caches historiques wines/spirits,
 * créer la ligne correspondante dans la table pivot products avec wine_id /
 * spirit_id déjà positionné, category_main, source='backfill'.
 *
 * Usage :
 *   node modules/products/migrate-backfill.js
 *   DB_DIR=./data node modules/products/migrate-backfill.js
 *
 * Idempotent : on utilise upsertFromOff qui COALESCE — un deuxième run
 * n'écrase rien et met juste à jour last_seen_at / scan_count.
 */
const path = require('path');
const Database = require('better-sqlite3');

const productsStorage = require('./storage');

const DB_DIR = process.env.DB_DIR || path.join(__dirname, '..', '..', 'data');

function openReadOnly(file) {
  const full = path.join(DB_DIR, file);
  try {
    return new Database(full, { readonly: true, fileMustExist: true });
  } catch (e) {
    console.warn(`[migrate] ${file} introuvable (${e.message}) — skip`);
    return null;
  }
}

function now() {
  return Date.now();
}

function backfillWines() {
  const db = openReadOnly('wines.db');
  if (!db) return { scanned: 0, inserted: 0 };

  const rows = db.prepare(`
    SELECT b.ean, b.format, b.first_seen, b.last_seen, b.scan_count, b.created_by,
           w.id AS wine_id, w.name, w.producer, w.country, w.region,
           w.volume_ml, w.alcohol
    FROM wine_barcodes b
    JOIN wines w ON w.id = b.wine_id
  `).all();

  let inserted = 0;
  for (const r of rows) {
    const mapped = {
      ean: String(r.ean),
      name: r.name || null,
      name_fr: null,
      brand: r.producer || null,
      brand_owner: null,
      category_main: 'wine',
      category_tags: ['en:wines'],
      quantity: r.volume_ml ? `${r.volume_ml}ml` : null,
      volume_ml: r.volume_ml || null,
      weight_g: null,
      abv: r.alcohol || null,
      country_origin: r.country || null,
      origins: r.region || null,
      labels: null,
      image_url: null,
      source: 'backfill',
    };
    try {
      productsStorage.upsertFromOff(mapped, {
        userSub: r.created_by || null,
        wineId: r.wine_id,
      });
      inserted += 1;
    } catch (e) {
      console.warn(`[migrate][wines] ${r.ean} failed: ${e.message}`);
    }
  }
  db.close();
  return { scanned: rows.length, inserted };
}

function backfillSpirits() {
  const db = openReadOnly('spirits.db');
  if (!db) return { scanned: 0, inserted: 0 };

  const rows = db.prepare(`
    SELECT b.ean, b.format, b.first_seen, b.last_seen, b.scan_count, b.created_by,
           s.id AS spirit_id, s.name, s.distillery, s.country, s.region,
           s.volume_ml, s.abv, s.type
    FROM spirit_barcodes b
    JOIN spirits s ON s.id = b.spirit_id
  `).all();

  let inserted = 0;
  for (const r of rows) {
    const mapped = {
      ean: String(r.ean),
      name: r.name || null,
      name_fr: null,
      brand: r.distillery || null,
      brand_owner: null,
      category_main: 'spirit',
      category_tags: r.type ? [`en:${r.type}`] : ['en:spirits'],
      quantity: r.volume_ml ? `${r.volume_ml}ml` : null,
      volume_ml: r.volume_ml || null,
      weight_g: null,
      abv: r.abv || null,
      country_origin: r.country || null,
      origins: r.region || null,
      labels: null,
      image_url: null,
      source: 'backfill',
    };
    try {
      productsStorage.upsertFromOff(mapped, {
        userSub: r.created_by || null,
        spiritId: r.spirit_id,
      });
      inserted += 1;
    } catch (e) {
      console.warn(`[migrate][spirits] ${r.ean} failed: ${e.message}`);
    }
  }
  db.close();
  return { scanned: rows.length, inserted };
}

function main() {
  console.log(`[migrate] DB_DIR = ${DB_DIR}`);
  productsStorage.init({ dbDir: DB_DIR });

  const t0 = now();
  const wines = backfillWines();
  const spirits = backfillSpirits();
  const dt = now() - t0;

  console.log('─'.repeat(60));
  console.log(`[migrate] wines   : ${wines.inserted}/${wines.scanned} upsertés`);
  console.log(`[migrate] spirits : ${spirits.inserted}/${spirits.scanned} upsertés`);
  console.log(`[migrate] durée   : ${dt}ms`);
  console.log('─'.repeat(60));
  console.log('[migrate] ✓ backfill terminé');
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error('[migrate] échec :', e);
    process.exit(1);
  }
}

module.exports = { backfillWines, backfillSpirits };
