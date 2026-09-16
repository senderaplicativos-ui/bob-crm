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

// Grava o telefone conectado da instância quando ele ainda não está no Mongo.
// A tela mostra "Sem número" enquanto esse campo estiver vazio, e o
// checkStatuses do painel só consegue preencher se a instância estiver online
// no exato momento em que alguém abre a página. Aqui aproveitamos qualquer
// evento da Evolution (que só chega quando a instância está de fato conectada)
// para resolver isso sozinho. Best-effort: falhar aqui não afeta o webhook.
async function backfillTelefoneInstancia(db: any, inst: any): Promise<void> {
  if (!inst || inst.telefone_conectado) return;
  const base = String(inst.evolution_url ?? '').replace(/\/$/, '');
  const apikey = String(inst.evolution_api_key ?? '');
  const name = String(inst.evolution_instance_name ?? '');
  if (!base || !apikey || !name) return;
  try {
    const r = await fetch(
      `${base}/instance/fetchInstances?instanceName=${encodeURIComponent(name)}`,
      { method: 'GET', headers: { 'Content-Type': 'application/json', apikey } },
    );
    if (!r.ok) return;
    const data: any = await r.json();
    const item = Array.isArray(data)
      ? (data[0]?.instance ?? data[0])
      : (data?.instance ?? data);
    const numero = soDigitos(item?.ownerJid ?? item?.owner ?? item?.number ?? item?.wuid);
    if (numero && pareceTelefoneReal(numero)) {
      await db.collection('instancias').updateOne(
        { id: inst.id },
        { $set: { telefone_conectado: numero, atualizado_em: nowIso() } },
      );
    }
  } catch { /* ignora: é melhor perder o número do que perder a mensagem */ }
}

type Regra = {
  tipo_regra?: string;
  modo?: string;
  texto?: string;
  resultado?: string;
  ativo?: boolean | null;
};

// Escapa um texto para uso literal dentro de RegExp.
function escapaRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Uma regra casa com a mensagem? Mesma semântica do findRuleMatches da tela de
// detalhe (ConversationDetail.tsx): 'texto' é uma lista separada por vírgula e
// basta UMA palavra-chave casar.
function regraCasa(regra: Regra, texto: string): boolean {
  const alvo = texto.toLowerCase();
  const palavras = String(regra.texto ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);

  for (const palavra of palavras) {
    const chave = palavra.toLowerCase();
    if (regra.modo === 'exact') {
      if (alvo === chave) return true;
    } else if (regra.modo === 'word') {
      if (new RegExp(`\\b${escapaRegex(chave)}\\b`, 'i').test(texto)) return true;
    } else {
      // 'contains' é o padrão
      if (alvo.includes(chave)) return true;
    }
  }
  return false;
}

// Aplica as regras cadastradas ao texto da mensagem e devolve o que deve ser
// gravado na conversa. Até agora as regras só pintavam a mensagem na tela de
// detalhe — nada era persistido, então Origem/Status nunca mudavam na lista.
// As regras valem para mensagem de entrada E de saída: a resposta automática da
// instância ("Oi! Anderson por aqui!") é justamente o que identifica um lead
// vindo de anúncio.
async function aplicarRegras(
  db: any,
  instanciaId: string | null,
  texto: string,
): Promise<{ origem?: string; status?: string }> {
  if (!texto) return {};
  try {
    // regras da instância + regras globais (instancia_id null)
    const filtro: Record<string, unknown> = {
      ativo: { $ne: false },
      $or: [{ instancia_id: instanciaId }, { instancia_id: null }],
    };
    const regras = (await db.collection('regras').find(filtro).toArray()) as Regra[];

    const out: { origem?: string; status?: string } = {};
    for (const regra of regras) {
      if (!regraCasa(regra, texto)) continue;
      const resultado = String(regra.resultado ?? '').trim();
      if (!resultado) continue;
      // a primeira regra que casar ganha (as demais do mesmo tipo são ignoradas)
      if (regra.tipo_regra === 'ORIGEM' && !out.origem) out.origem = resultado;
      if (regra.tipo_regra === 'STATUS' && !out.status) out.status = resultado;
    }
    return out;
  } catch {
    // regra é enfeite: se falhar, a mensagem ainda tem que ser gravada
    return {};
  }
}

