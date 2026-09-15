// Diagnóstico (SOMENTE LEITURA) do problema de conversa duplicada por @lid.
//
// Mostra:
//   1. os payloads capturados em log_webhook (motivo "remoteJid @lid"), com os
//      campos candidatos a telefone real;
//   2. as conversas cujo telefone não parece um telefone brasileiro real;
//   3. quantas mensagens cada uma dessas conversas tem.
//
// Uso: node scripts/diag-lid.mjs
// Não escreve nada no banco.

import { MongoClient } from 'mongodb';
import { readFileSync } from 'fs';

// carrega o .env local sem depender do pacote dotenv
function loadEnv() {
  try {
    const txt = readFileSync(new URL('../.env', import.meta.url), 'utf8');
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      const val = m[2].replace(/^["']|["']$/g, '');
      if (!process.env[m[1]]) process.env[m[1]] = val;
    }
  } catch { /* sem .env, usa o ambiente */ }
}
loadEnv();

const URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || 'bobcrm';
if (!URI) { console.error('ERRO: MONGODB_URI não definido.'); process.exit(1); }

const digits = (v) => String(v ?? '').replace(/@.*$/, '').replace(/\D/g, '');
const pareceReal = (n) => n.length >= 10 && n.length <= 13;

const client = new MongoClient(URI, { serverSelectionTimeoutMS: 10000 });
await client.connect();
const db = client.db(DB_NAME);

console.log('=== 1. PAYLOADS @lid CAPTURADOS ===');
const logs = await db.collection('log_webhook')
  .find({}).sort({ criado_em: -1 }).limit(5).toArray();
if (!logs.length) {
  console.log('(nenhum payload @lid capturado ainda — o log só grava a partir do commit 453dc1e)');
}
for (const l of logs) {
  const data = l.body?.data ?? l.body ?? {};
  const key = data.key ?? {};
  console.log('---', l.criado_em, '| telefone resolvido:', l.telefone_resolvido);
  console.log('  key =', JSON.stringify(key));
  console.log('  pushName =', data.pushName, '| fromMe =', key.fromMe);
  // lista TODOS os campos de data/key cujo valor tenha cara de telefone/JID
  const achados = [];
  const varre = (obj, prefixo) => {
    if (!obj || typeof obj !== 'object') return;
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string' && /@(s\.whatsapp\.net|lid)$/.test(v)) {
        achados.push(`${prefixo}${k} = ${v}`);
      } else if (typeof v === 'string' && pareceReal(digits(v)) && /^\+?\d[\d\s()-]*$/.test(v)) {
        achados.push(`${prefixo}${k} = ${v}`);
      } else if (v && typeof v === 'object' && prefixo.split('.').length < 3) {
        varre(v, `${prefixo}${k}.`);
      }
    }
  };
  varre(data, 'data.');
  console.log('  campos com cara de telefone/JID:');
  for (const a of achados) console.log('    ', a);
}

console.log('\n=== 2. CONVERSAS COM TELEFONE SUSPEITO (provável @lid) ===');
const convs = await db.collection('conversas').find({}).toArray();
const suspeitas = convs.filter((c) => !pareceReal(digits(c.telefone)));
for (const c of suspeitas) {
  const n = await db.collection('mensagens').countDocuments({ telefone: c.telefone });
  console.log(`  ${c.telefone} | nome=${c.nome ?? 'null'} | instancia=${c.instancia_id} | msgs=${n} | id=${c.id}`);
  console.log(`     última: ${JSON.stringify(c.ultima_mensagem)} em ${c.ultima_mensagem_em}`);
}
if (!suspeitas.length) console.log('  (nenhuma)');

console.log('\n=== 3. TOTAIS ===');
console.log('  conversas:', convs.length, '| suspeitas:', suspeitas.length);
console.log('  mensagens:', await db.collection('mensagens').countDocuments({}));

await client.close();
