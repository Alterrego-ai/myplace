/**
 * Chat API — Assistant IA pour Sauf Imprévu (via Anthropic Claude)
 * Accessible uniquement aux utilisateurs connectés (token SSO valide)
 * Supporte les tool_use pour vérifier dispo et créer des réservations
 */
const Anthropic = require('@anthropic-ai/sdk');
const { verifyUserToken } = require('./auth');

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 1024;
const CAPACITE_TOTALE = 42;

// Historiques de conversation en mémoire (par user sub, limité)
const conversations = new Map();
const MAX_HISTORY = 20; // paires de messages max par user
const CONVERSATION_TTL = 30 * 60 * 1000; // 30 min d'inactivité

// ── Définition des tools Anthropic (tool_use) ───────────────────────────────
const tools = [
  {
    name: 'check_availability',
    description: "Vérifie la disponibilité du restaurant pour une date, heure et nombre de couverts donnés. Appeler UNIQUEMENT quand le client a donné une heure précise. Ne jamais inventer une heure.",
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date au format YYYY-MM-DD' },
        heure: { type: 'string', description: 'Heure au format HH:MM' },
        couverts: { type: 'integer', description: 'Nombre de personnes' },
      },
      required: ['date', 'heure', 'couverts'],
    },
  },
  {
    name: 'create_reservation',
    description: "Crée une réservation confirmée. N'appeler qu'APRÈS avoir vérifié la disponibilité ET obtenu la confirmation du client sur le récapitulatif.",
    input_schema: {
      type: 'object',
      properties: {
        nom: { type: 'string', description: 'Nom du client pour la réservation' },
        date: { type: 'string', description: 'Date au format YYYY-MM-DD' },
        heure: { type: 'string', description: 'Heure au format HH:MM' },
        couverts: { type: 'integer', description: 'Nombre de personnes' },
        telephone: { type: 'string', description: 'Numéro de téléphone (optionnel)' },
        notes: { type: 'string', description: 'Notes ou précisions du client (optionnel)' },
      },
      required: ['nom', 'date', 'heure', 'couverts'],
    },
  },
];

// ── Fonctions métier ────────────────────────────────────────────────────────
function getService(heure) {
  const [h, m] = heure.split(':').map(Number);
  const minutes = h * 60 + m;
  if (minutes >= 720 && minutes <= 840) return 'midi';   // 12h–14h
  if (minutes >= 1020 && minutes <= 1500) return 'soir'; // 17h–01h
  return null;
}

