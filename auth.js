/**
 * Module d'authentification OpenID Connect — mySafe
 * Flow: Authorization Code avec PKCE (S256)
 * Supporte le cross-domain (myPlace) via token signé en hash fragment
 */
const { Issuer, generators } = require('openid-client');
const crypto = require('crypto');

let client = null;

// Domaines autorisés pour le returnTo cross-domain
const ALLOWED_RETURN_DOMAINS = [
  'myplace.coach',
  'www.myplace.coach',
  'myplace-production.up.railway.app',
  'localhost',
];

/**
 * Vérifie si une URL returnTo est autorisée (même domaine ou domaine whitelist)
 */
function isAllowedReturnTo(url) {
  if (!url) return false;
  // Chemins relatifs = toujours OK (same-origin)
  if (url.startsWith('/')) return true;
  try {
    const parsed = new URL(url);
    return ALLOWED_RETURN_DOMAINS.some(d => parsed.hostname === d || parsed.hostname.endsWith('.' + d));
  } catch {
    return false;
  }
}

/**
 * Crée un token signé contenant les infos user (HMAC-SHA256)
 * Format: base64url(JSON payload).base64url(signature)
 * Expire après 30 jours
 */
function createUserToken(user) {
  const secret = process.env.OIDC_CLIENT_SECRET || 'dev-secret';
  const payload = {
    sub: user.sub,
    account_id: user.account_id || null,
    name: user.name,
    email: user.email,
    picture: user.picture,
    birthday: user.birthday || null,
    phone: user.phone || null,
    address: user.address || null,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60), // 30 jours
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return payloadB64 + '.' + sig;
}

/**
 * Vérifie et décode un token signé
 */
function verifyUserToken(token) {
  if (!token || !token.includes('.')) return null;
  const secret = process.env.OIDC_CLIENT_SECRET || 'dev-secret';
  const [payloadB64, sig] = token.split('.');
  const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  if (sig !== expectedSig) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Initialise le client OIDC depuis la discovery URL
 */
async function initOIDC() {
  if (client) return client;

  const issuer = await Issuer.discover('https://openid.mysafe.services');
  console.log('✓ OIDC Issuer discovered:', issuer.metadata.issuer);

  client = new issuer.Client({
    client_id: process.env.OIDC_CLIENT_ID,
    client_secret: process.env.OIDC_CLIENT_SECRET,
    redirect_uris: [process.env.OIDC_REDIRECT_URI],
    post_logout_redirect_uris: [process.env.OIDC_POST_LOGOUT_URI],
    response_types: ['code'],
    token_endpoint_auth_method: 'client_secret_basic',
  });

  return client;
}

/**
 * Middleware : vérifie si l'utilisateur est authentifié
 */
function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  // Sauvegarder l'URL d'origine pour rediriger après login
  req.session.returnTo = req.originalUrl;
  res.redirect('/auth/login');
}

/**
 * Middleware : injecte l'user dans res.locals (pour les templates/API)
 */
function injectUser(req, res, next) {
  res.locals.user = req.session ? req.session.user : null;
  next();
}

/**
 * Monte les routes d'authentification sur le router Express
 */
