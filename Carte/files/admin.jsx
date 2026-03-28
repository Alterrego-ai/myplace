import { useState, useRef } from "react";

// ── Palette ─────────────────────────────────────────────────────────────────
const P = {
  primary: "#3d5a80", primaryLight: "#e8edf4", primaryMid: "#c5d3e8",
  primaryDark: "#2c4260", accent: "#5c8db8",
  text: "#1a2332", textMid: "#4a5568", textLight: "#8a9bb0",
  border: "#dde3ec", borderLight: "#eef1f6",
  bg: "#f0f3f8", surface: "#fff", surfaceAlt: "#f7f9fc",
};

// ── 14 allergènes réglementaires EU ─────────────────────────────────────────
// Source : Règlement (UE) n°1169/2011
// Note : les sulfites ne sont pas des protéines — ils agissent comme additif chimique
const ALLERGENS = [
  {
    slug: "gluten",
    name: "Gluten",
    icon: "🌾",
    description: "Céréales contenant du gluten : blé, seigle, orge, avoine, épeautre, kamut",
    color: "#92400e", bg: "#fef3c7",
  },
  {
    slug: "crustaces",
    name: "Crustacés",
    icon: "🦐",
    description: "Crustacés et produits à base de crustacés",
    color: "#9f1239", bg: "#ffe4e6",
  },
  {
    slug: "oeufs",
    name: "Œufs",
    icon: "🥚",
    description: "Œufs et produits à base d'œufs",
    color: "#78350f", bg: "#fef9c3",
  },
  {
    slug: "poisson",
    name: "Poissons",
    icon: "🐟",
    description: "Poissons et produits à base de poissons",
    color: "#075985", bg: "#e0f2fe",
  },
  {
    slug: "arachides",
    name: "Arachides",
    icon: "🥜",
    description: "Arachides et produits à base d'arachides",
    color: "#78350f", bg: "#fef3c7",
  },
  {
    slug: "soja",
    name: "Soja",
    icon: "🫘",
    description: "Soja et produits à base de soja",
    color: "#14532d", bg: "#dcfce7",
  },
  {
    slug: "lait",
    name: "Lait",
    icon: "🥛",
    description: "Lait et produits à base de lait (y compris lactose)",
    color: "#1e40af", bg: "#dbeafe",
  },
  {
    slug: "fruits-a-coque",
    name: "Fruits à coque",
    icon: "🌰",
    description: "Amandes, noisettes, noix, cajou, pécan, macadamia, Brésil, Queensland, pistaches",
    color: "#92400e", bg: "#fef3c7",
  },
  {
    slug: "celeri",
    name: "Céleri",
    icon: "🌿",
    description: "Céleri et produits à base de céleri",
    color: "#166534", bg: "#f0fdf4",
  },
  {
    slug: "moutarde",
    name: "Moutarde",
    icon: "🟡",
    description: "Moutarde et produits à base de moutarde",
    color: "#854d0e", bg: "#fef9c3",
  },
  {
    slug: "sesame",
    name: "Sésame",
    icon: "🌱",
    description: "Graines de sésame et produits à base de graines de sésame",
    color: "#78350f", bg: "#fef3c7",
  },
  {
    slug: "sulfites",
    name: "Sulfites",
    icon: "⚗️",
    description: "Anhydride sulfureux et sulfites > 10 mg/kg ou 10 mg/l — non protéique, additif chimique",
    color: "#4c1d95", bg: "#ede9fe",
    note: "Non protéique",
  },
  {
    slug: "lupin",
    name: "Lupin",
    icon: "🌸",
    description: "Lupin et produits à base de lupin",
    color: "#831843", bg: "#fce7f3",
  },
  {
    slug: "mollusques",
    name: "Mollusques",
    icon: "🐚",
    description: "Mollusques et produits à base de mollusques",
    color: "#075985", bg: "#e0f2fe",
  },
];

const SYSTEM_TAGS = {
  ALLERGEN: ALLERGENS,
  PRODUCT_TYPE: [
    // Régimes
    { slug: "vegan",          name: "Vegan",          icon: "🌱", color: "#14532d", bg: "#dcfce7" },
    { slug: "vegetarien",     name: "Végétarien",     icon: "🥗", color: "#166534", bg: "#f0fdf4" },
    { slug: "sans-gluten",    name: "Sans gluten",    icon: "✓",  color: "#14532d", bg: "#dcfce7" },
    { slug: "sans-lactose",   name: "Sans lactose",   icon: "🥛", color: "#1e40af", bg: "#dbeafe" },
    { slug: "sans-porc",      name: "Sans porc",      icon: "🐷", color: "#9f1239", bg: "#fff1f2" },
    { slug: "adapte-enfants", name: "Adapté enfants", icon: "👶", color: "#0369a1", bg: "#e0f2fe" },
    // Qualité & préparation
    { slug: "bio",            name: "Bio",            icon: "♻️", color: "#14532d", bg: "#dcfce7" },
    { slug: "nature",         name: "Nature",         icon: "🍃", color: "#166534", bg: "#f0fdf4" },
    { slug: "fait-maison",    name: "Fait maison",    icon: "👨‍🍳", color: "#4c1d95", bg: "#ede9fe" },
    { slug: "label-rouge",    name: "Label Rouge",    icon: "🔴", color: "#be123c", bg: "#fff1f2" },
    { slug: "plein-air",      name: "Élevage plein air", icon: "🌾", color: "#166534", bg: "#f0fdf4" },
    { slug: "cru",            name: "Cru / non cuit", icon: "⚠️", color: "#b45309", bg: "#fef3c7", note: "Info sécurité" },
    { slug: "surgele",        name: "Surgelé",        icon: "❄️", color: "#0369a1", bg: "#e0f2fe", note: "Mention légale" },
    // Épices
    { slug: "epice",          name: "Épicé",          icon: "🌶️", color: "#b45309", bg: "#fef3c7" },
    { slug: "tres-epice",     name: "Très épicé",     icon: "🌶️🌶️", color: "#be123c", bg: "#fff1f2" },
  ],
  BEVERAGE: [
    { slug: "sans-alcool",       name: "Sans alcool",       icon: "🚫", color: "#166534", bg: "#dcfce7" },
    { slug: "contient-alcool",   name: "Contient de l'alcool", icon: "🍷", color: "#9f1239", bg: "#fff1f2" },
    { slug: "vin-naturel",       name: "Vin naturel",       icon: "🍇", color: "#7c3aed", bg: "#ede9fe" },
    { slug: "biodynamique",      name: "Biodynamique",      icon: "🌙", color: "#4c1d95", bg: "#ede9fe" },
    { slug: "petillant",         name: "Pétillant",         icon: "🫧", color: "#0369a1", bg: "#e0f2fe" },
    { slug: "sans-sucre-ajoute", name: "Sans sucre ajouté", icon: "🍬", color: "#166534", bg: "#dcfce7" },
    { slug: "pression",          name: "Pression",          icon: "🍺", color: "#78350f", bg: "#fef3c7" },
  ],
  CERTIFICATION: [
    { slug: "halal",       name: "Halal",       icon: "☪️",  color: "#166534", bg: "#dcfce7", note: "Certification requise" },
    { slug: "casher",      name: "Casher",      icon: "✡️",  color: "#1e40af", bg: "#dbeafe", note: "Certification requise" },
  ],
  ORIGIN: [
    { slug: "local",         name: "Local",         icon: "📍", color: "#14532d", bg: "#dcfce7" },
    { slug: "france",        name: "France",        icon: "🇫🇷", color: "#1e40af", bg: "#dbeafe" },
    { slug: "aoc",           name: "AOC",           icon: "🏷️", color: "#4c1d95", bg: "#ede9fe" },
    { slug: "aop",           name: "AOP",           icon: "🏷️", color: "#4c1d95", bg: "#ede9fe" },
    { slug: "igp",           name: "IGP",           icon: "🏷️", color: "#3d5a80", bg: "#e8edf4" },
    { slug: "circuit-court", name: "Circuit court", icon: "🌿", color: "#14532d", bg: "#dcfce7" },
  ],
  OFFER: [
    { slug: "menu-midi",   name: "Menu midi",   icon: "☀️", color: "#78350f", bg: "#fef3c7", systemRole: "view" },
    { slug: "happy-hour",  name: "Happy Hour",  icon: "🍹", color: "#9f1239", bg: "#ffe4e6", systemRole: "schedule" },
    { slug: "suggestion",  name: "Suggestion",  icon: "⭐", color: "#1e40af", bg: "#dbeafe", systemRole: "view" },
    { slug: "menu-soir",   name: "Menu du soir",icon: "🌙", color: "#4c1d95", bg: "#ede9fe", systemRole: "view" },
  ],
  HIGHLIGHT: [
    { slug: "nouveau",       name: "Nouveau",      icon: "✨", color: "#78350f", bg: "#fef3c7", systemRole: "badge" },
    { slug: "signature",     name: "Signature",    icon: "👑", color: "#3d5a80", bg: "#e8edf4", systemRole: "badge" },
    { slug: "coup-de-coeur", name: "Coup de cœur", icon: "❤️", color: "#9f1239", bg: "#ffe4e6", systemRole: "badge" },
    { slug: "saison",        name: "Saison",       icon: "🍂", color: "#92400e", bg: "#fef3c7", systemRole: "badge" },
  ],
};

