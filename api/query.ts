import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "./_lib/mongo";
import { checkAuth, applyCors } from "./_lib/auth";
import { executeQuery, QueryPayload } from "./_lib/translate";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;

  if (req.method !== "POST") {
    res.status(405).json({ data: null, error: { message: "Method not allowed" } });
    return;
  }

  if (!checkAuth(req, res)) return;

  try {
    const db = await getDb();
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        res.status(400).json({ data: null, error: { message: "Invalid JSON body" } });
        return;
      }
    }

    // Batch: array of payloads → array of results
    if (Array.isArray(body)) {
      const results = [];
      for (const payload of body as QueryPayload[]) {
        results.push(await executeQuery(db, payload));
      }
      res.status(200).json(results);
      return;
    }

    const result = await executeQuery(db, body as QueryPayload);
    res.status(200).json(result);
  } catch (err: any) {
    res.status(500).json({
      data: null,
      error: { message: err?.message || "Internal error" },
    });
  }
}
