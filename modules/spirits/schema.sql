-- ═══════════════════════════════════════════════════════════════════════════
-- Module spirits — Base collaborative spiritueux (whisky, rhum, cognac, gin…)
-- Architecture parallèle au module wines.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Distilleries (domaines producteurs de spiritueux) ─────────────────────
CREATE TABLE IF NOT EXISTS distilleries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug            TEXT NOT NULL UNIQUE,   -- "lagavulin", "rhum-clement"
  name            TEXT NOT NULL,
  legal_name      TEXT,
  country         TEXT,
  region          TEXT,                   -- 'Islay'|'Speyside'|'Martinique'|'Cognac'…
  category        TEXT,                   -- 'malt'|'grain'|'rhum agricole'|'cognac'|'mezcal'…
  address         TEXT,
  latitude        REAL,
  longitude       REAL,
  website         TEXT,
  phone           TEXT,
  email           TEXT,
  owner           TEXT,
  founded_year    INTEGER,
  closed_year     INTEGER,                -- NULL si active
  capacity_lpa    REAL,                   -- litres d'alcool pur / an (whisky)
  stills_count    INTEGER,
  water_source    TEXT,
  description     TEXT,
  wikipedia_url   TEXT,
  enrichment_status TEXT DEFAULT 'pending',
  enriched_at     INTEGER,
  source          TEXT DEFAULT 'scan',
  created_by      TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_distilleries_name    ON distilleries(name);
CREATE INDEX IF NOT EXISTS idx_distilleries_region  ON distilleries(region);
CREATE INDEX IF NOT EXISTS idx_distilleries_country ON distilleries(country);
CREATE INDEX IF NOT EXISTS idx_distilleries_enrich  ON distilleries(enrichment_status);

-- FTS distilleries
CREATE VIRTUAL TABLE IF NOT EXISTS distilleries_fts USING fts5(
  name, legal_name, region, country, description,
  content='distilleries', content_rowid='id'
);
CREATE TRIGGER IF NOT EXISTS distilleries_ai AFTER INSERT ON distilleries BEGIN
  INSERT INTO distilleries_fts(rowid, name, legal_name, region, country, description)
  VALUES (new.id, new.name, new.legal_name, new.region, new.country, new.description);
END;
CREATE TRIGGER IF NOT EXISTS distilleries_ad AFTER DELETE ON distilleries BEGIN
  INSERT INTO distilleries_fts(distilleries_fts, rowid, name, legal_name, region, country, description)
  VALUES ('delete', old.id, old.name, old.legal_name, old.region, old.country, old.description);
END;
CREATE TRIGGER IF NOT EXISTS distilleries_au AFTER UPDATE ON distilleries BEGIN
  INSERT INTO distilleries_fts(distilleries_fts, rowid, name, legal_name, region, country, description)
  VALUES ('delete', old.id, old.name, old.legal_name, old.region, old.country, old.description);
  INSERT INTO distilleries_fts(rowid, name, legal_name, region, country, description)
  VALUES (new.id, new.name, new.legal_name, new.region, new.country, new.description);
END;

-- ─── Spiritueux (bouteilles individuelles) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS spirits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL,            -- "Lagavulin 16 ans"
  distillery       TEXT,                     -- nom lisible (cache)
  distillery_id    INTEGER REFERENCES distilleries(id) ON DELETE SET NULL,
  bottler          TEXT,                     -- embouteilleur (OB/IB, ex: "Gordon & MacPhail")
  type             TEXT,                     -- 'whisky'|'rhum'|'cognac'|'gin'|'vodka'|'tequila'|'mezcal'|'armagnac'|'liqueur'|'eau-de-vie'
  subtype          TEXT,                     -- 'single malt'|'blended'|'bourbon'|'agricole'|'VS'|'VSOP'|'XO'|'London Dry'…
  age              INTEGER,                  -- années, NULL si NAS (No Age Statement)
  cask_type        TEXT,                     -- 'bourbon'|'sherry oloroso'|'sherry PX'|'port'|'virgin oak'…
  cask_finish      TEXT,
  distillation_year INTEGER,
  bottling_year    INTEGER,
  abv              REAL,                     -- % vol
  volume_ml        INTEGER,
  cask_strength    INTEGER DEFAULT 0,        -- 0/1 : brut de fût
  chill_filtered   INTEGER,                  -- 0/1/NULL
  natural_color    INTEGER,                  -- 0/1/NULL
  batch_number     TEXT,
  bottle_number    TEXT,
  country          TEXT,
  region           TEXT,                     -- 'Islay', 'Speyside', 'Martinique'…
  tasting_notes    TEXT,                     -- 2-4 phrases
  food_pairings    TEXT,                     -- JSON array (cigare, chocolat, fromage…)
  serving          TEXT,                     -- 'sec'|'glace'|'cocktail'
  avg_price_eur    REAL,
  confidence       REAL,
  source           TEXT,                     -- 'scan'|'manual'|'import'
  created_by       TEXT,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_spirits_name         ON spirits(name);
