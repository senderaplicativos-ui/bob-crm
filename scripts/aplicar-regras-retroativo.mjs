// Aplica as regras cadastradas às conversas que JÁ existem no Mongo.
//
// Contexto: até agora as regras só pintavam a mensagem na tela de detalhe
// (findRuleMatches em ConversationDetail.tsx). Nada era persistido, então
// Origem/Status nunca mudavam na lista de Conversas. O webhook passou a aplicar
// as regras na gravação, mas isso só vale para mensagens novas — este script
// cuida do histórico.
//
// Uso:
//   node scripts/aplicar-regras-retroativo.mjs            (dry-run: só mostra)
//   node scripts/aplicar-regras-retroativo.mjs --aplicar   (grava de verdade)
//
// Mesmas salvaguardas do webhook:
//   - Origem: só preenche se estiver vazia.
//   - Status: só mexe se a conversa estiver em 'NOVO' (ninguém moveu no funil).

import { readFileSync } from 'node:fs';
import { MongoClient } from 'mongodb';

// .env na mão: o projeto não tem dotenv instalado.
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

function escapaRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Mesma semântica do webhook e do findRuleMatches.
function regraCasa(regra, texto) {
  const alvo = String(texto ?? '').toLowerCase();
  if (!alvo) return false;
  const palavras = String(regra.texto ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);

  for (const palavra of palavras) {
    const chave = palavra.toLowerCase();
    if (regra.modo === 'exact') {
      if (alvo === chave) return true;
    } else if (regra.modo === 'word') {
      if (new RegExp(`\\b${escapaRegex(chave)}\\b`, 'i').test(alvo)) return true;
    } else {
      if (alvo.includes(chave)) return true;
    }
  }
  return false;
}

const APLICAR = process.argv.includes('--aplicar');

loadEnv();
const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI não encontrado (.env ou ambiente).');
  process.exit(1);
}

const client = new MongoClient(uri);
await client.connect();
const db = client.db(process.env.MONGODB_DB || undefined);

const regras = await db.collection('regras').find({ ativo: { $ne: false } }).toArray();
console.log(`Regras ativas: ${regras.length}`);
for (const r of regras) {
  console.log(`  [${r.tipo_regra}] modo=${r.modo} "${r.texto}" -> ${r.resultado}`);
}
if (regras.length === 0) {
  console.log('Nada a fazer.');
  await client.close();
  process.exit(0);
}

const conversas = await db.collection('conversas').find({}).toArray();
console.log(`\nConversas: ${conversas.length}`);

let mudariam = 0;
let gravadas = 0;

for (const conv of conversas) {
  // todas as mensagens da conversa (entrada e saída — a resposta automática da
  // instância é justamente o que marca lead de anúncio)
  const msgs = await db
    .collection('mensagens')
    .find({ conversa_id: conv.id })
    .sort({ criado_em: 1 })
    .toArray();
  if (msgs.length === 0) continue;

  let origem;
  let status;
  for (const m of msgs) {
    const texto = m.mensagem ?? m.texto ?? '';
    for (const regra of regras) {
      if (!regraCasa(regra, texto)) continue;
      const resultado = String(regra.resultado ?? '').trim();
      if (!resultado) continue;
      if (regra.tipo_regra === 'ORIGEM' && !origem) origem = resultado;
      if (regra.tipo_regra === 'STATUS' && !status) status = resultado;
    }
  }

  const set = {};
  if (origem && !conv.origem) set.origem = origem;

  const statusAtual = String(conv.status ?? '').trim();
  const statusIntocado = statusAtual === '' || statusAtual === 'NOVO';
  if (status && statusIntocado) {
    set.status = status;
    set.estagio = status;
  }

  if (Object.keys(set).length === 0) continue;

  mudariam++;
  const quem = conv.nome || conv.telefone;
  const partes = [];
  if (set.origem) partes.push(`origem: ${conv.origem ?? '(vazio)'} -> ${set.origem}`);
  if (set.status) partes.push(`status: ${statusAtual || '(vazio)'} -> ${set.status}`);
  console.log(`  ${APLICAR ? '+' : '~'} ${quem}: ${partes.join(' | ')}`);

  if (APLICAR) {
    await db.collection('conversas').updateOne(
      { id: conv.id },
      { $set: { ...set, atualizado_em: new Date().toISOString() } },
    );
    gravadas++;
  }
}

console.log(
  APLICAR
    ? `\n${gravadas} conversas atualizadas.`
    : `\n${mudariam} conversas mudariam. Rode com --aplicar para gravar.`,
);

await client.close();
