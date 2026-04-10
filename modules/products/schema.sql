-- ═══════════════════════════════════════════════════════════════════════════
-- Module products — Catalogue universel EAN → fiche produit
--
-- Table pivot pour TOUS les produits scannés (vin, spiritueux, bière, soda,
-- eau, alimentaire, etc.). Alimente le POS des supérettes et le scan app.
-- Les tables spécialisées wines / spirits restent indépendantes pour les
-- fiches riches (notes de dégustation, accords, distillery enrichie…) et
-- sont liées via products.wine_id / products.spirit_id.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Table pivot ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ean             TEXT NOT NULL UNIQUE,        -- code-barres normalisé
  name            TEXT,
  name_fr         TEXT,                         -- product_name_fr OFF si dispo
  brand           TEXT,
  brand_owner     TEXT,
  category_main   TEXT,                         -- 'wine'|'spirit'|'beer'|'soda'|'water'|'food'|'other'
  category_tags   TEXT,                         -- JSON array des categories_tags OFF
  quantity        TEXT,                         -- texte brut: '75cl', '500g', '1.5L'
  volume_ml       INTEGER,                      -- volume normalisé en ml si liquide
  weight_g        INTEGER,                      -- poids normalisé en g si solide
  abv             REAL,                         -- taux d'alcool % si alcool
  country_origin  TEXT,
  origins         TEXT,                         -- texte brut OFF (pays + régions)
  labels          TEXT,                         -- JSON array labels (bio, label-rouge, …)
  image_url       TEXT,                         -- URL OFF (non téléchargée pour l'instant)
  local_image_path TEXT,                        -- chemin local si on download plus tard
  source          TEXT DEFAULT 'scan',          -- 'openfoodfacts'|'scan'|'manual'|'import'
  off_raw         TEXT,                         -- payload OFF brut archivé (JSON)
  -- Liens vers les spécialisations (soft FK : wines/spirits vivent dans des
  -- DB séparées, donc pas de contrainte cross-DB possible en SQLite).
  wine_id         INTEGER,
  spirit_id       INTEGER,
  -- stats d'usage
  scan_count      INTEGER NOT NULL DEFAULT 0,
  first_seen_at   INTEGER NOT NULL,
  last_seen_at    INTEGER NOT NULL,
  -- meta
  created_by      TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_products_ean        ON products(ean);
CREATE INDEX IF NOT EXISTS idx_products_category   ON products(category_main);
CREATE INDEX IF NOT EXISTS idx_products_brand      ON products(brand);
CREATE INDEX IF NOT EXISTS idx_products_wine_id    ON products(wine_id);
CREATE INDEX IF NOT EXISTS idx_products_spirit_id  ON products(spirit_id);
CREATE INDEX IF NOT EXISTS idx_products_updated    ON products(updated_at);

-- ─── FTS5 recherche full-text ───────────────────────────────────────────────
CREATE VIRTUAL TABLE IF NOT EXISTS products_fts USING fts5(
  name, name_fr, brand, brand_owner, category_main, origins, labels,
  content='products',
  content_rowid='id',
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS products_ai AFTER INSERT ON products BEGIN
  INSERT INTO products_fts(rowid, name, name_fr, brand, brand_owner, category_main, origins, labels)
  VALUES (new.id, new.name, new.name_fr, new.brand, new.brand_owner, new.category_main, new.origins, new.labels);
END;

CREATE TRIGGER IF NOT EXISTS products_ad AFTER DELETE ON products BEGIN
  INSERT INTO products_fts(products_fts, rowid, name, name_fr, brand, brand_owner, category_main, origins, labels)
  VALUES('delete', old.id, old.name, old.name_fr, old.brand, old.brand_owner, old.category_main, old.origins, old.labels);
END;

CREATE TRIGGER IF NOT EXISTS products_au AFTER UPDATE ON products BEGIN
  INSERT INTO products_fts(products_fts, rowid, name, name_fr, brand, brand_owner, category_main, origins, labels)
  VALUES('delete', old.id, old.name, old.name_fr, old.brand, old.brand_owner, old.category_main, old.origins, old.labels);
  INSERT INTO products_fts(rowid, name, name_fr, brand, brand_owner, category_main, origins, labels)
  VALUES (new.id, new.name, new.name_fr, new.brand, new.brand_owner, new.category_main, new.origins, new.labels);
END;

-- ─── Journal des scans (analytics + géoloc) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS product_scans (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id      INTEGER,                     -- null si on a stocké mais pas résolu
  ean             TEXT NOT NULL,
  source          TEXT,                         -- 'cache'|'openfoodfacts'|'miss'
  user_sub        TEXT,
  device_id       TEXT,
  poi_id          TEXT,                         -- établissement (supérette, bar, resto)
  lat             REAL,
  lon             REAL,
  location_source TEXT,                         -- 'gps'|'exif'
  location_accuracy_m REAL,
  location_at     INTEGER,
  created_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_product_scans_ean        ON product_scans(ean);
CREATE INDEX IF NOT EXISTS idx_product_scans_product    ON product_scans(product_id);
CREATE INDEX IF NOT EXISTS idx_product_scans_user       ON product_scans(user_sub);
CREATE INDEX IF NOT EXISTS idx_product_scans_poi        ON product_scans(poi_id);
CREATE INDEX IF NOT EXISTS idx_product_scans_created    ON product_scans(created_at);
