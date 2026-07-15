# Plano: Suprimentos → Fornecedores (Consulta de Fornecedores por Material)

Nova página em **Suprimentos → Fornecedores** onde o usuário cola uma lista de códigos de
material e recebe, para cada material, a lista de fornecedores únicos que já forneceram
aquele item (histórico de pedidos), enriquecida com dados de contato. Suporta exportação
para XLSX.

---

## 1. Novas tabelas no Supabase

### 1.1 `public.pedidosforn`
Histórico de pedidos por material/fornecedor, alimentado por importação de planilha.
Fonte da lista de fornecedores por material (referida no pedido original como
"pedidos_historico" — mesma finalidade, nome definitivo `pedidosforn`).

Colunas da planilha de origem → colunas da tabela:

| Coluna da planilha | Coluna da tabela   | Tipo         |
| ------------------- | ------------------ | ------------ |
| Material             | `material`          | `text`       |
| TxtBreve             | `txt_breve`         | `text`       |
| Cod Forn             | `cod_forn`          | `text`       |
| CNPJ                 | `cnpj`              | `text`       |
| Fornecedor           | `fornecedor`        | `text`       |
| Rg                   | `regiao_uf`         | `text`       |
| Data                 | `data_pedido`       | `date`       |

```sql
CREATE TABLE public.pedidosforn (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material TEXT NOT NULL,
  txt_breve TEXT,
  cod_forn TEXT,
  cnpj TEXT,
  fornecedor TEXT,
  regiao_uf TEXT,
  data_pedido DATE,
  campos_extras JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pedidosforn_material ON public.pedidosforn (material);
CREATE INDEX idx_pedidosforn_cnpj ON public.pedidosforn (cnpj);

ALTER TABLE public.pedidosforn ENABLE ROW LEVEL SECURITY;
```

Chave única composta `(material, cod_forn, data_pedido)` para permitir `upsert` idempotente
em recargas da mesma planilha (evita duplicar histórico quando a mesma base é reimportada):

```sql
ALTER TABLE public.pedidosforn
  ADD CONSTRAINT pedidosforn_unique_key UNIQUE (material, cod_forn, data_pedido);
```

### 1.2 `public.contatos`
Contatos e classificação por fornecedor, alimentado por importação de planilha.

| Coluna da planilha | Coluna da tabela   | Tipo    |
| -------------------- | ------------------- | ------- |
| N° VENDOR             | `cod_vendor`         | `text`  |
| FORNECEDORES          | `fornecedor`          | `text`  |
| NOME FANTASIA         | `nome_fantasia`      | `text`  |
| TELEFONE               | `telefone`             | `text`  |
| E-MAIL                 | `email`                | `text`  |
| CLASSIFICAÇÃO          | `classificacao`        | `text`  |

```sql
CREATE TABLE public.contatos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cod_vendor TEXT UNIQUE,
  fornecedor TEXT,
  nome_fantasia TEXT,
  telefone TEXT,
  email TEXT,
  classificacao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.contatos ENABLE ROW LEVEL SECURITY;
```


`cod_vendor` é único e serve de chave para `upsert` (`onConflict: 'cod_vendor'`), igual ao
padrão já usado para `materials.material_code` (`localDb.ts:1179`). O join com
`pedidosforn` é feito por `pedidosforn.cod_forn = contatos.cod_vendor` (o pedido original
citava `contatos_fornecedor`; consolidado aqui em `contatos`).

Ambas as tabelas entram no bloco de `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` do
`documentos/BD.md`, com política de leitura para usuários autenticados e escrita restrita a
`admin`/`coordenador_suprimentos`/`comprador`, seguindo o padrão de `requests` já documentado
ali.

---

## 2. Importação das planilhas

Reaproveitar o padrão de importação já usado em `AdminPanel.tsx`/`localDb.ts` para ME5A e
ZL0132:

1. UI de upload em `AdminPanel.tsx` (nova aba/seção "Importar Fornecedores", ao lado das
   existentes de materiais/SAP), usando `XLSX.read` + `XLSX.utils.sheet_to_json(ws, {header:1, defval:''})`.
