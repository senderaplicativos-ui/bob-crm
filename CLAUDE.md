# Bob CRM — instruções do projeto

## Conta GitHub

Este projeto **sempre** usa a conta `senderaplicativos-ui`.

- Repositório oficial: https://github.com/senderaplicativos-ui/bob-crm
- Nunca usar a conta antiga `AnderSetorC` (remote original: `wa-relationship-manager`, sem acesso).
- Ao criar novos remotes, PRs ou clones, assumir `senderaplicativos-ui` como owner.

## Segredos

- `.env` nunca vai para o repositório. Se aparecer como rastreado (`git ls-files`), remover do índice antes de commitar.
- Segredos do projeto: `MONGODB_URI`, `API_TOKEN`, `VITE_API_TOKEN`.
