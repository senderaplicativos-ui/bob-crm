// Diagnóstico da integração com a API de Conversões da Meta.
// Somente leitura: mostra config, mapeamentos e os últimos disparos.
import { readFileSync } from 'node:fs';
import { MongoClient } from 'mongodb';

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

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db(process.env.MONGODB_DB || 'bob_crm');

const instancias = await db.collection('instancias').find({}).toArray();
const nomeDe = (id) => instancias.find((i) => i.id === id)?.nome ?? id;

console.log('=== META_CONFIG ===');
for (const c of await db.collection('meta_config').find({}).toArray()) {
  const campos = Object.keys(c).filter((k) => k !== '_id').sort().join(', ');
  console.log(`\n[${nomeDe(c.instancia_id)}]`);
  console.log(`  pixel_id        = ${JSON.stringify(c.pixel_id ?? null)}`);
  console.log(`  access_token    = ${c.access_token ? `(presente, ${String(c.access_token).length} chars)` : '(VAZIO)'}`);
  console.log(`  ativo           = ${JSON.stringify(c.ativo ?? null)}`);
  console.log(`  test_event_code = ${JSON.stringify(c.test_event_code ?? null)}`);
  console.log(`  page_id         = ${JSON.stringify(c.page_id ?? null)}`);
  console.log(`  campos salvos   : ${campos}`);
}

console.log('\n\n=== MAPEAMENTO_EVENTOS ===');
for (const m of await db.collection('mapeamento_eventos').find({}).toArray()) {
  console.log(`[${nomeDe(m.instancia_id)}] ${m.estagio_nome} -> ${m.evento_meta} (ativo=${m.ativo})`);
}

console.log('\n\n=== ULTIMOS 12 DISPAROS ===');
const logs = await db.collection('log_eventos_meta')
  .find({}).sort({ criado_em: -1 }).limit(12).toArray();
for (const l of logs) {
  console.log(`\n${l.criado_em} [${nomeDe(l.instancia_id)}] ${l.evento_meta} status=${l.status_resposta}`);
  console.log(`  ${String(l.resposta ?? '').slice(0, 400)}`);
}

await client.close();
