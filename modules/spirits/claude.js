/**
 * Wrapper Claude Vision pour identifier une bouteille de spiritueux.
 * Parallèle à modules/wines/claude.js.
 */
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const {
  buildSystemPrompt,
  USER_INSTRUCTION,
  buildEnrichSystemPrompt,
  buildEnrichUserMessage,
} = require('./prompts');

// Même modèle par défaut que wines, override possible via env
const MODEL = process.env.SPIRITS_MODEL || process.env.WINES_MODEL || 'claude-sonnet-4-6';
const MAX_TOKENS = 1500;

let client = null;
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

async function identifySpirit(absPath, mimeType = 'image/jpeg') {
  const t0 = Date.now();
  const buffer = fs.readFileSync(absPath);
  const base64 = buffer.toString('base64');

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

async function enrichDistillery(distillery) {
  if (!distillery || !distillery.name) {
    throw new Error('distillery.name required');
  }
  const t0 = Date.now();
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 1200,
    system: buildEnrichSystemPrompt(),
    messages: [{ role: 'user', content: buildEnrichUserMessage(distillery) }],
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

module.exports = { identifySpirit, enrichDistillery, MODEL };
