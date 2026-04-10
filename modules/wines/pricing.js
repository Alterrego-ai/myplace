/**
 * Module wines — Pricing helper
 * ------------------------------
 * Calcul du coût d'un appel Claude à partir de l'objet `usage` retourné par l'API.
 * Les tarifs sont en USD par million de tokens (source : docs.claude.com / pricing).
 *
 * On stocke en USD (source de vérité) + on expose EUR via FX_USD_EUR.
 */

// Prix par million de tokens (USD) — à maintenir si les tarifs évoluent.
const MODEL_PRICING = {
  'claude-opus-4-6': { input: 15, output: 75 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
  // Fallbacks pour anciens noms
  'claude-opus-4': { input: 15, output: 75 },
  'claude-sonnet-4': { input: 3, output: 15 },
  'claude-haiku-4': { input: 1, output: 5 },
};

const DEFAULT_PRICING = { input: 3, output: 15 };

// Taux EUR/USD approximatif — à mettre à jour manuellement ou via une route.
const FX_USD_EUR = parseFloat(process.env.FX_USD_EUR || '0.92');

/**
 * @param {{ input_tokens?: number, output_tokens?: number,
 *           cache_creation_input_tokens?: number,
 *           cache_read_input_tokens?: number }} usage
 * @param {string} model
 */
function computeCost(usage, model) {
  const pricing = MODEL_PRICING[model] || DEFAULT_PRICING;
  const inTok  = (usage?.input_tokens || 0)
               + (usage?.cache_creation_input_tokens || 0)
               + (usage?.cache_read_input_tokens || 0);
  const outTok = usage?.output_tokens || 0;

  const usd = (inTok * pricing.input + outTok * pricing.output) / 1_000_000;
  const eur = usd * FX_USD_EUR;

  return {
    inputTokens: inTok,
    outputTokens: outTok,
    totalTokens: inTok + outTok,
    costUsd: round6(usd),
    costEur: round6(eur),
    model,
    pricing,
  };
}

function round6(n) {
  return Math.round(n * 1_000_000) / 1_000_000;
}

module.exports = { computeCost, MODEL_PRICING, FX_USD_EUR };
