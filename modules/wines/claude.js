/**
 * Wrapper Claude Vision pour identifier une bouteille de vin à partir d'une image.
 */
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const { buildSystemPrompt, USER_INSTRUCTION, buildMultiSystemPrompt, MULTI_USER_INSTRUCTION } = require('./prompts');
const { buildEnrichSystemPrompt, buildEnrichUserMessage } = require('./producer-prompts');

const MODEL = process.env.WINES_MODEL || 'claude-sonnet-4-6';
const MAX_TOKENS = 1500;

let client = null;
function getClient() {
  if (!client) client = new Anthropic(); // lit ANTHROPIC_API_KEY
  return client;
}

/**
 * @param {string} absPath - chemin absolu vers l'image uploadée
 * @param {string} mimeType - 'image/jpeg' | 'image/png' | ...
 * @returns {Promise<{ result: object, durationMs: number, raw: any }>}
 */
async function identifyWine(absPath, mimeType = 'image/jpeg') {
  const t0 = Date.now();
  const buffer = fs.readFileSync(absPath);
  const base64 = buffer.toString('base64');

  // Claude attend un media_type précis. On normalise.
  const mt = (mimeType || 'image/jpeg').toLowerCase();
  const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const media_type = allowed.includes(mt) ? mt : 'image/jpeg';

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: buildSystemPrompt(),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type, data: base64 },
          },
          { type: 'text', text: USER_INSTRUCTION },
        ],
      },
    ],
  });

  const durationMs = Date.now() - t0;

  // Extraire le texte et parser le JSON
  const textBlock = (response.content || []).find((b) => b.type === 'text');
  const rawText = textBlock ? textBlock.text : '';
  let parsed = null;
  let parseError = null;
  try {
    parsed = JSON.parse(extractJson(rawText));
  } catch (e) {
    parseError = e.message;
  }

  return {
    result: parsed,
    rawText,
    parseError,
    durationMs,
    usage: response.usage,
  };
}

/** Tente de récupérer le premier bloc JSON valide dans un texte (au cas où Claude ajoute du texte). */
function extractJson(text) {
  if (!text) return '';
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) return trimmed;
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

/**
 * Enrichit une fiche producteur à partir de son nom.
 * @param {object} producer - au minimum { name }, idéalement { name, region, country }
 * @returns {Promise<{ result: object|null, rawText: string, parseError: string|null, durationMs: number, usage: any }>}
 */
async function enrichProducer(producer) {
  if (!producer || !producer.name) {
    throw new Error('producer.name required');
  }
  const t0 = Date.now();
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 1200,
    system: buildEnrichSystemPrompt(),
    messages: [
      { role: 'user', content: buildEnrichUserMessage(producer) },
    ],
  });

  const durationMs = Date.now() - t0;
  const textBlock = (response.content || []).find((b) => b.type === 'text');
  const rawText = textBlock ? textBlock.text : '';
  let parsed = null;
  let parseError = null;
  try {
    parsed = JSON.parse(extractJson(rawText));
  } catch (e) {
    parseError = e.message;
  }

  return { result: parsed, rawText, parseError, durationMs, usage: response.usage };
}

/**
 * Identifie PLUSIEURS bouteilles sur une même photo.
 * Renvoie { bottle_count, bottles: [...], more_visible }
 * @param {string} absPath - chemin absolu vers l'image uploadée
 * @param {string} mimeType - 'image/jpeg' | 'image/png' | ...
 */
async function identifyWineMulti(absPath, mimeType = 'image/jpeg') {
  const t0 = Date.now();
  const buffer = fs.readFileSync(absPath);
  const base64 = buffer.toString('base64');

  const mt = (mimeType || 'image/jpeg').toLowerCase();
  const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const media_type = allowed.includes(mt) ? mt : 'image/jpeg';

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 16000, // jusqu'à 30 bouteilles
    system: buildMultiSystemPrompt(),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type, data: base64 },
          },
          { type: 'text', text: MULTI_USER_INSTRUCTION },
        ],
      },
    ],
  });

  const durationMs = Date.now() - t0;
  const textBlock = (response.content || []).find((b) => b.type === 'text');
  const rawText = textBlock ? textBlock.text : '';
  let parsed = null;
  let parseError = null;
  try {
    parsed = JSON.parse(extractJson(rawText));
  } catch (e) {
    parseError = e.message;
  }

  return {
    result: parsed,
    rawText,
    parseError,
    durationMs,
    usage: response.usage,
  };
}

module.exports = { identifyWine, identifyWineMulti, enrichProducer, MODEL };