// Mescla a conversa "órfã" (a que ficou gravada com o LID no campo telefone) na
// conversa do telefone real. Acontece quando o lead chega de anúncio: a primeira
// mensagem vem só com o @lid e, quando a instância responde, a Evolution passa a
// mandar o telefone. Sem isso um único lead aparece duas vezes na lista.
//
// Best-effort: se falhar, a mensagem ainda tem que ser gravada.
async function mesclarConversaLid(
  db: any,
  instanciaId: string,
  lid: string,
  telefoneReal: string,
): Promise<void> {
  if (!lid || !telefoneReal || lid === telefoneReal) return;
  try {
    const orfa = await db.collection('conversas').findOne({
      instancia_id: instanciaId,
      telefone: lid,
    });
    if (!orfa) return;

    // A conversa destino pode ainda não existir (a resposta da instância pode ser
    // o primeiro evento com o telefone real). Nesse caso basta renomear a órfã:
    // preserva id, mensagens, origem, status e o histórico já gravado.
    const destino = await db.collection('conversas').findOne({
      instancia_id: instanciaId,
      telefone: telefoneReal,
    });

    if (!destino) {
      await db.collection('conversas').updateOne(
        { id: orfa.id },
        { $set: { telefone: telefoneReal, lid, atualizado_em: nowIso() } },
      );
      await db.collection('mensagens').updateMany(
        { conversa_id: orfa.id },
        { $set: { telefone: telefoneReal } },
      );
      return;
    }

    // Destino já existe: move as mensagens da órfã e apaga a órfã.
    await db.collection('mensagens').updateMany(
      { conversa_id: orfa.id },
      { $set: { conversa_id: destino.id, telefone: telefoneReal } },
    );

    // Aproveita o que a órfã tinha e o destino não tem (a mensagem do anúncio
    // costuma ser a que carrega a origem, e o nome do contato pode estar só nela).
    const herda: Record<string, unknown> = { lid, atualizado_em: nowIso() };
    if (!destino.origem && orfa.origem) herda.origem = orfa.origem;
    if (!destino.nome && orfa.nome) {
      herda.nome = orfa.nome;
      herda.nome_contato = orfa.nome_contato ?? orfa.nome;
    }
    // mantém a data de criação mais antiga (o lead nasceu no clique do anúncio)
    if (orfa.criado_em && (!destino.criado_em || orfa.criado_em < destino.criado_em)) {
      herda.criado_em = orfa.criado_em;
    }
    await db.collection('conversas').updateOne({ id: destino.id }, { $set: herda });
    await db.collection('conversas').deleteOne({ id: orfa.id });
  } catch { /* ignora: melhor um lead duplicado do que perder a mensagem */ }
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

  // O LID (identificador interno de privacidade) desta conversa, quando existe.
  // Guardamos separado porque ele é a única ponte entre a mensagem de entrada do
  // anúncio (que chega SÓ com o @lid) e as respostas seguintes (que já trazem o
  // telefone real em remoteJidAlt). Sem gravar o LID, os dois viram leads.
  const lid = rawRemoteJid.includes('@lid') ? soDigitos(rawRemoteJid) : '';

  return { remoteJid, telefone, lid, fromMe, texto, tipo, nome, messageId, timestamp };
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
      // Se chegou evento é porque a instância está conectada: aproveita para
      // gravar o telefone dela caso ainda esteja faltando.
      await backfillTelefoneInstancia(db, inst);
    }

    // ---- Resolução do LID -------------------------------------------------
    // Mensagem de entrada vinda de anúncio chega SÓ com o @lid: não há
    // remoteJidAlt, então não há como saber o telefone naquele momento. Quando a
    // instância responde, a Evolution passa a mandar remoteJidAlt com o número
    // real. Se tratarmos os dois como conversas separadas, um lead vira dois.
    //
    // A ponte é o próprio LID: gravamos ele na conversa e, quando o telefone
    // real aparece, mesclamos a conversa órfã (a que ficou com o LID no campo
    // telefone) na conversa do telefone.
    let telefone = msg.telefone;
    const telefoneEhLid = !!msg.lid && telefone === msg.lid;

    if (telefoneEhLid && instanciaId) {
      // Já conhecemos esse LID de um pareamento anterior? Então usa o telefone.
      const conhecida = await db.collection('conversas').findOne({
        instancia_id: instanciaId,
        lid: msg.lid,
        telefone: { $ne: msg.lid },
      });
      if (conhecida?.telefone) telefone = String(conhecida.telefone);
    }

    // Caminho inverso: esta mensagem trouxe o telefone real E o LID juntos
    // (é o que acontece quando a instância responde). Se existe uma conversa
    // órfã gravada com o LID no lugar do telefone, ela é o mesmo contato —
    // mescla as mensagens nela para o telefone real e apaga a órfã.
    if (msg.lid && !telefoneEhLid && instanciaId) {
      await mesclarConversaLid(db, instanciaId, msg.lid, telefone);
    }

    // upsert da conversa (uma por telefone+instância)
    const convQuery: Record<string, unknown> = { telefone };
    if (instanciaId) convQuery.instancia_id = instanciaId;

    const convId = randomUUID();

    // Estado atual da conversa (se já existe): precisamos saber antes do upsert
    // para não sobrescrever Origem/Status que alguém ajustou à mão no painel.
    const convAtual = await db.collection('conversas').findOne(convQuery);

    // Regras casadas com o texto desta mensagem.
    const regra = await aplicarRegras(db, instanciaId, msg.texto);

    // O nome da conversa deve ser SEMPRE o do contato (remetente que faz contato),
    // nunca o da instância. Em mensagens de saída (fromMe = true) o pushName é o
    // nome da própria conta conectada, então não podemos usá-lo para renomear a
    // conversa — senão o nome do contato é sobrescrito pelo nome da instância.
    const setFields: Record<string, unknown> = {
      telefone,
      instancia_id: instanciaId,
      ultima_mensagem: msg.texto,
      ultima_mensagem_em: msg.timestamp,
      atualizado_em: nowIso(),
    };
    // Guarda o LID para reconhecer o mesmo contato nos próximos eventos.
    if (msg.lid) setFields.lid = msg.lid;
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

    // Grava o resultado das regras, sem atropelar ajuste manual:
    // - Origem: só preenche se ainda estiver vazia.
    // - Status: só mexe enquanto a conversa estiver em 'NOVO' (intocada). Se
    //   alguém já moveu o lead no funil, a regra não puxa de volta.
    // Atenção: o mesmo campo não pode estar em $set e $setOnInsert (o Mongo
    // recusa com conflito), então removemos do $setOnInsert quando entra no $set.
    if (regra.origem && !convAtual?.origem) {
      setFields.origem = regra.origem;
    }
    const statusAtual = String(convAtual?.status ?? '').trim();
    const statusIntocado = !convAtual || statusAtual === '' || statusAtual === 'NOVO';
    if (regra.status && statusIntocado) {
      setFields.status = regra.status;
      setFields.estagio = regra.status;
      delete setOnInsert.status;
      delete setOnInsert.estagio;
    }
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
