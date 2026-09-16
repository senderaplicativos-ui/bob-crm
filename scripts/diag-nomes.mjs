// Somente leitura: descobre por que algumas conversas ficaram sem nome.
// 1) lista conversas com nome vazio;
// 2) para cada uma, pergunta à EVO o pushName das mensagens de ENTRADA;
// 3) mostra o pushName nos payloads crus ainda guardados em log_webhook.
import { readFileSync } from 'fs';
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
  } catch {}
}
loadEnv();

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db(process.env.MONGODB_DB || 'bob_crm');

const instancias = await db.collection('instancias').find({}).toArray();
const porId = Object.fromEntries(instancias.map((i) => [i.id, i]));

const semNome = await db.collection('conversas')
  .find({ $or: [{ nome: null }, { nome: '' }, { nome: { $exists: false } }] })
  .toArray();

console.log(`=== ${semNome.length} conversas sem nome ===\n`);

for (const c of semNome.slice(0, 8)) {
  const inst = porId[c.instancia_id];
  console.log(`--- ${c.telefone} [${inst?.evolution_instance_name ?? '?'}] lid=${c.lid ?? '-'} criada=${c.criado_em}`);
  if (!inst) { console.log('    (sem instância)\n'); continue; }

  const base = String(inst.evolution_url).replace(/\/$/, '');
  const H = { 'Content-Type': 'application/json', apikey: String(inst.evolution_api_key) };
  const name = String(inst.evolution_instance_name);

  // mensagens de entrada segundo a EVO
  for (const jid of [`${c.telefone}@s.whatsapp.net`, ...(c.lid ? [`${c.lid}@lid`] : [])]) {
    try {
      const r = await fetch(`${base}/chat/findMessages/${name}`, {
        method: 'POST', headers: H,
        body: JSON.stringify({ where: { key: { remoteJid: jid } } }),
      });
      if (!r.ok) continue;
      const data = await r.json();
      const recs = data?.messages?.records ?? [];
      const entradas = recs.filter((x) => !x.key?.fromMe);
      const nomes = [...new Set(entradas.map((x) => x.pushName).filter(Boolean))];
      console.log(`    ${jid}: ${recs.length} msgs, ${entradas.length} entradas, pushName=${JSON.stringify(nomes)}`);
      if (entradas[0]) {
        const e = entradas[0];
        console.log(`      1a entrada: pushName=${JSON.stringify(e.pushName)} notifyName=${JSON.stringify(e.notifyName)} verified=${JSON.stringify(e.verifiedBizName ?? e.verifiedName)}`);
      }
    } catch (e) { console.log(`    ${jid}: erro ${e.message}`); }
  }

  // o que a EVO guarda no cadastro de contatos
  try {
    const r = await fetch(`${base}/chat/findContacts/${name}`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ where: { remoteJid: `${c.telefone}@s.whatsapp.net` } }),
    });
    if (r.ok) {
      const cs = await r.json();
      for (const ct of cs) console.log(`    contato EVO: pushName=${JSON.stringify(ct.pushName)} name=${JSON.stringify(ct.name)}`);
    }
  } catch {}
  console.log('');
}

// payloads crus ainda no log_webhook: onde estava o nome?
const logs = await db.collection('log_webhook').find({}).sort({ criado_em: -1 }).limit(4).toArray();
console.log(`=== ${logs.length} payloads no log_webhook ===`);
for (const l of logs) {
  const d = l.body?.data ?? l.body ?? {};
  console.log(`  fromMe=${d.key?.fromMe} pushName=${JSON.stringify(d.pushName)} notifyName=${JSON.stringify(d.notifyName)} keys=${Object.keys(d).join(',')}`);
}

await client.close();
