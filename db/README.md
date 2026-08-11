# Banco de dados — SISTEN

Scripts SQL do projeto Supabase (`sisten`, região `sa-east-1`, Postgres 17).

## Organização

| Pasta | Conteúdo |
| --- | --- |
| `sql/tables/` | `CREATE TABLE` + índices + políticas de RLS da tabela |
| `sql/views/` | Views e materialized views analíticas |
| `sql/functions/` | Funções e RPCs expostas via PostgREST |
| `sql/alters/` | Alterações incrementais de schema (`ALTER TABLE`, novas colunas) |
| `sql/data/` | Carga inicial, correções pontuais e limpezas de dados |

Edge Functions (Deno) ficam em [`../supabase/functions/`](../supabase/functions/).

## Convenções

- Todo script deve ser **idempotente**: use `CREATE ... IF NOT EXISTS`,
  `CREATE OR REPLACE`, `DROP POLICY IF EXISTS` antes de `CREATE POLICY`.
- Toda tabela nova em `public` **precisa** de `ENABLE ROW LEVEL SECURITY` e ao
  menos uma política. Sem isso a tabela fica aberta para o papel `anon`, que é o
  papel da chave pública embutida no bundle do frontend.
- Funções `SECURITY DEFINER` devem fixar o schema: `SET search_path = public, pg_temp`.
- Conceda privilégios ao papel mínimo necessário. Prefira
  `REVOKE ALL ON <objeto> FROM anon;` quando a leitura exigir login.

## Verificação

Após aplicar mudanças de schema, rode o linter do Supabase (Dashboard >
Advisors, ou `get_advisors` via MCP) e confirme que nenhum alerta novo de
`rls_disabled_in_public`, `rls_enabled_no_policy` ou `security_definer_view`
apareceu.
