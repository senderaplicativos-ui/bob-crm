// Somente leitura: procura campos de valor/moeda nas conversas.
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
const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db(process.env.MONGODB_DB || 'bob_crm');

const campos = new Set();
for (const c of await db.collection('conversas').find({}).limit(400).toArray()) {
  for (const k of Object.keys(c)) campos.add(k);
}
console.log('=== CAMPOS EM conversas ===');
console.log([...campos].sort().join(', '));

const suspeitos = [...campos].filter(k => /valor|preco|price|amount|ticket|moeda|currency|orcament/i.test(k));
console.log('\n=== CAMPOS DE VALOR/MOEDA ===');
console.log(suspeitos.length ? suspeitos.join(', ') : '(nenhum)');

console.log('\n=== CAMPOS EM meta_config ===');
const mc = await db.collection('meta_config').findOne({});
console.log(mc ? Object.keys(mc).filter(k => k !== '_id').sort().join(', ') : '(vazio)');

await client.close();