const ALL_TAGS = Object.entries(SYSTEM_TAGS).flatMap(([cat, tags]) => tags.map(t => ({ ...t, category: cat })));
const CAT_LABELS = {
  ALLERGEN:      "Allergènes (14 réglementaires)",
  PRODUCT_TYPE:  "Type de produit",
  BEVERAGE:      "Boissons",
  CERTIFICATION: "Certifications",
  ORIGIN:        "Origine & labels",
  OFFER:         "Offres & menus",
  HIGHLIGHT:     "Mise en avant",
};
const getTag = slug => ALL_TAGS.find(t => t.slug === slug);

// ── Data ─────────────────────────────────────────────────────────────────────
const INITIAL_FAMILIES = [
  { id: 1, name: "Cuisine", order: 0, imageUrl: null },
  { id: 2, name: "Boissons", order: 1, imageUrl: null },
];
const INITIAL_CATEGORIES = [
  { id: 1, name: "Entrées", order: 0, visible: true, familyId: 1, imageUrl: null, items: [
    { id: 1, name: "Carpaccio de bœuf",    description: "Roquette, parmesan 24 mois, huile de truffe",    price: 18, available: true,  imageUrl: null, tags: ["signature","fait-maison"] },
    { id: 2, name: "Velouté de butternut", description: "Crème de coco, graines de courge torréfiées",   price: 12, available: true,  imageUrl: null, tags: ["vegan","fait-maison","saison"] },
    { id: 3, name: "Foie gras maison",     description: "Chutney de figues, brioche toastée",             price: 24, available: false, imageUrl: null, tags: ["fait-maison","gluten","oeufs"] },
  ]},
  { id: 2, name: "Plats", order: 1, visible: true, familyId: 1, imageUrl: null, items: [
    { id: 4, name: "Filet de sole meunière", description: "Beurre noisette, câpres, citron confit",       price: 32, available: true, imageUrl: null, tags: ["poisson","lait","menu-midi"] },
    { id: 5, name: "Côte de veau rôtie",    description: "Jus corsé, gratin dauphinois, haricots verts", price: 38, available: true, imageUrl: null, tags: ["lait","france"] },
    { id: 6, name: "Risotto aux cèpes",     description: "Parmesan AOP, huile de truffe blanche",        price: 26, available: true, imageUrl: null, tags: ["vegetarien","aoc","coup-de-coeur","lait"] },
  ]},
  { id: 3, name: "Desserts", order: 2, visible: true, familyId: 1, imageUrl: null, items: [
    { id: 7, name: "Soufflé au Grand Marnier", description: "Crème anglaise vanille Bourbon",             price: 14, available: true, imageUrl: null, tags: ["fait-maison","oeufs","gluten","lait","sulfites"] },
    { id: 8, name: "Cheese-cake citron yuzu",  description: "Coulis de fruits de la passion",             price: 12, available: true, imageUrl: null, tags: ["nouveau","fait-maison","gluten","oeufs","lait"] },
  ]},
  { id: 4, name: "Vins rouges", order: 0, visible: true, familyId: 2, imageUrl: null, items: [
    { id: 9,  name: "Chablis Premier Cru", description: "Domaine Laroche, 2021",   price: 11, available: true, imageUrl: null, tags: ["aoc","france","sulfites"] },
    { id: 10, name: "Côtes du Rhône",      description: "Château Beauchêne, 2020", price: 8,  available: true, imageUrl: null, tags: ["france","happy-hour","sulfites"] },
  ]},
  { id: 5, name: "Softs", order: 1, visible: true, familyId: 2, imageUrl: null, items: [
    { id: 11, name: "Limonade maison", description: "Citron, gingembre, menthe fraîche", price: 5, available: true, imageUrl: null, tags: ["fait-maison","vegan"] },
  ]},
];

// ── UI Primitives ────────────────────────────────────────────────────────────
const Toggle = ({ checked, onChange }) => (
  <button onClick={onChange} style={{
    width: 44, height: 24, borderRadius: 12, background: checked ? P.primary : "#cbd5e1",
    border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0,
  }}>
    <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: checked ? 23 : 3, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.18)" }} />
  </button>
);

const TagBadge = ({ slug, onRemove }) => {
  const tag = getTag(slug);
  if (!tag) return null;
  return (
    <span title={tag.description} style={{
      display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600,
      padding: "3px 8px", borderRadius: 5, color: tag.color, background: tag.bg,
      fontFamily: "'DM Sans', system-ui", whiteSpace: "nowrap", cursor: tag.description ? "help" : "default",
    }}>
      {tag.icon} {tag.name}
      {tag.note && <span style={{ fontSize: 9, opacity: 0.7, fontStyle: "italic" }}>({tag.note})</span>}
      {onRemove && <button onClick={onRemove} style={{ background: "none", border: "none", cursor: "pointer", color: tag.color, fontSize: 13, padding: 0, lineHeight: 1, marginLeft: 2 }}>×</button>}
    </span>
  );
};

