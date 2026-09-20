import type { Db } from "mongodb";
import { createHash } from "crypto";

/**
 * Motor de envio de eventos para a API de Conversões da Meta.
 *
 * Best-effort: qualquer falha aqui é logada em `log_eventos_meta`, mas NUNCA
 * propaga exceção para quem chamou. Salvar a conversa é prioridade; o disparo
 * para a Meta é enfeite que não pode derrubar o fluxo principal.
 */

const GRAPH_VERSION = "v21.0";

type MetaConfig = {
  pixel_id?: string;
  access_token?: string;
  ativo?: boolean | null;
  test_event_code?: string | null;
};

type Mapeamento = {
  estagio_nome?: string;
  evento_meta?: string;
  ativo?: boolean | null;
};

// Só dígitos.
function soDigitos(v: unknown): string {
  return String(v ?? "").replace(/\D/g, "");
}

// A Meta exige os dados do usuário normalizados e hasheados em SHA-256.
// Telefone: só dígitos, com código do país, sem "+", em minúsculas (irrelevante
// para dígitos, mas mantemos a norma).
function hashSha256(valor: string): string {
  return createHash("sha256").update(valor).digest("hex");
}

function nowIso(): string {
  return new Date().toISOString();
}

function novoId(): string {
  // id textual no mesmo estilo do resto do projeto (uuid v4 simples).
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Dispara um evento para a Meta quando um lead entra em um novo estágio do funil.
 *
 * @param db          conexão Mongo já aberta
 * @param instanciaId instância dona da configuração/mapeamento
 * @param telefone    telefone do lead (será hasheado antes de enviar)
 * @param estagioNovo nome do estágio para onde o lead acabou de ir
 */
export async function dispararEvento(
  db: Db,
  instanciaId: string,
  telefone: string,
  estagioNovo: string
): Promise<void> {
  try {
    const estagio = String(estagioNovo ?? "").trim();
    if (!estagio || !instanciaId) return;

    // 1) Configuração da Meta para esta instância.
    const config = (await db
      .collection("meta_config")
      .findOne({ instancia_id: instanciaId })) as MetaConfig | null;

    if (!config) return;
    if (config.ativo === false) return;
    const pixelId = String(config.pixel_id ?? "").trim();
    const accessToken = String(config.access_token ?? "").trim();
    if (!pixelId || !accessToken) return;

    // 2) Este estágio está mapeado para algum evento Meta?
    const mapeamento = (await db.collection("mapeamento_eventos").findOne({
      instancia_id: instanciaId,
      estagio_nome: estagio,
    })) as Mapeamento | null;

    if (!mapeamento) return;
    if (mapeamento.ativo === false) return;
    const eventoMeta = String(mapeamento.evento_meta ?? "").trim();
    if (!eventoMeta) return;

    // 3) Monta o payload da API de Conversões.
    const telDigitos = soDigitos(telefone);
    const userData: Record<string, unknown> = {};
    if (telDigitos) {
      userData.ph = [hashSha256(telDigitos)];
    }

    // action_source "business_messaging": o lead vem de uma conversa de WhatsApp,
    // então mantemos a fonte de mensagens para preservar a atribuição ao anúncio
    // de clique-para-WhatsApp. A Meta EXIGE o campo "messaging_channel" nesse caso
    // (valores válidos: messenger | whatsapp | instagram); sem ele responde 400
    // "Parâmetro de canal de mensagens ausente" (error_subcode 2804063).
    const evento: Record<string, unknown> = {
      event_name: eventoMeta,
      event_time: Math.floor(Date.now() / 1000),
      action_source: "business_messaging",
      messaging_channel: "whatsapp",
      user_data: userData,
    };

    const payload: Record<string, unknown> = { data: [evento] };
    const testCode = String(config.test_event_code ?? "").trim();
    if (testCode) payload.test_event_code = testCode;

    // 4) POST para o Graph.
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(
      pixelId
    )}/events?access_token=${encodeURIComponent(accessToken)}`;

    let statusResposta = 0;
    let corpoResposta = "";
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      statusResposta = resp.status;
      corpoResposta = await resp.text();
    } catch (err) {
      statusResposta = 0;
      corpoResposta = err instanceof Error ? err.message : "erro de rede";
    }

    // 5) Registra no histórico (o que a aba "Histórico de Disparos" lê).
    await db.collection("log_eventos_meta").insertOne({
      id: novoId(),
      instancia_id: instanciaId,
      evento_meta: eventoMeta,
      estagio_origem: estagio,
      telefone: telDigitos || null,
      status_resposta: statusResposta,
      resposta: corpoResposta ? corpoResposta.slice(0, 2000) : null,
      criado_em: nowIso(),
    });
  } catch {
    // Nunca propaga: disparo para a Meta não pode derrubar o salvamento.
  }
}