CREATE INDEX IF NOT EXISTS idx_spirits_distillery   ON spirits(distillery);
CREATE INDEX IF NOT EXISTS idx_spirits_distillery_id ON spirits(distillery_id);
CREATE INDEX IF NOT EXISTS idx_spirits_type         ON spirits(type);
CREATE INDEX IF NOT EXISTS idx_spirits_region       ON spirits(region);
CREATE INDEX IF NOT EXISTS idx_spirits_age          ON spirits(age);

-- FTS spirits
CREATE VIRTUAL TABLE IF NOT EXISTS spirits_fts USING fts5(
  name, distillery, bottler, type, subtype, region, country, tasting_notes,
  content='spirits', content_rowid='id'
);
CREATE TRIGGER IF NOT EXISTS spirits_ai AFTER INSERT ON spirits BEGIN
  INSERT INTO spirits_fts(rowid, name, distillery, bottler, type, subtype, region, country, tasting_notes)
  VALUES (new.id, new.name, new.distillery, new.bottler, new.type, new.subtype, new.region, new.country, new.tasting_notes);
END;
CREATE TRIGGER IF NOT EXISTS spirits_ad AFTER DELETE ON spirits BEGIN
  INSERT INTO spirits_fts(spirits_fts, rowid, name, distillery, bottler, type, subtype, region, country, tasting_notes)
  VALUES ('delete', old.id, old.name, old.distillery, old.bottler, old.type, old.subtype, old.region, old.country, old.tasting_notes);
END;
CREATE TRIGGER IF NOT EXISTS spirits_au AFTER UPDATE ON spirits BEGIN
  INSERT INTO spirits_fts(spirits_fts, rowid, name, distillery, bottler, type, subtype, region, country, tasting_notes)
  VALUES ('delete', old.id, old.name, old.distillery, old.bottler, old.type, old.subtype, old.region, old.country, old.tasting_notes);
  INSERT INTO spirits_fts(rowid, name, distillery, bottler, type, subtype, region, country, tasting_notes)
  VALUES (new.id, new.name, new.distillery, new.bottler, new.type, new.subtype, new.region, new.country, new.tasting_notes);
END;

-- ─── Photos ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS spirit_photos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  spirit_id   INTEGER,
  path        TEXT NOT NULL,
  is_primary  INTEGER DEFAULT 0,
  uploaded_by TEXT,
  uploaded_at INTEGER NOT NULL,
  FOREIGN KEY (spirit_id) REFERENCES spirits(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_spirit_photos_spirit ON spirit_photos(spirit_id);

-- ─── Historique des scans ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS spirit_scans (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  photo_id       INTEGER,
  ai_raw         TEXT,
  ai_status      TEXT,
  matched_spirit_id INTEGER,
  user_sub       TEXT,
  duration_ms    INTEGER,
  model          TEXT,
  input_tokens   INTEGER,
  output_tokens  INTEGER,
  cost_usd       REAL,
  -- Géolocalisation
  lat                    REAL,
  lon                    REAL,
  location_source        TEXT,
  location_accuracy_m    REAL,
  location_at            INTEGER,
  place_name             TEXT,
  place_type             TEXT,
  matched_distillery_id  INTEGER,
  created_at     INTEGER NOT NULL,
  FOREIGN KEY (photo_id) REFERENCES spirit_photos(id) ON DELETE SET NULL,
  FOREIGN KEY (matched_spirit_id) REFERENCES spirits(id) ON DELETE SET NULL,
  FOREIGN KEY (matched_distillery_id) REFERENCES distilleries(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_spirit_scans_spirit  ON spirit_scans(matched_spirit_id);
CREATE INDEX IF NOT EXISTS idx_spirit_scans_user    ON spirit_scans(user_sub);
CREATE INDEX IF NOT EXISTS idx_spirit_scans_created ON spirit_scans(created_at);

-- ─── Historique des enrichissements distilleries ───────────────────────────
CREATE TABLE IF NOT EXISTS distillery_enrichments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  distillery_id INTEGER NOT NULL,
  status        TEXT,
  ai_raw        TEXT,
  fields_updated TEXT,
  model         TEXT,
  input_tokens  INTEGER,
  output_tokens INTEGER,
  cost_usd      REAL,
  duration_ms   INTEGER,
  user_sub      TEXT,
  created_at    INTEGER NOT NULL,
  FOREIGN KEY (distillery_id) REFERENCES distilleries(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_distillery_enrich_dist    ON distillery_enrichments(distillery_id);
CREATE INDEX IF NOT EXISTS idx_distillery_enrich_created ON distillery_enrichments(created_at);

-- ─── Code-barres EAN → spirit_id (cache gratuit) ──────────────────────────
CREATE TABLE IF NOT EXISTS spirit_barcodes (
  ean         TEXT PRIMARY KEY,
  spirit_id   INTEGER NOT NULL,
  format      TEXT,
  scan_count  INTEGER NOT NULL DEFAULT 1,
  first_seen  INTEGER NOT NULL,
  last_seen   INTEGER NOT NULL,
  created_by  TEXT,
  FOREIGN KEY (spirit_id) REFERENCES spirits(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_spirit_barcodes_spirit ON spirit_barcodes(spirit_id);