const ImageUpload = ({ value, onChange, size = "sm" }) => {
  const ref = useRef();
  const [hov, setHov] = useState(false);
  const isLg = size === "lg";
  return (
    <div onClick={() => ref.current.click()} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} style={{
      width: isLg ? "100%" : 52, height: isLg ? 100 : 52, borderRadius: isLg ? 10 : 8,
      border: `1.5px dashed ${hov ? P.primary : P.border}`, background: value ? "none" : P.surfaceAlt,
      cursor: "pointer", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0, position: "relative", transition: "border-color 0.15s",
    }}>
      {value ? (
        <> <img src={value} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          {hov && <div style={{ position: "absolute", inset: 0, background: "rgba(61,90,128,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "#fff", fontSize: 11, fontWeight: 600, fontFamily: "'DM Sans', system-ui" }}>Changer</span>
          </div>}
        </>
      ) : (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: isLg ? 20 : 15 }}>📷</div>
          {isLg && <div style={{ fontSize: 11, color: P.textLight, fontFamily: "'DM Sans', system-ui", marginTop: 4 }}>Upload ou URL</div>}
        </div>
      )}
      <input ref={ref} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files[0]; if (f) onChange(URL.createObjectURL(f)); }} />
    </div>
  );
};

// ── Tag Picker avec description au survol ────────────────────────────────────
const TagPicker = ({ selected, onChange }) => {
  const [open, setOpen] = useState(false);
  const toggle = slug => onChange(selected.includes(slug) ? selected.filter(s => s !== slug) : [...selected, slug]);
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen(!open)} style={{
        padding: "6px 12px", background: P.surfaceAlt, border: `1.5px solid ${P.border}`,
        borderRadius: 7, color: P.textMid, cursor: "pointer", fontSize: 12,
        fontFamily: "'DM Sans', system-ui", fontWeight: 600,
        display: "flex", alignItems: "center", gap: 6, transition: "border-color 0.15s",
      }}
        onMouseEnter={e => e.currentTarget.style.borderColor = P.primary}
        onMouseLeave={e => e.currentTarget.style.borderColor = P.border}
      >
        🏷️ Ajouter un tag
        {selected.length > 0 && <span style={{ background: P.primary, color: "#fff", borderRadius: 10, padding: "1px 6px", fontSize: 10 }}>{selected.length}</span>}
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, background: P.surface,
          border: `1.5px solid ${P.border}`, borderRadius: 12, padding: 16, zIndex: 300,
          boxShadow: "0 8px 32px rgba(61,90,128,0.14)", width: 340, maxHeight: 420, overflowY: "auto",
        }}>
          {Object.entries(SYSTEM_TAGS).map(([cat, tags]) => (
            <div key={cat} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: P.textLight, textTransform: "uppercase", letterSpacing: 1, marginBottom: 7, fontFamily: "'DM Sans', system-ui" }}>
                {CAT_LABELS[cat]}
              </div>
              {/* Allergènes : layout liste avec description */}
              {cat === "ALLERGEN" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {tags.map(tag => {
                    const active = selected.includes(tag.slug);
                    return (
                      <button key={tag.slug} onClick={() => toggle(tag.slug)} style={{
                        display: "flex", alignItems: "flex-start", gap: 8, padding: "7px 10px", borderRadius: 7,
                        color: active ? tag.color : P.textMid,
                        background: active ? tag.bg : P.surfaceAlt,
                        border: `1.5px solid ${active ? tag.color + "50" : "transparent"}`,
                        cursor: "pointer", fontFamily: "'DM Sans', system-ui", transition: "all 0.15s", textAlign: "left",
                      }}>
                        <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{tag.icon}</span>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700 }}>
                            {tag.name}
                            {tag.note && <span style={{ fontSize: 10, fontWeight: 400, fontStyle: "italic", marginLeft: 5, opacity: 0.7 }}>({tag.note})</span>}
                          </div>
                          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 1, lineHeight: 1.3 }}>{tag.description}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {tags.map(tag => {
                    const active = selected.includes(tag.slug);
                    return (
                      <button key={tag.slug} onClick={() => toggle(tag.slug)} style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        fontSize: 11, fontWeight: 600, padding: "4px 9px", borderRadius: 5,
                        color: active ? tag.color : P.textMid,
                        background: active ? tag.bg : P.surfaceAlt,
                        border: `1.5px solid ${active ? tag.color + "50" : "transparent"}`,
                        cursor: "pointer", fontFamily: "'DM Sans', system-ui", transition: "all 0.15s",
                      }}>{tag.icon} {tag.name}</button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
          <button onClick={() => setOpen(false)} style={{
            width: "100%", padding: "8px", background: P.surfaceAlt, border: "none",
            borderRadius: 7, color: P.textMid, cursor: "pointer", fontSize: 13,
            fontFamily: "'DM Sans', system-ui", fontWeight: 500, marginTop: 4,
          }}>Fermer</button>
        </div>
      )}
    </div>
  );
};

// ── Item Modal ────────────────────────────────────────────────────────────────
const ItemModal = ({ item, onClose, onSave }) => {
  const [form, setForm] = useState({ ...item });
  const [urlInput, setUrlInput] = useState("");
  const [imgTab, setImgTab] = useState("upload");
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(26,35,50,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: P.surface, borderRadius: 16, padding: 28, width: "100%", maxWidth: 500, boxShadow: "0 24px 60px rgba(61,90,128,0.22)", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, letterSpacing: 2.5, color: P.primary, textTransform: "uppercase", marginBottom: 4, fontFamily: "'DM Sans', system-ui", fontWeight: 700 }}>Édition</div>
          <h2 style={{ margin: 0, fontSize: 24, color: P.text, fontFamily: "'DM Sans', system-ui", fontWeight: 700 }}>{form.name || "Nouveau plat"}</h2>
        </div>
        {[["Nom", "name", "text"], ["Description", "description", "text"], ["Prix (€)", "price", "number"]].map(([label, key, type]) => (
          <div key={key} style={{ marginBottom: 13 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: P.textMid, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5, fontFamily: "'DM Sans', system-ui" }}>{label}</label>
            <input type={type} value={form[key] ?? ""} onChange={e => setForm({ ...form, [key]: type === "number" ? parseFloat(e.target.value) || 0 : e.target.value })} style={{
              width: "100%", padding: "10px 13px", fontSize: 14, border: `1.5px solid ${P.border}`,
              borderRadius: 8, fontFamily: "'DM Sans', system-ui", color: P.text,
              outline: "none", boxSizing: "border-box", background: P.surfaceAlt,
            }} onFocus={e => e.target.style.borderColor = P.primary} onBlur={e => e.target.style.borderColor = P.border} />
          </div>
        ))}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: P.textMid, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, fontFamily: "'DM Sans', system-ui" }}>Photo</label>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            {["upload", "url"].map(t => (
              <button key={t} onClick={() => setImgTab(t)} style={{
                padding: "5px 13px", borderRadius: 6, border: `1.5px solid ${imgTab === t ? P.primary : P.border}`,
                background: imgTab === t ? P.primaryLight : P.surfaceAlt, color: imgTab === t ? P.primary : P.textMid,
                cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans', system-ui", fontWeight: 600,
              }}>{t === "upload" ? "📁 Upload" : "🔗 URL"}</button>
            ))}
          </div>
          {imgTab === "upload"
            ? <ImageUpload value={form.imageUrl} onChange={v => setForm({ ...form, imageUrl: v })} size="lg" />
            : <div style={{ display: "flex", gap: 8 }}>
                <input value={urlInput} onChange={e => setUrlInput(e.target.value)} placeholder="https://..." style={{ flex: 1, padding: "9px 12px", fontSize: 13, border: `1.5px solid ${P.border}`, borderRadius: 7, fontFamily: "'DM Sans', system-ui", color: P.text, outline: "none", background: P.surfaceAlt }} onFocus={e => e.target.style.borderColor = P.primary} onBlur={e => e.target.style.borderColor = P.border} />
                <button onClick={() => { setForm({ ...form, imageUrl: urlInput }); setUrlInput(""); }} style={{ padding: "9px 14px", background: P.primary, border: "none", borderRadius: 7, color: "#fff", cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', system-ui", fontWeight: 600 }}>OK</button>
              </div>
          }
        </div>
        <div style={{ marginBottom: 22 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: P.textMid, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, fontFamily: "'DM Sans', system-ui" }}>
            Allergènes & tags
          </label>
          {form.tags.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {form.tags.map(s => <TagBadge key={s} slug={s} onRemove={() => setForm({ ...form, tags: form.tags.filter(x => x !== s) })} />)}
            </div>
          )}
          <TagPicker selected={form.tags} onChange={tags => setForm({ ...form, tags })} />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "11px", background: P.surfaceAlt, border: "none", borderRadius: 8, color: P.textMid, cursor: "pointer", fontFamily: "'DM Sans', system-ui", fontSize: 14, fontWeight: 500 }}>Annuler</button>
          <button onClick={() => onSave(form)} style={{ flex: 2, padding: "11px", background: P.primary, border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontFamily: "'DM Sans', system-ui", fontSize: 14, fontWeight: 600 }}>Enregistrer</button>
        </div>
      </div>
    </div>
  );
};

