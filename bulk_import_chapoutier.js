#!/usr/bin/env node
/**
 * Bulk import Chapoutier/Trenel wines into the knowledge base.
 *
 * Usage:
 *   node bulk_import_chapoutier.js --dry-run   # Simulation (no insert)
 *   node bulk_import_chapoutier.js             # Real import
 *   node bulk_import_chapoutier.js --url=https://... --token=...
 *
 * Reads chapoutier_wines.json (from the regex parser), expands multi-vintage
 * entries into one wine per vintage, and POSTs them to /api/wine/bulk-import
 * in batches. The backend dedupes via findWineByIdentity so re-runs are safe.
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
// --replace : purge le "source" côté backend avant le 1er batch (via replace=true).
// Utile quand le parser a été corrigé et qu'on veut nuker l'ancien lot.
const REPLACE = args.includes('--replace');
const BASE_URL =
  args.find((a) => a.startsWith('--url='))?.slice(6) ||
  process.env.MYPLACE_URL ||
  'http://localhost:3000';
const TOKEN =
  args.find((a) => a.startsWith('--token='))?.slice(8) || process.env.MYPLACE_TOKEN || '';
const SRC =
  args.find((a) => a.startsWith('--src='))?.slice(6) || 'chapoutier_wines.json';
const BATCH_SIZE = 100;

const SECTION_TO_PRODUCER = {
  // Gammes M. Chapoutier → producer = M. Chapoutier
  'FAC&SPERA': 'M. Chapoutier',
  'EXCELLENCE': 'M. Chapoutier',
  'TRADITION': 'M. Chapoutier',
  'ALCHIMIE': 'M. Chapoutier',
  'SPÉCIALITÉS': 'M. Chapoutier',
  'MARIUS': 'M. Chapoutier',
  'GAMME DES CHEFS': 'M. Chapoutier',
  'BELLERUCHE': 'M. Chapoutier',
  // Marques tierces distribuées
  'BILA-HAUT': 'Bila-Haut',
  'STENOPE': 'Sténopé',
  'LAUGHTON': 'Laughton',
  'TRENEL': 'Trenel',
};

function resolveProducer(w) {
  if (w.producer && w.producer !== 'null') return w.producer;
  return SECTION_TO_PRODUCER[w.section] || 'M. Chapoutier';
}

function colorToType(color) {
  if (!color) return null;
  const c = color.toLowerCase();
  if (c.includes('rouge')) return 'rouge';
  if (c.includes('blanc')) return 'blanc';
  if (c.includes('ros')) return 'rosé';
  if (c.includes('eff') || c.includes('peti')) return 'effervescent';
  return c;
}

function buildName(w) {
  // Nom = cuvée si elle existe, sinon appellation
  const cuvee = (w.cuvee || '').trim();
  if (cuvee) return cuvee;
  return w.appellation || 'Vin sans nom';
}

function expand(wines) {
  const out = [];
  for (const w of wines) {
    const vintages = Array.isArray(w.vintages) && w.vintages.length > 0 ? w.vintages : [null];
    for (const v of vintages) {
      out.push({
        name: buildName(w),
        producer: resolveProducer(w),
        appellation: w.appellation || null,
        region: null,
        country: 'France',
        vintage: v,
        type: colorToType(w.color),
        color: w.color || null,
        avg_price_eur: w.ref_price_eur_ht || null,
        source: 'chapoutier-tarif-2026',
      });
    }
  }
  return out;
}

async function postBatch(batch, replaceFirst = false) {
  const res = await fetch(`${BASE_URL}/api/wine/bulk-import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: JSON.stringify({
      wines: batch,
      dryRun: DRY_RUN,
      source: 'chapoutier-tarif-2026',
      replace: replaceFirst,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

(async () => {
  const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  const expanded = expand(raw);
  console.log(`[chapoutier] source=${SRC}`);
  console.log(`[chapoutier] raw entries: ${raw.length}`);
  console.log(`[chapoutier] expanded (1 row per vintage): ${expanded.length}`);
  console.log(`[chapoutier] mode: ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}`);
  console.log(`[chapoutier] target: ${BASE_URL}`);
  console.log('');

  const total = { total: 0, inserted: 0, skipped: 0, failed: 0 };
  const failures = [];
  const skipped = [];

  let totalPurged = 0;
  for (let i = 0; i < expanded.length; i += BATCH_SIZE) {
    const batch = expanded.slice(i, i + BATCH_SIZE);
    const isFirst = i === 0;
    process.stdout.write(
      `  batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(expanded.length / BATCH_SIZE)} (${batch.length})${isFirst && REPLACE ? ' [REPLACE]' : ''} ... `
    );
    try {
      const r = await postBatch(batch, isFirst && REPLACE);
      if (r.purged) totalPurged += r.purged;
      total.total += r.total || 0;
      total.inserted += r.inserted || 0;
      total.skipped += r.skipped || 0;
      total.failed += r.failed || 0;
      for (const d of r.details || []) {
        if (d.status === 'failed') failures.push(d);
        if (d.status === 'skipped') skipped.push(d);
      }
      console.log(`ok (${r.inserted}↑ ${r.skipped}= ${r.failed}✗)`);
    } catch (e) {
      console.log(`FAIL: ${e.message}`);
      total.failed += batch.length;
    }
  }

  console.log('');
  console.log('─── Rapport final ──────────────────────');
  if (REPLACE) console.log(`  Purgés avant insert    : ${totalPurged}`);
  console.log(`  Total soumis : ${total.total}`);
  console.log(`  ${DRY_RUN ? 'Would insert' : 'Inserés     '} : ${total.inserted}`);
  console.log(`  Skippés (déjà en base) : ${total.skipped}`);
  console.log(`  Échecs                 : ${total.failed}`);

  if (failures.length > 0) {
    console.log('');
    console.log(`Échecs (${failures.length}) :`);
    failures.slice(0, 20).forEach((f) => {
      console.log(`  - [${f.idx}] ${f.name || '?'} :: ${f.reason}`);
    });
    if (failures.length > 20) console.log(`  ... +${failures.length - 20}`);
  }

  // Dump détail pour audit
  const outPath = DRY_RUN ? 'chapoutier_dryrun_report.json' : 'chapoutier_import_report.json';
  fs.writeFileSync(
    outPath,
    JSON.stringify({ total, failures, skipped: skipped.slice(0, 50) }, null, 2)
  );
  console.log('');
  console.log(`Rapport détaillé → ${outPath}`);
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
