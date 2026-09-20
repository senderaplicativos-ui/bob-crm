# Inspetor de Vendas — plano de implementação (inspirado no Tintim / LUPA IA)

> Documento de **planejamento**. Nada aqui está implementado ainda. O objetivo é
> descrever, de forma aderente à arquitetura atual do Bob CRM, como reproduzir as
> duas capacidades que o Tintim oferece, para implantação futura.

## 1. O que o Tintim faz (referência)

Analisando o produto, ele junta **duas coisas distintas** sob a marca "Inspetor de
Vendas — Powered by LUPA IA":

1. **Rastreamento direto (pixel/tag no site).** Um script JS que o cliente instala
   nas páginas (`s.tintim.app/static/core/tintim-1.0.js`), identificado por um
   `accountCode`. Ele marca a origem do tráfego (ex.: campanhas do Google/Meta Ads)
   e amarra o clique ao lead que cai no WhatsApp. É o lado "rastrear direto o
   Google".

2. **Análise por conversa (IA).** Uma IA que lê as conversas do WhatsApp **toda
   madrugada**, encontra indícios de venda **sem depender de frase-gatilho**,
   e entrega uma lista de conversas com:
   - **Nível de Confiança** (Baixa / Média / Alta) de que houve venda;
   - filtro por **origem** (ex.: "Meta Ads");
   - ação humana: **Aprovar / Recusar / mover de etapa** ("Você decide");
   - **aprendizado contínuo** a partir das aprovações e recusas;
   - **limite mensal** de conversas analisadas (no print: 67/500).

   Essa parte "precisa de uma chave": um provedor de IA (LLM) com API key.

## 2. O que o Bob CRM já tem (base reaproveitável)

A boa notícia é que os dois "ossos" já existem no código:

| Capacidade Tintim | Já existe no Bob CRM | Onde |
|---|---|---|
| Rastreamento de origem por link | Links rastreáveis `/go/<instancia>?s=&c=&a=&t=` | `api/go.ts`, `src/pages/Links.tsx`, coleções `links_rastreavel` e `cliques_rastreavel` |
| Origem/Status por regra de texto | Regras de automação | `api/webhook-evolution.ts` (`aplicarRegras`), `src/pages/Regras.tsx`, coleção `regras` |
| Evento de conversão na mudança de estágio | Meta Conversions API | `api/_lib/meta.ts` (`dispararEvento`), coleção `log_eventos_meta` |
| Ingestão de todas as mensagens | Webhook da Evolution | `api/webhook-evolution.ts`, coleções `conversas` e `mensagens` |

Ou seja: **não partimos do zero**. Falta fechar o elo do rastreamento e adicionar a
camada de IA por cima das conversas que já estão no Mongo.

## 3. Parte A — Rastrear direto (Google/Meta → conversa)

### 3.0. Como a origem é definida HOJE (e por que é frágil)

Hoje o Bob CRM **não rastreia** a origem de verdade na maioria dos casos: ele
**adivinha por palavra-chave**. Existe uma regra de ORIGEM (tela Regras) que casa a
palavra `orçamento` e carimba `GOOGLE` na conversa. Como a mensagem do botão do site
do cliente é "Oi tudo bem? Tem disponibilidade de fazer um orçamento?", a palavra
"orçamento" casa e o lead aparece como GOOGLE.

Isso é um **chute**, não rastreamento:

- Qualquer lead que escreva "orçamento" — venha do Instagram, indicação, o que for —
  é marcado como GOOGLE.
- Se o texto do botão mudar, para de funcionar.
- Não há como saber a campanha, o anúncio ou a palavra-chave que trouxe o lead.

O código que faz isso é `aplicarRegras` em `api/webhook-evolution.ts` + as regras da
tela `src/pages/Regras.tsx` (a palavra que casou vem grifada por `findRuleMatches` em
`ConversationDetail.tsx`, daí o "→ GOOGLE" destacado na mensagem).

### 3.1. O que já existe de rastreamento REAL

O único rastreamento verdadeiro que o Bob CRM já tem são os **Links Rastreáveis**:

- `api/go.ts` registra cada clique em `cliques_rastreavel` com `source`, `campaign`,
  `ad` e redireciona para `wa.me/<telefone>?text=<mensagem>`.
