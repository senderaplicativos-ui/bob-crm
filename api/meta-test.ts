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

    // Envia um Lead fictício com test_event_code. É a validação definitiva,
    // porque usa exatamente a mesma rota e permissão do envio real (POST
    // /{pixel}/events). Retorna { ok, status, texto, dados }.
    const enviarTeste = async (testCode: string) => {
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
      return { ok: resp.ok, status: resp.status, texto, dados };
    };

    if (modo === "conexao") {
      // Passo 1: GET no dataset (não envia nada). Quando funciona, confirma
      // ID + token e devolve o nome do conjunto de dados.
      const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(
        pixelId
      )}?fields=name&access_token=${encodeURIComponent(accessToken)}`;
      let getOk = false;
      let getNome: string | null = null;
      let getErro: string | null = null;
      try {
        const resp = await fetch(url);
        const texto = await resp.text();
        let dados: unknown = null;
        try {
          dados = JSON.parse(texto);
        } catch {
          // Mantém o texto bruto para a mensagem de erro.
        }
        if (resp.ok) {
          getOk = true;
          getNome =
            dados && typeof dados === "object" && "name" in dados
              ? String((dados as { name: unknown }).name)
              : null;
        } else {
          getErro = extrairErroMeta(dados, texto);
        }
      } catch (err) {
        getErro = err instanceof Error ? err.message : "erro de rede";
      }
      if (getOk) {
        res.status(200).json({ ok: true, id: pixelId, nome: getNome, via: "leitura" });
        return;
      }

      // Passo 2 (fallback): o token gerado em "Configurar API de Conversões"
      // geralmente só tem permissão de ENVIO, e o GET acima falha com erro de
      // permissão mesmo com tudo certo. Nesse caso valida pela rota real de
      // envio, com um evento de teste — se o POST passar, o envio real funciona.
      const codigoConexao =
        String(body?.test_event_code ?? config?.test_event_code ?? "").trim() || "TESTECONEXAO";
      const post = await enviarTeste(codigoConexao);
      if (post.ok) {
        res.status(200).json({
          ok: true,
          id: pixelId,
          nome: null,
          via: "envio",
          codigoUsado: codigoConexao,
          detalhe: post.texto.slice(0, 300),
          avisoLeitura: getErro,
        });
        return;
      }
      res.status(200).json({
        ok: false,
        status: post.status,
        error: extrairErroMeta(post.dados, post.texto),
        detalheLeitura: getErro,
      });
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
    const post = await enviarTeste(testCode);
    if (!post.ok) {
      res.status(200).json({ ok: false, status: post.status, error: extrairErroMeta(post.dados, post.texto) });
      return;
    }
    res.status(200).json({ ok: true, status: post.status, detalhe: post.texto.slice(0, 300) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : "Internal error" });
  }
}
