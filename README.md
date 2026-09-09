# Bob CRM — versão MongoDB

CRM de WhatsApp (integra com a Evolution API). Originalmente usava **Supabase**;
esta versão foi migrada para rodar sobre o **MongoDB** que está na VPS, mantendo
o frontend praticamente intacto.

Frontend: Vite + React 18 + TypeScript + Tailwind + shadcn/ui.
Backend: funções serverless na Vercel (pasta `api/`) que falam com o MongoDB.

---

## Como a migração funciona (visão geral)

O app inteiro usava o cliente do Supabase (`supabase.from("tabela").select()...`).
Reescrever as 21+ telas seria arriscado, então a migração foi feita por uma
**camada de compatibilidade ("shim")**:

```
Telas (sem mudança)
  └─ import { supabase } from "@/integrations/supabase/client"
       └─ src/integrations/supabase/client.ts   ← SHIM (imita a API do Supabase)
            └─ POST /api/query  (envia a consulta serializada + token)
                 └─ api/_lib/translate.ts  ← traduz para operações MongoDB
                      └─ MongoDB (VPS)
```

Ou seja: as telas continuam chamando `supabase.from(...)` como antes, mas por baixo
a consulta vira uma requisição HTTP para uma função serverless, que traduz para o
MongoDB. Nenhuma tela precisou ser reescrita.

---

## Estrutura dos arquivos novos/alterados

| Arquivo | O que é |
|---|---|
| `src/integrations/supabase/client.ts` | **Shim**. Imita a API encadeável do Supabase (`.from().select().eq().single()`...) e envia tudo para `/api/query`. Substitui o cliente antigo do Supabase. |
| `api/_lib/mongo.ts` | Conexão com o MongoDB (com cache entre invocações serverless). Lê `MONGODB_URI` e `MONGODB_DB`. |
| `api/_lib/auth.ts` | Protege a API: valida o header `x-api-token` contra a env `API_TOKEN`. Também trata CORS. |
| `api/_lib/translate.ts` | **Coração do backend**. Traduz o payload estilo PostgREST para operações MongoDB (select/insert/update/delete/upsert, filtros, order, limit, count, single). |
| `api/query.ts` | Endpoint principal (`POST /api/query`). Recebe a consulta do shim, chama o tradutor, devolve `{ data, error, count }`. |
| `api/health.ts` | Endpoint de saúde (`GET /api/health`) para testar se a API está no ar. |
| `api/webhook-evolution.ts` | Recebe os webhooks da Evolution API e salva as mensagens no Mongo (`conversas` + `mensagens`). |
| `scripts/seed.mjs` | Cria as 11 coleções, índices e os estágios de funil padrão. Rode uma vez. |
| `vercel.json` | Config de build do SPA + funções serverless na Vercel. |
| `.env.example` | Modelo das variáveis de ambiente (sem segredos). |
| `.gitignore` | Atualizado para **ignorar `.env`** (não commitar segredos). |

---

## Coleções do MongoDB (equivalem às antigas tabelas do Supabase)

Não é preciso criar nada na mão — o `scripts/seed.mjs` cria tudo. São 11 coleções:

| Coleção | Para que serve |
|---|---|
| `instancias` | conexões de WhatsApp (clientes) |
| `conversas` | cada contato/conversa |
| `mensagens` | mensagens vindas da Evolution |
| `estagios_funil` | etapas do funil (NOVO, LEAD, CONTATO, COMPROU) |
| `regras` | regras de automação |
| `links_rastreavel` | links rastreáveis |
| `cliques_rastreavel` | cliques nesses links |
| `meta_config` | config do Meta/Facebook Pixel |
| `mapeamento_eventos` | mapeamento de eventos do Meta |
| `log_eventos_meta` | histórico de eventos enviados ao Meta |
| `log_erros` | registro de erros |
| `configuracoes` | ajustes gerais do CRM |

O Mongo não exige esquema fixo: os campos de cada documento são gravados conforme
o app salva, e batem com os tipos em `src/integrations/supabase/types.ts`.
O campo `id` continua sendo um UUID em string (compatível com o que o Postgres gerava),
e o `_id` interno do Mongo é removido antes de devolver os dados ao frontend.

---

## Variáveis de ambiente

Copie `.env.example` para `.env` e preencha. **Nunca** commite o `.env`.