- `src/pages/Links.tsx` monta o link `/go/<instancia>?s=&c=&a=&t=`.

Ou seja: se o clique passar por um link `/go/...`, a origem é **real** (a pessoa
passou pelo link). O que **falta** é ligar esse clique à conversa que nasce dele —
hoje `conversa_id` fica sempre `null` no registro do clique.

### 3.2. Cenário real do cliente: site com botão + Google Ads (rede de pesquisa)

O caso concreto: o anúncio do Google Ads (pesquisa) leva a pessoa a um **site**, e no
site há um **botão de WhatsApp com a mensagem já preenchida**. Como existe uma página
no meio, dá pra rastrear de verdade. Duas opções, da mais simples à mais completa.

#### Opção 1 — Botão do site aponta para o link rastreável (simples)

Trocar o destino do botão do site: em vez de `wa.me/<numero>?text=...`, apontar para
`https://SEU-DOMINIO/go/<instancia>?s=google_ads&t=<mensagem>`.

- Ganho: a origem passa a ser **real** (`google_ads`), sem depender da palavra
  "orçamento". O clique já é gravado em `cliques_rastreavel`.
- Limite: você sabe que "veio do Google Ads", mas não de qual campanha/palavra-chave —
  a menos que crie um link por campanha (`?c=marca`, `?c=institucional`, etc.).
- Falta implementar: só o **elo clique→conversa** (3.3).

#### Opção 2 — Pixel no site capturando o `gclid` (completo, = Tintim)

Um JS leve na página do cliente que:

- lê o `gclid` que o Google Ads anexa à URL de destino (`?gclid=...`), e também
  `utm_source`, `utm_campaign`, `utm_term`, `utm_content`;
- injeta esses valores no botão de WhatsApp — seja apontando para
  `/go/<instancia>?s=google_ads&c=<utm_campaign>&a=<gclid>&t=...`, seja embutindo um
  `tracking_code` curto no texto (ver 3.3);
- assim o **`gclid` real** chega ao Bob CRM.

Ganho: identifica campanha, anúncio e palavra-chave, e abre caminho para **enviar a
conversão de volta ao Google Ads** (Offline Conversion Import / Enhanced Conversions
for Leads) quando o lead vira venda — é o ciclo que fecha a otimização de campanha de
rede de pesquisa. É o equivalente funcional do `tintim-1.0.js`.

Custo: exige colocar o JS no site do cliente e capturar/guardar o `gclid` no webhook.

> **Recomendação:** começar pela **Opção 1** (rastreamento real imediato, quase sem
> código novo) e evoluir para a **Opção 2** quando quiser atribuição por
> campanha/palavra-chave e conversão offline no Google Ads.

### 3.3. O elo que falta: casar clique → conversa

Vale para as duas opções. O truque é o **texto pré-preenchido** do `wa.me`. Embutir um
código curto de rastreio na mensagem (`t=`), por exemplo:

```
Oi tudo bem? Tem disponibilidade de fazer um orçamento? [#a1b2c3]
```

Fluxo proposto:

1. Em `go.ts`, ao gravar o clique, gerar um `tracking_code` curto (6-8 chars) e
   incluí-lo tanto no documento de `cliques_rastreavel` quanto no texto do `wa.me`
   (guardar também o `gclid`/`utm_*` no clique, quando vierem — Opção 2).
2. No `webhook-evolution.ts`, ao receber a **primeira mensagem** de uma conversa,
   procurar um `tracking_code` no texto (regex simples). Se achar, buscar o clique
   correspondente **não usado** e:
   - gravar `origem`, `campaign`, `ad` (e `gclid`) na conversa;
   - marcar o clique como `usado: true` e preencher seu `conversa_id`.
3. Alternativa/complemento sem poluir o texto: casar por **janela de tempo +
   telefone destino** (clique recente na mesma instância cujo `telefone_destino`
   bate), útil quando o cliente apaga o texto pré-preenchido.

Feito isso, a regra de palavra "orçamento → GOOGLE" pode ser **aposentada** para o
tráfego que passa pelo link (fica só como reserva para quem chega sem passar por ele).

### 3.4. Nota sobre atribuição por anúncio (Meta / clique-para-WhatsApp)

