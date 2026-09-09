// Seed do MongoDB para o Bob CRM.
// Cria as 11 coleções, índices úteis e os estágios de funil padrão.
//
// Uso (local, com Node 18+):
//   MONGODB_URI="mongodb://usuario:senha@host:27017/" MONGODB_DB="bobcrm" node scripts/seed.mjs
//
// É idempotente: pode rodar várias vezes sem duplicar dados.

import { MongoClient } from 'mongodb';
import { randomUUID } from 'crypto';

const URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || 'bobcrm';

if (!URI) {
  console.error('ERRO: defina a variável de ambiente MONGODB_URI.');
  process.exit(1);
}

const nowIso = () => new Date().toISOString();

const COLLECTIONS = [
  'instancias',
  'conversas',
  'mensagens',
  'estagios_funil',
  'regras',
  'links_rastreavel',
  'cliques_rastreavel',
  'meta_config',
  'mapeamento_eventos',
  'log_eventos_meta',
  'log_erros',
  'configuracoes',
];

const ESTAGIOS_PADRAO = [
  { nome: 'NOVO', cor: '#6B7280', ordem: 1 },
  { nome: 'LEAD', cor: '#3B82F6', ordem: 2 },
  { nome: 'CONTATO', cor: '#F59E0B', ordem: 3 },
  { nome: 'COMPROU', cor: '#10B981', ordem: 4 },
];

async function main() {
  const client = new MongoClient(URI, { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  const db = client.db(DB_NAME);
  console.log(`Conectado ao banco "${DB_NAME}".`);

  // 1) cria as coleções que ainda não existem
  const existentes = (await db.listCollections().toArray()).map((c) => c.name);
  for (const nome of COLLECTIONS) {
    if (!existentes.includes(nome)) {
      await db.createCollection(nome);
      console.log(`  + coleção criada: ${nome}`);
    } else {
      console.log(`  = coleção já existe: ${nome}`);
    }
  }

  // 2) índices úteis
  await db.collection('conversas').createIndex({ telefone: 1, instancia_id: 1 });
  await db.collection('conversas').createIndex({ estagio: 1 });
  await db.collection('mensagens').createIndex({ conversa_id: 1 });
  await db.collection('mensagens').createIndex({ message_id: 1 }, { sparse: true });
  await db.collection('instancias').createIndex({ nome: 1 });
  await db.collection('estagios_funil').createIndex({ ordem: 1 });
  await db.collection('links_rastreavel').createIndex({ click_id: 1 }, { sparse: true });
  // id único em todas as coleções (compatibilidade com os UUIDs do Postgres)
  for (const nome of COLLECTIONS) {
    await db.collection(nome).createIndex({ id: 1 }, { unique: true, sparse: true });
  }
  console.log('  índices criados/garantidos.');

  // 3) estágios de funil padrão (só insere se a coleção estiver vazia)
  const qtdEstagios = await db.collection('estagios_funil').countDocuments();
  if (qtdEstagios === 0) {
    const docs = ESTAGIOS_PADRAO.map((e) => ({
      id: randomUUID(),
      nome: e.nome,
      cor: e.cor,
      ordem: e.ordem,
      criado_em: nowIso(),
    }));
    await db.collection('estagios_funil').insertMany(docs);
    console.log(`  + ${docs.length} estágios de funil padrão inseridos.`);
  } else {
    console.log(`  = estágios de funil já existem (${qtdEstagios}), nada a fazer.`);
  }

  await client.close();
  console.log('Seed concluído com sucesso.');
}

main().catch((err) => {
  console.error('Falha no seed:', err);
  process.exit(1);
});