2. Mapear cabeçalhos via `localDb.reconcileSchema(headers, expectedColumns)`
   (`localDb.ts:1885`), com dois novos schemas constantes: `PEDIDOSFORN_COLUMNS` e
   `CONTATOS_COLUMNS`, no mesmo formato de `ME5A_COLUMNS`/`ZL0132_COLUMNS`.
3. Duas novas funções em `localDb.ts`:
   - `importPedidosForn(rows, filename, userName)` — upsert em lotes de 50 via
     `supabase.from('pedidosforn').upsert(rows, { onConflict: 'material,cod_forn,data_pedido' })`.
   - `importContatos(rows, filename, userName)` — `supabase.from('contatos').upsert(rows, { onConflict: 'cod_vendor' })` em lotes de 50.
4. Ambas gravam um registro em `import_logs` (mesmo formato usado em `localDb.ts:2147-2165`),
   com `type: 'PEDIDOSFORN'` / `type: 'CONTATOS'`.
5. Permissão de importar: reaproveitar `sap.importar`, concedida também a `comprador` (além
   de `coordenador_suprimentos` e `admin`, que já a possui via bypass).

---

## 3. Nova página: Suprimentos → Fornecedores

### 3.1 Rota e navegação
- Rota: `/suprimentos/fornecedores`.
- `App.tsx`: novo `const SuppliersLookup = lazy(() => import('./views/SuppliersLookup'));`
  e novo `case` no switch, gated por `localDb.hasPermission(user, 'sap', 'fornecedores')`.
- `Sidebar.tsx`: novo item no grupo `SUPRIMENTOS`, mesmo formato dos existentes:
  ```js
  { label: 'Fornecedores', path: '/suprimentos/fornecedores', icon: Truck, perm: { module: 'sap', action: 'fornecedores' } },
  ```
- `localDb.ts` (`hasPermission`, linha ~891): adicionar `'sap.fornecedores'` a
  `comprador` e `coordenador_suprimentos` (todo o módulo Suprimentos fica visível para
  `admin` e `comprador`, mantendo o mesmo alcance do restante do módulo SAP).

### 3.2 Fluxo de busca (frontend)
1. Textarea onde o usuário cola os códigos de material.
2. Parse no frontend: split por regex `/[\s,;]+/`, `trim()`, remove vazios, `dedupe`
   (`Set`) preservando a ordem de digitação.
3. Botão "Buscar" dispara:
   ```ts
   const { data, error } = await supabase
     .from('pedidosforn')
     .select('*')
     .in('material', codigosParseados);
   ```
   (`.in()` é o equivalente do `WHERE codigo = ANY($1)` no client do Supabase — ainda não
   usado em nenhum lugar do `localDb.ts`; será o primeiro uso desse operador no projeto).
4. Códigos colados que não retornam nenhuma linha em `pedidosforn` são marcados como
   "Material não encontrado" (comparação em memória entre o array parseado e os `material`
   distintos retornados).

### 3.3 Deduplicação e enriquecimento
Para cada material, sobre as linhas de `pedidosforn` retornadas:
1. Agrupar por chave de dedupe: `cnpj` quando não vazio; senão `cod_forn` como chave
   alternativa.
2. Dentro de cada grupo, manter apenas o registro com `data_pedido` mais recente
   (ordenação decrescente).
3. Buscar em `contatos` (uma única query com `.in('cod_vendor', codsFornUnicos)` sobre todos
   os `cod_forn` de todos os materiais, para evitar N chamadas) e fazer o join em memória por
   `cod_forn === cod_vendor`.
4. Campos de contato ausentes (`telefone`, `email`, `classificacao` vazios/null) exibidos
   como `"—"` na UI.

### 3.4 UI — Seções expansíveis por material
Um componente `<details>`/accordion por material buscado, na ordem em que foi colado:
- Cabeçalho: `código + descrição curta (txt_breve) + "N fornecedores únicos"`.
- Se não encontrado: cabeçalho destacado em vermelho com texto "Material não encontrado" no
  lugar da descrição/tabela.