> Para o caso de anúncio de **clique-para-WhatsApp** (sem site no meio), atribuir a
> conversão ao anúncio específico exigiria capturar o `ctwa_clid` do *referral* da
> primeira mensagem (hoje não coletado) e usar `action_source: "business_messaging"`.
> Está fora do escopo desta fase — ver `CLAUDE.md`, decisão do `system_generated`.
> No cenário do cliente (Google Ads de pesquisa com site + botão) isso **não se
> aplica**: ali o caminho certo é o `gclid` da Opção 2.

## 4. Parte B — Análise por conversa (IA) — "precisa de uma chave"

Este é o coração do "Inspetor de Vendas". A ideia: um processo periódico lê as
conversas, pede a um LLM para julgar se houve venda, grava o veredito com um nível de
confiança e monta uma **fila de revisão** onde o usuário aprova ou recusa.

### 4.1. A chave (segredo, nunca hardcoded)

Precisa de uma API key de um provedor de IA. Seguindo as regras do projeto
(`CLAUDE.md`: segredos só via env, `.env` fora do repositório):

| Env var | Uso | Onde |
|---|---|---|
| `AI_API_KEY` | chave do provedor de LLM | Backend (segredo) |
| `AI_PROVIDER` | ex.: `openai`, `anthropic`, `google` | Backend |
| `AI_MODEL` | modelo (ex.: um modelo econômico para classificação) | Backend |
| `INSPETOR_LIMITE_MENSAL` | teto de conversas analisadas/mês (ex.: 500) | Backend |

Adicionar essas linhas ao `.env.example` (sem valores). **Nunca** commitar a chave
real. O `accountCode`/Token do Tintim que apareceram nos prints são credenciais
reais — não devem entrar em nenhum arquivo versionado.

### 4.2. Nova coleção: `analises_venda`

Um documento por conversa analisada:

```jsonc
{
  "id": "uuid",
  "conversa_id": "uuid",
  "instancia_id": "uuid",
  "veredito": "venda" | "sem_venda" | "incerto",
  "confianca": 0.0-1.0,          // nível de confiança do LLM
  "nivel": "baixa" | "media" | "alta",
  "evidencias": ["trechos citados pelo modelo"],
  "valor_estimado": 0,            // opcional, se o modelo inferir
  "origem": "Meta Ads",           // herdado da conversa (para o filtro)
  "status_revisao": "pendente" | "aprovado" | "recusado",
  "revisado_por": null,
  "revisado_em": null,
  "modelo": "AI_MODEL usado",
  "analisado_em": "iso",
  "hash_conversa": "sha256 das mensagens"  // evita reanalisar sem mudança
}
```

Índices sugeridos: `conversa_id` (único), `status_revisao`, `instancia_id`,
`analisado_em`.

### 4.3. O job noturno

Como o Bob CRM roda na Vercel, o caminho natural é um **Vercel Cron** apontando para
um novo endpoint `api/inspetor-cron.ts` (proteger com o `API_TOKEN`, igual aos
demais). Em `vercel.json`:

```jsonc
{
  "crons": [
    { "path": "/api/inspetor-cron", "schedule": "0 6 * * *" }  // 06:00 UTC ≈ madrugada BR
  ]
}
```

Lógica do endpoint:

1. Selecionar conversas candidatas: com atividade nas últimas 24-48h, ainda sem
   análise atual (comparar `hash_conversa`), respeitando `INSPETOR_LIMITE_MENSAL`.
2. Para cada conversa, montar o histórico de `mensagens` (ordenado, com `direcao`).
3. Chamar o LLM com um **prompt de classificação** estruturado (ver 4.4), pedindo
   saída **JSON** (veredito, confiança, evidências, valor estimado).
4. Gravar em `analises_venda` com `status_revisao: "pendente"`.
5. Contabilizar o uso mensal (para o "67/500").

> Atenção ao tempo limite das funções serverless: processar em **lotes** e, se o
> volume crescer, paginar entre execuções (marca de progresso) em vez de tudo numa
> invocação.

### 4.4. Prompt de classificação (rascunho)

Sistema: "Você analisa conversas de WhatsApp de um negócio e decide se houve **venda
concluída**. Não invente. Baseie-se só nas mensagens. Responda em JSON."

