---
name: defuddle
description: Extract clean Markdown from web pages using Defuddle CLI/library. Eliminates ads, navigation, noise, headers, and footers, drastically reducing token usage when reading web content.
---

# Defuddle

Extração de conteúdo limpo e legível em Markdown a partir de páginas web. Preferir ao invés de ferramentas genéricas de captura bruta de HTML para reduzir drasticamente o uso de tokens e eliminar ruídos (menus, propagandas, rodapés e barras laterais).

Caso não esteja instalado globalmente:
```bash
npm install -g defuddle
```

## Uso

Sempre utilize a flag `--md` para obter saída direta em Markdown:

```bash
defuddle parse <url> --md
```

Salvar diretamente em arquivo:

```bash
defuddle parse <url> --md -o content.md
```

Extrair metadados específicos:

```bash
defuddle parse <url> -p title
defuddle parse <url> -p description
defuddle parse <url> -p domain
```

## Formatos de Saída

| Flag | Formato |
|------|---------|
| `--md` | Markdown limpo e padronizado (padrão recomendado) |
| `--json` | JSON contendo tanto HTML limpo quanto Markdown e metadados |
| (nenhuma) | HTML limpo |
| `-p <nome>` | Propriedade específica de metadado (ex: title, description) |

## Integração em Scripts / Node.js

```typescript
import Defuddle from 'defuddle';

const defuddle = new Defuddle(document, { markdown: true });
const result = defuddle.parse();
console.log(result.content);
```
