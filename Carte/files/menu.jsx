import { useState, useRef } from "react";

// ── Data ──────────────────────────────────────────────────────────────────────
const RESTAURANT = { name: "Le Bistrot Doré", tagline: "Cuisine de saison · Paris 6e" };

const FAMILIES = [
  { id: 1, name: "Cuisine" },
  { id: 2, name: "Boissons" },
];

const CATEGORIES = [
  { id: 1, name: "Entrées",     familyId: 1 },
  { id: 2, name: "Plats",       familyId: 1 },
  { id: 3, name: "Desserts",    familyId: 1 },
  { id: 4, name: "Vins rouges", familyId: 2 },
  { id: 5, name: "Softs",       familyId: 2 },
];

const ITEMS = [
  { id: 1,  categoryId: 1, name: "Carpaccio de bœuf",      description: "Roquette, parmesan 24 mois, huile de truffe",    price: 18, available: true,  tags: ["signature","fait-maison"] },
  { id: 2,  categoryId: 1, name: "Velouté de butternut",   description: "Crème de coco, graines de courge torréfiées",   price: 12, available: true,  tags: ["vegan","fait-maison","saison"] },
  { id: 3,  categoryId: 1, name: "Foie gras maison",       description: "Chutney de figues, brioche toastée",             price: 24, available: false, tags: ["fait-maison","gluten","oeufs"] },
  { id: 4,  categoryId: 2, name: "Filet de sole meunière", description: "Beurre noisette, câpres, citron confit",         price: 32, available: true,  tags: ["poisson","lait","menu-midi","local"] },
  { id: 5,  categoryId: 2, name: "Côte de veau rôtie",     description: "Jus corsé, gratin dauphinois, haricots verts",  price: 38, available: true,  tags: ["lait","france"] },
  { id: 6,  categoryId: 2, name: "Risotto aux cèpes",      description: "Parmesan AOP, huile de truffe blanche",         price: 26, available: true,  tags: ["vegetarien","aoc","coup-de-coeur","lait"] },
  { id: 7,  categoryId: 3, name: "Soufflé Grand Marnier",  description: "Crème anglaise vanille Bourbon",                price: 14, available: true,  tags: ["fait-maison","oeufs","gluten","lait","sulfites"] },
  { id: 8,  categoryId: 3, name: "Cheese-cake yuzu",       description: "Coulis de fruits de la passion",                price: 12, available: true,  tags: ["nouveau","fait-maison","gluten","oeufs","lait"] },
  { id: 9,  categoryId: 4, name: "Chablis Premier Cru",    description: "Domaine Laroche, 2021",                         price: 11, available: true,  tags: ["aoc","france","sulfites","contient-alcool"] },
  { id: 10, categoryId: 4, name: "Côtes du Rhône",         description: "Château Beauchêne, 2020",                       price: 8,  available: true,  tags: ["france","sulfites","contient-alcool"] },
  { id: 11, categoryId: 5, name: "Limonade maison",        description: "Citron, gingembre, menthe fraîche",             price: 5,  available: true,  tags: ["fait-maison","vegan","sans-alcool"] },
];

