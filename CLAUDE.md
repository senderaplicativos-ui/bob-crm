# Bob CRM — instruções do projeto

## Conta GitHub

Este projeto **sempre** usa a conta `senderaplicativos-ui`.

- Repositório oficial: https://github.com/senderaplicativos-ui/bob-crm
- Nunca usar a conta antiga `AnderSetorC` (remote original: `wa-relationship-manager`, sem acesso).
- Ao criar novos remotes, PRs ou clones, assumir `senderaplicativos-ui` como owner.

## Segredos

- `.env` nunca vai para o repositório. Se aparecer como rastreado (`git ls-files`), remover do índice antes de commitar.
- Segredos do projeto: `MONGODB_URI`, `API_TOKEN`, `VITE_API_TOKEN`.

## Onde paramos (última sessão: 2026-09-20)

Estado: correção da aba Meta Pixel commitada e **já enviada ao GitHub** (`e404f4d` está em `origin/main`). A Vercel deve ter feito o deploy automático.

### Meta Pixel — o que foi resolvido

O problema era HTTP 400/422 em todo evento enviado à API de Conversões da Meta. Causa raiz: o código usava `action_source: "business_messaging"`, que é o modo para anúncios de clique-para-WhatsApp e exige uma cadeia de campos que o CRM não tem (`messaging_channel` → `page_id` → `ctwa_clid`) além de restringir os nomes de evento (só `LeadSubmitted`/`Purchase`, rejeitando `Contact` com 422).

Decisão (confirmada pelo usuário): trocar para **`action_source: "system_generated"`**, que é o modo correto — o CRM dispara o evento na mudança de estágio do funil, não no clique do anúncio. Dispensa `page_id`, `ctwa_clid`, `messaging_channel` e aceita os nomes de evento padrão.

Trade-off aceito: `system_generated` reativa o pixel e faz os eventos serem aceitos, mas **não atribui a conversão ao anúncio específico** de clique-para-WhatsApp (isso exigiria capturar `ctwa_clid` do referral da primeira mensagem, que o CRM não coleta hoje). Para evoluir a atribuição por anúncio no futuro: capturar `ctwa_clid` no webhook da Evolution e aí sim usar `business_messaging`.

Arquivos alterados (commit `e404f4d` no branch `main-limpo`):

- `api/_lib/meta.ts` — `action_source` agora é `system_generated`; removidos `messaging_channel`, a normalização forçada para `LeadSubmitted` e a validação que barrava nomes de evento com 422.
- `src/pages/MetaPixel.tsx` — restaurada a lista completa de eventos padrão (`META_EVENTS`: Lead, Contact, Purchase, Schedule, etc.) e ajustado o texto de ajuda.

### Git

- Remote `origin` = `https://github.com/senderaplicativos-ui/bob-crm.git`.
- Branch local ativo: `main-limpo`, rastreando `origin/main`, em sincronia (o `e404f4d` já está no remoto).
- Push exige refspec explícito, porque o nome local difere do upstream: `git push origin HEAD:main`.
- `historico-antigo` = backup local dos 177 commits originais. **Só existe nesta máquina**, nunca foi enviado ao GitHub. Não apagar sem pensar.
- `main` = branch antigo, também só local.
- `.env` continua fora do índice (só `.env.example` é rastreado). Valores reais seguem no disco.
- Obs. de ambiente: o mount Plan9/Windows gera warnings de "unable to unlink .git/*.lock / tmp_obj" e churn de CRLF (~120 arquivos aparecem como modificados sem mudança real). Commitar arquivos específicos por nome e usar `git diff -w` para conferir a mudança real.

### Próximos passos

1. Na aba Meta Pixel, revisar o mapeamento de estágios (pode reapontar para "Lead"/"Contact" agora que voltaram a ser válidos).
2. Alinhar o `test_event_code`: BOB CRM estava com `TEST70484`, a Meta esperava `TEST22117`. Usar o código do Gerenciador de Eventos > Testar eventos, ou deixar em branco para tráfego real.
3. Mudar um lead de estágio e conferir no "Histórico de Disparos" se o status volta **200**.
4. Rodar `npm install` + build + testes. O README avisa que **nunca foram executados** — ainda pendente.
5. Revogar as chaves antigas do Supabase (`VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL`) expostas no histórico do repo anterior. Risco baixo (projeto já saiu do Supabase), mas é a limpeza correta.
