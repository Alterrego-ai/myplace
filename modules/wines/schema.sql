-- ═══════════════════════════════════════════════════════════════════════════
-- Module wines — Base collaborative vins & univers du vin
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Producteurs (domaines, maisons, caves) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS producers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug            TEXT NOT NULL UNIQUE,  -- clé de matching ("maison-chandesais")
  name            TEXT NOT NULL,
  legal_name      TEXT,
  country         TEXT,
  region          TEXT,
  appellation_main TEXT,
  address         TEXT,
  latitude        REAL,
  longitude       REAL,
  website         TEXT,
  phone           TEXT,
  email           TEXT,
  owner           TEXT,
  founded_year    INTEGER,
  area_ha         REAL,
  farming         TEXT,                  -- conventional / organic / biodynamic / natural
  description     TEXT,
  wikipedia_url   TEXT,
  enrichment_status TEXT DEFAULT 'pending', -- pending / enriching / enriched / failed
  enriched_at     INTEGER,
  source          TEXT DEFAULT 'scan',   -- scan / manual / import / enrichment
  created_by      TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_producers_name   ON producers(name);
CREATE INDEX IF NOT EXISTS idx_producers_region ON producers(region);
CREATE INDEX IF NOT EXISTS idx_producers_enrich ON producers(enrichment_status);

