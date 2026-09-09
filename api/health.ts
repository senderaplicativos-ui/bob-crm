import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "./_lib/mongo";
import { applyCors } from "./_lib/auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;

  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    res.status(200).json({ status: "ok", db: db.databaseName });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err?.message || "DB unreachable" });
  }
}
