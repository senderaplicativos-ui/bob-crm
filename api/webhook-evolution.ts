// Webhook da Evolution API -> salva mensagens no MongoDB.
// Aponte a Evolution para: https://SEU-DOMINIO.vercel.app/api/webhook-evolution
//
// Protegido pelo mesmo token: a Evolution deve enviar o header
//   apikey: <API_TOKEN>   (ou x-api-token / Authorization: Bearer)
// Se preferir liberar sem token (a Evolution nem sempre manda header custom),
// defina WEBHOOK_PUBLIC=true nas env vars — mas aí qualquer um pode postar.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from './_lib/mongo';
import { randomUUID } from 'crypto';

function nowIso() {
  return new Date().toISOString();
}

function authorized(req: VercelRequest): boolean {
  if (process.env.WEBHOOK_PUBLIC === 'true') return true;
  const expected = process.env.API_TOKEN;
  if (!expected) return false;
  const apikey = (req.headers['apikey'] as string) || '';
  const xToken = (req.headers['x-api-token'] as string) || '';
  const authz = (req.headers['authorization'] as string) || '';
  const bearer = authz.startsWith('Bearer ') ? authz.slice(7) : '';
  return apikey === expected || xToken === expected || bearer === expected;
}

// Extrai os campos que interessam de um payload da Evolution (formato messages.upsert).
function parseMessage(body: Record<string, unknown>) {
  const data = (body.data ?? body) as Record<string, any>;
  const key = (data.key ?? {}) as Record<string, any>;
  const message = (data.message ?? {}) as Record<string, any>;

  const remoteJid: string = key.remoteJid ?? '';
  const telefone = remoteJid.replace(/@.*$/, '');
  const fromMe: boolean = key.fromMe ?? false;

  // texto pode vir em vários formatos
  const texto =
    message.conversation ??
    message.extendedTextMessage?.text ??
    message.imageMessage?.caption ??
    message.videoMessage?.caption ??
    message.documentMessage?.caption ??
    '';

  const tipo =
    (message.conversation || message.extendedTextMessage) ? 'texto'
    : message.imageMessage ? 'imagem'
    : message.audioMessage ? 'audio'
    : message.videoMessage ? 'video'
    : message.documentMessage ? 'documento'
    : 'outro';

  const nome = data.pushName ?? null;
  const messageId = key.id ?? null;
  const timestamp = data.messageTimestamp
    ? new Date(Number(data.messageTimestamp) * 1000).toISOString()
    : nowIso();

  return { remoteJid, telefone, fromMe, texto, tipo, nome, messageId, timestamp };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    // permite validar rapidamente que o endpoint está no ar
    return res.status(200).json({ ok: true, service: 'webhook-evolution' });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }
  if (!authorized(req)) {
    return res.status(401).json({ error: { message: 'Não autorizado' } });
  }

  try {
    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) ?? {};
    const evt = (body.event ?? body.type ?? '') as string;
    const instanceName = (body.instance ?? body.instanceName ?? null) as string | null;

    // só tratamos eventos de mensagem
    if (evt && !/messages?[._]?upsert/i.test(evt)) {
      return res.status(200).json({ ok: true, ignored: evt });
    }

    const msg = parseMessage(body);
    if (!msg.telefone) {
      return res.status(200).json({ ok: true, ignored: 'sem remoteJid' });
    }

    const db = await getDb();

    // resolve a instância pelo nome da Evolution (se veio).
    // O nome que a Evolution envia fica no campo evolution_instance_name;
    // caímos para 'nome' apenas como reserva.
    let instanciaId: string | null = null;
    if (instanceName) {
      const inst = await db.collection('instancias').findOne({
        $or: [
          { evolution_instance_name: instanceName },
          { nome: instanceName },
        ],
      });
      instanciaId = inst?.id ?? null;
    }

    // upsert da conversa (uma por telefone+instância)
    const convQuery: Record<string, unknown> = { telefone: msg.telefone };
    if (instanciaId) convQuery.instancia_id = instanciaId;

    const convId = randomUUID();
    await db.collection('conversas').updateOne(
      convQuery,
      {
        $set: {
          telefone: msg.telefone,
          // a tela de Conversas lê 'nome'; mantemos 'nome_contato' por compatibilidade
          nome: msg.nome,
          nome_contato: msg.nome,
          instancia_id: instanciaId,
          ultima_mensagem: msg.texto,
          ultima_mensagem_em: msg.timestamp,
          atualizado_em: nowIso(),
        },
        $setOnInsert: {
          id: convId,
          // a tela de Conversas lê 'status'; mantemos 'estagio' por compatibilidade
          status: 'NOVO',
          estagio: 'NOVO',
          criado_em: nowIso(),
        },
      },
      { upsert: true },
    );

    const conversa = await db.collection('conversas').findOne(convQuery);
    const conversaId = conversa?.id ?? convId;

    // evita duplicar a mesma mensagem (idempotência por messageId)
    if (msg.messageId) {
      const existe = await db.collection('mensagens').findOne({ message_id: msg.messageId });
      if (existe) {
        return res.status(200).json({ ok: true, duplicated: true });
      }
    }

    await db.collection('mensagens').insertOne({
      id: randomUUID(),
      conversa_id: conversaId,
      instancia_id: instanciaId,
      telefone: msg.telefone,
      texto: msg.texto,
      tipo: msg.tipo,
      direcao: msg.fromMe ? 'enviada' : 'recebida',
      message_id: msg.messageId,
      criado_em: msg.timestamp,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    // registra o erro mas responde 200 pra Evolution não ficar reenviando infinitamente
    try {
      const db = await getDb();
      await db.collection('log_erros').insertOne({
        id: randomUUID(),
        origem: 'webhook-evolution',
        mensagem: err instanceof Error ? err.message : String(err),
        criado_em: nowIso(),
      });
    } catch { /* ignora erro de log */ }
    return res.status(200).json({ ok: false, error: err instanceof Error ? err.message : 'erro' });
  }
}
