// Proxy para a Evolution API (EVO).
//
// O navegador não consegue falar direto com a EVO (CORS + precisa mandar a
// apikey no header), então o front chama este endpoint no próprio bob-crm e
// ele repassa a requisição para a Evolution. Protegido pelo mesmo API_TOKEN
// dos demais endpoints.
//
// POST /api/evolution
// body: {
//   action: "create" | "connect" | "status" | "delete" | "logout" | "restart",
//   evolutionUrl: string,        // ex: https://chatevo.atende.app.br
//   evolutionApiKey: string,     // apikey da EVO
//   instanceName: string,
//   clientName?: string          // só usado no create (integração/nome)
// }

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkAuth, applyCors } from "./_lib/auth";

type Action = "create" | "connect" | "status" | "delete" | "logout" | "restart";

interface EvoBody {
  action?: Action;
  evolutionUrl?: string;
  evolutionApiKey?: string;
  instanceName?: string;
  clientName?: string;
}

function stripSlash(url: string): string {
  return url.replace(/\/$/, "");
}

// Normaliza a resposta da EVO extraindo o QR code, que aparece com nomes
// diferentes dependendo da versão (qrcode.base64 / base64 / code).
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
  if (applyCors(req, res)) return;

  if (req.method !== "POST") {
    res.status(405).json({ error: { message: "Method not allowed" } });
    return;
  }

  if (!checkAuth(req, res)) return;

  let body: EvoBody = req.body as EvoBody;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      res.status(400).json({ error: { message: "JSON inválido" } });
      return;
    }
  }

  const { action, evolutionUrl, evolutionApiKey, instanceName, clientName } = body || {};

  if (!action || !evolutionUrl || !evolutionApiKey || !instanceName) {
    res.status(400).json({
      error: { message: "Campos obrigatórios: action, evolutionUrl, evolutionApiKey, instanceName" },
    });
    return;
  }

  const base = stripSlash(evolutionUrl);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: evolutionApiKey,
  };

  try {
    let evoRes: Response;

    switch (action) {
      case "create": {
        // Cria a instância na EVO já pedindo o QR code.
        evoRes = await fetch(`${base}/instance/create`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            instanceName,
            qrcode: true,
            integration: "WHATSAPP-BAILEYS",
          }),
        });
        break;
      }
      case "connect": {
        evoRes = await fetch(`${base}/instance/connect/${encodeURIComponent(instanceName)}`, {
          method: "GET",
          headers,
        });
        break;
      }
      case "status": {
        evoRes = await fetch(
          `${base}/instance/connectionState/${encodeURIComponent(instanceName)}`,
          { method: "GET", headers }
        );
        break;
      }
      case "delete": {
        evoRes = await fetch(`${base}/instance/delete/${encodeURIComponent(instanceName)}`, {
          method: "DELETE",
          headers,
        });
        break;
      }
      case "logout": {
        evoRes = await fetch(`${base}/instance/logout/${encodeURIComponent(instanceName)}`, {
          method: "DELETE",
          headers,
        });
        break;
      }
      case "restart": {
        evoRes = await fetch(`${base}/instance/restart/${encodeURIComponent(instanceName)}`, {
          method: "PUT",
          headers,
        });
        break;
      }
      default: {
        res.status(400).json({ error: { message: `Ação inválida: ${action}` } });
        return;
      }
    }

    let data: any = null;
    const text = await evoRes.text();
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (!evoRes.ok) {
      // Repassa o status e a mensagem da EVO (ex: 403 "already in use").
      res.status(evoRes.status).json({
        error: {
          message:
            data?.response?.message ??
            data?.message ??
            data?.error ??
            `EVO respondeu ${evoRes.status}`,
          status: evoRes.status,
        },
        raw: data,
      });
      return;
    }

    // Normaliza os campos mais usados pelo front.
    const state = data?.instance?.state ?? data?.state ?? null;
    const qrcode = extractQr(data);
    const number =
      data?.instance?.owner ??
      data?.instance?.number ??
      data?.number ??
      null;

    res.status(200).json({ ok: true, state, qrcode, number, raw: data });
  } catch (err: any) {
    res.status(502).json({
      error: { message: err?.message || "Falha ao contatar a Evolution API" },
    });
  }
}
