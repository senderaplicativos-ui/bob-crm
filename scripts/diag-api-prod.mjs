// Diagnóstico (SOMENTE LEITURA) do endpoint /api/evolution em produção.
//
// Reproduz exatamente o que a tela Conexões faz: chama as ações "status" e
// "fetchInstance" para cada instância ativa, passando url/apikey do Mongo.
// Serve para descobrir se o problema está no navegador, no serverless ou na EVO.
//
// Uso: node scripts/diag-api-prod.mjs [https://seu-app.vercel.app]
// Não escreve nada.

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
  } catch { /* sem .env */ }
}
loadEnv();

const BASE = (process.argv[2] || 'https://bob-crm-ten.vercel.app').replace(/\/$/, '');
const TOKEN = process.env.API_TOKEN || process.env.VITE_API_TOKEN;
const URI = process.env.MONGODB_URI;
if (!URI) { console.error('ERRO: MONGODB_URI não definido.'); process.exit(1); }
if (!TOKEN) { console.error('ERRO: API_TOKEN não definido.'); process.exit(1); }

console.log('Base:', BASE, '| token presente: sim');

const client = new MongoClient(URI, { serverSelectionTimeoutMS: 10000 });
await client.connect();
const insts = await client.db(process.env.MONGODB_DB || 'bobcrm')
  .collection('instancias').find({ ativo: { $ne: false } }).toArray();
await client.close();

async function chamar(action, inst) {
  const t0 = Date.now();
  try {
    const r = await fetch(`${BASE}/api/evolution`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-token': TOKEN },
      body: JSON.stringify({
        action,
        instanceName: inst.evolution_instance_name,
        evolutionUrl: inst.evolution_url,
        evolutionApiKey: inst.evolution_api_key,
      }),
    });
    const txt = await r.text();
    let j = null;
    try { j = txt ? JSON.parse(txt) : null; } catch { /* html/erro */ }
    const ms = Date.now() - t0;
    if (!j) {
      console.log(`   ${action}: HTTP ${r.status} em ${ms}ms — resposta não-JSON: ${txt.slice(0, 200)}`);
      return;
    }
    // não imprime o raw inteiro, só o que a tela usa
    console.log(`   ${action}: HTTP ${r.status} em ${ms}ms | ok=${j.ok} state=${JSON.stringify(j.state)} number=${JSON.stringify(j.number)}${j.error ? ' error=' + j.error : ''}`);
  } catch (e) {
    console.log(`   ${action}: FALHOU — ${e.message}`);
  }
}

for (const inst of insts) {
  console.log(`\n--- ${inst.nome} | ${inst.evolution_instance_name} | telefone_conectado=${JSON.stringify(inst.telefone_conectado ?? null)}`);
  await chamar('status', inst);
  await chamar('fetchInstance', inst);
}
