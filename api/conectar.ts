// Endpoint PÚBLICO de conexão de instância (QR code para o cliente final).
//
// Quem abre é o cliente da empresa, que não tem login no CRM nem como mandar
// o API_TOKEN no header. Por isso este endpoint é público de propósito —
// mesma lógica do /go. O que o torna seguro é que ele NUNCA expõe a apikey da
// Evolution ao navegador: a apikey fica só no servidor, buscada no Mongo pelo
// nome da instância. O cliente recebe apenas o QR code (base64) e o estado.
//
// GET /api/conectar?i=<instancia>        → { ok, state, qrcode, connected }
//   - state "open"  → já conectado (não devolve QR)
//   - senão         → chama connect na EVO e devolve o QR para escanear
//
// A URL bonita /conectar/<instancia> chega aqui via rewrite no vercel.json.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "./_lib/mongo";

function stripSlash(url: string): string {
  return url.replace(/\/$/, "");
}

function firstStr(v: unknown): string {
  if (Array.isArray(v)) return typeof v[0] === "string" ? v[0] : "";
  return typeof v === "string" ? v : "";
}

// Extrai o QR code, que aparece com nomes diferentes conforme a versão da EVO.
function extractQr(data: any): string | null {
  if (!data) return null;
  return (
    data?.qrcode?.base64 ??
    data?.qrcode?.code ??
    data?.qrcode ??
    data?.base64 ??
    data?.code ??
    null
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  const instanceName = firstStr(req.query.i) || firstStr(req.query.instance);
  if (!instanceName) {
    res.status(400).json({ ok: false, error: "Instância não informada." });
    return;
  }

  try {
    const db = await getDb();
    const inst = await db.collection("instancias").findOne({
      evolution_instance_name: instanceName,
    });

    if (!inst) {
      res.status(404).json({ ok: false, error: "Instância não encontrada." });
      return;
    }

    const evolutionUrl = (inst.evolution_url as string) || "";
    const apiKey = (inst.evolution_api_key as string) || "";
    const nome = (inst.nome as string) || instanceName;

    if (!evolutionUrl || !apiKey) {
      res.status(400).json({ ok: false, error: "Instância sem configuração da Evolution." });
      return;
    }

    const base = stripSlash(evolutionUrl);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      apikey: apiKey,
    };

    // 1) Já está conectada? Não precisa de QR.
    try {
      const stResp = await fetch(
        `${base}/instance/connectionState/${encodeURIComponent(instanceName)}`,
        { method: "GET", headers },
      );
      const stText = await stResp.text();
      let stData: any = null;
      try {
        stData = stText ? JSON.parse(stText) : null;
      } catch {
        stData = null;
      }
      const state = stData?.instance?.state ?? stData?.state ?? null;
      if (state === "open") {
        res.status(200).json({ ok: true, state: "open", connected: true, qrcode: null, nome });
        return;
      }
    } catch {
      // ignora — segue para tentar o connect
    }

    // 2) Busca o QR pelo connect.
    const resp = await fetch(
      `${base}/instance/connect/${encodeURIComponent(instanceName)}`,
      { method: "GET", headers },
    );
    const text = await resp.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    if (!resp.ok) {
      res.status(200).json({
        ok: false,
        state: null,
        connected: false,
        qrcode: null,
        nome,
        error: data?.response?.message ?? data?.message ?? `EVO respondeu ${resp.status}`,
      });
      return;
    }

    const state = data?.instance?.state ?? data?.state ?? null;
    const qrcode = extractQr(data);

    res.status(200).json({
      ok: true,
      state,
      connected: state === "open",
      qrcode,
      nome,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || "Erro ao processar a conexão." });
  }
}
