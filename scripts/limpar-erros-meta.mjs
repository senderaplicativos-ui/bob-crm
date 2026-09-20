// Limpa do log_eventos_meta os disparos que falharam (status != 200).
// Faz backup em JSON antes de apagar. Uso:
//   node scripts/limpar-erros-meta.mjs <nome-da-instancia>            (só lista)
//   node scripts/limpar-erros-meta.mjs <nome-da-instancia> --apagar   (apaga)
import { MongoClient } from 'mongodb';
import { readFileSync, writeFileSync } from 'fs';

// .env manual: dotenv não está instalado no projeto.
const env = {};
for (const linha of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}

const alvo = process.argv[2];
const apagar = process.argv.includes('--apagar');
if (!alvo) {
  console.error('informe o nome da instância');
  process.exit(1);
}

const client = new MongoClient(env.MONGODB_URI);
await client.connect();
const db = client.db();

const inst = await db.collection('instancias').findOne({ nome: alvo });
if (!inst) {
  console.error(`instância "${alvo}" não encontrada`);
  await client.close();
  process.exit(1);
}

const filtro = { instancia_id: inst.id, status_resposta: { $ne: 200 } };
const erros = await db.collection('log_eventos_meta').find(filtro).toArray();

const total = await db.collection('log_eventos_meta').countDocuments({ instancia_id: inst.id });
console.log(`instância: ${inst.nome} (${inst.id})`);
console.log(`disparos no total: ${total}`);
console.log(`com erro (status != 200): ${erros.length}`);

const porStatus = {};
for (const e of erros) porStatus[e.status_resposta ?? 'null'] = (porStatus[e.status_resposta ?? 'null'] ?? 0) + 1;
console.log('por status:', porStatus);

if (!apagar) {
  console.log('\n(nada apagado — rode com --apagar para remover)');
  await client.close();
  process.exit(0);
}

if (erros.length === 0) {
  console.log('nada para apagar');
  await client.close();
  process.exit(0);
}

const backup = new URL(`../backup-erros-meta-${alvo}-${Date.now()}.json`, import.meta.url);
writeFileSync(backup, JSON.stringify(erros, null, 2));
console.log(`\nbackup: ${backup.pathname}`);

const r = await db.collection('log_eventos_meta').deleteMany(filtro);
console.log(`apagados: ${r.deletedCount}`);
console.log(`restaram: ${await db.collection('log_eventos_meta').countDocuments({ instancia_id: inst.id })}`);

await client.close();
