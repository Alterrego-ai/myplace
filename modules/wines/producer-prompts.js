/**
 * Prompts pour l'enrichissement Claude d'une fiche producteur.
 * L'objectif : à partir du nom (+ éventuellement région), récupérer les infos
 * publiques connues du domaine (localisation, superficie, cépages, histoire…).
 */

const ENRICH_SYSTEM_PROMPT = `Tu es un expert du monde du vin : sommelier, journaliste spécialisé, œnologue.
Ta mission : à partir du nom d'un domaine / d'une maison / d'une cave, fournir une fiche factuelle, concise et vérifiable.

Règles strictes :
- Tu réponds UNIQUEMENT en JSON valide, sans texte avant ou après, sans bloc markdown.
- Tu ne réponds QUE pour des producteurs dont tu as une connaissance raisonnable. Si tu ne connais pas, retourne { "status": "unknown" }.
- Pour chaque champ, si tu n'es pas sûr, mets null. Ne jamais inventer.
- "description" doit rester factuelle : 2 à 4 phrases, sans hyperbole, sans vocabulaire marketing.
- "founded_year" uniquement si tu es sûr.
- "area_ha" en hectares, en nombre.
- "farming" ∈ { "conventional", "organic", "biodynamic", "natural", null }.
- "confidence" ∈ [0, 1] reflète ta propre confiance dans l'identification globale.
`;

const ENRICH_OUTPUT_HINT = `Format de sortie attendu :
{
  "status": "identified" | "partial" | "unknown",
  "legal_name": string | null,
  "country": string | null,
  "region": string | null,
  "appellation_main": string | null,
  "address": string | null,
  "latitude": number | null,
  "longitude": number | null,
  "website": string | null,
  "owner": string | null,
  "founded_year": number | null,
  "area_ha": number | null,
  "farming": "conventional" | "organic" | "biodynamic" | "natural" | null,
  "description": string | null,
  "wikipedia_url": string | null,
  "confidence": number,
  "reason": string | null
}`;

function buildEnrichSystemPrompt() {
  return `${ENRICH_SYSTEM_PROMPT}\n\n${ENRICH_OUTPUT_HINT}`;
}

function buildEnrichUserMessage(producer) {
  const hints = [];
  if (producer.region) hints.push(`Région connue : ${producer.region}`);
  if (producer.country) hints.push(`Pays connu : ${producer.country}`);
  if (producer.appellation_main) hints.push(`Appellation : ${producer.appellation_main}`);
  const hintStr = hints.length ? `\nIndices déjà connus :\n${hints.join('\n')}` : '';
  return `Producteur à enrichir : "${producer.name}"${hintStr}\n\nFournis la fiche JSON selon le schéma.`;
}

module.exports = {
  buildEnrichSystemPrompt,
  buildEnrichUserMessage,
};
