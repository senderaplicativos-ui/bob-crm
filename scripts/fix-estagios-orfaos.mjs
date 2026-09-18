// Limpa estágios de funil órfãos (criados sem o campo `ativo`, que ficam
// invisíveis na busca e viram lixo/duplicata) para uma instância.
//
// Uso:
//   node scripts/fix-estagios-orfaos.mjs Ideia3           (só mostra o que faria)
//   node scripts/fix-estagios-orfaos.mjs Ideia3 --apply   (apaga de verdade)
//
// A instância pode ser informada pelo nome, evolution_instance_name ou id.

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
const APPLY = process.argv.includes('--apply');
if (!alvo) { console.error('ERRO: informe a instância. Ex: node scripts/fix-estagios-orfaos.mjs Ideia3'); process.exit(1); }

const client = new MongoClient(URI, { serverSelectionTimeoutMS: 10000 });
await client.connect();
const db = client.db(DB_NAME);

// Resolve a instância
const inst = await db.collection('instancias').findOne({
  $or: [{ id: alvo }, { nome: alvo }, { evolution_instance_name: alvo }],
});
if (!inst) { console.error(`ERRO: instância "${alvo}" não encontrada.`); await client.close(); process.exit(1); }
console.log(`Instância: ${inst.nome} | ${inst.evolution_instance_name} | id=${inst.id}`);

const col = db.collection('estagios_funil');
const todos = await col.find({ instancia_id: inst.id }).toArray();
console.log(`\nEstágios cadastrados para esta instância: ${todos.length}`);
for (const e of todos) {
  console.log(`  - nome=${e.nome} ordem=${e.ordem} ativo=${JSON.stringify(e.ativo)} id=${e.id}`);
}

// Órfãos = sem ativo:true (campo ausente, null ou false). Estes nunca aparecem
// na tela porque a busca filtra por ativo:true.
const orfaos = todos.filter((e) => e.ativo !== true);
console.log(`\nÓrfãos (invisíveis na tela, ativo != true): ${orfaos.length}`);
for (const e of orfaos) {
  console.log(`  x nome=${e.nome} ordem=${e.ordem} ativo=${JSON.stringify(e.ativo)} id=${e.id}`);
}

if (orfaos.length === 0) {
  console.log('\nNada a limpar.');
} else if (!APPLY) {
  console.log('\n[SIMULAÇÃO] Rode de novo com --apply para apagar os órfãos acima.');
} else {
  const ids = orfaos.map((e) => e.id);
  const res = await col.deleteMany({ instancia_id: inst.id, id: { $in: ids } });
  console.log(`\n[APLICADO] Removidos: ${res.deletedCount}`);
  const restam = await col.find({ instancia_id: inst.id }).toArray();
  console.log(`Estágios restantes: ${restam.length}`);
  for (const e of restam) {
    console.log(`  - nome=${e.nome} ordem=${e.ordem} ativo=${JSON.stringify(e.ativo)}`);
  }
}

await client.close();
