---
type: project
created: 2026-09-22
updated: 2026-09-22
---

# Diretrizes Defuddle (Extração Limpa da Web)

Regra e prática para ingestão de páginas da web e documentação externa no projeto:

## Regra de Uso
- Sempre que for necessário consultar páginas web, documentações ou artigos via URL, priorizar o uso do **Defuddle** (`defuddle parse <url> --md` ou biblioteca) em vez de capturar HTML bruto.
- **Objetivo**: Extrair apenas o conteúdo central em Markdown, eliminando anúncios, menus, rodapés e barras laterais.
- **Benefício**: Reduz drasticamente o consumo de tokens na janela de contexto do agente e evita ruídos que possam induzir a erros ou distrair o modelo.
