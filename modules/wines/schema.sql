-- ═══════════════════════════════════════════════════════════════════════════
-- Module wines — Base collaborative vins & univers du vin
-- ═══════════════════════════════════════════════════════════════════════════

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
  created_at     INTEGER NOT NULL,
  FOREIGN KEY (photo_id) REFERENCES wine_photos(id) ON DELETE SET NULL,
  FOREIGN KEY (matched_wine_id) REFERENCES wines(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_wine_scans_wine ON wine_scans(matched_wine_id);
CREATE INDEX IF NOT EXISTS idx_wine_scans_user ON wine_scans(user_sub);
