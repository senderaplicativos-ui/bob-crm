// Mescla conversas duplicadas por @lid.
//
// O lead que chega de anúncio cria uma conversa com o LID no campo telefone
// (a mensagem de entrada não traz o número). Quando a instância responde, a
// Evolution passa a mandar o telefone real e nasce uma segunda conversa.
// Este script pergunta à EVO qual telefone corresponde a cada LID e junta as
// duas conversas em uma só.
//
// Uso:
//   node scripts/mesclar-lid-retroativo.mjs            (dry-run, não grava)
//   node scripts/mesclar-lid-retroativo.mjs --aplicar  (grava)

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
  } catch { /* sem .env, usa o ambiente */ }
}
loadEnv();

const APLICAR = process.argv.includes('--aplicar');

// Um telefone real tem país+DDD+número; o LID é um código interno mais longo.
function pareceTelefoneReal(num) {
  return num.length >= 10 && num.length <= 13;
}
function soDigitos(v) {
  return String(v ?? '').replace(/@.*$/, '').replace(/\D/g, '');
}

// Pergunta à EVO o telefone real de um LID, olhando o remoteJidAlt das mensagens.
async function resolveLidNaEvo(inst, lid) {
  const base = String(inst.evolution_url ?? '').replace(/\/$/, '');
  const apikey = String(inst.evolution_api_key ?? '');
  const name = String(inst.evolution_instance_name ?? '');
  if (!base || !apikey || !name) return '';
  try {
    const r = await fetch(`${base}/chat/findMessages/${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey },
      body: JSON.stringify({ where: { key: { remoteJid: `${lid}@lid` } } }),
    });
    if (!r.ok) return '';
    const data = await r.json();
    const records = data?.messages?.records ?? [];
    for (const rec of records) {
      const alt = soDigitos(rec?.key?.remoteJidAlt);
      if (alt && pareceTelefoneReal(alt)) return alt;
    }
  } catch { /* sem resposta da EVO */ }
  return '';
}

const uri = process.env.MONGODB_URI;
if (!uri) { console.error('MONGODB_URI não encontrado'); process.exit(1); }

const client = new MongoClient(uri);
await client.connect();
const db = client.db(process.env.MONGODB_DB || undefined);

const instancias = await db.collection('instancias').find({}).toArray();
const conversas = await db.collection('conversas').find({}).toArray();

// Órfãs = conversas cujo telefone não parece telefone (é um LID).
const orfas = conversas.filter((c) => {
  const tel = soDigitos(c.telefone);
  return tel && !pareceTelefoneReal(tel);
});

console.log(`${orfas.length} conversas com LID no lugar do telefone\n`);

let mescladas = 0;
let semPar = 0;

for (const orfa of orfas) {
  const inst = instancias.find((i) => i.id === orfa.instancia_id);
  const lid = soDigitos(orfa.telefone);
  const nomeInst = inst?.evolution_instance_name ?? '(sem instância)';

  const telefoneReal = inst ? await resolveLidNaEvo(inst, lid) : '';
  if (!telefoneReal) {
    console.log(`? ${lid} [${nomeInst}] -> EVO não devolveu telefone; mantida`);
    semPar++;
    continue;
  }

  // conversa destino: mesma instância + telefone real
  const destino = conversas.find(
    (c) => c.instancia_id === orfa.instancia_id && soDigitos(c.telefone) === telefoneReal,
  );

  const qtdMsgs = await db.collection('mensagens').countDocuments({ conversa_id: orfa.id });

  if (!destino) {
    // Não existe conversa do telefone: só corrige o telefone da órfã.
    console.log(`~ ${lid} [${nomeInst}] -> renomeia para ${telefoneReal} (${qtdMsgs} msgs)`);
    if (APLICAR) {
      await db.collection('conversas').updateOne(
        { id: orfa.id },
        { $set: { telefone: telefoneReal, lid, atualizado_em: new Date().toISOString() } },
      );
      await db.collection('mensagens').updateMany(
        { conversa_id: orfa.id },
        { $set: { telefone: telefoneReal } },
      );
    }
    mescladas++;
    continue;
  }

  console.log(`+ ${lid} [${nomeInst}] -> mescla em ${telefoneReal} (${qtdMsgs} msgs movidas)`);
  if (APLICAR) {
    // move as mensagens para a conversa do telefone real
    await db.collection('mensagens').updateMany(
      { conversa_id: orfa.id },
      { $set: { conversa_id: destino.id, telefone: telefoneReal } },
    );
    // preserva o nome e a origem se o destino não tiver
    const set = { lid, atualizado_em: new Date().toISOString() };
    if (!destino.nome && orfa.nome) { set.nome = orfa.nome; set.nome_contato = orfa.nome; }
    if (!destino.origem && orfa.origem) set.origem = orfa.origem;
    // mantém a data da primeira mensagem mais antiga
    if (orfa.criado_em && (!destino.criado_em || orfa.criado_em < destino.criado_em)) {
      set.criado_em = orfa.criado_em;
    }
    await db.collection('conversas').updateOne({ id: destino.id }, { $set: set });
    await db.collection('conversas').deleteOne({ id: orfa.id });
  }
  mescladas++;
}

console.log(
  `\n${mescladas} conversas ${APLICAR ? 'mescladas' : 'seriam mescladas'}, ${semPar} sem par.`,
);
if (!APLICAR && mescladas > 0) console.log('Rode com --aplicar para gravar.');

await client.close();
