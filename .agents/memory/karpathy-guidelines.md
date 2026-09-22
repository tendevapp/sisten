---
type: project
created: 2026-09-22
updated: 2026-09-22
---

# Diretrizes Karpathy (Karpathy Guidelines)

Diretrizes comportamentais para evitar vícios e erros comuns de LLMs em engenharia de software (baseadas nas observações de Andrej Karpathy):

## 1. Pense Antes de Codificar (Think Before Coding)
- **Não presuma. Não esconda dúvidas. Exponha tradeoffs.**
- Explicite suposições antes de implementar. Em caso de dúvida, pergunte.
- Se houver múltiplas interpretações, apresente-as — não escolha silenciosamente.
- Se existir uma abordagem mais simples, avise. Questione quando apropriado.
- Se algo estiver confuso, pare imediatamente. Nomeie o ponto de confusão e tire a dúvida.

## 2. Simplicidade em Primeiro Lugar (Simplicity First)
- **Código mínimo que resolve o problema. Nada especulativo.**
- Nenhuma feature além do que foi solicitado.
- Sem abstrações desnecessárias para código de uso único.
- Sem "flexibilidade" ou "configurabilidade" prematura.
- Sem tratamento de erro convoluto para cenários impossíveis.
- Se escreveu 200 linhas quando 50 resolveriam, reescreva de forma enxuta.
- Pergunta-chave: "Um engenheiro sênior diria que isso é superengenharia?" Se sim, simplifique.

## 3. Alterações Cirúrgicas (Surgical Changes)
- **Toque apenas no estritamente necessário. Limpe apenas o que você gerou.**
- Não "melhore" código adjacente, comentários ou formatação fora do escopo.
- Não refatore o que não está quebrado.
- Siga o estilo existente do arquivo/projeto, mesmo que tenha preferências pessoais distintas.
- Se notar código morto antigo não relacionado, aponte ao usuário, mas não remova por conta própria.
- Limpe órfãos criados pela sua alteração (imports, variáveis e funções que a sua mudança tornou inúteis).
- Teste de ouro: Toda linha alterada deve ter relação direta com a solicitação do usuário.

## 4. Execução Orientada a Metas (Goal-Driven Execution)
- **Defina critérios de sucesso verificáveis. Itere até comprovar o resultado.**
- Transforme pedidos imperativos em metas testáveis:
  - "Adicionar validação" → escrever testes para entradas inválidas e fazê-los passar.
  - "Corrigir bug" → reproduzir o bug com teste/evidência e validar que foi sanado.
  - "Refatorar X" → garantir que testes e verificações passem antes e depois.
- Para tarefas de múltiplos passos, estruture com validações:
  - `Passo 1 → verify: [checar resultado]`
  - `Passo 2 → verify: [checar resultado]`
- Sempre valide com execução real (`npx tsc --noEmit`, testes, lint, etc.) antes de concluir.
