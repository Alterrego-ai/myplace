/**
 * Client Open Food Facts — tier 2 du lookup code-barres.
 * ---------------------------------------------------------
 * Appel HTTP gratuit, sans clé, documenté ici :
 *   https://openfoodfacts.github.io/api-documentation/
 *
 * Flow :
 *   1) Cache local wine_barcodes / spirit_barcodes → hit direct
 *   2) Open Food Facts → hit "suggestion" (fiche à confirmer)
 *   3) Claude Vision sur photo étiquette → dernier recours
 *
 * Licence des données : ODbL. Toute app qui redistribue ces données
 * doit créditer "© Open Food Facts contributors" quelque part.
 */

const OFF_API_BASE = 'https://world.openfoodfacts.org/api/v2/product';
const USER_AGENT = 'SaufImprevu - myPlace/1.0 (contact@sauf-imprevu.fr)';
const DEFAULT_TIMEOUT_MS = 2500;

/**
 * Récupère un produit OFF par EAN. Retourne null si absent, timeout ou erreur.
 * @param {string} ean
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<object|null>} produit brut OFF ou null
 */
async function fetchProduct(ean, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!ean || !/^[0-9]{6,14}$/.test(ean)) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `${OFF_API_BASE}/${encodeURIComponent(ean)}.json?fields=product_name,product_name_fr,brands,brand_owner,categories_tags,countries_tags,countries,quantity,image_front_url,image_url,labels_tags,alcohol_by_volume_value,nutriments,ingredients_text,origins,manufacturing_places`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.status !== 1 || !data.product) return null;
    return data.product;
  } catch (e) {
    if (e.name !== 'AbortError') {
      console.warn('[openfoodfacts] fetch failed:', e.message);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Helpers de parsing ─────────────────────────────────────────────────────

function parseVolumeMl(quantity) {
  if (!quantity) return null;
  const str = String(quantity).toLowerCase().replace(/\s+/g, '');
  // "75cl" | "750ml" | "0,7l" | "0.7l"
  let m = str.match(/([\d.,]+)\s*cl/);
  if (m) return Math.round(parseFloat(m[1].replace(',', '.')) * 10);
  m = str.match(/([\d.,]+)\s*ml/);
  if (m) return Math.round(parseFloat(m[1].replace(',', '.')));
  m = str.match(/([\d.,]+)\s*l\b/);
  if (m) return Math.round(parseFloat(m[1].replace(',', '.')) * 1000);
  return null;
}

function parseAbv(product) {
  if (product.alcohol_by_volume_value != null) {
    const v = parseFloat(product.alcohol_by_volume_value);
    return Number.isFinite(v) ? v : null;
  }
  const n = product.nutriments?.alcohol_value ?? product.nutriments?.['alcohol_100g'];
  if (n != null) {
    const v = parseFloat(n);
    return Number.isFinite(v) ? v : null;
  }
  return null;
}

function firstCountry(product) {
  if (product.countries) {
    const list = String(product.countries).split(',').map((s) => s.trim()).filter(Boolean);
    if (list.length > 0) return list[0];
  }
  if (Array.isArray(product.countries_tags) && product.countries_tags.length > 0) {
    return product.countries_tags[0].replace(/^en:/, '').replace(/-/g, ' ');
  }
  return null;
}

/** Extrait le nom lisible à partir de product_name / product_name_fr. */
function bestName(product) {
  return (
    product.product_name_fr ||
    product.product_name ||
    null
  );
}

/** Regarde les tags de catégorie pour deviner le type (vin rouge, whisky, rhum…). */
function inferWineType(categoriesTags = []) {
  const tags = categoriesTags.map((t) => String(t).toLowerCase());
  if (tags.some((t) => /red-wine|vin-rouge/.test(t))) return 'rouge';
  if (tags.some((t) => /white-wine|vin-blanc/.test(t))) return 'blanc';
  if (tags.some((t) => /rose-wine|vin-rose/.test(t))) return 'rosé';
  if (tags.some((t) => /sparkling|effervescent|champagne/.test(t))) return 'effervescent';
  if (tags.some((t) => /sweet-wine|vin-doux/.test(t))) return 'doux';
  if (tags.some((t) => /fortified|vin-fortifie/.test(t))) return 'fortifié';
  if (tags.some((t) => /\bwine\b|\bvin\b|\bwines\b|\bvins\b/.test(t))) return null; // vin générique
  return null;
}

function isWineCategory(categoriesTags = []) {
  const tags = categoriesTags.map((t) => String(t).toLowerCase());
  return tags.some((t) => /\b(wine|vin|wines|vins|champagne|sparkling-wine)\b/.test(t));
}

function inferSpiritType(categoriesTags = []) {
  const tags = categoriesTags.map((t) => String(t).toLowerCase());
  if (tags.some((t) => /whisk(e)?y|bourbon|scotch/.test(t))) return 'whisky';
  if (tags.some((t) => /\brum\b|\brhum\b|\brums\b|\brhums\b/.test(t))) return 'rhum';
  if (tags.some((t) => /cognac/.test(t))) return 'cognac';
  if (tags.some((t) => /armagnac/.test(t))) return 'armagnac';
  if (tags.some((t) => /\bgin\b|\bgins\b/.test(t))) return 'gin';
  if (tags.some((t) => /vodka/.test(t))) return 'vodka';
  if (tags.some((t) => /tequila/.test(t))) return 'tequila';
  if (tags.some((t) => /mezcal/.test(t))) return 'mezcal';
  if (tags.some((t) => /liqueur|liqueurs/.test(t))) return 'liqueur';
  if (tags.some((t) => /eau-de-vie|eaux-de-vie/.test(t))) return 'eau-de-vie';
  return null;
}

function isSpiritCategory(categoriesTags = []) {
  const tags = categoriesTags.map((t) => String(t).toLowerCase());
  return tags.some((t) =>
    /\b(spirit|spirits|whisk|bourbon|scotch|rum|rhum|cognac|armagnac|gin|vodka|tequila|mezcal|liqueur|eau-de-vie)\b/.test(t)
  );
}

// ─── Mapping OFF → WineSuggestion ──────────────────────────────────────────

/**
 * Transforme un produit OFF en WineSuggestion (même shape que Claude output).
 * Retourne null si le produit n'est manifestement pas un vin.
 */
function mapToWineSuggestion(product) {
  if (!product) return null;
  const categories = product.categories_tags || [];
  if (!isWineCategory(categories)) return null;

  const name = bestName(product);
  if (!name) return null;

  return {
    status: 'partial',
    name,
    producer: product.brands || product.brand_owner || null,
    appellation: null,
    region: product.origins || product.manufacturing_places || null,
    country: firstCountry(product),
    vintage: null,
    type: inferWineType(categories),
    color: null,
    grapes: [],
    alcohol: parseAbv(product),
    volume_ml: parseVolumeMl(product.quantity),
    tasting_notes: null,
    food_pairings: [],
    aging_potential: null,
    service_temp: null,
    avg_price_eur: null,
    confidence: 0.6,
    source: 'openfoodfacts',
    off_image_url: product.image_front_url || product.image_url || null,
  };
}

// ─── Mapping OFF → SpiritSuggestion ────────────────────────────────────────

function mapToSpiritSuggestion(product) {
  if (!product) return null;
  const categories = product.categories_tags || [];
  if (!isSpiritCategory(categories)) return null;

  const name = bestName(product);
  if (!name) return null;

  return {
    status: 'partial',
    name,
    distillery: product.brands || product.brand_owner || null,
    bottler: null,
    type: inferSpiritType(categories),
    subtype: null,
    age: null,
    cask_type: null,
    cask_finish: null,
    distillation_year: null,
    bottling_year: null,
    abv: parseAbv(product),
    volume_ml: parseVolumeMl(product.quantity),
    cask_strength: false,
    chill_filtered: null,
    natural_color: null,
    batch_number: null,
    bottle_number: null,
    country: firstCountry(product),
    region: product.origins || product.manufacturing_places || null,
    tasting_notes: null,
    food_pairings: [],
    serving: null,
    avg_price_eur: null,
    confidence: 0.6,
    source: 'openfoodfacts',
    off_image_url: product.image_front_url || product.image_url || null,
  };
}

module.exports = {
  fetchProduct,
  mapToWineSuggestion,
  mapToSpiritSuggestion,
  // exportés pour tests / debug
  _internals: { parseVolumeMl, parseAbv, firstCountry, bestName, inferWineType, inferSpiritType, isWineCategory, isSpiritCategory },
};
