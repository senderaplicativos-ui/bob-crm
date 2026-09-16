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
  } catch {}
}
loadEnv();
const c = new MongoClient(process.env.MONGODB_URI);
await c.connect();
const db = c.db(process.env.MONGODB_DB || 'bob_crm');
const inst = await db.collection('instancias').findOne({ evolution_instance_name: 'RenataFuncional' });
const convs = await db.collection('conversas').find({ instancia_id: inst.id }).toArray();
for (const cv of convs) {
  const msgs = await db.collection('mensagens').find({ conversa_id: cv.id }).sort({ criado_em: 1 }).toArray();
  console.log(`\n=== ${cv.telefone} (nome=${cv.nome ?? '—'}) id=${cv.id} ===`);
  for (const m of msgs) {
    console.log(`  [${m.direcao}] ${String(m.mensagem ?? m.texto ?? '').slice(0, 70)}`);
    console.log(`     ${m.criado_em}  mid=${m.message_id}`);
  }
}
await c.close();