function executeFunction(name, args, resaDb) {
  if (name === 'check_availability') {
    const { date, heure, couverts } = args;
    const demande = parseInt(couverts);

    // Vérifier que la date n'est pas un week-end
    const requestedDate = new Date(date + 'T12:00:00');
    const dayOfWeek = requestedDate.getDay(); // 0 = dimanche, 6 = samedi
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      const dayNames = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
      return { disponible: false, message: `Le ${dayNames[dayOfWeek]} ${date}, nous sommes fermés. Le restaurant est fermé le week-end (samedi et dimanche). Propose le lundi suivant.` };
    }

    // Vérifier que la date n'est pas dans le passé
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    if (date < todayStr) {
      return { disponible: false, message: `La date ${date} est passée. Nous sommes le ${todayStr}. Demande une date future.` };
    }

    if (demande > 10) {
      return { disponible: false, message: "Les groupes de plus de 10 personnes nécessitent une privatisation. Invitez le client à appeler le restaurant." };
    }

    const service = getService(heure);
    if (!service) {
      return { disponible: false, message: "Cet horaire ne correspond pas à un service. Midi : 12h–14h, Soir : 17h–minuit (ou 1h jeu-ven)." };
    }

    const row = resaDb.prepare('SELECT COALESCE(SUM(couverts), 0) as total FROM reservations WHERE date = ? AND service = ?').get(date, service);
    const couverts_restants = CAPACITE_TOTALE - row.total;

    if (couverts_restants >= demande) {
      return { disponible: true, service, message: `Place disponible pour ${demande} personne(s) le ${date} à ${heure} (service du ${service}).` };
    } else {
      return { disponible: false, service, message: `Désolé, le service du ${service} est complet pour ce nombre de couverts ce jour-là.` };
    }
  }

  if (name === 'create_reservation') {
    const { nom, date, heure, couverts, telephone, notes } = args;
    const demande = parseInt(couverts);

    // Garde-fou : pas de résa le week-end
    const reqDate = new Date(date + 'T12:00:00');
    const dow = reqDate.getDay();
    if (dow === 0 || dow === 6) {
      return { success: false, message: "Impossible : le restaurant est fermé le week-end." };
    }

    const service = getService(heure);

    if (!service) {
      return { success: false, message: "Horaire hors service." };
    }

    const row = resaDb.prepare('SELECT COALESCE(SUM(couverts), 0) as total FROM reservations WHERE date = ? AND service = ?').get(date, service);
    const couverts_restants = CAPACITE_TOTALE - row.total;

    if (couverts_restants < demande) {
      return { success: false, message: `Plus assez de places pour ce service.` };
    }

    const result = resaDb.prepare(
      'INSERT INTO reservations (nom, telephone, date, heure, couverts, notes, service, source, statut) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(nom, telephone || null, date, heure, demande, notes || null, service, 'chat', 'confirmee');

    console.log(`✅ Résa #${result.lastInsertRowid} créée via chat (${nom}, ${date} ${heure}, ${demande} pers.)`);
    return { success: true, id: result.lastInsertRowid, message: `Réservation #${result.lastInsertRowid} confirmée pour ${nom}, le ${date} à ${heure} pour ${demande} personne(s).` };
  }

  return { error: 'Fonction inconnue' };
}

/**
 * Construit le system prompt avec le contexte du restaurant (carte, horaires, etc.)
 */