- Corpo (quando encontrado): tabela com colunas — Cód. Forn, CNPJ, Fornecedor, UF,
  Telefone, E-mail, Classificação, Última Data.
- Reaproveitar estilo de tabela/accordion já usado em `SapPanel.tsx`/`Reports.tsx` para
  manter consistência visual (dark mode incluso, via classes Tailwind existentes no
  projeto).

### 3.5 Exportação XLSX
Botão "Exportar Excel", mesmo padrão de `SapPanel.tsx:660-720`:
1. Percorrer todos os materiais buscados (inclusive os "não encontrados", opcionalmente em
   aba/observação separada — a confirmar).
2. Montar `dataToExport` como array de objetos com colunas: Código, Descrição, Texto
   Técnico, Cód. Forn, CNPJ, Fornecedor, UF, Telefone, E-mail, Classificação, Última Data.
   Texto técnico do material vem de `public.materials.technical_text`, via join adicional por
   `material_code` (query `supabase.from('materials').select('material_code,technical_text').in('material_code', codigosParseados)`,
   feita uma única vez para todos os materiais buscados).
3. `XLSX.utils.json_to_sheet` → `XLSX.utils.book_new()` →
   `XLSX.utils.book_append_sheet(wb, ws, 'Fornecedores')` → `XLSX.writeFile(wb, filename)`
   com filename com timestamp ISO, igual ao padrão existente.

---

## 4. Novos tipos (`src/types.ts`)

```ts
export interface PedidoForn {
  id: string;
  material: string;
  txt_breve?: string;
  cod_forn?: string;
  cnpj?: string;
  fornecedor?: string;
  regiao_uf?: string;
  data_pedido?: string;
  created_at: string;
}

export interface ContatoFornecedor {
  id: string;
  cod_vendor: string;
  fornecedor?: string;
  telefone?: string;
  email?: string;
  classificacao?: string;
}

// Resultado já deduplicado/enriquecido, usado só na UI (não persistido)
export interface FornecedorMaterialRow {
  cod_forn: string;
  cnpj: string;
  fornecedor: string;
  regiao_uf: string;
  telefone: string;
  email: string;
  classificacao: string;
  ultima_data: string;
}

export interface MaterialFornecedoresGroup {
  codigo: string;
  descricao?: string;         // txt_breve
  encontrado: boolean;
  fornecedores: FornecedorMaterialRow[];
}
```

---

## 5. Decisões confirmadas
1. `pedidosforn` usa upsert por chave composta `(material, cod_forn, data_pedido)` —
   recargas da mesma planilha não duplicam histórico.
2. `/suprimentos/fornecedores` e a permissão de importar as duas novas planilhas seguem o
   mesmo alcance do restante do módulo Suprimentos: `admin` e `comprador` (e
   `coordenador_suprimentos`, que já tem `sap.importar`).
3. Texto técnico na exportação XLSX vem de `public.materials.technical_text` (join por
   `material_code`).

## 5.1. Ponto ainda em aberto
- Tratamento de materiais "não encontrados" na exportação XLSX (incluir linha vazia, omitir,
  ou aba separada) — decidir durante a implementação, sem impacto arquitetural.

---

## 6. Resumo dos arquivos afetados
- **Novo**: `src/views/SuppliersLookup.tsx` (página principal).
- `src/App.tsx` — nova rota lazy + case no switch.
- `src/components/Sidebar.tsx` — novo item de menu.
- `src/types.ts` — novos tipos `PedidoForn`, `ContatoFornecedor`,
  `FornecedorMaterialRow`, `MaterialFornecedoresGroup`.
- `src/db/localDb.ts` — `hasPermission` (+`sap.fornecedores`), `importPedidosForn`,
  `importContatos`, schemas `PEDIDOSFORN_COLUMNS`/`CONTATOS_COLUMNS`.
- `src/views/AdminPanel.tsx` — UI de importação das duas novas planilhas.
- `documentos/BD.md` — documentar as duas novas tabelas e políticas RLS.
- **Supabase**: criação das tabelas `pedidosforn` e `contatos` (SQL acima) + policies RLS.
