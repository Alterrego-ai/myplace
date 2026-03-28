// ─────────────────────────────────────────────────────────────────────────────
// API ROUTES — Structure Next.js App Router
// Fichier de référence — à éclater dans /app/api/
// ─────────────────────────────────────────────────────────────────────────────

// lib/prisma.ts ───────────────────────────────────────────────────────────────
/*
import { PrismaClient } from "@prisma/client"
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }
export const prisma = globalForPrisma.prisma ?? new PrismaClient()
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
*/

// lib/auth.ts ─────────────────────────────────────────────────────────────────
/*
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { NextResponse } from "next/server"

export async function requireAuth() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  return null
}
*/

// ─────────────────────────────────────────────────────────────────────────────
// STRUCTURE DES ROUTES
// ─────────────────────────────────────────────────────────────────────────────
//
// /app/api
//   /auth/[...nextauth]/route.ts   → NextAuth
//   /menu/[slug]/route.ts          → GET carte publique complète
//   /families
//     /route.ts                    → GET all, POST create
//     /[id]/route.ts               → PUT update, DELETE
//     /reorder/route.ts            → PUT drag & drop
//   /categories
//     /route.ts                    → GET all, POST create
//     /[id]/route.ts               → PUT update, DELETE
//     /reorder/route.ts            → PUT drag & drop
//   /items
//     /route.ts                    → POST create
//     /[id]/route.ts               → PUT update, DELETE
//     /[id]/toggle/route.ts        → PUT available on/off
//   /tags
//     /route.ts                    → GET all
//     /custom/route.ts             → POST create custom tag
// ─────────────────────────────────────────────────────────────────────────────


// ── /app/api/menu/[slug]/route.ts ─────────────────────────────────────────────
// Route publique — pas d'auth requise
// Retourne la carte complète pour la vue client PWA
export async function GET_MENU(req: Request, { params }: { params: { slug: string } }) {
  // import { prisma } from "@/lib/prisma"
  // import { NextResponse } from "next/server"
  const data = await (null as any).restaurant.findUnique({
    where: { slug: params.slug },
    include: {
      families: { orderBy: { order: "asc" } },
      categories: {
        where: { visible: true },
        orderBy: { order: "asc" },
        include: {
          items: {
            where: { available: true },
            include: {
              tags: { include: { tag: true } }
            }
          }
        }
      }
    }
  })
  if (!data) return Response.json({ error: "Not found" }, { status: 404 })
  return Response.json(data)
}


// ── /app/api/families/route.ts ────────────────────────────────────────────────
export async function GET_FAMILIES() {
  const families = await (null as any).family.findMany({ orderBy: { order: "asc" } })
  return Response.json(families)
}

export async function POST_FAMILY(req: Request) {
  // const guard = await requireAuth(); if (guard) return guard
  const { name, restaurantId } = await req.json()
  const last = await (null as any).family.findFirst({ orderBy: { order: "desc" } })
  const family = await (null as any).family.create({
    data: { name, restaurantId, order: (last?.order ?? 0) + 1 }
  })
  return Response.json(family, { status: 201 })
}


// ── /app/api/families/reorder/route.ts ───────────────────────────────────────
// Body: { ids: [3, 1, 2] } → ordre souhaité
export async function PUT_FAMILIES_REORDER(req: Request) {
  // const guard = await requireAuth(); if (guard) return guard
  const { ids } = await req.json()
  await (null as any).$transaction(
    ids.map((id: number, index: number) =>
      (null as any).family.update({ where: { id }, data: { order: index } })
    )
  )
  return Response.json({ success: true })
}


// ── /app/api/categories/route.ts ──────────────────────────────────────────────
export async function GET_CATEGORIES() {
  const categories = await (null as any).category.findMany({
    orderBy: { order: "asc" },
    include: { items: true, family: true }
  })
  return Response.json(categories)
}

