// Diagnóstico (SOMENTE LEITURA) de uma instância: o que está gravado no Mongo
// e o que a Evolution responde para connectionState e fetchInstances.
//
// Uso: node scripts/diag-instancia.mjs GessoAlfa8903
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

const alvo = process.argv[2] || null;

const client = new MongoClient(URI, { serverSelectionTimeoutMS: 10000 });
await client.connect();
const db = client.db(DB_NAME);

const filtro = alvo
  ? { $or: [{ evolution_instance_name: alvo }, { nome: alvo }] }
  : {};
const insts = await db.collection('instancias').find(filtro).toArray();

console.log(`=== INSTANCIAS NO MONGO (${insts.length}) ===`);
for (const i of insts) {
  console.log('---', i.nome, '|', i.evolution_instance_name);
  console.log('   id                 =', i.id);
  console.log('   ativo              =', i.ativo);
  console.log('   telefone_conectado =', JSON.stringify(i.telefone_conectado));
  console.log('   evolution_url      =', i.evolution_url);
  console.log('   apikey presente?   =', i.evolution_api_key ? `sim (${String(i.evolution_api_key).length} chars)` : 'NÃO');
}

for (const i of insts) {
  if (!i.evolution_url || !i.evolution_api_key || !i.evolution_instance_name) {
    console.log(`\n### ${i.evolution_instance_name}: falta url/apikey, não consulto a EVO`);
    continue;
  }
  const base = String(i.evolution_url).replace(/\/$/, '');
  const headers = { 'Content-Type': 'application/json', apikey: String(i.evolution_api_key) };
  const nome = encodeURIComponent(i.evolution_instance_name);

  console.log(`\n### EVO para ${i.evolution_instance_name}`);

  for (const [rotulo, url] of [
    ['connectionState', `${base}/instance/connectionState/${nome}`],
    ['fetchInstances?instanceName', `${base}/instance/fetchInstances?instanceName=${nome}`],
    ['fetchInstances (todas)', `${base}/instance/fetchInstances`],
  ]) {
    try {
      const r = await fetch(url, { method: 'GET', headers });
      const t = await r.text();
      let d = null;
      try { d = t ? JSON.parse(t) : null; } catch { d = t; }
      // para a listagem completa, só mostra a instância alvo
      if (rotulo === 'fetchInstances (todas)' && Array.isArray(d)) {
        d = d.filter((x) => {
          const n = x?.name ?? x?.instanceName ?? x?.instance?.instanceName ?? x?.instance?.name;
          return n === i.evolution_instance_name;
        });
      }
      console.log(`  [${rotulo}] HTTP ${r.status}`);
      console.log('   ', JSON.stringify(d).slice(0, 1200));
    } catch (e) {
      console.log(`  [${rotulo}] ERRO: ${e.message}`);
    }
  }
}

await client.close();
