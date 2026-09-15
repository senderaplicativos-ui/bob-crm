// Preenche telefone_conectado das instâncias que estão conectadas na Evolution
// mas estão sem número gravado no Mongo (aparecem como "Sem número" no CRM).
//
// O número vem do ownerJid do /instance/fetchInstances da própria EVO.
// Só escreve o campo telefone_conectado. Não apaga nem altera mais nada.
//
// Uso: node scripts/fix-telefone-instancia.mjs

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

const URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || 'bobcrm';
if (!URI) { console.error('ERRO: MONGODB_URI não definido.'); process.exit(1); }

const stripSlash = (u) => String(u || '').replace(/\/$/, '');

const client = new MongoClient(URI, { serverSelectionTimeoutMS: 10000 });
await client.connect();
const db = client.db(DB_NAME);

const instancias = await db.collection('instancias')
  .find({ ativo: { $ne: false } }).toArray();

for (const inst of instancias) {
  const nome = inst.evolution_instance_name;
  if (!nome || !inst.evolution_url || !inst.evolution_api_key) {
    console.log(`- ${inst.nome}: sem configuração da EVO, pulando.`);
    continue;
  }

  const base = stripSlash(inst.evolution_url);
  const headers = { 'Content-Type': 'application/json', apikey: inst.evolution_api_key };

  let data = null;
  try {
    const r = await fetch(
      `${base}/instance/fetchInstances?instanceName=${encodeURIComponent(nome)}`,
      { method: 'GET', headers },
    );
    const t = await r.text();
    data = t ? JSON.parse(t) : null;
  } catch (e) {
    console.log(`- ${inst.nome} (${nome}): erro ao consultar a EVO: ${e.message}`);
    continue;
  }

  const evo = Array.isArray(data) ? (data[0]?.instance ?? data[0]) : (data?.instance ?? data);
  const state = evo?.state ?? evo?.connectionStatus ?? null;
  const numero = String(evo?.ownerJid ?? evo?.owner ?? evo?.number ?? '')
    .replace(/@.*$/, '').replace(/\D/g, '');

  if (state !== 'open') {
    console.log(`- ${inst.nome} (${nome}): state=${state}, não está conectada. Nada a fazer.`);
    continue;
  }
  if (!numero) {
    console.log(`- ${inst.nome} (${nome}): conectada, mas a EVO não devolveu o número.`);
    continue;
  }
  if (inst.telefone_conectado === numero) {
    console.log(`= ${inst.nome} (${nome}): já está correto (${numero}).`);
    continue;
  }

  await db.collection('instancias').updateOne(
    { id: inst.id },
    { $set: { telefone_conectado: numero, atualizado_em: new Date().toISOString() } },
  );
  console.log(`+ ${inst.nome} (${nome}): telefone_conectado ${JSON.stringify(inst.telefone_conectado)} -> ${numero}`);
}

await client.close();