const ALL_TAGS = {
  "gluten":          { name: "Gluten",         icon: "🌾", color: "#92400e", bg: "#fef3c7", category: "ALLERGEN" },
  "crustaces":       { name: "Crustacés",      icon: "🦐", color: "#9f1239", bg: "#ffe4e6", category: "ALLERGEN" },
  "oeufs":           { name: "Œufs",           icon: "🥚", color: "#78350f", bg: "#fef9c3", category: "ALLERGEN" },
  "poisson":         { name: "Poissons",       icon: "🐟", color: "#075985", bg: "#e0f2fe", category: "ALLERGEN" },
  "arachides":       { name: "Arachides",      icon: "🥜", color: "#78350f", bg: "#fef3c7", category: "ALLERGEN" },
  "soja":            { name: "Soja",           icon: "🫘", color: "#14532d", bg: "#dcfce7", category: "ALLERGEN" },
  "lait":            { name: "Lait",           icon: "🥛", color: "#1e40af", bg: "#dbeafe", category: "ALLERGEN" },
  "fruits-a-coque":  { name: "Fruits à coque", icon: "🌰", color: "#92400e", bg: "#fef3c7", category: "ALLERGEN" },
  "celeri":          { name: "Céleri",         icon: "🌿", color: "#166534", bg: "#f0fdf4", category: "ALLERGEN" },
  "moutarde":        { name: "Moutarde",       icon: "🟡", color: "#854d0e", bg: "#fef9c3", category: "ALLERGEN" },
  "sesame":          { name: "Sésame",         icon: "🌱", color: "#78350f", bg: "#fef3c7", category: "ALLERGEN" },
  "sulfites":        { name: "Sulfites",       icon: "⚗️", color: "#4c1d95", bg: "#ede9fe", category: "ALLERGEN" },
  "lupin":           { name: "Lupin",          icon: "🌸", color: "#831843", bg: "#fce7f3", category: "ALLERGEN" },
  "mollusques":      { name: "Mollusques",     icon: "🐚", color: "#075985", bg: "#e0f2fe", category: "ALLERGEN" },
  "vegan":           { name: "Vegan",          icon: "🌱", color: "#14532d", bg: "#dcfce7", category: "PRODUCT_TYPE" },
  "vegetarien":      { name: "Végétarien",     icon: "🥗", color: "#166534", bg: "#f0fdf4", category: "PRODUCT_TYPE" },
  "bio":             { name: "Bio",            icon: "♻️", color: "#14532d", bg: "#dcfce7", category: "PRODUCT_TYPE" },
  "fait-maison":     { name: "Fait maison",    icon: "👨‍🍳", color: "#4c1d95", bg: "#ede9fe", category: "PRODUCT_TYPE" },
  "sans-gluten":     { name: "Sans gluten",    icon: "✓",  color: "#14532d", bg: "#dcfce7", category: "PRODUCT_TYPE" },
  "sans-lactose":    { name: "Sans lactose",   icon: "🥛", color: "#1e40af", bg: "#dbeafe", category: "PRODUCT_TYPE" },
  "sans-alcool":     { name: "Sans alcool",    icon: "🚫", color: "#166534", bg: "#dcfce7", category: "BEVERAGE" },
  "contient-alcool": { name: "Alcool",         icon: "🍷", color: "#9f1239", bg: "#ffe4e6", category: "BEVERAGE" },
  "local":           { name: "Local",          icon: "📍", color: "#14532d", bg: "#dcfce7", category: "ORIGIN" },
  "france":          { name: "France",         icon: "🇫🇷", color: "#1e40af", bg: "#dbeafe", category: "ORIGIN" },
  "aoc":             { name: "AOC",            icon: "🏷️", color: "#4c1d95", bg: "#ede9fe", category: "ORIGIN" },
  "nouveau":         { name: "Nouveau",        icon: "✦",  color: "#3d5a80", bg: "#e8edf4", category: "HIGHLIGHT" },
  "signature":       { name: "Signature",      icon: "✦",  color: "#3d5a80", bg: "#e8edf4", category: "HIGHLIGHT" },
  "coup-de-coeur":   { name: "Coup de cœur",   icon: "✦",  color: "#3d5a80", bg: "#e8edf4", category: "HIGHLIGHT" },
  "saison":          { name: "Saison",         icon: "✦",  color: "#3d5a80", bg: "#e8edf4", category: "HIGHLIGHT" },
  "menu-midi":       { name: "Menu midi",      icon: "☀️", color: "#78350f", bg: "#fef3c7", category: "OFFER" },
};

