# Module `wines`

Identification de bouteilles de vin via Claude Vision + base collaborative.

## Structure

```
modules/wines/
├── README.md         ← ce fichier
├── schema.sql        ← tables SQLite (wines, wine_photos, wine_scans, FTS)
├── storage.js        ← accès DB + filesystem photos
├── prompts.js        ← prompts Claude Vision (isolés pour itération)
├── claude.js         ← wrapper Anthropic SDK
└── routes.js         ← routes Express (POST /scan, /confirm, GET /search, /:id)
```

## Montage dans `server.js`

```js
const winesStorage = require('./modules/wines/storage');
const winesRouter  = require('./modules/wines/routes');

// Init DB + dossier photos (à faire après avoir défini DB_DIR et le dossier public)
winesStorage.init({
  dbDir:     DB_DIR,
  publicDir: path.join(__dirname, 'public'),
});

app.use('/api/wine', winesRouter());
```

Les photos sont stockées sous `public/uploads/wines/` et servies via
`express.static(path.join(__dirname, 'public'))` qui est déjà monté.

## Variables d'environnement

- `ANTHROPIC_API_KEY` (obligatoire) — déjà utilisée par `chat.js`
- `WINES_MODEL` (optionnel) — défaut `claude-sonnet-4-6`

## API

### `POST /api/wine/scan`
Multipart form : `photo` (fichier image, ≤ 8 Mo).
Réponse :
```json
{
  "status": "identified" | "partial" | "unknown",
  "suggestion": { ...champs vin... },
  "photo": { "id": 42, "path": "/uploads/wines/17xxx-photo.jpg", "uploaded_at": 1712... },
  "model": "claude-sonnet-4-6",
  "durationMs": 2300
}
```

### `POST /api/wine/confirm`
Body JSON : `{ wine: {...}, photoId?: number, primary?: boolean }`
Crée la fiche en base et lie la photo. Renvoie la fiche créée.

### `GET /api/wine/search?q=chapoutier`
Recherche FTS5 (fallback LIKE si FTS indispo). Renvoie les 20 premiers résultats.

### `GET /api/wine/:id`
Récupère une fiche + ses photos.

## Portabilité

Ce module est volontairement autonome : une seule DB (`wines.db`), un seul
dossier photos (`public/uploads/wines/`), zéro dépendance aux autres tables de
myPlace. Le jour où on le déplace vers Sauf Imprévu, il suffit de copier ce
dossier, ajuster les 2 chemins dans `storage.init()`, et monter le router.