-- FTS producteurs
CREATE VIRTUAL TABLE IF NOT EXISTS producers_fts USING fts5(
  name, legal_name, region, appellation_main, description,
  content='producers', content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS producers_ai AFTER INSERT ON producers BEGIN
  INSERT INTO producers_fts(rowid, name, legal_name, region, appellation_main, description)
  VALUES (new.id, new.name, new.legal_name, new.region, new.appellation_main, new.description);
END;
CREATE TRIGGER IF NOT EXISTS producers_ad AFTER DELETE ON producers BEGIN
  INSERT INTO producers_fts(producers_fts, rowid, name, legal_name, region, appellation_main, description)
  VALUES ('delete', old.id, old.name, old.legal_name, old.region, old.appellation_main, old.description);
END;
CREATE TRIGGER IF NOT EXISTS producers_au AFTER UPDATE ON producers BEGIN
  INSERT INTO producers_fts(producers_fts, rowid, name, legal_name, region, appellation_main, description)
  VALUES ('delete', old.id, old.name, old.legal_name, old.region, old.appellation_main, old.description);
  INSERT INTO producers_fts(rowid, name, legal_name, region, appellation_main, description)
  VALUES (new.id, new.name, new.legal_name, new.region, new.appellation_main, new.description);
END;

CREATE TABLE IF NOT EXISTS wines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,
  producer       TEXT,
  appellation    TEXT,
  region         TEXT,
  country        TEXT,
  vintage        INTEGER,
  type           TEXT,                 -- rouge / blanc / rosé / effervescent / ...
  color          TEXT,
  grapes         TEXT,                 -- JSON array
  alcohol        REAL,
  volume_ml      INTEGER,
  tasting_notes  TEXT,
  food_pairings  TEXT,                 -- JSON array
  aging_potential TEXT,
  service_temp   TEXT,
  avg_price_eur  REAL,
  confidence     REAL,                 -- 0..1 (score de l'IA sur l'identification)
  source         TEXT,                 -- 'scan' | 'manual' | 'import'
  created_by     TEXT,                 -- user sub (optionnel)
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_wines_name       ON wines(name);
CREATE INDEX IF NOT EXISTS idx_wines_producer   ON wines(producer);
CREATE INDEX IF NOT EXISTS idx_wines_appellation ON wines(appellation);
CREATE INDEX IF NOT EXISTS idx_wines_region     ON wines(region);
CREATE INDEX IF NOT EXISTS idx_wines_vintage    ON wines(vintage);

-- Recherche plein-texte (FTS5)
CREATE VIRTUAL TABLE IF NOT EXISTS wines_fts USING fts5(
  name, producer, appellation, region, country, grapes, tasting_notes,
  content='wines', content_rowid='id'
);

-- Triggers pour maintenir le FTS en sync
CREATE TRIGGER IF NOT EXISTS wines_ai AFTER INSERT ON wines BEGIN
  INSERT INTO wines_fts(rowid, name, producer, appellation, region, country, grapes, tasting_notes)
  VALUES (new.id, new.name, new.producer, new.appellation, new.region, new.country, new.grapes, new.tasting_notes);
END;
CREATE TRIGGER IF NOT EXISTS wines_ad AFTER DELETE ON wines BEGIN
  INSERT INTO wines_fts(wines_fts, rowid, name, producer, appellation, region, country, grapes, tasting_notes)
  VALUES ('delete', old.id, old.name, old.producer, old.appellation, old.region, old.country, old.grapes, old.tasting_notes);
END;
CREATE TRIGGER IF NOT EXISTS wines_au AFTER UPDATE ON wines BEGIN
  INSERT INTO wines_fts(wines_fts, rowid, name, producer, appellation, region, country, grapes, tasting_notes)
  VALUES ('delete', old.id, old.name, old.producer, old.appellation, old.region, old.country, old.grapes, old.tasting_notes);
  INSERT INTO wines_fts(rowid, name, producer, appellation, region, country, grapes, tasting_notes)
  VALUES (new.id, new.name, new.producer, new.appellation, new.region, new.country, new.grapes, new.tasting_notes);
END;

-- Photos attachées à une fiche vin
CREATE TABLE IF NOT EXISTS wine_photos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  wine_id     INTEGER,                 -- peut être NULL si le scan n'a pas encore été confirmé
  path        TEXT NOT NULL,           -- chemin relatif sous /public/uploads/wines/
  is_primary  INTEGER DEFAULT 0,
  uploaded_by TEXT,
  uploaded_at INTEGER NOT NULL,
  FOREIGN KEY (wine_id) REFERENCES wines(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_wine_photos_wine ON wine_photos(wine_id);

-- Historique de tous les scans (pour analyse, amélioration prompt, re-training futur)
CREATE TABLE IF NOT EXISTS wine_scans (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  photo_id       INTEGER,
  ai_raw         TEXT,                 -- JSON brut renvoyé par Claude
  ai_status      TEXT,                 -- 'identified' | 'partial' | 'unknown' | 'error'
  matched_wine_id INTEGER,             -- NULL si pas confirmé
  user_sub       TEXT,
  duration_ms    INTEGER,
  model          TEXT,                 -- modèle Claude utilisé
  input_tokens   INTEGER,
  output_tokens  INTEGER,
  cost_usd       REAL,                 -- coût calculé côté serveur (source de vérité)
  -- Géolocalisation du scan (où la photo a été prise)
  lat                 REAL,
  lon                 REAL,
  location_source     TEXT,            -- 'gps' | 'exif' | null
  location_accuracy_m REAL,            -- précision GPS en mètres
  location_at         INTEGER,         -- timestamp de la capture de position
  place_name          TEXT,            -- reverse geocode (ex: "Cave Les Halles, Beaune")
  place_type          TEXT,            -- 'vigneron'|'commerce'|'restaurant'|'particulier'|'inconnu'
  matched_producer_id INTEGER,         -- producteur détecté par match spatial
  created_at     INTEGER NOT NULL,
  FOREIGN KEY (photo_id) REFERENCES wine_photos(id) ON DELETE SET NULL,
  FOREIGN KEY (matched_wine_id) REFERENCES wines(id) ON DELETE SET NULL,
  FOREIGN KEY (matched_producer_id) REFERENCES producers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_wine_scans_wine ON wine_scans(matched_wine_id);
CREATE INDEX IF NOT EXISTS idx_wine_scans_user ON wine_scans(user_sub);
CREATE INDEX IF NOT EXISTS idx_wine_scans_created ON wine_scans(created_at);

-- Historique des enrichissements producteurs (appels Claude hors scan)
CREATE TABLE IF NOT EXISTS producer_enrichments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  producer_id   INTEGER NOT NULL,
  status        TEXT,                 -- 'identified' | 'partial' | 'unknown' | 'error'
  ai_raw        TEXT,
  fields_updated TEXT,                -- JSON array des champs patchés
  model         TEXT,
  input_tokens  INTEGER,
  output_tokens INTEGER,
  cost_usd      REAL,
  duration_ms   INTEGER,
  user_sub      TEXT,
  created_at    INTEGER NOT NULL,
  FOREIGN KEY (producer_id) REFERENCES producers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_producer_enrich_prod ON producer_enrichments(producer_id);
CREATE INDEX IF NOT EXISTS idx_producer_enrich_created ON producer_enrichments(created_at);

-- ─── Cave de l'utilisateur (inventaire perso) ───────────────────────────────
-- wines = base de connaissance (toujours alimentée par les scans).
-- user_cellar = inventaire perso d'un user donné : ce qu'il POSSÈDE.
-- Un même wine_id peut apparaître plusieurs fois pour un même user si
-- il a plusieurs bouteilles achetées à des dates/prix différents, mais
-- le front peut aussi choisir d'agréger en incrémentant quantity.
CREATE TABLE IF NOT EXISTS user_cellar (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_sub        TEXT NOT NULL,           -- identifiant user (sub OIDC ou email)
  wine_id         INTEGER NOT NULL,        -- soft FK vers wines.id (base de connaissance)
  quantity        INTEGER NOT NULL DEFAULT 1,
  acquired_at     INTEGER,                 -- date d'achat (epoch ms)
  acquired_price_eur REAL,                 -- prix d'achat réel (si connu)
  location        TEXT,                    -- "Cave rack B · rang 4" / "Frigo" / ...
  notes           TEXT,                    -- notes perso sur cette bouteille
  photo_id        INTEGER,                 -- photo perso (optionnel, sinon photo de la fiche)
  status          TEXT DEFAULT 'stock',    -- 'stock' | 'consumed' | 'gifted' | 'lost'
  consumed_at     INTEGER,                 -- si status='consumed'
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  FOREIGN KEY (wine_id) REFERENCES wines(id) ON DELETE CASCADE,
  FOREIGN KEY (photo_id) REFERENCES wine_photos(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_user_cellar_user ON user_cellar(user_sub);
CREATE INDEX IF NOT EXISTS idx_user_cellar_wine ON user_cellar(wine_id);
CREATE INDEX IF NOT EXISTS idx_user_cellar_status ON user_cellar(status);

-- ─── Code-barres EAN → wine_id (cache d'identification gratuit) ──────────────
-- Permet de sauter l'appel Claude Vision pour les cuvées déjà connues.
CREATE TABLE IF NOT EXISTS wine_barcodes (
  ean         TEXT PRIMARY KEY,
  wine_id     INTEGER NOT NULL,
  format      TEXT,                    -- 'ean13'|'ean8'|'upc_a'|'upc_e'|'qr'
  scan_count  INTEGER NOT NULL DEFAULT 1,
  first_seen  INTEGER NOT NULL,
  last_seen   INTEGER NOT NULL,
  created_by  TEXT,
  FOREIGN KEY (wine_id) REFERENCES wines(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_wine_barcodes_wine ON wine_barcodes(wine_id);

-- ─── Référentiel millésimes (RUF — prêt pour enrichissement futur) ──────────
-- Qualité et contexte d'un millésime pour (pays, région, [appellation]).
-- Réutilisé pour tous les vins de ce triplet. Une seule recherche Claude
-- enrichit toute une cohorte de vins.
CREATE TABLE IF NOT EXISTS vintages (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  country           TEXT,
  region            TEXT,
  appellation       TEXT,              -- NULL = note régionale globale
  vintage           INTEGER NOT NULL,
  score             INTEGER,           -- /100
  rating_label      TEXT,              -- 'exceptionnel'|'excellent'|'bon'|'moyen'|'faible'
  summary           TEXT,              -- résumé qualité
  weather_summary   TEXT,              -- conditions météo
  harvest_notes     TEXT,              -- vendanges
  aging_potential   TEXT,              -- potentiel de garde global
  sources           TEXT,              -- JSON array
  enrichment_status TEXT DEFAULT 'pending',
  enriched_at       INTEGER,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vintages_unique
  ON vintages(IFNULL(country,''), IFNULL(region,''), IFNULL(appellation,''), vintage);
CREATE INDEX IF NOT EXISTS idx_vintages_status ON vintages(enrichment_status);

-- ─── Référentiel appellations (RUF) ─────────────────────────────────────────
-- Terroir, cépages autorisés, style. Enrichi à la demande par Claude.
CREATE TABLE IF NOT EXISTS appellations (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  slug              TEXT UNIQUE NOT NULL,
  name              TEXT NOT NULL,
  country           TEXT,
  region            TEXT,
  aoc_level         TEXT,              -- 'AOC'|'IGP'|'DOCG'|'DOC'|'Vin de France'...
  allowed_grapes    TEXT,              -- JSON array
  typical_style     TEXT,              -- 'rouge puissant', 'blanc sec minéral'...
  terroir           TEXT,
  area_ha           REAL,
  description       TEXT,
  enrichment_status TEXT DEFAULT 'pending',
  enriched_at       INTEGER,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_appellations_region ON appellations(region);
CREATE INDEX IF NOT EXISTS idx_appellations_status ON appellations(enrichment_status);