const ALLERGEN_SLUGS = ["gluten","crustaces","oeufs","poisson","arachides","soja","lait","fruits-a-coque","celeri","moutarde","sesame","sulfites","lupin","mollusques"];
const FILTER_TAGS   = ["vegan","vegetarien","sans-gluten","sans-lactose","sans-alcool","fait-maison","local","bio"];

const C = {
  text: "#111827", textMid: "#6b7280", textLight: "#9ca3af",
  border: "#e5e7eb", borderLight: "#f3f4f6",
  bg: "#ffffff", bgAlt: "#f9fafb",
  primary: "#3d5a80", primaryLight: "#e8edf4",
};

const priceStr = p => p.toFixed(2).replace(".", ",") + " €";
const getTag = slug => ALL_TAGS[slug];

const itemMatches = (item, search, exclAllergens, inclTags) => {
  if (search) {
    const q = search.toLowerCase();
    if (!item.name.toLowerCase().includes(q) && !(item.description || "").toLowerCase().includes(q)) return false;
  }
  if (exclAllergens.length > 0 && exclAllergens.some(a => item.tags.includes(a))) return false;
  if (inclTags.length > 0 && !inclTags.every(t => item.tags.includes(t))) return false;
  return true;
};

// ── Item Card ─────────────────────────────────────────────────────────────────
// Règles d'affichage des tags :
// - HIGHLIGHT : un mot très sobre (pas de couleur, juste italique gris clair)
// - ALLERGEN  : icônes seules, grises par défaut → colorées si dans exclAllergens
// - AUTRES    : invisibles par défaut → badge coloré si dans inclTags actifs
const ItemCard = ({ item, view, exclAllergens, inclTags }) => {
  const [expanded, setExpanded] = useState(false);

  const highlightTag = item.tags.find(s => getTag(s)?.category === "HIGHLIGHT");
  const allergens = item.tags.filter(s => ALLERGEN_SLUGS.includes(s));
  const otherActiveTags = item.tags.filter(s => {
    const t = getTag(s);
    return t && t.category !== "ALLERGEN" && t.category !== "HIGHLIGHT" && inclTags.includes(s);
  });

  // Tags détail (expanded)
  const allOtherTags = item.tags.filter(s => {
    const t = getTag(s);
    return t && t.category !== "ALLERGEN" && t.category !== "HIGHLIGHT";
  });

  const allergenRow = allergens.length > 0 && (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
      {allergens.map(s => {
        const t = getTag(s);
        const isActive = exclAllergens.includes(s);
        return (
          <span key={s} title={t.name} style={{
            display: "inline-flex", alignItems: "center", gap: 3,
            fontSize: 11, padding: "2px 6px", borderRadius: 4,
            fontFamily: "'DM Sans', system-ui", fontWeight: 500,
            color: isActive ? t.color : "#9ca3af",
            background: isActive ? t.bg : "#f3f4f6",
            border: `1px solid ${isActive ? t.color + "30" : "transparent"}`,
            transition: "all 0.2s",
          }}>
            <span style={{ fontSize: 12 }}>{t.icon}</span>
            {/* Texte uniquement si actif ou expanded */}
            {(isActive || expanded) && <span>{t.name}</span>}
          </span>
        );
      })}
    </div>
  );

  if (view === "scroll") {
    return (
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          padding: "15px 0",
          borderBottom: `1px solid ${C.borderLight}`,
          cursor: allergens.length > 0 || allOtherTags.length > 0 ? "pointer" : "default",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Nom + highlight */}
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: item.available ? C.text : C.textLight, fontFamily: "'DM Sans', system-ui", lineHeight: 1.3 }}>
                {item.name}
              </span>
              {!item.available && (
                <span style={{ fontSize: 11, color: C.textLight, fontStyle: "italic", fontFamily: "'DM Sans', system-ui" }}>indisponible</span>
              )}
              {highlightTag && !expanded && (
                <span style={{ fontSize: 11, color: C.textLight, fontStyle: "italic", fontFamily: "'DM Sans', system-ui" }}>
                  {getTag(highlightTag)?.name}
                </span>
              )}
            </div>

            {/* Description */}
            <div style={{ fontSize: 13, color: C.textLight, marginTop: 3, fontStyle: "italic", fontFamily: "'DM Sans', system-ui", lineHeight: 1.4 }}>
              {item.description}
            </div>

            {/* Tags actifs inclus (filtres) */}
            {otherActiveTags.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                {otherActiveTags.map(s => {
                  const t = getTag(s);
                  return (
                    <span key={s} style={{
                      fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 4,
                      color: t.color, background: t.bg, fontFamily: "'DM Sans', system-ui",
                    }}>{t.icon} {t.name}</span>
                  );
                })}
              </div>
            )}

            {/* Allergènes */}
            {allergenRow}

            {/* Expanded : tous les autres tags */}
            {expanded && allOtherTags.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                {allOtherTags.map(s => {
                  const t = getTag(s);
                  return (
                    <span key={s} style={{
                      fontSize: 11, fontWeight: 500, padding: "2px 7px", borderRadius: 4,
                      color: t.color, background: t.bg, fontFamily: "'DM Sans', system-ui",
                    }}>{t.icon} {t.name}</span>
                  );
                })}
              </div>
            )}
          </div>

          {/* Prix + indicateur détail */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: C.primary, fontFamily: "'DM Sans', system-ui" }}>
              {priceStr(item.price)}
            </span>
            {(allergens.length > 0 || allOtherTags.length > 0) && (
              <span style={{ fontSize: 10, color: C.textLight, fontFamily: "'DM Sans', system-ui" }}>
                {expanded ? "▲" : "ℹ"}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Mode nav : carte ──
  return (
    <div
      onClick={() => setExpanded(!expanded)}
      style={{
        background: C.bg, border: `1px solid ${expanded ? C.primary + "40" : C.border}`,
        borderRadius: 12, overflow: "hidden",
        boxShadow: expanded ? `0 4px 16px rgba(61,90,128,0.1)` : "0 1px 3px rgba(0,0,0,0.04)",
        cursor: "pointer", transition: "all 0.18s",
      }}
    >
      <div style={{ padding: "14px 16px" }}>
        {/* Nom + prix */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: item.available ? C.text : C.textLight, fontFamily: "'DM Sans', system-ui", lineHeight: 1.3, flex: 1 }}>
            {item.name}
          </span>
          <span style={{ fontSize: 15, fontWeight: 700, color: C.primary, fontFamily: "'DM Sans', system-ui", flexShrink: 0 }}>
            {priceStr(item.price)}
          </span>
        </div>

        {/* Highlight + unavailable */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: item.description ? 4 : 0, flexWrap: "wrap" }}>
          {!item.available && (
            <span style={{ fontSize: 11, color: C.textLight, fontStyle: "italic", fontFamily: "'DM Sans', system-ui" }}>Indisponible</span>
          )}
          {highlightTag && (
            <span style={{ fontSize: 11, color: C.textLight, fontStyle: "italic", fontFamily: "'DM Sans', system-ui" }}>
              {getTag(highlightTag)?.name}
            </span>
          )}
        </div>

        {/* Description */}
        {item.description && (
          <div style={{ fontSize: 12, color: C.textLight, fontStyle: "italic", fontFamily: "'DM Sans', system-ui", lineHeight: 1.4, marginBottom: 6 }}>
            {item.description}
          </div>
        )}

        {/* Tags inclus actifs */}
        {otherActiveTags.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
            {otherActiveTags.map(s => {
              const t = getTag(s);
              return (
                <span key={s} style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 4, color: t.color, background: t.bg, fontFamily: "'DM Sans', system-ui" }}>{t.icon} {t.name}</span>
              );
            })}
          </div>
        )}

        {/* Allergènes */}
        {allergenRow}

        {/* Expanded : tous les tags */}
        {expanded && allOtherTags.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
            {allOtherTags.map(s => {
              const t = getTag(s);
              return (
                <span key={s} style={{ fontSize: 11, fontWeight: 500, padding: "2px 7px", borderRadius: 4, color: t.color, background: t.bg, fontFamily: "'DM Sans', system-ui" }}>{t.icon} {t.name}</span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Filter Panel ──────────────────────────────────────────────────────────────
const FilterPanel = ({ exclAllergens, setExclAllergens, inclTags, setInclTags, onClose }) => {
  const toggle = (arr, set, slug) => set(p => p.includes(slug) ? p.filter(s => s !== slug) : [...p, slug]);
  const total = exclAllergens.length + inclTags.length;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.2)" }} />
      <div style={{
        position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)",
        width: "100%", maxWidth: 640,
        background: C.bg, borderRadius: "20px 20px 0 0",
        padding: "20px 20px 40px", maxHeight: "80vh", overflowY: "auto",
        boxShadow: "0 -4px 30px rgba(0,0,0,0.1)",
      }}>
        <div style={{ width: 36, height: 4, background: C.border, borderRadius: 2, margin: "0 auto 20px" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <span style={{ fontSize: 17, fontWeight: 700, color: C.text, fontFamily: "'DM Sans', system-ui" }}>Filtres</span>
          {total > 0 && (
            <button onClick={() => { setExclAllergens([]); setInclTags([]); }} style={{ fontSize: 12, color: C.primary, background: "none", border: "none", cursor: "pointer", fontFamily: "'DM Sans', system-ui", fontWeight: 600 }}>
              Réinitialiser ({total})
            </button>
          )}
        </div>

        {/* Allergènes */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textLight, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4, fontFamily: "'DM Sans', system-ui" }}>Exclure les allergènes</div>
          <div style={{ fontSize: 12, color: C.textLight, fontFamily: "'DM Sans', system-ui", marginBottom: 12 }}>Les plats contenant ces allergènes seront masqués.</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {ALLERGEN_SLUGS.map(slug => {
              const t = getTag(slug);
              const active = exclAllergens.includes(slug);
              return (
                <button key={slug} onClick={() => toggle(exclAllergens, setExclAllergens, slug)} style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "7px 12px", borderRadius: 8, cursor: "pointer",
                  fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', system-ui",
                  border: `1.5px solid ${active ? t.color + "50" : C.border}`,
                  background: active ? t.bg : C.bgAlt,
                  color: active ? t.color : C.textMid,
                  transition: "all 0.15s",
                }}>
                  {t.icon} {t.name} {active && <span style={{ fontSize: 14 }}>×</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tags inclusion */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textLight, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4, fontFamily: "'DM Sans', system-ui" }}>Afficher uniquement</div>
          <div style={{ fontSize: 12, color: C.textLight, fontFamily: "'DM Sans', system-ui", marginBottom: 12 }}>Seuls les plats correspondants seront affichés.</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {FILTER_TAGS.map(slug => {
              const t = getTag(slug);
              const active = inclTags.includes(slug);
              return (
                <button key={slug} onClick={() => toggle(inclTags, setInclTags, slug)} style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "7px 12px", borderRadius: 8, cursor: "pointer",
                  fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', system-ui",
                  border: `1.5px solid ${active ? t.color + "50" : C.border}`,
                  background: active ? t.bg : C.bgAlt,
                  color: active ? t.color : C.textMid,
                  transition: "all 0.15s",
                }}>
                  {t.icon} {t.name} {active && <span style={{ fontSize: 14 }}>×</span>}
                </button>
              );
            })}
          </div>
        </div>

        <button onClick={onClose} style={{
          marginTop: 28, width: "100%", padding: "14px",
          background: C.text, border: "none", borderRadius: 12,
          color: "#fff", fontSize: 15, fontWeight: 600,
          fontFamily: "'DM Sans', system-ui", cursor: "pointer",
        }}>Voir les résultats</button>
      </div>
    </div>
  );
};

// ── Main ──────────────────────────────────────────────────────────────────────
export default function MenuClient() {
  const [view, setView] = useState("nav");
  const [search, setSearch] = useState("");
  const [exclAllergens, setExclAllergens] = useState([]);
  const [inclTags, setInclTags] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [activeFamily, setActiveFamily] = useState(1);
  const [activeCategory, setActiveCategory] = useState(1);
  const sectionRefs = useRef({});

  const filterCount = exclAllergens.length + inclTags.length;
  const isSearching = search.length > 0;
  const catsByFamily = fid => CATEGORIES.filter(c => c.familyId === fid);

  const filtered = (items) => items.filter(i => i.available && itemMatches(i, search, exclAllergens, inclTags));

  const navItems = filtered(ITEMS.filter(i => i.categoryId === activeCategory));

  const scrollGroups = CATEGORIES.map(cat => ({
    ...cat, items: filtered(ITEMS.filter(i => i.categoryId === cat.id)),
  })).filter(g => g.items.length > 0);

  const searchGroups = CATEGORIES.map(cat => ({
    ...cat, items: filtered(ITEMS.filter(i => i.categoryId === cat.id)),
  })).filter(g => g.items.length > 0);

  const itemProps = { exclAllergens, inclTags };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'DM Sans', system-ui, sans-serif", maxWidth: 640, margin: "0 auto" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet" />

      {/* ── Header ── */}
      <div style={{ padding: "36px 24px 0", textAlign: "center" }}>
        <div style={{ fontSize: 11, letterSpacing: 3, color: C.textLight, textTransform: "uppercase", marginBottom: 8, fontWeight: 500 }}>
          {RESTAURANT.tagline}
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: C.text, margin: 0, letterSpacing: -0.5 }}>
          {RESTAURANT.name}
        </h1>
      </div>

      {/* ── Barre actions ── */}
      <div style={{ padding: "18px 20px 0", display: "flex", gap: 8, alignItems: "center" }}>
        {/* Recherche */}
        <div style={{ flex: 1, position: "relative" }}>
          <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: C.textLight, pointerEvents: "none" }}>🔍</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher…"
            style={{
              width: "100%", padding: "10px 32px 10px 32px",
              border: `1.5px solid ${search ? C.primary : C.border}`,
              borderRadius: 10, fontSize: 14, color: C.text,
              fontFamily: "'DM Sans', system-ui", outline: "none",
              background: C.bgAlt, boxSizing: "border-box", transition: "border-color 0.15s",
            }}
            onFocus={e => e.target.style.borderColor = C.primary}
            onBlur={e => e.target.style.borderColor = search ? C.primary : C.border}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: C.textLight, fontSize: 16, lineHeight: 1 }}>×</button>
          )}
        </div>

        {/* Filtres */}
        <button onClick={() => setShowFilters(true)} style={{
          position: "relative", width: 42, height: 42, borderRadius: 10,
          border: `1.5px solid ${filterCount > 0 ? C.primary : C.border}`,
          background: filterCount > 0 ? C.primaryLight : C.bgAlt,
          color: filterCount > 0 ? C.primary : C.textMid,
          cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.15s", flexShrink: 0,
        }}>
          ⚙
          {filterCount > 0 && (
            <span style={{
              position: "absolute", top: -5, right: -5,
              width: 16, height: 16, borderRadius: "50%",
              background: C.primary, color: "#fff",
              fontSize: 9, fontWeight: 700, fontFamily: "'DM Sans', system-ui",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>{filterCount}</span>
          )}
        </button>

        {/* Toggle vue */}
        <div style={{ display: "flex", background: C.bgAlt, border: `1.5px solid ${C.border}`, borderRadius: 10, overflow: "hidden", flexShrink: 0 }}>
          {[["nav", "⊞", "Navigation"], ["scroll", "☰", "Carte"]].map(([v, icon, label]) => (
            <button key={v} onClick={() => setView(v)} title={label} style={{
              width: 42, height: 42, border: "none", cursor: "pointer",
              background: view === v ? C.text : "none",
              color: view === v ? "#fff" : C.textLight,
              fontSize: 15, transition: "all 0.15s",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>{icon}</button>
          ))}
        </div>
      </div>

      {/* Filtres actifs */}
      {filterCount > 0 && (
        <div style={{ padding: "10px 20px 0", display: "flex", flexWrap: "wrap", gap: 5 }}>
          {exclAllergens.map(s => { const t = getTag(s); return t ? (
            <button key={s} onClick={() => setExclAllergens(p => p.filter(x => x !== s))} style={{
              display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 5,
              fontSize: 11, fontWeight: 600, color: t.color, background: t.bg,
              border: "none", cursor: "pointer", fontFamily: "'DM Sans', system-ui",
            }}>{t.icon} Sans {t.name} ×</button>
          ) : null; })}
          {inclTags.map(s => { const t = getTag(s); return t ? (
            <button key={s} onClick={() => setInclTags(p => p.filter(x => x !== s))} style={{
              display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 5,
              fontSize: 11, fontWeight: 600, color: t.color, background: t.bg,
              border: "none", cursor: "pointer", fontFamily: "'DM Sans', system-ui",
            }}>{t.icon} {t.name} ×</button>
          ) : null; })}
        </div>
      )}

      {/* ── Contenu ── */}
      {isSearching ? (
        /* Recherche */
        <div style={{ padding: "16px 20px 120px" }}>
          {searchGroups.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: C.textLight, fontSize: 14 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🍽️</div>
              Aucun résultat pour « {search} »
            </div>
          ) : searchGroups.map(group => (
            <div key={group.id} style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textLight, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8, fontFamily: "'DM Sans', system-ui" }}>{group.name}</div>
              {group.items.map(item => <ItemCard key={item.id} item={item} view="scroll" {...itemProps} />)}
            </div>
          ))}
        </div>

      ) : view === "nav" ? (
        /* Navigation */
        <div>
          {/* Familles — pills centrées */}
          <div style={{ padding: "18px 20px 0", display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
            {FAMILIES.map(f => (
              <button key={f.id} onClick={() => { setActiveFamily(f.id); setActiveCategory(catsByFamily(f.id)[0]?.id); }} style={{
                padding: "9px 24px", borderRadius: 24,
                border: "none",
                background: activeFamily === f.id ? C.text : C.bgAlt,
                color: activeFamily === f.id ? "#fff" : C.textMid,
                cursor: "pointer", fontSize: 14, fontWeight: 600,
                fontFamily: "'DM Sans', system-ui", transition: "all 0.18s",
                boxShadow: activeFamily === f.id ? "0 2px 8px rgba(17,24,39,0.15)" : "none",
              }}>{f.name}</button>
            ))}
          </div>

          {/* Catégories — texte simple, souligné actif */}
          <div style={{ padding: "14px 20px 0", display: "flex", gap: 0, overflowX: "auto", scrollbarWidth: "none", borderBottom: `1px solid ${C.borderLight}` }}>
            {catsByFamily(activeFamily).map(cat => (
              <button key={cat.id} onClick={() => setActiveCategory(cat.id)} style={{
                padding: "6px 14px 10px", whiteSpace: "nowrap", flexShrink: 0,
                border: "none", borderBottom: `2px solid ${activeCategory === cat.id ? C.text : "transparent"}`,
                background: "none",
                color: activeCategory === cat.id ? C.text : C.textLight,
                cursor: "pointer", fontSize: 12, fontWeight: activeCategory === cat.id ? 700 : 400,
                fontFamily: "'DM Sans', system-ui", transition: "all 0.15s",
                marginBottom: -1,
              }}>{cat.name}</button>
            ))}
          </div>

          {/* Items grille */}
          <div style={{ padding: "14px 20px 120px" }}>
            {navItems.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: C.textLight, fontSize: 14 }}>Aucun plat disponible</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
                {navItems.map(item => <ItemCard key={item.id} item={item} view="nav" {...itemProps} />)}
              </div>
            )}
          </div>
        </div>

      ) : (
        /* Scroll carte papier */
        <div>
          {/* Nav familles sticky — même style pills que mode nav */}
          <div style={{
            position: "sticky", top: 0, zIndex: 10,
            background: "rgba(255,255,255,0.96)", backdropFilter: "blur(8px)",
            borderBottom: `1px solid ${C.borderLight}`,
            padding: "10px 20px", display: "flex", justifyContent: "center", gap: 8,
          }}>
            {FAMILIES.map(f => (
              <button key={f.id} onClick={() => { const first = catsByFamily(f.id)[0]; if (first && sectionRefs.current[first.id]) sectionRefs.current[first.id].scrollIntoView({ behavior: "smooth", block: "start" }); }} style={{
                padding: "8px 22px", borderRadius: 24, border: "none",
                background: C.text, color: "#fff",
                cursor: "pointer", fontSize: 13, fontWeight: 600,
                fontFamily: "'DM Sans', system-ui", transition: "opacity 0.15s",
                opacity: 1,
              }}
                onMouseEnter={e => e.currentTarget.style.opacity = "0.75"}
                onMouseLeave={e => e.currentTarget.style.opacity = "1"}
              >{f.name}</button>
            ))}
          </div>

          <div style={{ padding: "0 24px 120px" }}>
            {FAMILIES.map(family => {
              const cats = scrollGroups.filter(g => g.familyId === family.id);
              if (!cats.length) return null;
              return (
                <div key={family.id}>
                  {/* Séparateur famille */}
                  <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "28px 0 20px" }}>
                    <div style={{ flex: 1, height: 1, background: C.borderLight }} />
                    <span style={{ fontSize: 11, letterSpacing: 3, color: C.textLight, textTransform: "uppercase", fontWeight: 600, flexShrink: 0 }}>{family.name}</span>
                    <div style={{ flex: 1, height: 1, background: C.borderLight }} />
                  </div>

                  {cats.map(group => (
                    <div key={group.id} ref={el => sectionRefs.current[group.id] = el} style={{ marginBottom: 32, scrollMarginTop: 60 }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 2, letterSpacing: -0.3 }}>{group.name}</div>
                      <div style={{ width: 28, height: 2, background: C.primary, borderRadius: 2, marginBottom: 8 }} />
                      {group.items.map(item => <ItemCard key={item.id} item={item} view="scroll" {...itemProps} />)}
                    </div>
                  ))}
                </div>
              );
            })}
            {scrollGroups.length === 0 && (
              <div style={{ textAlign: "center", padding: "60px 0", color: C.textLight, fontSize: 14 }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🍽️</div>
                Aucun plat ne correspond à vos filtres.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Footer fixe ── */}
      <div style={{
        position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
        width: "100%", maxWidth: 640,
        padding: "10px 20px 18px",
        background: "rgba(255,255,255,0.97)", backdropFilter: "blur(10px)",
        borderTop: `1px solid ${C.borderLight}`,
        textAlign: "center",
      }}>
        <div style={{ fontSize: 10, color: C.textLight, fontFamily: "'DM Sans', system-ui", lineHeight: 1.5 }}>
          Allergènes indiqués à titre indicatif — en cas de doute, demandez à votre serveur.
        </div>
      </div>

      {showFilters && (
        <FilterPanel
          exclAllergens={exclAllergens} setExclAllergens={setExclAllergens}
          inclTags={inclTags} setInclTags={setInclTags}
          onClose={() => setShowFilters(false)}
        />
      )}
    </div>
  );
}
