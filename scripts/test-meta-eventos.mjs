// Teste: quais nomes de evento a Meta aceita com action_source system_generated.
// Usa telefone FICTICIO e test_event_code. Nao gera conversao real.
import { readFileSync } from 'node:fs';
import { createHash } from 'crypto';
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

const sha = (v) => createHash('sha256').update(v).digest('hex');
const TEL_FICTICIO = '5500900000000'; // nao existe: prefixo 009 invalido

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db(process.env.MONGODB_DB || 'bob_crm');

const cfg = await db.collection('meta_config').findOne({ ativo: { $ne: false } });
if (!cfg) { console.log('sem meta_config ativa'); await client.close(); process.exit(0); }

const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(cfg.pixel_id)}/events`
  + `?access_token=${encodeURIComponent(cfg.access_token)}`;

// Purchase precisa de moeda+valor; os outros nao.
const CASOS = [
  { nome: 'Lead' },
  { nome: 'Contact' },
  { nome: 'Schedule' },
  { nome: 'CompleteRegistration' },
  { nome: 'Subscribe' },
  { nome: 'Purchase' },
  { nome: 'Purchase (com moeda+valor)', event: 'Purchase', custom: { currency: 'BRL', value: 1 } },
];

for (const caso of CASOS) {
  const evento = {
    event_name: caso.event ?? caso.nome,
    event_time: Math.floor(Date.now() / 1000),
    action_source: 'system_generated',
    user_data: { ph: [sha(TEL_FICTICIO)] },
  };
  if (caso.custom) evento.custom_data = caso.custom;

  const payload = { data: [evento] };
  if (cfg.test_event_code) payload.test_event_code = String(cfg.test_event_code).trim();

  const r = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const txt = await r.text();
  if (r.ok) {
    console.log(`OK   ${caso.nome}  -> HTTP ${r.status}`);
  } else {
    let msg = txt;
    try { msg = JSON.parse(txt).error?.error_user_msg ?? JSON.parse(txt).error?.message ?? txt; } catch {}
    console.log(`FALHA ${caso.nome}  -> HTTP ${r.status}: ${String(msg).slice(0, 200)}`);
  }
}

await client.close();