export async function POST_CATEGORY(req: Request) {
  // const guard = await requireAuth(); if (guard) return guard
  const { name, restaurantId, familyId, imageUrl, visible } = await req.json()
  const last = await (null as any).category.findFirst({ orderBy: { order: "desc" } })
  const category = await (null as any).category.create({
    data: { name, restaurantId, familyId, imageUrl, visible: visible ?? true, order: (last?.order ?? 0) + 1 }
  })
  return Response.json(category, { status: 201 })
}


// ── /app/api/categories/reorder/route.ts ─────────────────────────────────────
export async function PUT_CATEGORIES_REORDER(req: Request) {
  // const guard = await requireAuth(); if (guard) return guard
  const { ids } = await req.json()
  await (null as any).$transaction(
    ids.map((id: number, index: number) =>
      (null as any).category.update({ where: { id }, data: { order: index } })
    )
  )
  return Response.json({ success: true })
}


// ── /app/api/categories/[id]/route.ts ────────────────────────────────────────
export async function PUT_CATEGORY(req: Request, { params }: { params: { id: string } }) {
  // const guard = await requireAuth(); if (guard) return guard
  const data = await req.json()
  const category = await (null as any).category.update({ where: { id: Number(params.id) }, data })
  return Response.json(category)
}

export async function DELETE_CATEGORY(_: Request, { params }: { params: { id: string } }) {
  // const guard = await requireAuth(); if (guard) return guard
  await (null as any).category.delete({ where: { id: Number(params.id) } })
  return Response.json({ success: true })
}


// ── /app/api/items/route.ts ───────────────────────────────────────────────────
export async function POST_ITEM(req: Request) {
  // const guard = await requireAuth(); if (guard) return guard
  const { name, description, price, categoryId, imageUrl, tagIds } = await req.json()
  const item = await (null as any).item.create({
    data: {
      name, description, price, categoryId, imageUrl,
      tags: tagIds?.length
        ? { create: tagIds.map((tagId: number) => ({ tagId })) }
        : undefined
    },
    include: { tags: { include: { tag: true } } }
  })
  return Response.json(item, { status: 201 })
}


// ── /app/api/items/[id]/route.ts ──────────────────────────────────────────────
export async function PUT_ITEM(req: Request, { params }: { params: { id: string } }) {
  // const guard = await requireAuth(); if (guard) return guard
  const { tagIds, ...data } = await req.json()
  const id = Number(params.id)
  // Remplace tous les tags
  if (tagIds !== undefined) {
    await (null as any).itemTag.deleteMany({ where: { itemId: id } })
  }
  const item = await (null as any).item.update({
    where: { id },
    data: {
      ...data,
      ...(tagIds !== undefined && {
        tags: { create: tagIds.map((tagId: number) => ({ tagId })) }
      })
    },
    include: { tags: { include: { tag: true } } }
  })
  return Response.json(item)
}

export async function DELETE_ITEM(_: Request, { params }: { params: { id: string } }) {
  // const guard = await requireAuth(); if (guard) return guard
  await (null as any).item.delete({ where: { id: Number(params.id) } })
  return Response.json({ success: true })
}


// ── /app/api/items/[id]/toggle/route.ts ──────────────────────────────────────
export async function PUT_ITEM_TOGGLE(_: Request, { params }: { params: { id: string } }) {
  // const guard = await requireAuth(); if (guard) return guard
  const item = await (null as any).item.findUnique({ where: { id: Number(params.id) } })
  const updated = await (null as any).item.update({
    where: { id: Number(params.id) },
    data: { available: !item?.available }
  })
  return Response.json(updated)
}


// ── /app/api/tags/route.ts ────────────────────────────────────────────────────
export async function GET_TAGS() {
  const tags = await (null as any).tag.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] })
  return Response.json(tags)
}

export async function POST_CUSTOM_TAG(req: Request) {
  // const guard = await requireAuth(); if (guard) return guard
  const { name, slug, icon, color } = await req.json()
  const tag = await (null as any).tag.create({
    data: { name, slug, icon, color, category: "CUSTOM", isSystem: false }
  })
  return Response.json(tag, { status: 201 })
}
