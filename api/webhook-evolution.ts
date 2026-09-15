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

// Só dígitos de um JID/telefone (remove o sufixo @... e qualquer não-dígito).
function soDigitos(jid: unknown): string {
  return String(jid ?? '').replace(/@.*$/, '').replace(/\D/g, '');
}

// Um telefone "de verdade" do WhatsApp tem o formato país+DDD+número.
// O identificador @lid traz um código interno (não começa com 55 e costuma
// ter 14-15+ dígitos), então serve só como último recurso.
function pareceTelefoneReal(num: string): boolean {
  return num.length >= 10 && num.length <= 13;
}

// Extrai os campos que interessam de um payload da Evolution (formato messages.upsert).
function parseMessage(body: Record<string, unknown>) {
  const data = (body.data ?? body) as Record<string, any>;
  const key = (data.key ?? {}) as Record<string, any>;
  const message = (data.message ?? {}) as Record<string, any>;

  // O WhatsApp às vezes manda o remetente como @lid (um ID interno) em vez do
  // telefone real (@s.whatsapp.net). Nesses casos a Evolution/Baileys envia o
  // número verdadeiro em um campo alternativo. Coletamos todos os candidatos e
  // preferimos o que parece um telefone de verdade; o @lid fica como reserva.
  const rawRemoteJid: string = key.remoteJid ?? '';
  const candidatos = [
    key.senderPn,          // número real do remetente (formato novo)
    key.remoteJidAlt,      // JID alternativo (quando remoteJid é @lid)
    key.participantPn,     // idem para grupos
    data.senderPn,
    rawRemoteJid.includes('@lid') ? '' : rawRemoteJid, // remoteJid só se não for @lid
    rawRemoteJid,          // último recurso: mesmo que seja @lid
  ];

  let telefone = '';
  for (const c of candidatos) {
    const num = soDigitos(c);
    if (num && pareceTelefoneReal(num)) { telefone = num; break; }
  }
  // se nenhum candidato pareceu telefone real, usa o primeiro não-vazio (o @lid)
  if (!telefone) {
    for (const c of candidatos) {
      const num = soDigitos(c);
      if (num) { telefone = num; break; }
    }
  }

  const remoteJid = rawRemoteJid;
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

    // Grupo (@g.us), newsletter/canal (@newsletter) e status (status@broadcast)
    // não são leads — são ruído no CRM. Só tratamos conversa individual.
    if (/@(g\.us|newsletter|broadcast)$/i.test(msg.remoteJid)) {
      return res.status(200).json({ ok: true, ignored: 'não é conversa individual' });
    }

    const db = await getDb();

    // LOG TEMPORÁRIO: quando o remetente vem como @lid, gravamos o payload bruto
    // para descobrir em qual campo a Evolution manda o telefone real.
    // Remover depois de confirmar o campo certo.
    try {
      const rawJid = String((((body.data ?? body) as any)?.key?.remoteJid) ?? '');
      if (rawJid.includes('@lid')) {
        await db.collection('log_webhook').insertOne({
          id: randomUUID(),
          motivo: 'remoteJid @lid',
          telefone_resolvido: msg.telefone,
          body,
          criado_em: nowIso(),
        });
      }
    } catch { /* ignora erro de log */ }

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

    // O nome da conversa deve ser SEMPRE o do contato (remetente que faz contato),
    // nunca o da instância. Em mensagens de saída (fromMe = true) o pushName é o
    // nome da própria conta conectada, então não podemos usá-lo para renomear a
    // conversa — senão o nome do contato é sobrescrito pelo nome da instância.
    const setFields: Record<string, unknown> = {
      telefone: msg.telefone,
      instancia_id: instanciaId,
      ultima_mensagem: msg.texto,
      ultima_mensagem_em: msg.timestamp,
      atualizado_em: nowIso(),
    };
    if (!msg.fromMe && msg.nome) {
      // só atualiza o nome quando a mensagem é de ENTRADA (o contato)
      // a tela de Conversas lê 'nome'; mantemos 'nome_contato' por compatibilidade
      setFields.nome = msg.nome;
      setFields.nome_contato = msg.nome;
    }

    const setOnInsert: Record<string, unknown> = {
      id: convId,
      // a tela de Conversas lê 'status'; mantemos 'estagio' por compatibilidade
      status: 'NOVO',
      estagio: 'NOVO',
      criado_em: nowIso(),
    };
    // Se a conversa nascer de uma mensagem de saída, ainda não temos o nome do
    // contato — deixamos null (a tela cai para o telefone) em vez de gravar o
    // nome da instância.
    if (msg.fromMe || !msg.nome) {
      setOnInsert.nome = null;
      setOnInsert.nome_contato = null;
    }

    await db.collection('conversas').updateOne(
      convQuery,
      { $set: setFields, $setOnInsert: setOnInsert },
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
      // a tela de detalhe lê 'mensagem'; mantemos 'texto' por compatibilidade
      mensagem: msg.texto,
      texto: msg.texto,
      tipo: msg.tipo,
      // a tela de detalhe alinha à direita quando direcao === 'saida'
      direcao: msg.fromMe ? 'saida' : 'entrada',
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
