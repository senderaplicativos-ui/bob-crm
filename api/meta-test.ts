import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash } from "crypto";
import { getDb } from "./_lib/mongo";
import { checkAuth, applyCors } from "./_lib/auth";

/**
 * Testes da integração Meta sem sujar o histórico:
 * - modo "conexao" (padrão): GET no dataset, só valida Pixel ID + token.
 * - modo "evento": envia um Lead fictício com o test_event_code, para
 *   aparecer na aba "Eventos de teste" do Events Manager.
 * Nunca grava em log_eventos_meta e nunca dispara evento real.
 */

const GRAPH_VERSION = "v21.0";

function extrairErroMeta(dados: unknown, texto: string): string {
  if (dados && typeof dados === "object" && "error" in dados) {
    const e = (dados as { error?: { message?: string; code?: number; error_subcode?: number } }).error;
    if (e?.message) {
      const cod = [e.code, e.error_subcode].filter((n) => n !== undefined).join("/");
      return cod ? `${e.message} (código ${cod})` : e.message;
    }
  }
  return texto.slice(0, 300) || "Resposta inesperada da Meta.";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;

  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
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
        res.status(400).json({ ok: false, error: "Invalid JSON body" });
        return;
      }
    }

    const instanciaId = String(body?.instancia_id ?? "").trim();
    const modo = body?.modo === "evento" ? "evento" : "conexao";
    if (!instanciaId) {
      res.status(400).json({ ok: false, error: "instancia_id é obrigatório." });
      return;
    }

    const config = (await db
      .collection("meta_config")
      .findOne({ instancia_id: instanciaId })) as {
      pixel_id?: string;
      access_token?: string;
      test_event_code?: string | null;
    } | null;

    const pixelId = String(config?.pixel_id ?? "").trim();
    const accessToken = String(config?.access_token ?? "").trim();
    if (!pixelId || !accessToken) {
      res.status(400).json({
        ok: false,
        error: "Pixel ID e Access Token não configurados. Salve a configuração antes de testar.",
      });
      return;
    }
    if (!/^\d{10,20}$/.test(pixelId)) {
      res.status(400).json({
        ok: false,
        error: "Pixel ID inválido: deve conter só números (10 a 20 dígitos).",
      });
      return;
    }

    if (modo === "conexao") {
      // GET no dataset: não envia evento nenhum, só valida ID + token.
      const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(
        pixelId
      )}?access_token=${encodeURIComponent(accessToken)}`;
      const resp = await fetch(url);
      const texto = await resp.text();
      let dados: unknown = null;
      try {
        dados = JSON.parse(texto);
      } catch {
        // Mantém o texto bruto para a mensagem de erro.
      }
      if (!resp.ok) {
        res.status(200).json({ ok: false, status: resp.status, error: extrairErroMeta(dados, texto) });
        return;
      }
      const nome =
        dados && typeof dados === "object" && "name" in dados
          ? String((dados as { name: unknown }).name)
          : null;
      res.status(200).json({ ok: true, id: pixelId, nome });
      return;
    }

    // modo "evento": Lead fictício, telefone de mentira hasheado.
    const testCode = String(body?.test_event_code ?? config?.test_event_code ?? "").trim();
    if (!testCode) {
      res.status(400).json({
        ok: false,
        error:
          "Preencha o Código de Teste (aba Eventos de teste do Events Manager) antes de enviar o evento de teste.",
      });
      return;
    }
    const telefoneFake = createHash("sha256").update("5511999999999").digest("hex");
    const payload = {
      data: [
        {
          event_name: "Lead",
          event_time: Math.floor(Date.now() / 1000),
          action_source: "system_generated",
          user_data: { ph: [telefoneFake] },
        },
      ],
      test_event_code: testCode,
    };
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(
      pixelId
    )}/events?access_token=${encodeURIComponent(accessToken)}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const texto = await resp.text();
    let dados: unknown = null;
    try {
      dados = JSON.parse(texto);
    } catch {
      // Mantém o texto bruto para a mensagem de erro.
    }
    if (!resp.ok) {
      res.status(200).json({ ok: false, status: resp.status, error: extrairErroMeta(dados, texto) });
      return;
    }
    res.status(200).json({ ok: true, status: resp.status, detalhe: texto.slice(0, 300) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : "Internal error" });
  }
}