| Variável | Onde | O que é |
|---|---|---|
| `MONGODB_URI` | Backend (segredo) | String de conexão do Mongo na VPS: `mongodb://usuario:senha@host:27017/` |
| `MONGODB_DB` | Backend | Nome do banco (ex.: `bobcrm`) |
| `API_TOKEN` | Backend (segredo) | Token que protege a API. Gere um valor aleatório longo (`openssl rand -hex 32`). |
| `VITE_API_TOKEN` | Frontend | Mesmo valor de `API_TOKEN` (o navegador precisa enviar no header). |
| `VITE_API_BASE` | Frontend | Base da API. Em produção na Vercel, deixe **vazio** (mesmo domínio). |

> Nota de segurança: como é um SPA, o `VITE_API_TOKEN` acaba visível no bundle.
> Ele evita acesso anônimo casual à API, mas não é uma proteção forte. Se um dia
> precisar de segurança de verdade, o próximo passo seria trocar o login fake por
> autenticação real e validar sessões no backend.

---

## Rodando localmente

Requisito: Node.js 18+ e npm.

```bash
# 1. instalar dependências
npm install

# 2. criar o .env a partir do modelo e preencher os valores
cp .env.example .env
#   edite o .env com a MONGODB_URI real, MONGODB_DB=bobcrm e um API_TOKEN

# 3. criar as coleções e os estágios padrão (uma vez só; pode repetir sem duplicar)
node scripts/seed.mjs

# 4. rodar o frontend
npm run dev
```

Para testar as funções serverless localmente do mesmo jeito que rodam na Vercel,
o ideal é usar a Vercel CLI:

```bash
npm i -g vercel
vercel dev
```

---

## Deploy na Vercel (plano: GitHub → Vercel → domínio)

1. **GitHub**: suba o projeto para um repositório novo.
   ```bash
   git add .
   git commit -m "Migração do Supabase para MongoDB"
   git branch -M main
   git remote add origin <URL_DO_SEU_REPO>
   git push -u origin main
   ```
   Confira que o `.env` **não** foi para o repositório (ele está no `.gitignore`).

2. **Vercel**: importe o repositório em vercel.com (New Project → Import).
   O framework é detectado como Vite automaticamente.

3. **Variáveis de ambiente na Vercel** (Project → Settings → Environment Variables):
   adicione `MONGODB_URI`, `MONGODB_DB`, `API_TOKEN`, `VITE_API_TOKEN`.
   Deixe `VITE_API_BASE` vazio. Marque para os ambientes Production e Preview.

4. **Seed do banco**: rode o `scripts/seed.mjs` uma vez apontando para o Mongo da VPS
   (pode rodar da sua máquina, com a `MONGODB_URI` no `.env`).

5. **Deploy**: a Vercel faz o build e publica. Teste `GET https://SEU-DOMINIO/api/health`.

6. **Evolution API**: aponte o webhook da Evolution para
   `https://SEU-DOMINIO/api/webhook-evolution` e mande o `API_TOKEN` no header
   `apikey` (ou defina `WEBHOOK_PUBLIC=true` se a Evolution não enviar header custom).

7. **Domínio/subdomínio**: em Project → Settings → Domains, adicione seu domínio e
   configure o DNS conforme as instruções da Vercel.

---

## Login

O login continua simples (client-side, em `src/contexts/AuthContext.tsx`),
como era antes. As credenciais estão definidas nesse arquivo. Não é autenticação
de verdade — serve para uso próprio/interno.

---

## Pendências / o que ainda falta testar

- **Build e testes não foram rodados** no ambiente onde o código foi escrito.
  O primeiro `npm run build` / `vercel dev` vai ser o teste de fogo — rode antes de confiar.
- Confirmar o fluxo real da Evolution: o formato exato do payload do webhook pode
  variar conforme a versão; `api/webhook-evolution.ts` cobre o formato `messages.upsert`
  mais comum, mas vale conferir com um evento real.
- A gravação no Mongo já foi confirmada manualmente (usuário tem permissão de escrita).
- O serviço externo `https://whatsapp-webhook-liart.vercel.app` (usado por algumas telas
  para criar/conectar instâncias e enviar eventos ao Meta) é um **repositório separado**,
  não faz parte deste projeto.

---

## Tecnologias

Vite · React 18 · TypeScript · Tailwind · shadcn/ui · React Query · React Router ·
MongoDB (driver oficial) · Funções serverless da Vercel.
