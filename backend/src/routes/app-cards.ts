import { Router, type IRouter, type Response } from "express";
import crypto from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { db, pool, inMemory, appCards } from "../db";
import { requireAuth, requireAdmin, type AuthRequest } from "../lib/auth";

const router: IRouter = Router();

// GET all app cards
router.get("/app-cards", requireAuth, async (_req: AuthRequest, res: Response): Promise<void> => {
  if (pool && db) {
    try {
      const rows = await db.select().from(appCards).orderBy(asc(appCards.name));
      const result = rows.map((r: any) => ({
        id: r.id,
        category_id: r.categoryId,
        name: r.name,
        link: r.link,
        created_at: typeof r.createdAt === "string" ? r.createdAt : r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
        updated_at: typeof r.updatedAt === "string" ? r.updatedAt : r.updatedAt ? new Date(r.updatedAt).toISOString() : new Date().toISOString(),
      }));
      res.status(200).json(result);
      return;
    } catch (err) {
      console.error("[AppCards] Database error fetching app cards:", err);
    }
  }

  // Fallback in memory
  const list = Array.from(inMemory.appCards.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  res.status(200).json(
    list.map((c) => ({
      id: c.id,
      category_id: c.categoryId,
      name: c.name,
      link: c.link,
      created_at: typeof c.createdAt === "string" ? c.createdAt : c.createdAt.toISOString(),
      updated_at: typeof c.updatedAt === "string" ? c.updatedAt : c.updatedAt.toISOString(),
    })),
  );
});

// CREATE app card (Admin only)
router.post("/app-cards", requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  const { name, link, category_id } = req.body || {};
  if (!name || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "App name is required." });
    return;
  }
  if (!link || typeof link !== "string" || !link.trim()) {
    res.status(400).json({ error: "App link is required." });
    return;
  }
  if (!category_id || typeof category_id !== "string") {
    res.status(400).json({ error: "category_id is required." });
    return;
  }

  const cleanName = name.trim();
  const cleanLink = link.trim();
  const id = crypto.randomUUID();
  const now = new Date();

  if (pool && db) {
    try {
      const [inserted] = await db
        .insert(appCards)
        .values({
          id,
          categoryId: category_id,
          name: cleanName,
          link: cleanLink,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      res.status(201).json({
        id: inserted.id,
        category_id: inserted.categoryId,
        name: inserted.name,
        link: inserted.link,
        created_at: inserted.createdAt.toISOString(),
        updated_at: inserted.updatedAt.toISOString(),
      });
      return;
    } catch (err) {
      console.error("[AppCards] Database error creating app card:", err);
    }
  }

  const card = {
    id,
    categoryId: category_id,
    name: cleanName,
    link: cleanLink,
    createdAt: now,
    updatedAt: now,
  };
  inMemory.appCards.set(id, card);
  inMemory.save?.();
  res.status(201).json({
    id,
    category_id,
    name: cleanName,
    link: cleanLink,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  });
});

// UPDATE app card (Admin only)
router.patch("/app-cards/:id", requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const { name, link, category_id } = req.body || {};

  const updates: Record<string, any> = { updatedAt: new Date() };
  if (name && typeof name === "string") updates.name = name.trim();
  if (link && typeof link === "string") updates.link = link.trim();
  if (category_id && typeof category_id === "string") updates.categoryId = category_id;

  if (pool && db) {
    try {
      const [updated] = await db
        .update(appCards)
        .set(updates)
        .where(eq(appCards.id, id))
        .returning();

      if (!updated) {
        res.status(404).json({ error: "App card not found." });
        return;
      }

      res.status(200).json({
        id: updated.id,
        category_id: updated.categoryId,
        name: updated.name,
        link: updated.link,
        created_at: updated.createdAt.toISOString(),
        updated_at: updated.updatedAt.toISOString(),
      });
      return;
    } catch (err) {
      console.error("[AppCards] Database error updating app card:", err);
    }
  }

  const card = inMemory.appCards.get(id);
  if (!card) {
    res.status(404).json({ error: "App card not found." });
    return;
  }

  if (updates.name) card.name = updates.name;
  if (updates.link) card.link = updates.link;
  if (updates.categoryId) card.categoryId = updates.categoryId;
  card.updatedAt = updates.updatedAt;
  inMemory.save?.();

  res.status(200).json({
    id: card.id,
    category_id: card.categoryId,
    name: card.name,
    link: card.link,
    created_at: typeof card.createdAt === "string" ? card.createdAt : card.createdAt.toISOString(),
    updated_at: card.updatedAt.toISOString(),
  });
});

// DELETE app card (Admin only)
router.delete("/app-cards/:id", requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  const id = String(req.params.id);

  if (pool && db) {
    try {
      await db.delete(appCards).where(eq(appCards.id, id));
      res.status(200).json({ message: "App card deleted successfully." });
      return;
    } catch (err) {
      console.error("[AppCards] Database error deleting app card:", err);
    }
  }

  inMemory.appCards.delete(id);
  inMemory.save?.();
  res.status(200).json({ message: "App card deleted successfully." });
});

export default router;