function buildSystemPrompt(carteDb) {
  // Charger les prompts de services depuis agenda.json
  let servicePrompts = '';
  try {
    const fs = require('fs');
    const path = require('path');
    const agenda = JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'agenda.json'), 'utf8'));
    const bookableSlots = (agenda.services || []).filter(s => s.booking && s.booking.prompt);
    if (bookableSlots.length > 0) {
      servicePrompts = bookableSlots.map(s => {
        const booking = s.booking;
        return `### ${s.label} (${s.recurrence.start}–${s.recurrence.end})
${booking.prompt}
${booking.enabled ? `Créneaux réservables : de ${booking.firstSlot || s.recurrence.start} à ${booking.lastSlot || s.recurrence.end}, toutes les ${booking.interval || 30} min. Max ${booking.maxCouverts || 'N/A'} couverts.` : 'Pas de réservation pour ce service.'}`;
      }).join('\n\n');
    }
  } catch (e) {
    console.warn('Chat: impossible de charger agenda.json pour les prompts services:', e.message);
  }

  // Charger la carte depuis la DB
  let carteText = '';
  try {
    const resto = carteDb.prepare('SELECT * FROM restaurants LIMIT 1').get();
    const families = carteDb.prepare('SELECT * FROM families WHERE restaurant_id = ? ORDER BY "order"').all(resto.id);
    const categories = carteDb.prepare('SELECT * FROM categories WHERE restaurant_id = ? AND visible = 1 ORDER BY "order"').all(resto.id);
    const items = carteDb.prepare(`
      SELECT i.*, c.name as category_name, c.family_id,
        GROUP_CONCAT(t.label) as tags
      FROM items i
      LEFT JOIN categories c ON c.id = i.category_id
      LEFT JOIN item_tags it ON it.item_id = i.id
      LEFT JOIN tags t ON t.id = it.tag_id
      WHERE i.category_id IN (SELECT id FROM categories WHERE restaurant_id = ? AND visible = 1)
      GROUP BY i.id
      ORDER BY c."order", i.name
    `).all(resto.id);

    for (const family of families) {
      carteText += `\n### ${family.name}\n`;
      const familyCategories = categories.filter(c => c.family_id === family.id);
      for (const cat of familyCategories) {
        carteText += `\n**${cat.name}**\n`;
        const catItems = items.filter(i => i.category_id === cat.id);
        for (const item of catItems) {
          const price = item.price ? ` — ${item.price}€` : '';
          const desc = item.description ? ` (${item.description})` : '';
          const available = item.available ? '' : ' [INDISPONIBLE]';
          const tags = item.tags ? ` [${item.tags}]` : '';
          carteText += `- ${item.name}${desc}${price}${tags}${available}\n`;
        }
      }
    }
  } catch (e) {
    console.warn('Chat: impossible de charger la carte:', e.message);
    carteText = '(Carte non disponible)';
  }

  const today = new Date().toISOString().split('T')[0];
  const dayNames = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
  const monthNames = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const todayDay = dayNames[new Date().getDay()];

  // Générer un calendrier des 14 prochains jours pour éviter les erreurs de dates
  const calendarLines = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const day = dayNames[d.getDay()];
    const num = d.getDate();
    const month = monthNames[d.getMonth()];
    const iso = d.toISOString().split('T')[0];
    calendarLines.push(`${day} ${num} ${month} = ${iso}`);
  }
  const calendarText = calendarLines.join('\n');

  return `Tu es Maïa, l'hôtesse chaleureuse de Sauf Imprévu, un bar à vins, bar-restaurant traditionnel qui fait la part belle à la cuisine de marché et à une carte des vins soigneusement sélectionnée, situé au 15 Rue Vauban, 69006 Lyon.

Sauf Imprévu propose une cuisine maison à base de produits frais et de saison, qui change au gré du marché. En fin d'après-midi et en soirée, c'est l'endroit idéal pour un apéro chaleureux, un after work convivial ou un verre en amoureux. La sélection de vins, issue de domaines prestigieux et de vignerons triés sur le volet, accompagnée de plats et tapas généreux, ravit novices comme connaisseurs.

Tu fais en sorte que chaque visiteur se sente comme un invité de marque, pas comme un client.

## Date du jour
Aujourd'hui c'est ${todayDay} ${today}.${(new Date().getDay() === 0 || new Date().getDay() === 6) ? ' ATTENTION : NOUS SOMMES FERMÉS AUJOURD\'HUI (week-end). Aucune réservation n\'est possible pour aujourd\'hui.' : ''}

## Horaires
- Du lundi au mercredi · Midi : 12h00 – 14h00 (dernières commandes vers 13h30) · Soir : 17h00 – minuit (cuisine jusqu'à 22h)
- Du jeudi au vendredi · Midi : 12h00 – 14h00 (dernières commandes vers 13h30) · Soir : 17h00 – 1h00 (cuisine jusqu'à 22h)
- Fermé le week-end.

## Capacité
- Intérieur : 24 couverts, tables de 2 modulables
- Terrasse : 18 places, tables de 2 (4 fixes côté trottoir, 4 sur stationnement)

## Infos pratiques
- Note Google : 4.7/5 (284 avis)
- Services : Cave à emporter, terrasse, CB acceptée, tickets restaurant

## Services et règles de réservation
${servicePrompts || '(Aucun service trouvé dans agenda.json)'}

## Règles générales de réservation
- Ne communique JAMAIS le nombre de places restantes au client. Dis simplement si c'est disponible ou non.
- Ne propose JAMAIS un horaire toi-même. Demande toujours au client à quelle heure il souhaite venir. Si le client dit juste "mercredi soir", dis qu'il y a de la place et demande l'heure souhaitée.
- OBLIGATOIRE : tu DOIS utiliser la fonction check_availability pour vérifier la disponibilité. Ne dis JAMAIS qu'une table est disponible sans avoir appelé cette fonction.
- OBLIGATOIRE : tu DOIS utiliser la fonction create_reservation pour enregistrer la réservation. Une réservation n'existe PAS tant que cette fonction n'a pas été appelée. Ne confirme JAMAIS une réservation sans l'avoir créée via create_reservation.
- Ne simule JAMAIS le résultat de ces fonctions. Tu DOIS les appeler réellement.

## Calendrier de référence (les 14 prochains jours)
${calendarText}

## Gestion des dates
- UTILISE OBLIGATOIREMENT le calendrier ci-dessus pour convertir les jours en dates. Ne calcule JAMAIS de tête.
- Si le client dit "mercredi soir", cherche le prochain mercredi dans le calendrier et utilise la date correspondante.
- Si le client dit "mardi 31 mars" mais que le calendrier montre que le 31 mars est un autre jour, corrige immédiatement.
- Ne permets JAMAIS une date passée. Si le mois est déjà écoulé, suppose l'année suivante et demande confirmation.
- Si une date est à plus de 3 mois, demande une brève confirmation.
- Le restaurant est FERMÉ le week-end (samedi et dimanche). Si le client demande un samedi ou dimanche, informe-le gentiment et propose le jour ouvré le plus proche.

## La carte actuelle
${carteText}

## Ton et style
- Chaleureux et accueillant — chaque visiteur est traité comme un invité de marque
- Enjoué et expressif — enthousiasme sincère pour la cuisine, le vin et l'hospitalité lyonnaise
- Efficace — tu gères les questions et réservations sans allers-retours inutiles
- Ne tutoie pas. Le nom n'apparaît qu'au moment du récapitulatif de réservation.
- Naturel — ne surjoue pas l'enthousiasme. Pas d'exclamations comme "Excellente nouvelle !" ou "Parfait !". Maïa feint de vérifier brièvement avant de confirmer ou d'infirmer la disponibilité, sans exclamation.
- Sois concis (2-3 phrases max sauf si on te demande plus de détails)
- Tu t'adaptes naturellement à la langue du visiteur. Si la langue n'est ni le français ni l'anglais, précise que l'équipe sur place parle principalement français et anglais.

## Style de conversation (réservation)
- Ne récapitule pas les informations déjà collectées après chaque nouvelle information. Passe naturellement à la suite.
- Si la date ou l'heure manque, demande les deux ensemble en une seule question. Demande toujours une heure précise, jamais "midi ou soir ?". Si le client a déjà mentionné le service (déjeuner ou dîner), tiens-en compte pour formuler la question : "À quelle heure souhaitez-vous venir ?"
- Si le nom manque, demande uniquement le nom. Ne demande jamais le numéro de téléphone avant le récapitulatif.
- Le récapitulatif complet ne se fait qu'une seule fois, juste avant de confirmer la réservation. Maïa l'énonce sans phrase d'introduction — jamais "voilà le récapitulatif" ou formule similaire. Elle enchaîne directement avec les infos, un retour à la ligne par information (date, heure, nombre de personnes, nom, téléphone si donné, notes si données).
- Après le récapitulatif, pose une seule question neutre : "Y a-t-il autre chose que vous souhaitez nous préciser ?" — sans suggérer de catégories. Cette question ne se pose qu'une seule fois et ne se répète jamais, même après une correction du client.
- Si le client apporte une correction (nom, heure, nombre de personnes), intègre-la et confirme uniquement l'élément corrigé, sans répéter les informations déjà validées.
- Si le client ajoute une précision, note-la simplement et confirme la réservation. Ne refais pas le récapitulatif.
- INTERDIT de répéter les informations de réservation après la confirmation. La seule exception est le récapitulatif unique avant confirmation. Toute récapitulation supplémentaire est une erreur.
- La phrase de clôture inclut un remerciement court et sincère avant la formule de congé, calibrée selon l'échéance : "Merci, à ce soir !", "Avec plaisir, à très vite !" ou "Merci, à bientôt !" — naturel, jamais corporate.
- Une fois la phrase de clôture prononcée, Maïa met fin à la conversation rapidement. Elle ne pose pas de question supplémentaire.
- Si la conversation ne débouche pas sur une réservation (question pratique, simple renseignement), Maïa conclut naturellement avec une phrase courte et chaleureuse.

## Consignes générales
- Tu parles TOUJOURS à la première personne du pluriel : "chez nous", "notre bar à vins", "notre carte". Tu ne dis JAMAIS "chez Sauf Imprévu" ou "à Sauf Imprévu" — tu es l'hôtesse, pas une étrangère. La seule exception est si quelqu'un demande le nom du restaurant.
- Tu peux répondre aux questions sur la carte, les vins et suggérer des accords mets-vins
- Si on te demande un plat/vin que tu ne trouves pas dans la carte, dis-le honnêtement — la carte change régulièrement
- Ne donne pas de prix si tu n'es pas sûr — renvoie vers la carte
- Si la question n'a rien à voir avec le restaurant, réponds poliment que tu es l'assistante de Sauf Imprévu
- Pour toute demande hors de ton périmètre, redirige élégamment vers l'équipe sur place ou invite à appeler avant le service.

## Objectif
Faire en sorte que chaque visiteur se sente bienvenu et enthousiaste à l'idée de venir chez Sauf Imprévu. Gérer les réservations efficacement, répondre aux questions avec passion, rediriger élégamment sur les sujets non couverts en invitant à passer sur place ou à rappeler avant le service.`;
}

