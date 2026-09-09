# Guia de Deploy — Bob CRM (MongoDB + Vercel)

Este guia leva o projeto do zero ao ar: GitHub → Vercel → variáveis de ambiente
→ seed do banco → teste → webhook da Evolution → (opcional) domínio.

Siga na ordem. Os passos marcados com ⚠️ são os que, se pulados, fazem a tela
abrir mas ficar em branco / sem dados.

---

## Visão geral do que você vai fazer

1. Subir o código pro GitHub
2. Importar o projeto na Vercel e configurar as variáveis de ambiente ⚠️
3. Fazer o primeiro deploy (`.vercel.app`)
4. Rodar o seed do MongoDB uma vez ⚠️
5. Testar o app
6. Apontar a Evolution pro webhook
7. (Depois, sem pressa) ligar um domínio próprio

---

## Pré-requisitos

- Node.js 18+ instalado no seu PC (para rodar o seed).
- Conta no GitHub.
- Conta na Vercel (pode logar com o próprio GitHub).
- A string de conexão do seu MongoDB da VPS (já está no seu `.env` local).

---

## 1) Subir o código pro GitHub

No VSCode, abra o terminal na pasta do projeto e rode:

```bash
git add .
git commit -m "Migração de Supabase para MongoDB"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/bob-crm.git
git push -u origin main
```

> Crie o repositório vazio no GitHub antes (sem README, pois já temos um) e
> troque a URL acima pela do seu repo.

**Confirme que o `.env` NÃO foi enviado.** Ele está no `.gitignore` de propósito —
contém a senha do Mongo e o token da API. No GitHub, a pasta não deve mostrar o
arquivo `.env` (só o `.env.example`).

---

## 2) Importar na Vercel + variáveis de ambiente ⚠️

1. Acesse https://vercel.com → **Add New… → Project**.
2. Selecione o repositório `bob-crm` que você acabou de enviar.
3. A Vercel detecta Vite automaticamente. **Não faça deploy ainda** — primeiro
   configure as variáveis.
4. Em **Environment Variables**, adicione (marque todas para Production,
   Preview e Development):

| Nome | Valor | Observação |
|---|---|---|
| `MONGODB_URI` | `mongodb://autochatapp07:...@5.189.151.76:27017/` | copie do seu `.env` |
| `MONGODB_DB` | `bobcrm` | nome do banco |
| `API_TOKEN` | (o token do seu `.env`) | segredo do servidor |
| `VITE_API_TOKEN` | (o MESMO valor de `API_TOKEN`) | o front envia no header |
| `VITE_API_BASE` | (deixe vazio) | mesmo domínio em produção |

> `VITE_API_TOKEN` precisa ser idêntico ao `API_TOKEN`. Os valores exatos estão
> no seu arquivo `.env` local (que não foi pro GitHub).

---

## 3) Primeiro deploy

Clique em **Deploy**. Ao terminar, a Vercel te dá uma URL tipo
`https://bob-crm.vercel.app`.

Teste rápido de que a API subiu — abra no navegador:

```
https://SEU-PROJETO.vercel.app/api/health
```

Deve responder um JSON de status. Se responder, o backend serverless está no ar.

---

## 4) Rodar o seed do MongoDB (uma vez) ⚠️

Isso cria as 11 coleções, os índices e os 4 estágios de funil padrão. Rode do
seu PC (ele acessa o Mongo da VPS pela internet):

```bash
# na pasta do projeto, com o .env preenchido
npm install
node scripts/seed.mjs
```

Deve terminar com **"Seed concluído com sucesso."**
É seguro rodar mais de uma vez — não duplica dados.

> Alternativa sem depender do `.env`: você pode passar as variáveis na hora:
> `MONGODB_URI="mongodb://..." MONGODB_DB="bobcrm" node scripts/seed.mjs`

---

## 5) Testar o app

Abra `https://SEU-PROJETO.vercel.app` e faça login com as credenciais do CRM
(as mesmas de antes, definidas em `src/contexts/AuthContext.tsx`).

Checklist do que validar:

- A tela de Funil mostra os 4 estágios (NOVO, LEAD, CONTATO, COMPROU).
- Criar uma instância/conexão em "Conexões" salva sem erro.
- O menu abre as telas sem erro de rede no console (F12 → Console/Network).

Se aparecer erro 401 nas chamadas `/api/query`, o `VITE_API_TOKEN` no build não
bate com o `API_TOKEN` do servidor — revise o passo 2 e refaça o deploy.

---

## 6) Apontar a Evolution pro webhook

No painel/config da sua Evolution API, configure o webhook para:

```
https://SEU-PROJETO.vercel.app/api/webhook-evolution
```

Eventos: **messages.upsert** (mensagens recebidas/enviadas).

Autenticação: a Evolution deve mandar o token no header. O endpoint aceita
`apikey`, `x-api-token` ou `Authorization: Bearer` — todos comparados com o
`API_TOKEN`. Se a sua Evolution não permitir header customizado, você pode
liberar temporariamente definindo `WEBHOOK_PUBLIC=true` nas variáveis da Vercel
(menos seguro; qualquer um poderia postar).

Teste: mande uma mensagem no WhatsApp da instância e veja se aparece em
"Conversas". No Compass, a coleção `mensagens` deve receber o novo documento.

---

## 7) (Depois) Ligar um domínio

Na Vercel: **Project → Settings → Domains → Add**. Aponte seu domínio ou
subdomínio (ex.: `crm.seusite.com.br`) seguindo as instruções de DNS que a
Vercel mostrar. Depois disso, atualize o webhook da Evolution para a nova URL.

---

## Resolução de problemas

| Sintoma | Causa provável | Solução |
|---|---|---|
| Telas abrem em branco / sem dados | seed não rodou | rode o passo 4 |
| Erro 401 nas chamadas da API | token divergente | `VITE_API_TOKEN` = `API_TOKEN`, refaça deploy |
| Erro 500 "API_TOKEN" | variável não configurada | configure na Vercel (passo 2) |
| `/api/health` não responde | deploy falhou | veja os logs em Vercel → Deployments |
| Timeout ao conectar no Mongo | VPS/firewall bloqueando | libere a porta 27017 pro IP da Vercel ou use IP público |
| Mensagens não chegam | webhook errado | confira URL e header do passo 6 |

---

## Lembretes de segurança

- O `.env` nunca vai pro Git (está no `.gitignore`). As credenciais vivem só no
  seu PC e nas variáveis de ambiente da Vercel.
- A API `/api/query` é protegida por token. Mesmo assim, o token do frontend
  fica visível no bundle — é uma barreira contra acesso casual, não sigilo
  absoluto. Para produção séria, considere restringir o acesso ao Mongo por IP.
- Se algum dia o token vazar, gere outro (`openssl rand -hex 32`), troque nas
  variáveis da Vercel e refaça o deploy.
