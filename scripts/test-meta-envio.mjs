// Teste de envio real para a API de Conversões da Meta.
// Replica EXATAMENTE o payload que api/_lib/meta.ts monta hoje, lendo a mesma
// config do Mongo. Usa telefone fictício e test_event_code para não injetar
// conversão falsa na conta de anúncios.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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

const GRAPH_VERSION = 'v21.0';
const EVENTOS_COM_VALOR = new Set(['Purchase', 'InitiateCheckout', 'AddToCart']);
const TELEFONE_FICTICIO = '5500000000000';

const sha256 = (v) => createHash('sha256').update(v).digest('hex');

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db(process.env.MONGODB_DB || 'bob_crm');

const instancias = await db.collection('instancias').find({}).toArray();
const nomeDe = (id) => instancias.find((i) => i.id === id)?.nome ?? id;

for (const config of await db.collection('meta_config').find({}).toArray()) {
  console.log(`\n========== ${nomeDe(config.instancia_id)} ==========`);
  const pixelId = String(config.pixel_id ?? '').trim();
  const accessToken = String(config.access_token ?? '').trim();
  if (!pixelId || !accessToken) { console.log('  sem pixel/token, pulando'); continue; }

  const mapeamentos = await db.collection('mapeamento_eventos')
    .find({ instancia_id: config.instancia_id }).toArray();
  if (mapeamentos.length === 0) console.log('  nenhum mapeamento de estágio');

  for (const map of mapeamentos) {
    const eventoMeta = String(map.evento_meta ?? '').trim();
    if (!eventoMeta) continue;

    const evento = {
      event_name: eventoMeta,
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'system_generated',
      user_data: { ph: [sha256(TELEFONE_FICTICIO)] },
    };
    if (EVENTOS_COM_VALOR.has(eventoMeta)) {
      const moeda = String(config.moeda ?? '').trim().toUpperCase() || 'BRL';
      const bruto = Number(config.valor_padrao ?? 0);
      const valor = Number.isFinite(bruto) && bruto >= 0 ? bruto : 0;
      evento.custom_data = { currency: moeda, value: valor };
    }

    const payload = { data: [evento] };
    const testCode = String(config.test_event_code ?? '').trim();
    if (testCode) payload.test_event_code = testCode;

    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(pixelId)}`
      + `/events?access_token=${encodeURIComponent(accessToken)}`;

    console.log(`\n  estágio "${map.estagio_nome}" -> evento "${eventoMeta}"`);
    console.log(`  custom_data = ${JSON.stringify(evento.custom_data ?? null)}`);
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const txt = await r.text();
      console.log(`  HTTP ${r.status}`);
      console.log(`  ${txt.slice(0, 300)}`);
      console.log(r.ok ? '  >>> ACEITO' : '  >>> REJEITADO');
    } catch (e) {
      console.log(`  erro de rede: ${e.message}`);
    }
  }
}

await client.close();
