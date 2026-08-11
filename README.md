# SISTEN — Sistema de Informação TEN

Plataforma web interna da **Torres Eólicas do Nordeste S.A.** (Jacobina/BA) para gestão de
suprimentos: solicitações de compra, aprovações, catálogo SAP, contratos, contas a pagar,
rastreio de compras, almoxarifado e helpdesk.

## Stack

| Camada | Tecnologia |
| --- | --- |
| UI | React 19 + TypeScript, Tailwind CSS 4, Recharts, lucide-react, motion |
| Build | Vite 6 |
| Backend | Supabase (Postgres 17, Auth, Storage, Edge Functions) |
| Cache local | IndexedDB via `idb-keyval` |
| Testes | Vitest |

Não há framework de roteamento: o roteamento é próprio, baseado em `window.location.hash`
(ver [src/App.tsx](src/App.tsx)).

## Estrutura

```
src/
  App.tsx              Roteador hash, gate de rotas, layout e ciclo de sessão
  main.tsx             Bootstrap do React
  types.ts             Tipos de domínio compartilhados
  db/
    supabaseClient.ts  Cliente Supabase (singleton)
    localDb.ts         Camada de acesso a dados + cache IndexedDB
  lib/                 Regras de negócio puras e utilitários (alvo dos testes)
  views/               Uma tela por rota (carregadas via lazy import)
  components/          Componentes de UI, agrupados por domínio
  styles/tokens.css    Tokens de design (cores, espaçamento, tipografia)

db/sql/                Scripts SQL versionados do Postgres
  tables/  views/  functions/  alters/  data/

supabase/functions/    Edge Functions (Deno)
docs/                  Especificações de design e planos de implementação
public/                Assets estáticos servidos na raiz
```

## Como rodar

**Pré-requisitos:** Node.js 20+.

```bash
npm install
cp .env.example .env    # preencha as variáveis
npm run dev             # http://localhost:3000
```

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento na porta 3000 |
| `npm run build` | Build de produção em `dist/` |
| `npm run preview` | Serve o build de produção localmente |
| `npm run lint` | Checagem de tipos (`tsc --noEmit`) |
| `npm test` | Suíte de testes (Vitest) |
| `npm run check` | `lint` + `test` — rode antes de commitar |

## Variáveis de ambiente

Ver [.env.example](.env.example). Toda variável com prefixo `VITE_` é **embutida no
bundle JavaScript e fica pública** — nunca coloque segredo de servidor sob esse prefixo.

## Banco de dados

Os scripts em `db/sql/` documentam o schema aplicado no projeto Supabase, organizados por
tipo de objeto. Ver [db/README.md](db/README.md).
