/**
 * Sign in with Apple — vérification du identity token (JWT)
 * Pas de dépendance externe : utilise crypto natif + JWKS Apple
 *
 * Flow :
 *  1. iOS (Capacitor) appelle SignInWithApple.authorize() → retourne identityToken + user
 *  2. Frontend POST /auth/apple { identityToken, user }
 *  3. Serveur vérifie le JWT contre les clés publiques Apple (JWKS)
 *  4. Crée la session Express (persistante via SQLiteStore)
 *  5. Stocke/retrouve l'user dans la table `apple_users`
 */

const crypto = require('crypto');
const https = require('https');

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';

// Audiences acceptées dans le JWT :
// - Bundle ID (app iOS native)
// - Services ID (web via Apple JS SDK)
const APPLE_AUDIENCES = [
  process.env.APPLE_BUNDLE_ID || 'fr.saufimprevu.app',
  process.env.APPLE_SERVICES_ID || 'com.saufimprevu.web',
].filter(Boolean);

// ── Cache des clés publiques Apple (TTL 1h) ──────────────────────────────────
let jwksCache = null;
let jwksCacheExpiry = 0;

function fetchAppleJWKS() {
  return new Promise((resolve, reject) => {
    https.get(APPLE_JWKS_URL, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data).keys); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function getAppleKeys() {
  if (jwksCache && Date.now() < jwksCacheExpiry) return jwksCache;
  jwksCache = await fetchAppleJWKS();
  jwksCacheExpiry = Date.now() + 60 * 60 * 1000; // 1h
  return jwksCache;
}

// ── Vérification JWT ─────────────────────────────────────────────────────────
function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64');
}

async function verifyAppleIdentityToken(idToken) {
  if (!idToken || typeof idToken !== 'string') throw new Error('Token manquant');

  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('JWT malformé');
  const [headerB64, payloadB64, sigB64] = parts;

  const header = JSON.parse(b64urlDecode(headerB64).toString());
  const payload = JSON.parse(b64urlDecode(payloadB64).toString());

  // Trouver la clé publique correspondante
  const keys = await getAppleKeys();
  const jwk = keys.find(k => k.kid === header.kid);
  if (!jwk) throw new Error('Clé Apple introuvable (kid=' + header.kid + ')');

  // Construire la clé publique depuis le JWK
  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });

  // Vérifier la signature RSA-SHA256
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(headerB64 + '.' + payloadB64);
  const valid = verifier.verify(publicKey, b64urlDecode(sigB64));
  if (!valid) throw new Error('Signature invalide');

  // Vérifier les claims
  if (payload.iss !== APPLE_ISSUER) throw new Error('Issuer invalide: ' + payload.iss);
  if (!APPLE_AUDIENCES.includes(payload.aud)) throw new Error('Audience invalide: ' + payload.aud);
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) throw new Error('Token expiré');
  if (payload.iat > now + 60) throw new Error('Token futur');

  return payload;
}

// ── Table users Apple (persistance email/nom entre logins) ────────────────────
// Apple ne renvoie email/nom QU'À la première connexion → on doit les stocker
function initAppleUsersTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS apple_users (
      sub TEXT PRIMARY KEY,
      email TEXT,
      name TEXT,
      created_at INTEGER NOT NULL,
      last_login_at INTEGER NOT NULL
    );
  `);
}

function upsertAppleUser(db, { sub, email, name }) {
  const now = Date.now();
  const existing = db.prepare('SELECT * FROM apple_users WHERE sub = ?').get(sub);
  if (existing) {
    // Mettre à jour email/nom seulement si on a de nouvelles valeurs (1ère connexion)
    db.prepare(`
      UPDATE apple_users
      SET email = COALESCE(?, email),
          name = COALESCE(?, name),
          last_login_at = ?
      WHERE sub = ?
    `).run(email || null, name || null, now, sub);
    return {
      sub,
      email: email || existing.email,
      name: name || existing.name,
    };
  } else {
    db.prepare(`
      INSERT INTO apple_users (sub, email, name, created_at, last_login_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(sub, email || null, name || null, now, now);
    return { sub, email, name };
  }
}

// ── Route Express ─────────────────────────────────────────────────────────────
function appleAuthRoutes(router, db) {
  initAppleUsersTable(db);

  // POST /auth/apple { identityToken, user: { givenName, familyName, email } }
  router.post('/auth/apple', async (req, res) => {
    try {
      const { identityToken, user: clientUser } = req.body || {};
      if (!identityToken) {
        return res.status(400).json({ error: 'identityToken requis' });
      }

      // Vérifier le JWT Apple
      const payload = await verifyAppleIdentityToken(identityToken);

      // payload.sub = identifiant Apple stable (unique par app + user)
      // payload.email = présent si non-masqué ET si user l'a partagé
      // clientUser = envoyé par l'app iOS, UNIQUEMENT à la 1ère connexion
      const appleSub = payload.sub;
      const emailFromToken = payload.email || null;
      const emailFromClient = clientUser && clientUser.email || null;
      const nameFromClient = clientUser && clientUser.givenName
        ? `${clientUser.givenName} ${clientUser.familyName || ''}`.trim()
        : null;

      // Stocker/récupérer user (Apple renvoie email/nom seulement à la 1ère connexion)
      const user = upsertAppleUser(db, {
        sub: appleSub,
        email: emailFromToken || emailFromClient,
        name: nameFromClient,
      });

      // Créer la session Express
      req.session.user = {
        sub: 'apple:' + user.sub,
        provider: 'apple',
        email: user.email,
        name: user.name || user.email || 'Utilisateur',
        picture: null,
        email_verified: payload.email_verified === 'true' || payload.email_verified === true,
        is_private_email: payload.is_private_email === 'true' || payload.is_private_email === true,
      };

      res.json({ ok: true, user: req.session.user });
    } catch (err) {
      console.error('❌ Apple auth error:', err.message);
      res.status(401).json({ error: 'Authentification Apple échouée', detail: err.message });
    }
  });

  return router;
}

module.exports = { appleAuthRoutes, verifyAppleIdentityToken };