function authRoutes(router) {

  // --- LOGIN : redirige vers mySafe ---
  // Accepte ?returnTo=<url> pour le cross-domain (myPlace)
  router.get('/auth/login', async (req, res) => {
    try {
      if (!process.env.OIDC_CLIENT_ID) {
        return res.status(503).json({ error: 'SSO non configuré — OIDC_CLIENT_ID manquant' });
      }

      // Sauvegarder returnTo (cross-domain ou local)
      const returnTo = req.query.returnTo || req.session.returnTo;
      if (returnTo && isAllowedReturnTo(returnTo)) {
        req.session.returnTo = returnTo;
      }

      const oidcClient = await initOIDC();
      const codeVerifier = generators.codeVerifier();
      const codeChallenge = generators.codeChallenge(codeVerifier);
      const state = generators.state();

      // Stocker dans la session pour vérification au callback
      req.session.oidc = { codeVerifier, state };

      const authUrl = oidcClient.authorizationUrl({
        scope: 'openid birthday emails phones addresses account_id',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });

      res.redirect(authUrl);
    } catch (err) {
      console.error('❌ OIDC login error:', err.message);
      res.redirect('/admin?auth_error=1');
    }
  });

  // --- CALLBACK : échange du code contre un token ---
  // Route sur /connected (URL enregistrée dans mySafe) + alias /auth/callback
  router.get('/auth/callback', (req, res) => res.redirect(307, '/connected' + (req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '')));
  router.get('/connected', async (req, res) => {
    try {
      if (!process.env.OIDC_CLIENT_ID) {
        return res.status(503).json({ error: 'SSO non configuré' });
      }
      const oidcClient = await initOIDC();
      const oidcSession = req.session.oidc;
      if (!oidcSession) {
        return res.redirect('/admin?auth_error=no_session');
      }

      const params = oidcClient.callbackParams(req);
      const tokenSet = await oidcClient.callback(
        process.env.OIDC_REDIRECT_URI,
        params,
        {
          code_verifier: oidcSession.codeVerifier,
          state: oidcSession.state,
        }
      );

      // Récupérer les infos utilisateur
      console.log('✓ OIDC token claims:', JSON.stringify(tokenSet.claims(), null, 2));
      console.log('✓ OIDC access_token exists:', !!tokenSet.access_token);
      let userInfo = tokenSet.claims(); // fallback = claims du id_token
      try {
        const uinfo = await oidcClient.userinfo(tokenSet.access_token);
        console.log('✓ OIDC userinfo response:', JSON.stringify(uinfo, null, 2));
        userInfo = { ...userInfo, ...uinfo }; // merge claims + userinfo
      } catch (e) {
        console.warn('⚠ userinfo fetch failed, using token claims only:', e.message);
      }
      console.log('✓ OIDC final userInfo:', JSON.stringify(userInfo, null, 2));

      // Stocker en session (tous les champs disponibles)
      req.session.user = {
        sub: userInfo.sub,
        account_id: userInfo.account_id || null,
        email: userInfo.email || (userInfo.emails && userInfo.emails[0]) || null,
        name: userInfo.name || userInfo.preferred_username || userInfo.sub,
        picture: userInfo.picture || null,
        birthday: userInfo.birthday || userInfo.birthdate || null,
        phone: userInfo.phone_number || (userInfo.phones && userInfo.phones[0]) || null,
        address: userInfo.address || (userInfo.addresses && userInfo.addresses[0]) || null,
        roles: userInfo.roles || [],
      };
      req.session.tokens = {
        access_token: tokenSet.access_token,
        refresh_token: tokenSet.refresh_token,
        id_token: tokenSet.id_token,
        expires_at: tokenSet.expires_at,
      };

      // Nettoyer les données OIDC temporaires
      delete req.session.oidc;

      // Rediriger vers la page d'origine ou le backoffice
      const returnTo = req.session.returnTo || '/admin';
      delete req.session.returnTo;

      // Si returnTo est une URL externe (cross-domain), envoyer un token signé en hash
      if (returnTo.startsWith('http')) {
        const token = createUserToken(req.session.user);
        const separator = returnTo.includes('#') ? '&' : '#';
        return res.redirect(returnTo + separator + 'auth=' + token);
      }

      res.redirect(returnTo);

    } catch (err) {
      console.error('❌ OIDC callback error:', err.message);
      res.redirect('/admin?auth_error=callback_failed');
    }
  });

  // --- Route /disconnected : landing après logout mySafe ---
  // Lit le returnTo depuis le cookie (posé avant le logout) ou query param
  router.get('/disconnected', (req, res) => {
    // Lire le cookie logout_returnTo manuellement (pas besoin de cookie-parser)
    let cookieReturnTo = null;
    if (req.headers.cookie) {
      const match = req.headers.cookie.match(/logout_returnTo=([^;]+)/);
      if (match) cookieReturnTo = decodeURIComponent(match[1]);
    }
    const returnTo = req.query.returnTo || cookieReturnTo;
    // Nettoyer le cookie
    res.clearCookie('logout_returnTo');
    if (returnTo && isAllowedReturnTo(returnTo)) {
      return res.redirect(returnTo);
    }
    res.redirect('/admin');
  });

  // --- LOGOUT : déconnexion locale + mySafe ---
  // Accepte ?returnTo=<url> pour le cross-domain (myPlace)
  router.get('/auth/logout', async (req, res) => {
    try {
      const returnTo = req.query.returnTo;
      const oidcClient = await initOIDC();
      const idToken = req.session.tokens ? req.session.tokens.id_token : null;

      // Stocker le returnTo dans un cookie AVANT de détruire la session
      if (returnTo && isAllowedReturnTo(returnTo)) {
        res.cookie('logout_returnTo', returnTo, { maxAge: 60000, httpOnly: true, sameSite: 'lax' });
      }

      // Détruire la session locale
      req.session.destroy((err) => {
        if (err) console.error('Session destroy error:', err);
      });

      // Toujours envoyer l'URI whitelistée exacte (sans query params) à mySafe
      const postLogoutUri = process.env.OIDC_POST_LOGOUT_URI || '/disconnected';

      if (idToken) {
        const logoutUrl = oidcClient.endSessionUrl({
          id_token_hint: idToken,
          post_logout_redirect_uri: postLogoutUri,
        });
        res.redirect(logoutUrl);
      } else {
        res.redirect(postLogoutUri);
      }
    } catch (err) {
      console.error('❌ OIDC logout error:', err.message);
      res.redirect('/admin');
    }
  });

  // --- API : info utilisateur courant (pour le frontend same-origin) ---
  router.get('/auth/me', (req, res) => {
    if (req.session && req.session.user) {
      res.json({ authenticated: true, user: req.session.user });
    } else {
      res.json({ authenticated: false });
    }
  });

  // --- API : vérifier un token signé (pour le frontend cross-domain myPlace) ---
  router.get('/auth/verify', (req, res) => {
    const token = req.query.token;
    const user = verifyUserToken(token);
    if (user) {
      res.json({ authenticated: true, user });
    } else {
      res.json({ authenticated: false });
    }
  });

  return router;
}

module.exports = { initOIDC, requireAuth, injectUser, authRoutes, createUserToken, verifyUserToken };
