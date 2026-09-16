// Tenta descobrir se a Evolution sabe traduzir um @lid para o telefone real.
// Somente leitura: não grava nada no Mongo nem na EVO.
import { MongoClient } from 'mongodb';
import { readFileSync } from 'node:fs';

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

const LIDS = ['60464650285250', '213555018264706'];

async function tenta(nome, url, opts) {
  try {
    const r = await fetch(url, opts);
    const txt = await r.text();
    let body = txt;
    try { body = JSON.parse(txt); } catch { /* texto puro */ }
    console.log(`\n--- ${nome} -> HTTP ${r.status}`);
    const s = JSON.stringify(body);
    console.log(s.length > 1200 ? s.slice(0, 1200) + ' ...(cortado)' : s);
    return body;
  } catch (e) {
    console.log(`\n--- ${nome} -> ERRO ${e.message}`);
    return null;
  }
}

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db(process.env.MONGODB_DB || 'bob_crm');

const inst = await db.collection('instancias').findOne({ evolution_instance_name: 'RenataFuncional' });
if (!inst) { console.log('instância RenataFuncional não encontrada'); await client.close(); process.exit(0); }

const base = String(inst.evolution_url).replace(/\/$/, '');
const apikey = String(inst.evolution_api_key);
const name = String(inst.evolution_instance_name);
const H = { 'Content-Type': 'application/json', apikey };

console.log(`instância ${name} em ${base}`);

for (const lid of LIDS) {
  console.log(`\n\n########## LID ${lid} ##########`);

  await tenta(`findContacts (lid ${lid})`, `${base}/chat/findContacts/${name}`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ where: { remoteJid: `${lid}@lid` } }),
  });

  await tenta(`whatsappNumbers (lid ${lid})`, `${base}/chat/whatsappNumbers/${name}`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ numbers: [lid] }),
  });

  await tenta(`findChats filtrado (lid ${lid})`, `${base}/chat/findChats/${name}`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ where: { remoteJid: `${lid}@lid` } }),
  });

  await tenta(`findMessages (lid ${lid})`, `${base}/chat/findMessages/${name}`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ where: { key: { remoteJid: `${lid}@lid` } }, limit: 2 }),
  });
}

// findChats geral: procura qualquer registro que cite os LIDs
const chats = await tenta('findChats (geral)', `${base}/chat/findChats/${name}`, {
  method: 'POST', headers: H, body: JSON.stringify({}),
});
if (Array.isArray(chats)) {
  console.log(`\n=== varredura em ${chats.length} chats ===`);
  for (const c of chats) {
    const s = JSON.stringify(c);
    if (LIDS.some((l) => s.includes(l))) console.log('  CITA LID:', s.slice(0, 500));
  }
}

await client.close();