/**
 * Middleware : vérifie le token SSO dans le header Authorization
 * Accepte les requêtes anonymes en mode limité (réservation uniquement)
 */
function requireChatAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // Mode anonyme — autorisé pour la réservation
    req.chatUser = { sub: 'anon_' + (req.ip || 'unknown'), name: 'Visiteur', anonymous: true };
    return next();
  }
  const token = authHeader.substring(7);
  const user = verifyUserToken(token);
  if (!user) {
    // Token invalide/expiré → fallback anonyme (ne pas bloquer le chat)
    req.chatUser = { sub: 'anon_' + (req.ip || 'unknown'), name: 'Visiteur', anonymous: true };
    return next();
  }
  req.chatUser = user;
  next();
}

/**
 * Enregistre les routes chat sur le router Express
 */
function chatRoutes(router, carteDb, resaDb) {
  let client;
  try {
    client = new Anthropic();
    console.log('✓ Anthropic SDK initialisé (Claude Sonnet)');
  } catch (e) {
    console.error('❌ Anthropic SDK init error:', e.message);
    router.post('/api/chat', (req, res) => {
      res.status(503).json({ error: 'Assistant indisponible pour le moment' });
    });
    return;
  }

  // Nettoyer les vieilles conversations périodiquement
  setInterval(() => {
    const now = Date.now();
    for (const [key, conv] of conversations) {
      if (now - conv.lastActivity > CONVERSATION_TTL) {
        conversations.delete(key);
      }
    }
  }, 5 * 60 * 1000);

  router.post('/api/chat', requireChatAuth, async (req, res) => {
    try {
      const { message } = req.body;
      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ error: 'Message requis' });
      }
      if (message.length > 2000) {
        return res.status(400).json({ error: 'Message trop long (2000 caractères max)' });
      }

      const userSub = req.chatUser.sub;

      // Récupérer ou créer l'historique
      let conv = conversations.get(userSub);
      if (!conv) {
        conv = { messages: [], lastActivity: Date.now() };
        conversations.set(userSub, conv);
      }
      conv.lastActivity = Date.now();

      // Ajouter le message utilisateur
      conv.messages.push({ role: 'user', content: message.trim() });

      // Garder uniquement les N derniers échanges
      if (conv.messages.length > MAX_HISTORY * 2) {
        conv.messages = conv.messages.slice(-MAX_HISTORY * 2);
      }

      // Appel Claude avec tools
      let systemPrompt = buildSystemPrompt(carteDb);
      if (req.chatUser.anonymous) {
        systemPrompt += '\n\n## MODE VISITEUR ANONYME\nCe visiteur n\'est pas connecté. Tu peux uniquement l\'aider à réserver une table. Pour toute autre demande (carte des vins, questions, conversation), invite-le à se créer un compte gratuitement pour accéder à toutes les fonctionnalités de l\'assistant.';
      }
      let response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        tools,
        messages: conv.messages,
      });

      // Boucle de tool_use (max 3 appels pour éviter les boucles infinies)
      let loops = 0;
      while (response.stop_reason === 'tool_use' && loops < 3) {
        loops++;

        // Collecter les tool_use blocks
        const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');

        // Ajouter la réponse assistant (avec tool_use) à l'historique
        conv.messages.push({ role: 'assistant', content: response.content });

        // Construire les résultats
        const toolResults = [];
        for (const tu of toolUseBlocks) {
          console.log(`🔧 Tool call: ${tu.name}(${JSON.stringify(tu.input)})`);
          const result = executeFunction(tu.name, tu.input, resaDb);
          console.log(`   → ${JSON.stringify(result)}`);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tu.id,
            content: JSON.stringify(result),
          });
        }

        // Ajouter les résultats comme message user
        conv.messages.push({ role: 'user', content: toolResults });

        // Relancer Claude
        response = await client.messages.create({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: systemPrompt,
          tools,
          messages: conv.messages,
        });
      }

      // Extraire le texte de la réponse
      const textBlocks = response.content.filter(b => b.type === 'text');
      const assistantMessage = textBlocks.map(b => b.text).join('\n');

      // Ajouter la réponse à l'historique
      conv.messages.push({ role: 'assistant', content: response.content });

      // Détecter si Maïa présente un récap de réservation avec des valeurs concrètes
      const lowerMsg = (assistantMessage || '').toLowerCase();
      const isConfirmation = lowerMsg.includes('confirmer') || lowerMsg.includes('c\'est bien ça') || lowerMsg.includes('on confirme') || lowerMsg.includes('est-ce correct') || lowerMsg.includes('je vous récapitule');
      // Le récap doit contenir une vraie date (jour/chiffre), un horaire (xxh), et un nombre de personnes
      const hasRealDate = /\d{1,2}\s*(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}/.test(lowerMsg);
      const hasRealTime = /\d{1,2}\s*[h:]\s*\d{0,2}/.test(lowerMsg);
      const hasRealCouverts = /\d+\s*(personne|couvert|convive)/.test(lowerMsg);
      const hasRecap = hasRealDate && hasRealTime && hasRealCouverts;

      const responseData = {
        reply: assistantMessage,
        usage: {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
        },
      };

      if (isConfirmation && hasRecap) {
        responseData.actions = [
          { label: 'Confirmer', value: 'Oui, je confirme' },
          { label: 'Modifier', value: 'Je souhaite modifier la réservation' },
          { label: 'Ajouter une note', value: 'Je voudrais ajouter une précision' },
          { label: 'Annuler', value: 'Non, annulez' },
        ];
      }

      res.json(responseData);
    } catch (err) {
      console.error('❌ Chat API error:', err.message);
      if (err.status === 401 || err.status === 403) {
        return res.status(500).json({ error: 'Erreur de configuration API — contactez le restaurant' });
      }
      res.status(500).json({ error: 'Désolé, je ne peux pas répondre pour le moment. Réessayez dans un instant.' });
    }
  });

  // Endpoint pour effacer l'historique de conversation
  router.delete('/api/chat/history', requireChatAuth, (req, res) => {
    conversations.delete(req.chatUser.sub);
    res.json({ ok: true });
  });

  router.post('/api/chat/reset', requireChatAuth, (req, res) => {
    conversations.delete(req.chatUser.sub);
    res.json({ ok: true });
  });

  return router;
}

module.exports = { chatRoutes };
