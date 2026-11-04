import type { Request, Response } from "express";
import app from "../backend/src/app";
import { initializeDatabase } from "../backend/src/db";

let isInitialized = false;

export default async function handler(req: Request, res: Response): Promise<void> {
  if (!isInitialized) {
    try {
      await initializeDatabase();
    } catch (err) {
      console.warn("[Vercel] DB initialization warning:", err);
    }
    isInitialized = true;
  }
  return app(req, res);
}
