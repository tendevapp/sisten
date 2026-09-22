---
type: project
created: 2026-05-25
updated: 2026-05-25
---

# Convenções do Projeto

## Fluxo de Trabalho do Git
- Sempre crie uma nova branch dedicada para alterações de código importantes.
- O formato do nome da branch deve seguir: `feature/[task-slug]` ou `fix/[bug-slug]`.

## Padrões de Código e Comportamento
- Seguir as Karpathy Guidelines (`karpathy-guidelines.md` e skill `@[karpathy-guidelines]`):
  1. Pense antes de codificar (suposições explícitas, tire dúvidas).
  2. Simplicidade em primeiro lugar (zero superengenharia/código especulativo).
  3. Alterações cirúrgicas (altere estritamente o solicitado, sem reformas paralelas).
  4. Execução orientada a metas verificáveis.
- Comunicação concisa e sem enrolação seguindo o padrão Caveman (`caveman.md` e skill `@[caveman]`).
- Para leitura e ingestão de páginas da web e documentação, preferir Defuddle (`defuddle.md` e skill `@[defuddle]`) para extrair Markdown limpo e poupar tokens.
- Sempre que houver novas funções importantes ou alteração de regras de negócio, consolidar e atualizar o histórico de versões em `diretrizes.ts` do app, sem sobrecarregar.


