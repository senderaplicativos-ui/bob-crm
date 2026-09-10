# Bob CRM — instruções do projeto

## Conta GitHub

Este projeto **sempre** usa a conta `senderaplicativos-ui`.

- Repositório oficial: https://github.com/senderaplicativos-ui/bob-crm
- Nunca usar a conta antiga `AnderSetorC` (remote original: `wa-relationship-manager`, sem acesso).
- Ao criar novos remotes, PRs ou clones, assumir `senderaplicativos-ui` como owner.

## Segredos

- `.env` nunca vai para o repositório. Se aparecer como rastreado (`git ls-files`), remover do índice antes de commitar.
- Segredos do projeto: `MONGODB_URI`, `API_TOKEN`, `VITE_API_TOKEN`.

## Onde paramos (última sessão: 2026-09-09)

Estado: projeto publicado no GitHub com histórico limpo. Nada quebrado, nada pela metade.

Git:

- Remote `origin` = `https://github.com/senderaplicativos-ui/bob-crm.git` (o antigo `AnderSetorC/wa-relationship-manager` foi removido; ele retornava "Repository not found").
- Branch local ativo: `main-limpo`, rastreando `origin/main`, em sincronia. Remoto em `860024b`.
- `historico-antigo` = backup local dos 177 commits originais. **Só existe nesta máquina**, nunca foi enviado ao GitHub. Não apagar sem pensar.
- `main` = branch antigo, também só local.
- `.env` deixou de ser rastreado. O arquivo continua no disco com os valores reais.

Pendente de commit:

- `.claude/settings.json` está modificado e não commitado (só permissões de ferramenta, nada sensível).

Próximos passos sugeridos:

1. Rodar `npm install` e depois build e testes. O README avisa que **nunca foram executados** neste código — é o teste de fogo do projeto e ainda não foi feito.
2. Renomear o branch: `rtk git branch -m main-limpo main` (o `main` antigo precisa ser renomeado ou apagado antes).
3. Revogar as chaves antigas do Supabase (`VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL`). Elas ficaram expostas no histórico do repo anterior. Risco baixo, já que o projeto saiu do Supabase, mas é a limpeza correta.
4. Deploy conforme a seção "Deploy na Vercel" do README: importar o repo, configurar `MONGODB_URI`, `MONGODB_DB`, `API_TOKEN`, `VITE_API_TOKEN` (deixar `VITE_API_BASE` vazio), rodar `node scripts/seed.mjs` uma vez e apontar o webhook da Evolution para `/api/webhook-evolution`.
