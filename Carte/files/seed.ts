// prisma/seed.ts
import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()

const SYSTEM_TAGS = [
  // ── ALLERGEN (14 réglementaires EU — Règlement 1169/2011) ──────────────────
  // Note : les sulfites sont un additif chimique, pas une protéine
  { slug: "gluten",         name: "Gluten",         category: "ALLERGEN", icon: "🌾", color: "#92400e", description: "Céréales contenant du gluten : blé, seigle, orge, avoine, épeautre, kamut" },
  { slug: "crustaces",      name: "Crustacés",      category: "ALLERGEN", icon: "🦐", color: "#9f1239", description: "Crustacés et produits à base de crustacés" },
  { slug: "oeufs",          name: "Œufs",           category: "ALLERGEN", icon: "🥚", color: "#78350f", description: "Œufs et produits à base d'œufs" },
  { slug: "poisson",        name: "Poissons",       category: "ALLERGEN", icon: "🐟", color: "#075985", description: "Poissons et produits à base de poissons" },
  { slug: "arachides",      name: "Arachides",      category: "ALLERGEN", icon: "🥜", color: "#78350f", description: "Arachides et produits à base d'arachides" },
  { slug: "soja",           name: "Soja",           category: "ALLERGEN", icon: "🫘", color: "#14532d", description: "Soja et produits à base de soja" },
  { slug: "lait",           name: "Lait",           category: "ALLERGEN", icon: "🥛", color: "#1e40af", description: "Lait et produits à base de lait (y compris lactose)" },
  { slug: "fruits-a-coque", name: "Fruits à coque", category: "ALLERGEN", icon: "🌰", color: "#92400e", description: "Amandes, noisettes, noix, cajou, pécan, macadamia, Brésil, Queensland, pistaches" },
  { slug: "celeri",         name: "Céleri",         category: "ALLERGEN", icon: "🌿", color: "#166534", description: "Céleri et produits à base de céleri" },
  { slug: "moutarde",       name: "Moutarde",       category: "ALLERGEN", icon: "🟡", color: "#854d0e", description: "Moutarde et produits à base de moutarde" },
  { slug: "sesame",         name: "Sésame",         category: "ALLERGEN", icon: "🌱", color: "#78350f", description: "Graines de sésame et produits à base de graines de sésame" },
  { slug: "sulfites",       name: "Sulfites",       category: "ALLERGEN", icon: "⚗️", color: "#4c1d95", note: "Non protéique", description: "Anhydride sulfureux et sulfites > 10 mg/kg ou 10 mg/l — additif chimique" },
  { slug: "lupin",          name: "Lupin",          category: "ALLERGEN", icon: "🌸", color: "#831843", description: "Lupin et produits à base de lupin" },
  { slug: "mollusques",     name: "Mollusques",     category: "ALLERGEN", icon: "🐚", color: "#075985", description: "Mollusques et produits à base de mollusques" },

  // ── PRODUCT_TYPE ───────────────────────────────────────────────────────────
  { slug: "vegan",            name: "Vegan",              category: "PRODUCT_TYPE", icon: "🌱", color: "#14532d" },
  { slug: "vegetarien",       name: "Végétarien",         category: "PRODUCT_TYPE", icon: "🥗", color: "#166534" },
  { slug: "sans-gluten",      name: "Sans gluten",        category: "PRODUCT_TYPE", icon: "✓",  color: "#14532d" },
  { slug: "sans-lactose",     name: "Sans lactose",       category: "PRODUCT_TYPE", icon: "🥛", color: "#1e40af" },
  { slug: "sans-porc",        name: "Sans porc",          category: "PRODUCT_TYPE", icon: "🐷", color: "#9f1239" },
  { slug: "adapte-enfants",   name: "Adapté enfants",     category: "PRODUCT_TYPE", icon: "👶", color: "#0369a1" },
  { slug: "bio",              name: "Bio",                category: "PRODUCT_TYPE", icon: "♻️", color: "#14532d" },
  { slug: "nature",           name: "Nature",             category: "PRODUCT_TYPE", icon: "🍃", color: "#166534" },
  { slug: "fait-maison",      name: "Fait maison",        category: "PRODUCT_TYPE", icon: "👨‍🍳", color: "#4c1d95" },
  { slug: "label-rouge",      name: "Label Rouge",        category: "PRODUCT_TYPE", icon: "🔴", color: "#be123c" },
  { slug: "plein-air",        name: "Élevage plein air",  category: "PRODUCT_TYPE", icon: "🌾", color: "#166534" },
  { slug: "cru",              name: "Cru / non cuit",     category: "PRODUCT_TYPE", icon: "⚠️", color: "#b45309", note: "Info sécurité" },
  { slug: "surgele",          name: "Surgelé",            category: "PRODUCT_TYPE", icon: "❄️", color: "#0369a1", note: "Mention légale" },
  { slug: "epice",            name: "Épicé",              category: "PRODUCT_TYPE", icon: "🌶️", color: "#b45309" },
  { slug: "tres-epice",       name: "Très épicé",         category: "PRODUCT_TYPE", icon: "🌶️🌶️", color: "#be123c" },

  // ── BEVERAGE ───────────────────────────────────────────────────────────────
  { slug: "sans-alcool",        name: "Sans alcool",          category: "BEVERAGE", icon: "🚫", color: "#166534" },
  { slug: "contient-alcool",    name: "Contient de l'alcool", category: "BEVERAGE", icon: "🍷", color: "#9f1239" },
  { slug: "vin-naturel",        name: "Vin naturel",          category: "BEVERAGE", icon: "🍇", color: "#7c3aed" },
  { slug: "biodynamique",       name: "Biodynamique",         category: "BEVERAGE", icon: "🌙", color: "#4c1d95" },
  { slug: "petillant",          name: "Pétillant",            category: "BEVERAGE", icon: "🫧", color: "#0369a1" },
  { slug: "sans-sucre-ajoute",  name: "Sans sucre ajouté",    category: "BEVERAGE", icon: "🍬", color: "#166534" },
  { slug: "pression",           name: "Pression",             category: "BEVERAGE", icon: "🍺", color: "#78350f" },

  // ── CERTIFICATION ──────────────────────────────────────────────────────────
  // ⚠️ Ne pas afficher sans certification officielle valide
  { slug: "halal",  name: "Halal",  category: "CERTIFICATION", icon: "☪️", color: "#166534", note: "Certification requise" },
  { slug: "casher", name: "Casher", category: "CERTIFICATION", icon: "✡️", color: "#1e40af", note: "Certification requise" },

  // ── ORIGIN ────────────────────────────────────────────────────────────────
  { slug: "local",         name: "Local",         category: "ORIGIN", icon: "📍", color: "#14532d" },
  { slug: "france",        name: "France",        category: "ORIGIN", icon: "🇫🇷", color: "#1e40af" },
  { slug: "aoc",           name: "AOC",           category: "ORIGIN", icon: "🏷️", color: "#4c1d95" },
  { slug: "aop",           name: "AOP",           category: "ORIGIN", icon: "🏷️", color: "#4c1d95" },
  { slug: "igp",           name: "IGP",           category: "ORIGIN", icon: "🏷️", color: "#3d5a80" },
  { slug: "circuit-court", name: "Circuit court", category: "ORIGIN", icon: "🌿", color: "#14532d" },

  // ── OFFER ─────────────────────────────────────────────────────────────────
  { slug: "menu-midi",   name: "Menu midi",    category: "OFFER", icon: "☀️", color: "#78350f", systemRole: "view" },
  { slug: "happy-hour",  name: "Happy Hour",   category: "OFFER", icon: "🍹", color: "#9f1239", systemRole: "schedule" },
  { slug: "suggestion",  name: "Suggestion",   category: "OFFER", icon: "⭐", color: "#1e40af", systemRole: "view" },
  { slug: "menu-soir",   name: "Menu du soir", category: "OFFER", icon: "🌙", color: "#4c1d95", systemRole: "view" },

  // ── HIGHLIGHT ─────────────────────────────────────────────────────────────
  { slug: "nouveau",       name: "Nouveau",      category: "HIGHLIGHT", icon: "✨", color: "#78350f", systemRole: "badge" },
  { slug: "signature",     name: "Signature",    category: "HIGHLIGHT", icon: "👑", color: "#3d5a80", systemRole: "badge" },
  { slug: "coup-de-coeur", name: "Coup de cœur", category: "HIGHLIGHT", icon: "❤️", color: "#9f1239", systemRole: "badge" },
  { slug: "saison",        name: "Saison",       category: "HIGHLIGHT", icon: "🍂", color: "#92400e", systemRole: "badge" },
]

async function main() {
  console.log("🌱 Seeding tags système...")
  for (const tag of SYSTEM_TAGS) {
    await prisma.tag.upsert({
      where: { slug: tag.slug },
      update: {},
      create: { ...tag, isSystem: true },
    })
  }
  console.log(`✓ ${SYSTEM_TAGS.length} tags système créés`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
