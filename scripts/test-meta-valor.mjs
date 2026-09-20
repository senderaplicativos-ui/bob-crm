// Teste pontual: a Meta aceita Purchase com value 0?
// Somente leitura no Mongo; envia com test_event_code e telefone ficticio.
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

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db(process.env.MONGODB_DB || 'bob_crm');
const cfg = await db.collection('meta_config').findOne({ pixel_id: { $ne: null } });
await client.close();

const TEL_FICTICIO = '5500000000000';
const ph = createHash('sha256').update(TEL_FICTICIO).digest('hex');
const url = `https://graph.facebook.com/v21.0/${cfg.pixel_id}/events?access_token=${encodeURIComponent(cfg.access_token)}`;

for (const valor of [0, 1, 99.9]) {
  const payload = {
    data: [{
      event_name: 'Purchase',
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'system_generated',
      user_data: { ph: [ph] },
      custom_data: { currency: 'BRL', value: valor },
    }],
  };
  if (cfg.test_event_code) payload.test_event_code = cfg.test_event_code;
  const r = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const txt = await r.text();
  const marca = r.ok ? 'OK   ' : 'FALHA';
  let detalhe = '';
  if (!r.ok) { try { detalhe = `: ${JSON.parse(txt).error?.error_user_msg ?? txt}`; } catch { detalhe = `: ${txt}`; } }
  console.log(`${marca} Purchase value=${valor} -> HTTP ${r.status}${detalhe}`);
}