Entrada: histórico da conversa (quem falou, texto, timestamp).

Saída esperada (JSON):

```json
{
  "veredito": "venda|sem_venda|incerto",
  "confianca": 0.0,
  "evidencias": ["cliente confirmou pagamento", "..."],
  "valor_estimado": 0
}
```

Mapear `confianca` → `nivel` (ex.: <0.4 baixa, 0.4-0.75 média, >0.75 alta), como no
Tintim.

### 4.5. Aprendizado contínuo

O Tintim "aprende" com aprovações/recusas. Sem re-treinar modelo, dá pra fazer
**few-shot dinâmico**: guardar exemplos recentes de conversas aprovadas/recusadas e
injetá-los no prompt como referência. Cada aprovação/recusa vira um exemplo rotulado
em `analises_venda`; o job seleciona alguns como few-shot. Evolução futura possível:
fine-tuning, se o provedor suportar.

## 5. Parte C — Tela "Inspetor de Vendas" (frontend)

Nova página `src/pages/Inspetor.tsx` (rota + item de menu), espelhando a UX do print:

- Lista de conversas analisadas com **nível de confiança** (badge Baixa/Média/Alta),
  trecho de evidência e origem.
- **Filtro por origem** (Meta Ads, Google, orgânico...) e por nível/status.
- Ações por item: **Aprovar**, **Recusar**, **Mover de etapa** (reusa o funil
  existente — ao aprovar, pode disparar o evento da Meta via `dispararEvento`,
  fechando o ciclo com o que já existe).
- Indicador de uso: **X / limite** conversas analisadas no mês.
- Tudo via o shim `supabase.from('analises_venda')` → `/api/query` (o tradutor já
  suporta select/update com filtros), sem novo backend de leitura.

### 5.1. Fechando o ciclo com a Meta

Quando o usuário **aprova** uma venda na tela, é o gatilho de maior confiança que
existe (humano confirmou). Nesse momento vale disparar o evento `Purchase` (ou o que
estiver mapeado) via `dispararEvento`, com o `valor_estimado` como `value`. Assim a
IA vira também uma fonte de conversões qualificadas para a Meta.

## 6. Ordem de implantação sugerida

1. **Parte A (elo clique→conversa)** — menor risco, reaproveita `go.ts` +
   webhook. Entrega rastreamento de origem confiável.
2. **Coleção `analises_venda` + tela em modo leitura** — estrutura de dados e UI.
3. **Job de IA (`inspetor-cron`)** — atrás da chave; começar com limite baixo e
   poucas conversas para validar custo/qualidade.
4. **Ações de revisão + disparo Meta na aprovação.**
5. **Few-shot / aprendizado contínuo.**

## 7. Riscos e cuidados

- **Custo de LLM:** cada conversa é uma chamada. O limite mensal e o `hash_conversa`
  (não reanalisar o que não mudou) são as travas de custo.
- **Privacidade:** as conversas vão para um provedor externo de IA. Deixar isso
  explícito para o cliente e, se possível, escolher provedor/modelo com política de
  não-treinamento sobre os dados enviados.
- **Tempo das funções serverless:** processar em lotes; não estourar o limite.
- **Segredos:** `AI_API_KEY` só em env; jamais no repositório (regra do `CLAUDE.md`).
- **Falso positivo:** por isso a etapa é **sugestão + aprovação humana**, nunca
  marca venda sozinha.

## 8. Resumo de mudanças previstas (para quando for implementar)

- `api/go.ts` — gerar/gravar `tracking_code`, incluir no texto do `wa.me`.
- `api/webhook-evolution.ts` — casar `tracking_code`/janela+telefone e preencher
  origem + `conversa_id` do clique.
- `api/inspetor-cron.ts` — **novo**: job noturno de análise por IA.
- `api/_lib/ai.ts` — **novo**: cliente do provedor de IA (lê `AI_*`).
- `vercel.json` — entrada de `crons`.
- `scripts/seed.mjs` — criar coleção/índices de `analises_venda`.
- `src/pages/Inspetor.tsx` + rota/menu — **nova** tela de revisão.
- `.env.example` — `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `INSPETOR_LIMITE_MENSAL`.
