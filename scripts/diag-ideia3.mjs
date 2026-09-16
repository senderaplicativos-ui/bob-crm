// Diagnóstico somente-leitura: procura leads duplicados (par @lid + telefone real)
// na instância Ideia3. Uso: node scripts/aplicar... este script NÃO escreve nada.
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
  } catch { /* sem .env */ }
}
loadEnv();

const pareceReal = (n) => n.length >= 10 && n.length <= 13;

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db(process.env.MONGODB_DB || 'bob_crm');

const inst = await db.collection('instancias').findOne({
  $or: [{ nome: /ideia3/i }, { evolution_instance_name: /ideia3/i }],
});
console.log('instância:', inst?.nome, '/', inst?.evolution_instance_name, '/ id:', inst?.id);

const convs = await db.collection('conversas')
  .find(inst ? { instancia_id: inst.id } : {})
  .sort({ criado_em: 1 })
  .toArray();

console.log(`\n=== ${convs.length} conversas ===`);
for (const c of convs) {
  const tel = String(c.telefone ?? '');
  const flag = pareceReal(tel) ? '   ' : 'LID';
  const nMsg = await db.collection('mensagens').countDocuments({ conversa_id: c.id });
  console.log(`${flag} ${tel.padEnd(16)} nome=${String(c.nome ?? '—').padEnd(18)} msgs=${nMsg} criado=${c.criado_em}`);
}

// Para cada conversa com telefone LID, mostra as mensagens e tenta achar o par real.
console.log('\n=== detalhe das conversas LID ===');
for (const c of convs) {
  const tel = String(c.telefone ?? '');
  if (pareceReal(tel)) continue;
  console.log(`\n--- conversa ${c.id} telefone=${tel} ---`);
  const msgs = await db.collection('mensagens')
    .find({ conversa_id: c.id }).sort({ criado_em: 1 }).toArray();
  for (const m of msgs) {
    console.log(`  [${m.direcao}] ${String(m.mensagem ?? m.texto ?? '').slice(0, 90)}`);
    console.log(`     message_id=${m.message_id} criado=${m.criado_em}`);
  }
}

// Payloads @lid gravados pelo log temporário (se ainda houver) para ver os campos.
const logs = await db.collection('log_webhook')
  .find({}).sort({ criado_em: -1 }).limit(6).toArray();
console.log(`\n=== ${logs.length} payloads @lid no log ===`);
for (const l of logs) {
  const key = l.body?.data?.key ?? l.body?.key ?? {};
  console.log(`\ntelefone_resolvido=${l.telefone_resolvido} instancia=${l.body?.instance} criado=${l.criado_em}`);
  console.log('  key:', JSON.stringify(key));
}

await client.close();