// ── Category Modal ────────────────────────────────────────────────────────────
const CategoryModal = ({ category, families, onClose, onSave }) => {
  const isNew = !category.id;
  const [form, setForm] = useState({ name: "", familyId: families[0]?.id ?? null, imageUrl: null, visible: true, ...category });
  const [imgTab, setImgTab] = useState("upload");
  const [urlInput, setUrlInput] = useState("");
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(26,35,50,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: P.surface, borderRadius: 16, padding: 28, width: "100%", maxWidth: 440, boxShadow: "0 24px 60px rgba(61,90,128,0.22)", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, letterSpacing: 2.5, color: P.primary, textTransform: "uppercase", marginBottom: 4, fontFamily: "'DM Sans', system-ui", fontWeight: 700 }}>{isNew ? "Nouvelle catégorie" : "Modifier"}</div>
          <h2 style={{ margin: 0, fontSize: 22, color: P.text, fontFamily: "'DM Sans', system-ui", fontWeight: 700 }}>{form.name || "Sans nom"}</h2>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: P.textMid, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5, fontFamily: "'DM Sans', system-ui" }}>Nom</label>
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={{ width: "100%", padding: "10px 13px", fontSize: 14, border: `1.5px solid ${P.border}`, borderRadius: 8, fontFamily: "'DM Sans', system-ui", color: P.text, outline: "none", boxSizing: "border-box", background: P.surfaceAlt }} onFocus={e => e.target.style.borderColor = P.primary} onBlur={e => e.target.style.borderColor = P.border} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: P.textMid, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5, fontFamily: "'DM Sans', system-ui" }}>Famille</label>
          <select value={form.familyId ?? ""} onChange={e => setForm({ ...form, familyId: e.target.value ? parseInt(e.target.value) : null })} style={{ width: "100%", padding: "10px 13px", fontSize: 14, border: `1.5px solid ${P.border}`, borderRadius: 8, fontFamily: "'DM Sans', system-ui", color: P.text, outline: "none", background: P.surfaceAlt, cursor: "pointer" }}>
            <option value="">Sans famille</option>
            {families.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: P.textMid, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, fontFamily: "'DM Sans', system-ui" }}>Photo d'ambiance</label>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            {["upload", "url"].map(t => (
              <button key={t} onClick={() => setImgTab(t)} style={{ padding: "5px 13px", borderRadius: 6, border: `1.5px solid ${imgTab === t ? P.primary : P.border}`, background: imgTab === t ? P.primaryLight : P.surfaceAlt, color: imgTab === t ? P.primary : P.textMid, cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans', system-ui", fontWeight: 600 }}>{t === "upload" ? "📁 Upload" : "🔗 URL"}</button>
            ))}
          </div>
          {imgTab === "upload"
            ? <ImageUpload value={form.imageUrl} onChange={v => setForm({ ...form, imageUrl: v })} size="lg" />
            : <div style={{ display: "flex", gap: 8 }}>
                <input value={urlInput} onChange={e => setUrlInput(e.target.value)} placeholder="https://..." style={{ flex: 1, padding: "9px 12px", fontSize: 13, border: `1.5px solid ${P.border}`, borderRadius: 7, fontFamily: "'DM Sans', system-ui", color: P.text, outline: "none", background: P.surfaceAlt }} onFocus={e => e.target.style.borderColor = P.primary} onBlur={e => e.target.style.borderColor = P.border} />
                <button onClick={() => { setForm({ ...form, imageUrl: urlInput }); setUrlInput(""); }} style={{ padding: "9px 14px", background: P.primary, border: "none", borderRadius: 7, color: "#fff", cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', system-ui", fontWeight: 600 }}>OK</button>
              </div>
          }
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22, padding: "10px 14px", background: P.surfaceAlt, borderRadius: 8 }}>
          <Toggle checked={form.visible} onChange={() => setForm({ ...form, visible: !form.visible })} />
          <span style={{ fontSize: 13, color: P.textMid, fontFamily: "'DM Sans', system-ui" }}>{form.visible ? "Visible sur la carte" : "Masquée sur la carte"}</span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "11px", background: P.surfaceAlt, border: "none", borderRadius: 8, color: P.textMid, cursor: "pointer", fontFamily: "'DM Sans', system-ui", fontSize: 14, fontWeight: 500 }}>Annuler</button>
          <button onClick={() => onSave(form)} style={{ flex: 2, padding: "11px", background: P.primary, border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontFamily: "'DM Sans', system-ui", fontSize: 14, fontWeight: 600 }}>{isNew ? "Créer" : "Enregistrer"}</button>
        </div>
      </div>
    </div>
  );
};

