import { Router, type IRouter, type Response } from "express";
import crypto from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { db, pool, inMemory, categories, appCards } from "@workspace/db";
import { requireAuth, requireAdmin, type AuthRequest } from "../lib/auth";

const router: IRouter = Router();

// GET all categories
router.get("/categories", requireAuth, async (_req: AuthRequest, res: Response): Promise<void> => {
  if (pool && db) {
    try {
      const rows = await db.select().from(categories).orderBy(asc(categories.name));
      const result = rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        created_at: r.createdAt.toISOString(),
        updated_at: r.updatedAt.toISOString(),
      }));
      res.status(200).json(result);
      return;
    } catch (err) {
      console.error("[Categories] Database error fetching categories:", err);
    }
  }

  // Fallback in memory
  const list = Array.from(inMemory.categories.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  res.status(200).json(
    list.map((c) => ({
      id: c.id,
      name: c.name,
      created_at: typeof c.createdAt === "string" ? c.createdAt : c.createdAt.toISOString(),
      updated_at: typeof c.updatedAt === "string" ? c.updatedAt : c.updatedAt.toISOString(),
    })),
  );
});

// CREATE category (Admin only)
router.post("/categories", requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  const { name } = req.body || {};
  if (!name || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "Category name is required." });
    return;
  }

  const cleanName = name.trim();
  const id = crypto.randomUUID();
  const now = new Date();

  if (pool && db) {
    try {
      const [inserted] = await db
        .insert(categories)
        .values({
          id,
          name: cleanName,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      res.status(201).json({
        id: inserted.id,
        name: inserted.name,
        created_at: inserted.createdAt.toISOString(),
        updated_at: inserted.updatedAt.toISOString(),
      });
      return;
    } catch (err) {
      console.error("[Categories] Database error creating category:", err);
    }
  }

  const cat = {
    id,
    name: cleanName,
    createdAt: now,
    updatedAt: now,
  };
  inMemory.categories.set(id, cat);
  res.status(201).json({
    id,
    name: cleanName,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  });
});

// UPDATE category (Admin only)
router.patch("/categories/:id", requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const { name } = req.body || {};
  if (!name || typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "Category name is required." });
    return;
  }

  const cleanName = name.trim();
  const now = new Date();

  if (pool && db) {
    try {
      const [updated] = await db
        .update(categories)
        .set({ name: cleanName, updatedAt: now })
        .where(eq(categories.id, id))
        .returning();

      if (!updated) {
        res.status(404).json({ error: "Category not found." });
        return;
      }

      res.status(200).json({
        id: updated.id,
        name: updated.name,
        created_at: updated.createdAt.toISOString(),
        updated_at: updated.updatedAt.toISOString(),
      });
      return;
    } catch (err) {
      console.error("[Categories] Database error updating category:", err);
    }
  }

  const cat = inMemory.categories.get(id);
  if (!cat) {
    res.status(404).json({ error: "Category not found." });
    return;
  }

  cat.name = cleanName;
  cat.updatedAt = now;
  res.status(200).json({
    id: cat.id,
    name: cat.name,
    created_at: typeof cat.createdAt === "string" ? cat.createdAt : cat.createdAt.toISOString(),
    updated_at: now.toISOString(),
  });
});

// DELETE category (Admin only)
router.delete("/categories/:id", requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;

  if (pool && db) {
    try {
      await db.delete(categories).where(eq(categories.id, id));
      res.status(200).json({ message: "Category deleted successfully." });
      return;
    } catch (err) {
      console.error("[Categories] Database error deleting category:", err);
    }
  }

  inMemory.categories.delete(id);
  for (const [cardId, card] of inMemory.appCards.entries()) {
    if (card.categoryId === id) {
      inMemory.appCards.delete(cardId);
    }
  }

  res.status(200).json({ message: "Category deleted successfully." });
});

export default router;
