// Redirect público de links rastreáveis.
//
// O cliente clica num link de anúncio (/go/<instancia>?s=...&c=...&a=...&t=...),
// este endpoint registra o clique em cliques_rastreavel, incrementa o contador
// do link correspondente e redireciona para o WhatsApp da empresa
// (wa.me/<telefone>?text=<mensagem>).
//
// É PÚBLICO de propósito (não exige token): quem clica é o cliente final, que
// não tem como mandar header. Só faz leitura/gravação de clique, nada sensível.
//
// A URL bonita /go/<instancia> chega aqui via rewrite no vercel.json:
//   { "source": "/go/:name", "destination": "/api/go?i=:name" }

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "./_lib/mongo";
import { randomUUID } from "crypto";

function nowIso() {
  return new Date().toISOString();
}

// Só dígitos: wa.me exige o número no formato internacional sem símbolos.
function onlyDigits(v: string): string {
  return (v || "").replace(/\D/g, "");
}

function firstStr(v: unknown): string {
  if (Array.isArray(v)) return typeof v[0] === "string" ? v[0] : "";
  return typeof v === "string" ? v : "";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: { message: "Method not allowed" } });
    return;
  }

  const instanceName = firstStr(req.query.i) || firstStr(req.query.instance);
  const source = firstStr(req.query.s) || firstStr(req.query.source) || null;
  const campaign = firstStr(req.query.c) || firstStr(req.query.campaign) || null;
  const ad = firstStr(req.query.a) || firstStr(req.query.ad) || null;
  const texto = firstStr(req.query.t) || firstStr(req.query.text) || "";

  if (!instanceName) {
    res.status(400).send("Link inválido: instância não informada.");
    return;
  }

  try {
    const db = await getDb();

    // Resolve a instância pelo nome da Evolution.
    const inst = await db
      .collection("instancias")
      .findOne({ evolution_instance_name: instanceName });

    if (!inst) {
      res.status(404).send("Instância não encontrada.");
      return;
    }

    const telefone = onlyDigits((inst.telefone_conectado as string) || "");

    // Registra o clique (não bloqueia o redirect se algo falhar).
    try {
      const clickId = randomUUID();
      await db.collection("cliques_rastreavel").insertOne({
        id: clickId,
        click_id: clickId,
        instancia_id: inst.id ?? null,
        source,
        campaign,
        ad,
        telefone_destino: telefone || null,
        conversa_id: null,
        usado: false,
        criado_em: nowIso(),
      });

      // Incrementa o contador do link correspondente (match por source/campaign/ad).
      const linkFilter: Record<string, unknown> = { instancia_id: inst.id };
      if (source) linkFilter.source = source;
      if (campaign) linkFilter.campaign = campaign;
      if (ad) linkFilter.ad = ad;
      await db
        .collection("links_rastreavel")
        .updateMany(linkFilter, { $inc: { cliques: 1 } });
    } catch {
      // Ignora falha de tracking — o importante é levar o cliente ao WhatsApp.
    }

    // Monta o destino. Sem telefone conectado, cai no wa.me genérico com o texto.
    const encoded = texto ? `?text=${encodeURIComponent(texto)}` : "";
    const destino = telefone
      ? `https://wa.me/${telefone}${encoded}`
      : `https://wa.me/${encoded}`;

    res.setHeader("Cache-Control", "no-store");
    res.redirect(302, destino);
  } catch (err) {
    // Em erro de banco, tenta ao menos não deixar o cliente na mão.
    res.status(500).send("Erro ao processar o link. Tente novamente.");
  }
}
