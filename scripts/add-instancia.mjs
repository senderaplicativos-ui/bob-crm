// Insere (ou atualiza) uma instância na coleção "instancias" do MongoDB do Bob CRM.
// Use isto para cadastrar no CRM uma instância que já existe na Evolution.
//
// Uso (PowerShell, na pasta do projeto):
//   $env:MONGODB_URI="mongodb://usuario:senha@host:27017/"
//   $env:MONGODB_DB="bobcrm"
//   node scripts/add-instancia.mjs
//
// É idempotente: roda de novo sem duplicar (faz upsert por evolution_instance_name).

import { MongoClient } from 'mongodb';
import { randomUUID } from 'crypto';

// ==========================================================================
// EDITE AQUI os dados da instância que você quer cadastrar no CRM.
// Os valores abaixo são da instância que já está conectada na sua Evolution.
// ==========================================================================
const INSTANCIA = {
  nome: 'Ander Moraes - Ferramentas Atendimento', // nome amigável exibido no CRM
  evolution_instance_name: 'atede1734',            // nome EXATO da instância na Evolution
  evolution_url: 'https://chatevo.atende.app.br',  // URL da sua Evolution
  evolution_api_key: 'd68048fb02ba896f898888a8704467d2', // API key da Evolution
  telefone_conectado: '5511978111734',             // número conectado (ou null)
};

const URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || 'bobcrm';

if (!URI) {
  console.error('ERRO: defina a variável de ambiente MONGODB_URI.');
  process.exit(1);
}

const nowIso = () => new Date().toISOString();

async function main() {
  const client = new MongoClient(URI, { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  const db = client.db(DB_NAME);
  console.log(`Conectado ao banco "${DB_NAME}".`);

  const col = db.collection('instancias');
  const query = { evolution_instance_name: INSTANCIA.evolution_instance_name };

  const result = await col.updateOne(
    query,
    {
      $set: {
        nome: INSTANCIA.nome,
        evolution_url: INSTANCIA.evolution_url,
        evolution_api_key: INSTANCIA.evolution_api_key,
        evolution_instance_name: INSTANCIA.evolution_instance_name,
        telefone_conectado: INSTANCIA.telefone_conectado ?? null,
        ativo: true,
        atualizado_em: nowIso(),
      },
      $setOnInsert: {
        id: randomUUID(),
        criado_em: nowIso(),
      },
    },
    { upsert: true },
  );

  if (result.upsertedCount > 0) {
    console.log(`  + instância "${INSTANCIA.nome}" cadastrada no CRM.`);
  } else {
    console.log(`  = instância "${INSTANCIA.nome}" já existia — dados atualizados.`);
  }

  // cria os estágios de funil desta instância (se ainda não houver)
  const inst = await col.findOne(query);
  const instId = inst?.id;
  if (instId) {
    const estagios = db.collection('estagios_funil');
    const jaTem = await estagios.countDocuments({ instancia_id: instId });
    if (jaTem === 0) {
      await estagios.insertMany([
        { id: randomUUID(), nome: 'NOVO', ordem: 1, cor: '#6B7280', instancia_id: instId, criado_em: nowIso() },
        { id: randomUUID(), nome: 'LEAD', ordem: 2, cor: '#3B82F6', instancia_id: instId, criado_em: nowIso() },
        { id: randomUUID(), nome: 'CONTATO', ordem: 3, cor: '#F59E0B', instancia_id: instId, criado_em: nowIso() },
        { id: randomUUID(), nome: 'COMPROU', ordem: 4, cor: '#10B981', instancia_id: instId, criado_em: nowIso() },
      ]);
      console.log('  + 4 estágios de funil criados para esta instância.');
    } else {
      console.log(`  = estágios de funil desta instância já existem (${jaTem}).`);
    }
  }

  await client.close();
  console.log('Concluído com sucesso.');
}

main().catch((err) => {
  console.error('Falha:', err);
  process.exit(1);
});
