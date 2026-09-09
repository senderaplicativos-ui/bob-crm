import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * Sets permissive CORS headers so the SPA (served from any Vercel domain or
 * localhost during dev) can call the API. Handles the OPTIONS preflight.
 * Returns true when the request was fully handled (preflight) and the caller
 * should stop processing.
 */
export function applyCors(req: VercelRequest, res: VercelResponse): boolean {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-api-token"
  );
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}

/**
 * Validates the shared secret token. The database is reachable over the public
 * internet, so this token is the only thing standing between it and anyone who
 * finds the endpoint. Returns true when the request is authorized; otherwise it
 * writes the error response and returns false.
 */
export function checkAuth(req: VercelRequest, res: VercelResponse): boolean {
  const expected = process.env.API_TOKEN;
  if (!expected) {
    res.status(500).json({
      data: null,
      error: { message: "API_TOKEN não configurado no servidor." },
    });
    return false;
  }

  const headerToken =
    (req.headers["x-api-token"] as string | undefined) ||
    (typeof req.headers.authorization === "string" &&
    req.headers.authorization.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : undefined);

  if (headerToken !== expected) {
    res.status(401).json({
      data: null,
      error: { message: "Não autorizado." },
    });
    return false;
  }

  return true;
}
