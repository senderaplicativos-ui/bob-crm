// Diagnóstico (SOMENTE LEITURA) do par de conversas duplicadas reportado:
//   telefone real 5514997231847  vs  LID 77837709140163
//
// Mostra os dois documentos de conversa, todas as mensagens de cada um e o
// schema real de um documento de mensagem (para a fusão saber quais campos
// precisam ser reescritos).
//
// Uso: node scripts/diag-par.mjs
// Não escreve nada no banco.

import { MongoClient } from 'mongodb';
import { readFileSync } from 'fs';

function loadEnv() {
  try {
    const txt = readFileSync(new URL('../.env', import.meta.url), 'utf8');
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      const val = m[2].replace(/^["']|["']$/g, '');
      if (!process.env[m[1]]) process.env[m[1]] = val;
    }
  } catch { /* usa o ambiente */ }
}
loadEnv();

const URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || 'bobcrm';
if (!URI) { console.error('ERRO: MONGODB_URI não definido.'); process.exit(1); }

const ALVOS = ['5514997231847', '77837709140163'];

const client = new MongoClient(URI, { serverSelectionTimeoutMS: 10000 });
await client.connect();
const db = client.db(DB_NAME);

for (const tel of ALVOS) {
  console.log(`\n=== CONVERSAS com telefone ${tel} ===`);
  const cs = await db.collection('conversas').find({ telefone: tel }).toArray();
  for (const c of cs) {
    const { _id, ...resto } = c;
    console.log(JSON.stringify(resto, null, 2));
  }
  if (!cs.length) console.log('(nenhuma)');

  console.log(`--- MENSAGENS de ${tel} ---`);
  const ms = await db.collection('mensagens')
    .find({ telefone: tel }).sort({ criado_em: 1 }).toArray();
  for (const m of ms) {
    console.log(`  [${m.direcao}] ${m.criado_em} conv=${m.conversa_id} inst=${m.instancia_id} :: ${JSON.stringify(m.mensagem ?? m.texto)}`);
  }
  if (!ms.length) console.log('  (nenhuma)');
}

console.log('\n=== SCHEMA de um documento de mensagens ===');
const amostra = await db.collection('mensagens').findOne({});
if (amostra) {
  const { _id, ...resto } = amostra;
  console.log(JSON.stringify(resto, null, 2));
}

console.log('\n=== ÍNDICES ===');
for (const col of ['conversas', 'mensagens']) {
  const idx = await db.collection(col).indexes();
  console.log(` ${col}:`, idx.map((i) => i.name + (i.unique ? ' (unique)' : '')).join(', '));
}

await client.close();