// ── Family Modal ──────────────────────────────────────────────────────────────
const FamilyModal = ({ family, onClose, onSave }) => {
  const isNew = !family.id;
  const [form, setForm] = useState({ name: "", imageUrl: null, ...family });
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(26,35,50,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: P.surface, borderRadius: 16, padding: 28, width: "100%", maxWidth: 400, boxShadow: "0 24px 60px rgba(61,90,128,0.22)" }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, letterSpacing: 2.5, color: P.primary, textTransform: "uppercase", marginBottom: 4, fontFamily: "'DM Sans', system-ui", fontWeight: 700 }}>{isNew ? "Nouvelle famille" : "Modifier"}</div>
          <h2 style={{ margin: 0, fontSize: 22, color: P.text, fontFamily: "'DM Sans', system-ui", fontWeight: 700 }}>{form.name || "Sans nom"}</h2>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: P.textMid, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5, fontFamily: "'DM Sans', system-ui" }}>Nom</label>
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={{ width: "100%", padding: "10px 13px", fontSize: 14, border: `1.5px solid ${P.border}`, borderRadius: 8, fontFamily: "'DM Sans', system-ui", color: P.text, outline: "none", boxSizing: "border-box", background: P.surfaceAlt }} onFocus={e => e.target.style.borderColor = P.primary} onBlur={e => e.target.style.borderColor = P.border} />
        </div>
        <div style={{ marginBottom: 22 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: P.textMid, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, fontFamily: "'DM Sans', system-ui" }}>Photo</label>
          <ImageUpload value={form.imageUrl} onChange={v => setForm({ ...form, imageUrl: v })} size="lg" />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "11px", background: P.surfaceAlt, border: "none", borderRadius: 8, color: P.textMid, cursor: "pointer", fontFamily: "'DM Sans', system-ui", fontSize: 14, fontWeight: 500 }}>Annuler</button>
          <button onClick={() => onSave(form)} style={{ flex: 2, padding: "11px", background: P.primary, border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontFamily: "'DM Sans', system-ui", fontSize: 14, fontWeight: 600 }}>{isNew ? "Créer" : "Enregistrer"}</button>
        </div>
      </div>
    </div>
  );
};

// ── Item Row ──────────────────────────────────────────────────────────────────
const ItemRow = ({ item, onToggle, onEdit }) => {
  const [hov, setHov] = useState(false);
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 18px", background: hov ? "#f5f8fc" : P.surface, borderBottom: `1px solid ${P.borderLight}`, transition: "background 0.15s", flexWrap: "wrap" }}>
      <ImageUpload value={item.imageUrl} onChange={() => {}} size="sm" />
      <div style={{ flex: 1, minWidth: 140 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: item.available ? P.text : "#94a3b8", fontFamily: "'DM Sans', system-ui" }}>{item.name}</span>
          {!item.available && <span style={{ fontSize: 10, fontWeight: 700, color: "#be123c", background: "#ffe4e6", padding: "2px 7px", borderRadius: 4, fontFamily: "'DM Sans', system-ui", textTransform: "uppercase" }}>Indisponible</span>}
        </div>
        <div style={{ fontSize: 12, color: P.textLight, fontStyle: "italic", fontFamily: "'DM Sans', system-ui", marginBottom: item.tags.length ? 5 : 0 }}>{item.description}</div>
        {item.tags.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{item.tags.map(s => <TagBadge key={s} slug={s} />)}</div>}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: P.primary, fontFamily: "'DM Sans', system-ui", minWidth: 58, textAlign: "right" }}>{item.price.toFixed(2)} €</div>
      <Toggle checked={item.available} onChange={() => onToggle(item.id)} />
      <button onClick={() => onEdit(item)} style={{ padding: "6px 12px", background: "none", border: `1.5px solid ${P.border}`, borderRadius: 7, color: P.textMid, cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans', system-ui", fontWeight: 600, transition: "all 0.15s", whiteSpace: "nowrap" }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = P.primary; e.currentTarget.style.color = P.primary; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = P.border; e.currentTarget.style.color = P.textMid; }}
      >Éditer</button>
    </div>
  );
};

