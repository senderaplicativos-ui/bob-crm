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
  } catch {}
}
loadEnv();
const cli = new MongoClient(process.env.MONGODB_URI);
await cli.connect();
const db = cli.db(process.env.MONGODB_DB || 'bobcrm');

console.log('=== INSTANCIAS ===');
for (const i of await db.collection('instancias').find({}).toArray()) {
  console.log(`${i.id} | nome=${JSON.stringify(i.nome)} | evo=${JSON.stringify(i.evolution_instance_name)}`);
}

console.log('\n=== REGRAS ===');
for (const r of await db.collection('regras').find({}).toArray()) {
  console.log(JSON.stringify(r));
}
await cli.close();
