// Proxy para a Evolution API (EVO).
//
// O navegador não consegue falar direto com a EVO (CORS + precisa mandar a
// apikey no header), então o front chama este endpoint no próprio bob-crm e
// ele repassa a requisição para a Evolution. Protegido pelo mesmo API_TOKEN
// dos demais endpoints.
//
// POST /api/evolution
// body: {
//   action: "create" | "connect" | "status" | "delete" | "logout" | "restart" | "fetchInstance",
//   evolutionUrl: string,        // ex: https://chatevo.atende.app.br
//   evolutionApiKey: string,     // apikey da EVO
//   instanceName: string,
//   clientName?: string          // só usado no create (integração/nome)
// }

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkAuth, applyCors } from "./_lib/auth";

type Action =
  | "create"
  | "connect"
  | "status"
  | "delete"
  | "logout"
  | "restart"
  | "fetchInstance";

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

// Extrai o número do WhatsApp conectado. A EVO varia bastante conforme a
// versão e o endpoint: ownerJid ("5571...@s.whatsapp.net"), owner, number, e
// o fetchInstances devolve um array (às vezes com a instância dentro de
// .instance). Retorna só os dígitos, sem o sufixo do JID.
function extractNumber(data: any): string | null {
  const candidates: any[] = [];
  const push = (obj: any) => {
    if (!obj || typeof obj !== "object") return;
    candidates.push(obj.ownerJid, obj.owner, obj.number, obj.wuid);
  };

  push(data);
  push(data?.instance);
  if (Array.isArray(data)) {
    for (const item of data) {
      push(item);
      push(item?.instance);
    }
  }

  for (const raw of candidates) {
    if (typeof raw !== "string" || !raw) continue;
    const digits = raw.replace(/@.*$/, "").replace(/\D/g, "");
    if (digits) return digits;
  }
  return null;
}

// Monta a URL pública do webhook do bob-crm. Prioriza a env WEBHOOK_URL;
// senão, deriva do host da própria requisição (funciona em qualquer deploy).
function resolveWebhookUrl(req: VercelRequest): string | null {
  const fromEnv = process.env.WEBHOOK_URL;
  if (fromEnv) return stripSlash(fromEnv);
  const host = req.headers.host;
  if (!host) return null;
  const proto =
    (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0] ||
    "https";
  return `${proto}://${host}/api/webhook-evolution`;
}

// Configura o webhook da instância na Evolution para receber MESSAGES_UPSERT.
// É best-effort: se falhar, não derruba o create/connect — só devolve o erro
// junto na resposta para diagnóstico. Assim o usuário nunca precisa configurar
// o webhook manualmente a cada nova instância.
async function configureWebhook(
  base: string,
  headers: Record<string, string>,
  instanceName: string,
  webhookUrl: string,
): Promise<{ ok: boolean; status?: number; error?: string; raw?: any }> {
  try {
    const resp = await fetch(`${base}/webhook/set/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: webhookUrl,
          webhookByEvents: false,
          webhookBase64: false,
          events: ["MESSAGES_UPSERT"],
        },
      }),
    });
    const text = await resp.text();
    let raw: any = null;
    try {
      raw = text ? JSON.parse(text) : null;
    } catch {
      raw = { raw: text };
    }
    if (!resp.ok) {
      return {
        ok: false,
        status: resp.status,
        error: raw?.response?.message ?? raw?.message ?? `EVO respondeu ${resp.status}`,
        raw,
      };
    }
    return { ok: true, status: resp.status, raw };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Falha ao configurar o webhook" };
  }
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
      case "fetchInstance": {
        // Traz os dados completos da instância, incluindo o número do WhatsApp
        // conectado (ownerJid). O connectionState só devolve o state.
        evoRes = await fetch(
          `${base}/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`,
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

    // O fetchInstances devolve um array (ou { instance: {...} }); as demais
    // ações devolvem um objeto direto. Achata para um objeto só.
    const inst = Array.isArray(data)
      ? (data[0]?.instance ?? data[0] ?? null)
      : (data?.instance ?? data ?? null);

    // Normaliza os campos mais usados pelo front.
    const state = inst?.state ?? inst?.connectionStatus ?? data?.state ?? null;
    const qrcode = extractQr(data);
    const number = extractNumber(data);

    // Em create/connect, garante que o webhook do bob-crm esteja configurado
    // para receber MESSAGES_UPSERT. Assim o usuário nunca precisa configurar
    // manualmente a cada nova instância. É best-effort: não derruba a resposta.
    let webhook: Awaited<ReturnType<typeof configureWebhook>> | undefined;
    if (action === "create" || action === "connect") {
      const webhookUrl = resolveWebhookUrl(req);
      if (webhookUrl) {
        webhook = await configureWebhook(base, headers, instanceName, webhookUrl);
      } else {
        webhook = { ok: false, error: "Não foi possível resolver a URL do webhook" };
      }
    }

    res.status(200).json({ ok: true, state, qrcode, number, webhook, raw: data });
  } catch (err: any) {
    res.status(502).json({
      error: { message: err?.message || "Falha ao contatar a Evolution API" },
    });
  }
}
