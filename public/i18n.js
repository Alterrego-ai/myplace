/**
 * i18n — Traduction live côté client
 * Langues : FR (défaut), EN, ES, IT, DE, PT
 */
var I18N = (function() {
  var LANGS = ['fr','en','es','it','de','pt'];
  var LANG_LABELS = { fr:'Français', en:'English', es:'Español', it:'Italiano', de:'Deutsch', pt:'Português' };
  var LANG_FLAGS = { fr:'🇫🇷', en:'🇬🇧', es:'🇪🇸', it:'🇮🇹', de:'🇩🇪', pt:'🇵🇹' };

  var T = {
    // ── Navigation bottom bar ──
    nav_accueil:        { fr:'Accueil', en:'Home', es:'Inicio', it:'Home', de:'Start', pt:'Início' },
    nav_actualites:     { fr:'Actualités', en:'News', es:'Noticias', it:'Novità', de:'Neuigkeiten', pt:'Novidades' },
    nav_moi:            { fr:'Moi', en:'Me', es:'Yo', it:'Io', de:'Ich', pt:'Eu' },
    nav_plus:           { fr:'Plus', en:'More', es:'Más', it:'Altro', de:'Mehr', pt:'Mais' },
    nav_staff:          { fr:'Staff', en:'Staff', es:'Staff', it:'Staff', de:'Staff', pt:'Staff' },

    // ── Statut restaurant ──
    status_open:        { fr:'Ouvert', en:'Open', es:'Abierto', it:'Aperto', de:'Geöffnet', pt:'Aberto' },
    status_closed:      { fr:'Fermé', en:'Closed', es:'Cerrado', it:'Chiuso', de:'Geschlossen', pt:'Fechado' },

    // ── CTA zone ──
    cta_conseil:        { fr:'Besoin d\'un conseil', en:'Need advice', es:'¿Necesita un consejo?', it:'Bisogno di un consiglio?', de:'Brauchen Sie Rat?', pt:'Precisa de um conselho?' },
    cta_ou_table:       { fr:'ou d\'une table ?', en:'or a table?', es:'¿o una mesa?', it:'o un tavolo?', de:'oder einen Tisch?', pt:'ou uma mesa?' },
    cta_disponible:     { fr:'Je suis disponible', en:'I\'m available', es:'Estoy disponible', it:'Sono disponibile', de:'Ich bin verfügbar', pt:'Estou disponível' },
    cta_appeler:        { fr:'Appeler', en:'Call', es:'Llamar', it:'Chiamare', de:'Anrufen', pt:'Ligar' },
    cta_discuter:       { fr:'Discuter', en:'Chat', es:'Chatear', it:'Chatta', de:'Chatten', pt:'Conversar' },
    cta_partager:       { fr:'Partager', en:'Share', es:'Compartir', it:'Condividi', de:'Teilen', pt:'Partilhar' },

    // ── Avis ──
    avis_offres:        { fr:'Offres et avantages exclusifs', en:'Exclusive offers and benefits', es:'Ofertas y ventajas exclusivas', it:'Offerte e vantaggi esclusivi', de:'Exklusive Angebote und Vorteile', pt:'Ofertas e vantagens exclusivas' },
    avis_laisser:       { fr:'Laisser un avis', en:'Leave a review', es:'Dejar una reseña', it:'Lascia una recensione', de:'Bewertung abgeben', pt:'Deixar uma avaliação' },
    avis_count:         { fr:'avis', en:'reviews', es:'reseñas', it:'recensioni', de:'Bewertungen', pt:'avaliações' },

    // ── Présentation ──
    section_presentation: { fr:'Présentation', en:'About us', es:'Presentación', it:'Presentazione', de:'Über uns', pt:'Apresentação' },
    section_actualites: { fr:'Actualités', en:'News', es:'Novedades', it:'Novità', de:'Neuigkeiten', pt:'Novidades' },

    // ── Chat / Welcome ──
    chat_bonjour:       { fr:'Bonjour !', en:'Hello!', es:'¡Hola!', it:'Ciao!', de:'Hallo!', pt:'Olá!' },
    chat_intro:         { fr:'Je suis Maïa, votre agent d\'hospitalité', en:'I\'m Maïa, your hospitality agent', es:'Soy Maïa, su agente de hospitalidad', it:'Sono Maïa, il vostro agente di ospitalità', de:'Ich bin Maïa, Ihre Hospitality-Agentin', pt:'Sou a Maïa, a sua agente de hospitalidade' },
    chat_reserver:      { fr:'Réserver une table', en:'Book a table', es:'Reservar una mesa', it:'Prenota un tavolo', de:'Tisch reservieren', pt:'Reservar uma mesa' },
    chat_dispo:         { fr:'Disponibilité en temps réel', en:'Real-time availability', es:'Disponibilidad en tiempo real', it:'Disponibilità in tempo reale', de:'Echtzeit-Verfügbarkeit', pt:'Disponibilidade em tempo real' },
    chat_placeholder:   { fr:'Votre message...', en:'Your message...', es:'Su mensaje...', it:'Il tuo messaggio...', de:'Ihre Nachricht...', pt:'A sua mensagem...' },
    chat_resa_placeholder: { fr:'Votre demande de réservation...', en:'Your reservation request...', es:'Su solicitud de reserva...', it:'La tua richiesta di prenotazione...', de:'Ihre Reservierungsanfrage...', pt:'O seu pedido de reserva...' },
    chat_resa_auto:     { fr:'Je souhaite réserver une table', en:'I would like to book a table', es:'Me gustaría reservar una mesa', it:'Vorrei prenotare un tavolo', de:'Ich möchte einen Tisch reservieren', pt:'Gostaria de reservar uma mesa' },
    chat_login_placeholder: { fr:'Connectez-vous pour discuter...', en:'Log in to chat...', es:'Inicie sesión para chatear...', it:'Accedi per chattare...', de:'Einloggen zum Chatten...', pt:'Faça login para conversar...' },
    chat_agent:         { fr:'Agent d\'hospitalité · Sauf Imprévu Bar à vins', en:'Hospitality agent · Sauf Imprévu Wine bar', es:'Agente de hospitalidad · Sauf Imprévu Bar de vinos', it:'Agente di ospitalità · Sauf Imprévu Wine bar', de:'Hospitality-Agentin · Sauf Imprévu Weinbar', pt:'Agente de hospitalidade · Sauf Imprévu Bar de vinhos' },

    // ── Zone premium / Club ──
    premium_reserve:    { fr:'Réservé à nos membres', en:'Members only', es:'Reservado a miembros', it:'Riservato ai membri', de:'Nur für Mitglieder', pt:'Reservado a membros' },
    premium_avantages:  { fr:'Vos avantages membre', en:'Your member benefits', es:'Sus ventajas de miembro', it:'I tuoi vantaggi membro', de:'Ihre Mitgliedsvorteile', pt:'As suas vantagens de membro' },
    premium_espace:     { fr:'Espace club', en:'Club area', es:'Espacio club', it:'Area club', de:'Club-Bereich', pt:'Área do clube' },
    premium_join:       { fr:'Créer mon compte gratuitement', en:'Create my free account', es:'Crear mi cuenta gratis', it:'Crea il mio account gratuito', de:'Kostenloses Konto erstellen', pt:'Criar a minha conta grátis' },
    premium_bientot:    { fr:'Prochainement', en:'Coming soon', es:'Próximamente', it:'Prossimamente', de:'Demnächst', pt:'Em breve' },

    // ── Feature tiles ──
    feat_acheter:       { fr:'Acheter à prix club', en:'Buy at club price', es:'Comprar a precio club', it:'Acquista a prezzo club', de:'Zum Club-Preis kaufen', pt:'Comprar a preço de clube' },
    feat_domaines:      { fr:'Découvrir les domaines', en:'Discover the estates', es:'Descubrir las bodegas', it:'Scopri le tenute', de:'Weingüter entdecken', pt:'Descobrir as quintas' },
    feat_agenda:        { fr:'Agenda du club', en:'Club events', es:'Agenda del club', it:'Agenda del club', de:'Club-Termine', pt:'Agenda do clube' },
    feat_offres:        { fr:'Offres exclusives', en:'Exclusive offers', es:'Ofertas exclusivas', it:'Offerte esclusive', de:'Exklusive Angebote', pt:'Ofertas exclusivas' },
    feat_carnet:        { fr:'Carnet de dégustation', en:'Tasting journal', es:'Cuaderno de cata', it:'Diario di degustazione', de:'Verkostungsbuch', pt:'Caderno de degustação' },
    feat_fidelite:      { fr:'Fidélité & avantages', en:'Loyalty & benefits', es:'Fidelidad y ventajas', it:'Fedeltà e vantaggi', de:'Treue & Vorteile', pt:'Fidelidade e vantagens' },

    // ── Jours de la semaine ──
    day_lundi:          { fr:'Lundi', en:'Monday', es:'Lunes', it:'Lunedì', de:'Montag', pt:'Segunda' },
    day_mardi:          { fr:'Mardi', en:'Tuesday', es:'Martes', it:'Martedì', de:'Dienstag', pt:'Terça' },
    day_mercredi:       { fr:'Mercredi', en:'Wednesday', es:'Miércoles', it:'Mercoledì', de:'Mittwoch', pt:'Quarta' },
    day_jeudi:          { fr:'Jeudi', en:'Thursday', es:'Jueves', it:'Giovedì', de:'Donnerstag', pt:'Quinta' },
    day_vendredi:       { fr:'Vendredi', en:'Friday', es:'Viernes', it:'Venerdì', de:'Freitag', pt:'Sexta' },
    day_samedi:         { fr:'Samedi', en:'Saturday', es:'Sábado', it:'Sabato', de:'Samstag', pt:'Sábado' },
    day_dimanche:       { fr:'Dimanche', en:'Sunday', es:'Domingo', it:'Domenica', de:'Sonntag', pt:'Domingo' },
    horaires_semaine:   { fr:'Cette semaine', en:'This week', es:'Esta semana', it:'Questa settimana', de:'Diese Woche', pt:'Esta semana' },
    horaires_aujourdhui:{ fr:'Aujourd\'hui', en:'Today', es:'Hoy', it:'Oggi', de:'Heute', pt:'Hoje' },

    // ── Sheet Adresse ──
    sheet_adresse:      { fr:'Adresse', en:'Address', es:'Dirección', it:'Indirizzo', de:'Adresse', pt:'Morada' },
    sheet_plans:        { fr:'Plans', en:'Maps', es:'Mapas', it:'Mappe', de:'Karten', pt:'Mapas' },
    sheet_voir_carte:   { fr:'Voir sur la carte ou itinéraire', en:'View on map or get directions', es:'Ver en el mapa o ruta', it:'Vedi sulla mappa o indicazioni', de:'Auf der Karte oder Route anzeigen', pt:'Ver no mapa ou direções' },
    sheet_nav_temps:    { fr:'Navigation temps réel', en:'Real-time navigation', es:'Navegación en tiempo real', it:'Navigazione in tempo reale', de:'Echtzeit-Navigation', pt:'Navegação em tempo real' },
    sheet_copier_adresse:{ fr:'Copier l\'adresse', en:'Copy address', es:'Copiar dirección', it:'Copia indirizzo', de:'Adresse kopieren', pt:'Copiar morada' },
    sheet_adresse_copiee:{ fr:'Adresse copiée ✓', en:'Address copied ✓', es:'Dirección copiada ✓', it:'Indirizzo copiato ✓', de:'Adresse kopiert ✓', pt:'Morada copiada ✓' },

    // ── Sheet Partager ──
    sheet_partager:     { fr:'Partager', en:'Share', es:'Compartir', it:'Condividi', de:'Teilen', pt:'Partilhar' },
    sheet_garder_ecran: { fr:'Garder sur mon écran', en:'Add to home screen', es:'Guardar en pantalla', it:'Aggiungi alla schermata', de:'Zum Startbildschirm', pt:'Adicionar ao ecrã' },
    sheet_raccourci:    { fr:'Un raccourci, rien à installer', en:'A shortcut, nothing to install', es:'Un acceso directo, nada que instalar', it:'Una scorciatoia, nulla da installare', de:'Eine Verknüpfung, nichts zu installieren', pt:'Um atalho, nada para instalar' },
    sheet_partager_lien:{ fr:'Partager le lien', en:'Share link', es:'Compartir enlace', it:'Condividi link', de:'Link teilen', pt:'Partilhar link' },
    sheet_envoyer_ami:  { fr:'Envoyer à un ami', en:'Send to a friend', es:'Enviar a un amigo', it:'Invia a un amico', de:'An einen Freund senden', pt:'Enviar a um amigo' },
    sheet_copier_lien:  { fr:'Copier le lien', en:'Copy link', es:'Copiar enlace', it:'Copia link', de:'Link kopieren', pt:'Copiar link' },
    sheet_lien_copie:   { fr:'Lien copié !', en:'Link copied!', es:'¡Enlace copiado!', it:'Link copiato!', de:'Link kopiert!', pt:'Link copiado!' },

    // ── PWA Install ──
    pwa_titre:          { fr:'Garder sur votre écran', en:'Add to your home screen', es:'Guardar en su pantalla', it:'Aggiungi al tuo schermo', de:'Zum Startbildschirm hinzufügen', pt:'Adicionar ao seu ecrã' },
    pwa_sous_titre:     { fr:'Un simple raccourci, rien à installer ni à télécharger', en:'A simple shortcut, nothing to install or download', es:'Un simple acceso directo, nada que instalar', it:'Una semplice scorciatoia, nulla da installare', de:'Eine einfache Verknüpfung, nichts zu installieren', pt:'Um simples atalho, nada para instalar' },
    pwa_compris:        { fr:'Compris', en:'Got it', es:'Entendido', it:'Capito', de:'Verstanden', pt:'Entendido' },

    // ── Boutons génériques ──
    btn_annuler:        { fr:'Annuler', en:'Cancel', es:'Cancelar', it:'Annulla', de:'Abbrechen', pt:'Cancelar' },
    btn_fermer:         { fr:'Fermer', en:'Close', es:'Cerrar', it:'Chiudi', de:'Schließen', pt:'Fechar' },

    // ── Staff sheet ──
    staff_mon_profil:   { fr:'Mon profil', en:'My profile', es:'Mi perfil', it:'Il mio profilo', de:'Mein Profil', pt:'Meu perfil' },
    staff_deconnexion:  { fr:'Déconnexion', en:'Log out', es:'Cerrar sesión', it:'Disconnetti', de:'Abmelden', pt:'Terminar sessão' },
    staff_reservations: { fr:'Réservations', en:'Bookings', es:'Reservas', it:'Prenotazioni', de:'Reservierungen', pt:'Reservas' },
    staff_la_carte:     { fr:'La Carte', en:'Menu', es:'La Carta', it:'Il Menu', de:'Speisekarte', pt:'O Menu' },
    staff_pos:          { fr:'POS', en:'POS', es:'POS', it:'POS', de:'POS', pt:'POS' },
    staff_tpe:          { fr:'TPE', en:'Terminal', es:'TPE', it:'POS', de:'Terminal', pt:'TPA' },
    staff_communaute:   { fr:'Communauté', en:'Community', es:'Comunidad', it:'Comunità', de:'Community', pt:'Comunidade' },
    staff_ambassadeurs: { fr:'Ambassadeurs', en:'Ambassadors', es:'Embajadores', it:'Ambasciatori', de:'Botschafter', pt:'Embaixadores' },
    staff_avis:         { fr:'Avis clients', en:'Reviews', es:'Reseñas', it:'Recensioni', de:'Bewertungen', pt:'Avaliações' },
    staff_scanner:      { fr:'Scan', en:'Scan', es:'Scan', it:'Scan', de:'Scan', pt:'Scan' },
    staff_actus:        { fr:'Actus', en:'News', es:'Noticias', it:'Notizie', de:'Aktuelles', pt:'Notícias' },
    staff_cadeaux:      { fr:'Cadeaux', en:'Gift cards', es:'Regalos', it:'Regali', de:'Geschenke', pt:'Presentes' },
    staff_fidelite:     { fr:'Fidélité', en:'Loyalty', es:'Fidelidad', it:'Fedeltà', de:'Treue', pt:'Fidelidade' },
    staff_pourboires:   { fr:'Pourboires', en:'Tips', es:'Propinas', it:'Mance', de:'Trinkgeld', pt:'Gorjetas' },
    staff_scan_barcode: { fr:'Code-barres', en:'Barcode', es:'Código', it:'Codice', de:'Barcode', pt:'Código' },

    // ── Profil sheet ──
    profil_email:       { fr:'Email', en:'Email', es:'Email', it:'Email', de:'E-Mail', pt:'Email' },
    profil_telephone:   { fr:'Téléphone', en:'Phone', es:'Teléfono', it:'Telefono', de:'Telefon', pt:'Telefone' },
    profil_anniversaire:{ fr:'Anniversaire', en:'Birthday', es:'Cumpleaños', it:'Compleanno', de:'Geburtstag', pt:'Aniversário' },
    profil_adresse:     { fr:'Adresse', en:'Address', es:'Dirección', it:'Indirizzo', de:'Adresse', pt:'Morada' },
    profil_naissance:   { fr:'Date de naissance', en:'Date of birth', es:'Fecha de nacimiento', it:'Data di nascita', de:'Geburtsdatum', pt:'Data de nascimento' },

    // ── Wallet / Pass ──
    wallet_titre:       { fr:'Club Sauf Imprévu', en:'Club Sauf Imprévu', es:'Club Sauf Imprévu', it:'Club Sauf Imprévu', de:'Club Sauf Imprévu', pt:'Club Sauf Imprévu' },
    wallet_sous_titre:  { fr:'Accédez à vos avantages en un tap', en:'Access your benefits with one tap', es:'Acceda a sus ventajas con un toque', it:'Accedi ai vantaggi con un tap', de:'Zugriff auf Ihre Vorteile mit einem Tap', pt:'Aceda às suas vantagens com um toque' },
    wallet_apple:       { fr:'Apple Wallet', en:'Apple Wallet', es:'Apple Wallet', it:'Apple Wallet', de:'Apple Wallet', pt:'Apple Wallet' },
    wallet_google:      { fr:'Google Wallet', en:'Google Wallet', es:'Google Wallet', it:'Google Wallet', de:'Google Wallet', pt:'Google Wallet' },
    wallet_bientot:     { fr:'Bientôt disponible !', en:'Coming soon!', es:'¡Próximamente!', it:'Prossimamente!', de:'Bald verfügbar!', pt:'Em breve!' },

    // ── Messages Maïa (bulles) ──
    maia_reste_la:      { fr:'Je reste là si vous avez besoin de moi !', en:'I\'m here if you need me!', es:'¡Estoy aquí si me necesita!', it:'Sono qui se hai bisogno!', de:'Ich bin hier, wenn Sie mich brauchen!', pt:'Estou aqui se precisar de mim!' },
    maia_table_soir:    { fr:'Une table ce soir ?', en:'A table tonight?', es:'¿Una mesa esta noche?', it:'Un tavolo stasera?', de:'Ein Tisch heute Abend?', pt:'Uma mesa esta noite?' },
    maia_conseil_vin:   { fr:'Un conseil vin ? 🍷', en:'Wine advice? 🍷', es:'¿Un consejo de vino? 🍷', it:'Un consiglio sul vino? 🍷', de:'Weinempfehlung? 🍷', pt:'Conselho de vinho? 🍷' },
    maia_besoin_aide:   { fr:'Besoin d\'aide ?', en:'Need help?', es:'¿Necesita ayuda?', it:'Bisogno di aiuto?', de:'Brauchen Sie Hilfe?', pt:'Precisa de ajuda?' },

    // ── Erreurs ──
    err_reseau:         { fr:'Erreur de connexion au serveur. Vérifiez votre réseau.', en:'Server connection error. Check your network.', es:'Error de conexión al servidor. Verifique su red.', it:'Errore di connessione al server. Verifica la rete.', de:'Server-Verbindungsfehler. Überprüfen Sie Ihr Netzwerk.', pt:'Erro de ligação ao servidor. Verifique a sua rede.' },
    err_reseau_chat:    { fr:'Connexion impossible. Vérifiez votre réseau.', en:'Connection failed. Check your network.', es:'Conexión imposible. Verifique su red.', it:'Connessione impossibile. Verifica la rete.', de:'Verbindung fehlgeschlagen. Überprüfen Sie Ihr Netzwerk.', pt:'Ligação impossível. Verifique a sua rede.' },
    alert_club:         { fr:'L\'adhésion au club sera bientôt disponible !', en:'Club membership coming soon!', es:'¡La membresía del club estará disponible pronto!', it:'L\'iscrizione al club sarà presto disponibile!', de:'Club-Mitgliedschaft bald verfügbar!', pt:'A adesão ao clube estará disponível em breve!' },

    // ── Sélecteur de langue ──
    langue_titre:       { fr:'Langue', en:'Language', es:'Idioma', it:'Lingua', de:'Sprache', pt:'Idioma' },
  };

  var currentLang = localStorage.getItem('i18n_lang') || 'fr';

  function t(key) {
    var entry = T[key];
    if (!entry) return key;
    return entry[currentLang] || entry.fr || key;
  }

  function setLang(lang) {
    if (LANGS.indexOf(lang) === -1) return;
    currentLang = lang;
    localStorage.setItem('i18n_lang', lang);
    applyAll();
    // Dispatch event pour chat.html ou autres pages
    window.dispatchEvent(new CustomEvent('i18n-changed', { detail: { lang: lang } }));
  }

  function getLang() { return currentLang; }
  function getLangs() { return LANGS; }
  function getLangLabel(l) { return LANG_LABELS[l] || l; }
  function getLangFlag(l) { return LANG_FLAGS[l] || '🌐'; }

  function applyAll() {
    // Texte
    var els = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < els.length; i++) {
      var key = els[i].getAttribute('data-i18n');
      els[i].textContent = t(key);
    }
    // Placeholder
    var phs = document.querySelectorAll('[data-i18n-ph]');
    for (var j = 0; j < phs.length; j++) {
      var key2 = phs[j].getAttribute('data-i18n-ph');
      phs[j].placeholder = t(key2);
    }
    // HTML lang attribute
    document.documentElement.lang = currentLang;
  }

  // Auto-apply au chargement
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyAll);
  } else {
    applyAll();
  }

  return { t:t, setLang:setLang, getLang:getLang, getLangs:getLangs, getLangLabel:getLangLabel, getLangFlag:getLangFlag, applyAll:applyAll, TRANSLATIONS:T };
})();