// ── Category Card ─────────────────────────────────────────────────────────────
const CategoryCard = ({ category, index, total, families, onMoveUp, onMoveDown, onToggleItem, onEditItem, onToggleVisible, onUpdateImage, onChangeFamily, onEditCategory }) => {
  const [collapsed, setCollapsed] = useState(false);
  const family = families.find(f => f.id === category.familyId);
  return (
    <div style={{ background: P.surface, border: `1.5px solid ${P.border}`, borderRadius: 14, overflow: "hidden", opacity: category.visible ? 1 : 0.6, transition: "opacity 0.3s", boxShadow: "0 1px 6px rgba(61,90,128,0.07)" }}>
      {category.imageUrl && <div style={{ height: 64, overflow: "hidden", position: "relative" }}><img src={category.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /><div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, rgba(61,90,128,0.5), transparent)" }} /></div>}
      <div style={{ display: "flex", alignItems: "center", padding: "11px 16px", background: P.surfaceAlt, borderBottom: collapsed ? "none" : `1px solid ${P.borderLight}`, gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {[[-1, "▲", index === 0], [1, "▼", index === total - 1]].map(([dir, icon, dis]) => (
            <button key={icon} onClick={dis ? null : (dir === -1 ? onMoveUp : onMoveDown)} style={{ background: "none", border: "none", lineHeight: 1, cursor: dis ? "not-allowed" : "pointer", color: dis ? P.borderLight : P.textLight, fontSize: 11, padding: "2px 4px", transition: "color 0.15s" }}
              onMouseEnter={e => { if (!dis) e.currentTarget.style.color = P.primary; }}
              onMouseLeave={e => e.currentTarget.style.color = dis ? P.borderLight : P.textLight}
            >{icon}</button>
          ))}
        </div>
        <ImageUpload value={category.imageUrl} onChange={onUpdateImage} size="sm" />
        <div style={{ flex: 1, cursor: "pointer", minWidth: 100 }} onClick={() => setCollapsed(!collapsed)}>
          <div style={{ fontSize: 17, fontWeight: 700, color: P.text, fontFamily: "'DM Sans', system-ui" }}>{category.name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2, flexWrap: "wrap" }}>
            {family && <span style={{ fontSize: 11, color: P.primary, background: P.primaryLight, padding: "1px 8px", borderRadius: 20, fontFamily: "'DM Sans', system-ui", fontWeight: 600 }}>{family.name}</span>}
            <span style={{ fontSize: 11, color: P.textLight, background: P.bg, padding: "1px 8px", borderRadius: 20, fontFamily: "'DM Sans', system-ui" }}>{category.items.length} plat{category.items.length > 1 ? "s" : ""}</span>
            {!category.visible && <span style={{ fontSize: 10, fontWeight: 700, color: P.primary, background: P.primaryLight, padding: "1px 8px", borderRadius: 20, fontFamily: "'DM Sans', system-ui", textTransform: "uppercase" }}>Masquée</span>}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <select value={category.familyId ?? ""} onChange={e => onChangeFamily(e.target.value ? parseInt(e.target.value) : null)} onClick={e => e.stopPropagation()} style={{ padding: "5px 9px", border: `1.5px solid ${P.border}`, borderRadius: 7, fontSize: 12, color: P.textMid, background: P.surface, fontFamily: "'DM Sans', system-ui", cursor: "pointer", outline: "none" }}>
            <option value="">Sans famille</option>
            {families.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <button onClick={e => { e.stopPropagation(); onEditCategory(category); }} style={{ padding: "5px 10px", background: "none", border: `1.5px solid ${P.border}`, borderRadius: 7, color: P.textMid, cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans', system-ui", fontWeight: 600, transition: "all 0.15s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = P.primary; e.currentTarget.style.color = P.primary; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = P.border; e.currentTarget.style.color = P.textMid; }}
          >✎</button>
          <Toggle checked={category.visible} onChange={onToggleVisible} />
          <button onClick={() => setCollapsed(!collapsed)} style={{ background: "none", border: "none", cursor: "pointer", color: P.textLight, fontSize: 20, padding: "0 4px", transition: "transform 0.2s", transform: collapsed ? "rotate(-90deg)" : "rotate(0)" }}>›</button>
        </div>
      </div>
      {!collapsed && (
        <>
          {category.items.map(item => <ItemRow key={item.id} item={item} onToggle={onToggleItem} onEdit={onEditItem} />)}
          <div style={{ padding: "10px 18px", background: P.surfaceAlt }}>
            <button style={{ width: "100%", padding: "8px", background: "none", border: `1.5px dashed ${P.border}`, borderRadius: 7, color: P.textLight, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', system-ui", transition: "all 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = P.primary; e.currentTarget.style.color = P.primary; e.currentTarget.style.background = P.primaryLight; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = P.border; e.currentTarget.style.color = P.textLight; e.currentTarget.style.background = "none"; }}
            >+ Ajouter un plat</button>
          </div>
        </>
      )}
    </div>
  );
};

// ── Organisation Tab ──────────────────────────────────────────────────────────
const OrganisationTab = ({ families, categories, onEditFamily, onNewFamily, onEditCategory, onNewCategory, onMoveCategory, onToggleCatVisible }) => {
  const unassigned = categories.filter(c => !c.familyId);
  const DashedBtn = ({ label, onClick }) => (
    <button onClick={onClick} style={{ padding: "8px", background: "none", border: `1.5px dashed ${P.border}`, borderRadius: 8, color: P.textLight, cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans', system-ui", transition: "all 0.15s", width: "100%" }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = P.primary; e.currentTarget.style.color = P.primary; e.currentTarget.style.background = P.primaryLight; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = P.border; e.currentTarget.style.color = P.textLight; e.currentTarget.style.background = "none"; }}
    >{label}</button>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {families.map((family, fi) => {
        const cats = categories.filter(c => c.familyId === family.id);
        return (
          <div key={family.id} style={{ background: P.surface, border: `1.5px solid ${P.border}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 6px rgba(61,90,128,0.07)" }}>
            {family.imageUrl && <div style={{ height: 70, overflow: "hidden", position: "relative" }}><img src={family.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /><div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, rgba(61,90,128,0.55), transparent)" }} /><div style={{ position: "absolute", bottom: 10, left: 18 }}><span style={{ fontSize: 19, fontWeight: 700, color: "#fff", fontFamily: "'DM Sans', system-ui", textShadow: "0 1px 4px rgba(0,0,0,0.3)" }}>{family.name}</span></div></div>}
            <div style={{ display: "flex", alignItems: "center", padding: "13px 18px", background: P.surfaceAlt, borderBottom: `1px solid ${P.borderLight}`, gap: 12 }}>
              {!family.imageUrl && <div style={{ width: 36, height: 36, borderRadius: 8, background: P.primaryLight, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><span style={{ fontSize: 18 }}>{fi === 0 ? "🍽️" : "🥂"}</span></div>}
              <div style={{ flex: 1 }}>
                {!family.imageUrl && <div style={{ fontSize: 17, fontWeight: 700, color: P.text, fontFamily: "'DM Sans', system-ui" }}>{family.name}</div>}
                <div style={{ fontSize: 12, color: P.textLight, fontFamily: "'DM Sans', system-ui", marginTop: family.imageUrl ? 0 : 2 }}>{cats.length} catégorie{cats.length > 1 ? "s" : ""} · {cats.reduce((a, c) => a + c.items.length, 0)} plats</div>
              </div>
              <button onClick={() => onEditFamily(family)} style={{ padding: "6px 14px", background: "none", border: `1.5px solid ${P.border}`, borderRadius: 7, color: P.textMid, cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans', system-ui", fontWeight: 600, transition: "all 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = P.primary; e.currentTarget.style.color = P.primary; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = P.border; e.currentTarget.style.color = P.textMid; }}
              >Modifier</button>
            </div>
            <div style={{ padding: "12px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
              {cats.length === 0 && <div style={{ padding: "12px", textAlign: "center", color: P.textLight, fontSize: 13, fontFamily: "'DM Sans', system-ui", fontStyle: "italic" }}>Aucune catégorie</div>}
              {cats.map((cat, ci) => (
                <div key={cat.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: P.bg, borderRadius: 10, border: `1px solid ${P.borderLight}`, flexWrap: "wrap" }}>
                  <ImageUpload value={cat.imageUrl} onChange={() => {}} size="sm" />
                  <div style={{ flex: 1, minWidth: 100 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: cat.visible ? P.text : "#94a3b8", fontFamily: "'DM Sans', system-ui" }}>{cat.name}</div>
                    <div style={{ fontSize: 11, color: P.textLight, fontFamily: "'DM Sans', system-ui", marginTop: 1 }}>{cat.items.length} plat{cat.items.length > 1 ? "s" : ""}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      {[[-1, "▲", ci === 0], [1, "▼", ci === cats.length - 1]].map(([dir, icon, dis]) => (
                        <button key={icon} onClick={dis ? null : () => onMoveCategory(cat.id, dir)} style={{ background: "none", border: "none", lineHeight: 1, cursor: dis ? "not-allowed" : "pointer", color: dis ? P.borderLight : P.textLight, fontSize: 10, padding: "1px 3px", transition: "color 0.15s" }}
                          onMouseEnter={e => { if (!dis) e.currentTarget.style.color = P.primary; }}
                          onMouseLeave={e => e.currentTarget.style.color = dis ? P.borderLight : P.textLight}
                        >{icon}</button>
                      ))}
                    </div>
                    <Toggle checked={cat.visible} onChange={() => onToggleCatVisible(cat.id)} />
                    <button onClick={() => onEditCategory(cat)} style={{ padding: "5px 11px", background: "none", border: `1.5px solid ${P.border}`, borderRadius: 7, color: P.textMid, cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans', system-ui", fontWeight: 600, transition: "all 0.15s" }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = P.primary; e.currentTarget.style.color = P.primary; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = P.border; e.currentTarget.style.color = P.textMid; }}
                    >Modifier</button>
                  </div>
                </div>
              ))}
              <DashedBtn label={`+ Nouvelle catégorie dans ${family.name}`} onClick={() => onNewCategory(family.id)} />
            </div>
          </div>
        );
      })}
      {unassigned.length > 0 && (
        <div style={{ background: P.surface, border: `1.5px dashed ${P.border}`, borderRadius: 14, overflow: "hidden" }}>
          <div style={{ padding: "12px 18px", background: P.surfaceAlt, borderBottom: `1px solid ${P.borderLight}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: P.textLight, textTransform: "uppercase", letterSpacing: 1, fontFamily: "'DM Sans', system-ui" }}>Sans famille</div>
          </div>
          <div style={{ padding: "12px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
            {unassigned.map(cat => (
              <div key={cat.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: P.bg, borderRadius: 10, border: `1px solid ${P.borderLight}`, flexWrap: "wrap" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: P.text, fontFamily: "'DM Sans', system-ui" }}>{cat.name}</div>
                  <div style={{ fontSize: 11, color: P.textLight, fontFamily: "'DM Sans', system-ui" }}>{cat.items.length} plat{cat.items.length > 1 ? "s" : ""}</div>
                </div>
                <button onClick={() => onEditCategory(cat)} style={{ padding: "5px 11px", background: "none", border: `1.5px solid ${P.border}`, borderRadius: 7, color: P.textMid, cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans', system-ui", fontWeight: 600, transition: "all 0.15s" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = P.primary; e.currentTarget.style.color = P.primary; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = P.border; e.currentTarget.style.color = P.textMid; }}
                >Modifier</button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: "flex", gap: 10 }}>
        {[["+ Nouvelle famille", onNewFamily], ["+ Nouvelle catégorie", () => onNewCategory(null)]].map(([label, fn]) => (
          <button key={label} onClick={fn} style={{ flex: 1, padding: "12px", background: P.surface, border: `1.5px dashed ${P.border}`, borderRadius: 12, color: P.textLight, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', system-ui", transition: "all 0.15s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = P.primary; e.currentTarget.style.color = P.primary; e.currentTarget.style.background = P.primaryLight; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = P.border; e.currentTarget.style.color = P.textLight; e.currentTarget.style.background = P.surface; }}
          >{label}</button>
        ))}
      </div>
    </div>
  );
};

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AdminMenu() {
  const [categories, setCategories] = useState(INITIAL_CATEGORIES);
  const [families, setFamilies] = useState(INITIAL_FAMILIES);
  const [editingItem, setEditingItem] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);
  const [editingFamily, setEditingFamily] = useState(null);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState("carte");
  const [filterFamily, setFilterFamily] = useState(null);
  const nextId = useRef(100);

  const moveCategory = (i, dir) => { const n = [...categories]; const t = i + dir; if (t < 0 || t >= n.length) return; [n[i], n[t]] = [n[t], n[i]]; setCategories(n); };
  const moveCategoryById = (id, dir) => { const i = categories.findIndex(c => c.id === id); moveCategory(i, dir); };
  const toggleItem = id => setCategories(cs => cs.map(c => ({ ...c, items: c.items.map(i => i.id === id ? { ...i, available: !i.available } : i) })));
  const toggleCatVisible = id => setCategories(cs => cs.map(c => c.id === id ? { ...c, visible: !c.visible } : c));
  const saveItem = up => { setCategories(cs => cs.map(c => ({ ...c, items: c.items.map(i => i.id === up.id ? up : i) }))); setEditingItem(null); };
  const updateCatImage = (id, url) => setCategories(cs => cs.map(c => c.id === id ? { ...c, imageUrl: url } : c));
  const changeCatFamily = (id, fid) => setCategories(cs => cs.map(c => c.id === id ? { ...c, familyId: fid } : c));
  const saveCategory = form => { if (form.id) { setCategories(cs => cs.map(c => c.id === form.id ? { ...c, ...form } : c)); } else { setCategories(cs => [...cs, { ...form, id: nextId.current++, order: cs.length, items: [] }]); } setEditingCategory(null); };
  const saveFamily = form => { if (form.id) { setFamilies(fs => fs.map(f => f.id === form.id ? { ...f, ...form } : f)); } else { setFamilies(fs => [...fs, { ...form, id: nextId.current++, order: fs.length }]); } setEditingFamily(null); };

  const allItems = categories.flatMap(c => c.items);
  const unavailable = allItems.filter(i => !i.available).length;
  const avgPrice = allItems.length ? (allItems.reduce((a, i) => a + i.price, 0) / allItems.length).toFixed(0) : 0;
  const filtered = filterFamily !== null ? categories.filter(c => c.familyId === filterFamily) : categories;
  const TABS = [{ id: "carte", label: "Carte" }, { id: "organisation", label: "Organisation" }, { id: "tags", label: "Tags" }];

  return (
    <div style={{ minHeight: "100vh", background: P.bg }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* Topbar */}
      <div style={{ background: P.surface, borderBottom: `1.5px solid ${P.border}`, padding: "12px 20px", position: "sticky", top: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: `linear-gradient(135deg, ${P.primary}, ${P.primaryDark})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontSize: 17, color: "#fff" }}>✦</span>
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: P.text, fontFamily: "'DM Sans', system-ui", lineHeight: 1.2 }}>Le Bistrot Doré</div>
            <div style={{ fontSize: 11, color: P.textLight, fontFamily: "'DM Sans', system-ui" }}>Gestion de la carte</div>
          </div>
          <a
            href="/menu/le-bistrot-dore"
            target="_blank"
            rel="noopener noreferrer"
            title="Voir la carte client"
            style={{
              marginLeft: 6,
              display: "flex", alignItems: "center", gap: 5,
              padding: "5px 12px", borderRadius: 7,
              border: `1.5px solid ${P.border}`,
              background: P.surfaceAlt,
              color: P.textMid, textDecoration: "none",
              fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', system-ui",
              transition: "all 0.15s", whiteSpace: "nowrap",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = P.primary; e.currentTarget.style.color = P.primary; e.currentTarget.style.background = P.primaryLight; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = P.border; e.currentTarget.style.color = P.textMid; e.currentTarget.style.background = P.surfaceAlt; }}
          >
            <span style={{ fontSize: 13 }}>👁</span> Voir la carte
          </a>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ display: "flex", gap: 3, background: P.bg, padding: 4, borderRadius: 10 }}>
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ padding: "7px 15px", borderRadius: 7, border: "none", background: activeTab === tab.id ? P.surface : "none", color: activeTab === tab.id ? P.text : P.textLight, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', system-ui", boxShadow: activeTab === tab.id ? "0 1px 4px rgba(61,90,128,0.1)" : "none", transition: "all 0.15s" }}>{tab.label}</button>
            ))}
          </div>
          <button onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 2200); }} title={saved ? "Enregistré" : "Sauvegarder"} style={{ width: 36, height: 36, borderRadius: 9, border: "none", background: saved ? "#f0fdf4" : P.primary, color: saved ? "#166534" : "#fff", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.25s", flexShrink: 0, boxShadow: saved ? "none" : `0 1px 4px rgba(61,90,128,0.2)` }}>{saved ? "✓" : "💾"}</button>
        </div>
      </div>

      <div style={{ maxWidth: 880, margin: "0 auto", padding: "22px 16px 48px" }}>

        {/* CARTE */}
        {activeTab === "carte" && <>
          <div style={{ display: "flex", gap: 16, marginBottom: 18, flexWrap: "wrap", padding: "10px 14px", background: P.surface, borderRadius: 10, border: `1px solid ${P.borderLight}` }}>
            {[{ label: "Familles", value: families.length }, { label: "Catégories", value: categories.length, note: `${categories.filter(c => c.visible).length} vis.` }, { label: "Plats", value: allItems.length, note: `${unavailable} indispo`, alert: unavailable > 0 }, { label: "Prix moy.", value: `${avgPrice} €` }].map(({ label, value, note, alert }, i, arr) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: P.textLight, fontFamily: "'DM Sans', system-ui" }}>{label}</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: P.text, fontFamily: "'DM Sans', system-ui" }}>{value}</span>
                {note && <span style={{ fontSize: 11, color: alert ? "#be123c" : P.textLight, fontFamily: "'DM Sans', system-ui" }}>{note}</span>}
                {i < arr.length - 1 && <span style={{ color: P.border, fontSize: 14, marginLeft: 4 }}>·</span>}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 7, marginBottom: 14, flexWrap: "wrap" }}>
            {[{ id: null, name: "Tout" }, ...families].map(f => (
              <button key={f.id ?? "all"} onClick={() => setFilterFamily(f.id)} style={{ padding: "5px 13px", borderRadius: 20, border: `1.5px solid ${filterFamily === f.id ? P.primary : P.border}`, background: filterFamily === f.id ? P.primaryLight : P.surface, color: filterFamily === f.id ? P.primary : P.textMid, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', system-ui" }}>{f.name}</button>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            {filtered.map((cat, i) => (
              <CategoryCard key={cat.id} category={cat} index={i} total={filtered.length} families={families}
                onMoveUp={() => moveCategory(i, -1)} onMoveDown={() => moveCategory(i, 1)}
                onToggleItem={toggleItem} onEditItem={setEditingItem}
                onToggleVisible={() => toggleCatVisible(cat.id)}
                onUpdateImage={url => updateCatImage(cat.id, url)}
                onChangeFamily={fid => changeCatFamily(cat.id, fid)}
                onEditCategory={setEditingCategory}
              />
            ))}
            <button onClick={() => setEditingCategory({ familyId: null, visible: true, imageUrl: null })} style={{ padding: "12px", background: P.surface, border: `1.5px dashed ${P.border}`, borderRadius: 12, color: P.textLight, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', system-ui", transition: "all 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = P.primary; e.currentTarget.style.color = P.primary; e.currentTarget.style.background = P.primaryLight; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = P.border; e.currentTarget.style.color = P.textLight; e.currentTarget.style.background = P.surface; }}
            >+ Nouvelle catégorie</button>
          </div>
        </>}

        {/* ORGANISATION */}
        {activeTab === "organisation" && (
          <OrganisationTab families={families} categories={categories}
            onEditFamily={setEditingFamily}
            onNewFamily={() => setEditingFamily({ imageUrl: null })}
            onEditCategory={setEditingCategory}
            onNewCategory={fid => setEditingCategory({ familyId: fid, visible: true, imageUrl: null })}
            onMoveCategory={moveCategoryById}
            onToggleCatVisible={toggleCatVisible}
          />
        )}

        {/* TAGS */}
        {activeTab === "tags" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Rappel légal */}
            <div style={{ padding: "12px 16px", background: P.primaryLight, border: `1px solid ${P.primaryMid}`, borderRadius: 10, display: "flex", gap: 10 }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>⚖️</span>
              <div style={{ fontSize: 12, color: P.primary, fontFamily: "'DM Sans', system-ui", lineHeight: 1.5 }}>
                <strong>Règlement (UE) n°1169/2011</strong> — Les 14 allergènes ci-dessous sont à déclaration obligatoire. Les allergènes sont des protéines, à l'exception des <strong>sulfites</strong> qui sont un additif chimique.
              </div>
            </div>

            {Object.entries(SYSTEM_TAGS).map(([cat, tags]) => (
              <div key={cat} style={{ background: P.surface, border: `1.5px solid ${P.border}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 4px rgba(61,90,128,0.05)" }}>
                <div style={{ padding: "12px 18px", background: P.surfaceAlt, borderBottom: `1px solid ${P.borderLight}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: P.textLight, textTransform: "uppercase", letterSpacing: 1.5, fontFamily: "'DM Sans', system-ui" }}>{CAT_LABELS[cat]}</div>
                  {cat === "ALLERGEN" && <span style={{ fontSize: 11, color: P.primary, background: P.primaryLight, padding: "2px 8px", borderRadius: 20, fontFamily: "'DM Sans', system-ui", fontWeight: 600 }}>{tags.length} / 14</span>}
                  {cat === "CERTIFICATION" && <span style={{ fontSize: 11, color: "#be123c", background: "#fff1f2", padding: "2px 8px", borderRadius: 20, fontFamily: "'DM Sans', system-ui", fontWeight: 600 }}>⚠️ Certification requise</span>}
                </div>
                {cat === "CERTIFICATION" && (
                  <div style={{ padding: "8px 18px 0", margin: "0" }}>
                    <div style={{ padding: "8px 12px", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 7, fontSize: 11, color: "#92400e", fontFamily: "'DM Sans', system-ui", lineHeight: 1.5 }}>
                      ⚠️ Les certifications Halal et Casher impliquent un organisme certificateur agréé. Ne pas afficher ces tags sans certification officielle valide — risque de tromperie du consommateur.
                    </div>
                  </div>
                )}
                <div style={{ padding: "14px 18px", display: "flex", flexWrap: "wrap", gap: cat === "ALLERGEN" ? 8 : 10 }}>
                  {cat === "ALLERGEN" ? tags.map(tag => {
                    const count = allItems.filter(i => i.tags.includes(tag.slug)).length;
                    return (
                      <div key={tag.slug} title={tag.description} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", borderRadius: 10, background: tag.bg, border: `1.5px solid ${tag.color}22`, width: "calc(50% - 4px)", boxSizing: "border-box", cursor: "help" }}>
                        <span style={{ fontSize: 20, flexShrink: 0 }}>{tag.icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: tag.color, fontFamily: "'DM Sans', system-ui" }}>{tag.name}</span>
                            {tag.note && <span style={{ fontSize: 10, color: tag.color, opacity: 0.7, fontStyle: "italic", fontFamily: "'DM Sans', system-ui" }}>{tag.note}</span>}
                          </div>
                          <div style={{ fontSize: 11, color: P.textMid, fontFamily: "'DM Sans', system-ui", marginTop: 2, lineHeight: 1.3 }}>{tag.description}</div>
                          <div style={{ fontSize: 10, color: P.textLight, fontFamily: "'DM Sans', system-ui", marginTop: 4 }}>{count} plat{count !== 1 ? "s" : ""}</div>
                        </div>
                      </div>
                    );
                  }) : tags.map(tag => {
                    const count = allItems.filter(i => i.tags.includes(tag.slug)).length;
                    return (
                      <div key={tag.slug} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 13px", borderRadius: 10, background: tag.bg, border: `1.5px solid ${tag.color}22` }}>
                        <span style={{ fontSize: 17 }}>{tag.icon}</span>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: tag.color, fontFamily: "'DM Sans', system-ui" }}>{tag.name}</span>
                            {tag.note && <span style={{ fontSize: 10, color: tag.color, opacity: 0.65, fontStyle: "italic", fontFamily: "'DM Sans', system-ui" }}>({tag.note})</span>}
                          </div>
                          <div style={{ fontSize: 10, color: P.textLight, fontFamily: "'DM Sans', system-ui" }}>{count} plat{count !== 1 ? "s" : ""}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editingItem     && <ItemModal     item={editingItem}         onClose={() => setEditingItem(null)}     onSave={saveItem} />}
      {editingCategory && <CategoryModal category={editingCategory} families={families} onClose={() => setEditingCategory(null)} onSave={saveCategory} />}
      {editingFamily   && <FamilyModal   family={editingFamily}     onClose={() => setEditingFamily(null)}   onSave={saveFamily} />}
    </div>
  );
}
