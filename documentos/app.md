# SISTEN — Especificação Completa do Aplicativo

> **Como usar este documento:** este arquivo descreve, de ponta a ponta, o portal corporativo **SISTEN** (Torres Eólicas do Nordeste — TEN). Ele foi escrito para ser colado no Claude Code (ou outro agente) e permitir a recriação de um aplicativo **idêntico**: telas, funções, regras de negócio, RBAC, integração com Supabase e — em especial — as **lógicas de importação de dados do SAP**. Onde há regra de cálculo, ela está descrita com fórmulas e valores exatos.

---

## 1. Visão geral

O SISTEN é um portal interno de operações para uma fábrica de torres eólicas. Ele unifica quatro grandes fluxos:

1. **Solicitações** — compras de material, cadastro de item/fornecedor no SAP e chamados de helpdesk (fluxo único com "criticidade" e numeração sequencial).
2. **Suprimentos / SAP** — painel operacional das requisições (ME5A) e pedidos (ZL0132) do SAP, com enriquecimento de indicadores (atraso, alerta, lead time), dashboards, consulta de fornecedores por material e importação de planilhas.
3. **Helpdesk** — atendimento de chamados por setores de suporte (TI, Facilities, Manutenção) com SLA, transferência, avaliação de satisfação.
4. **Administração** — usuários (RBAC), setores, matriz de permissões, importação do catálogo de materiais, grupos de comprador, configuração de helpdesk.

### 1.1 Stack técnica

| Item | Escolha |
|------|---------|
| Build/dev | **Vite 6** (`npm run dev` na porta 3000) |
| UI | **React 19** + **TypeScript** |
| Estilo | **Tailwind CSS v4** (via `@tailwindcss/vite`), classes utilitárias, dark mode por classe `dark` |
| Ícones | **lucide-react** |
| Gráficos | SVG manual + **recharts** (disponível) |
| Planilhas | **xlsx** (SheetJS) para ler `.xlsx/.xls` e exportar |
| Backend | **Supabase** (`@supabase/supabase-js`) — Postgres + PostgREST |
| Cache local | **IndexedDB** via **idb-keyval** (espelho em memória síncrono) |
| Roteamento | Hash router customizado (sem react-router em uso efetivo; `window.location.hash`) |
| Datas | **date-fns** (disponível) |

Variáveis de ambiente (`.env`): `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. Se ausentes, o app funciona só com seeds/local (avisos no console).

### 1.2 Identidade visual (Design System)

```
name: SISTEN (Torres Eólicas do Nordeste)
Cor primária (marca / login):   #0056c6  (hover #004bb0)  — azul institucional
Cor de ação (app interno):      emerald-700/800/900       — verde nas ações internas
Fundo claro:  slate-50/#f1f5f9    Fundo escuro: slate-900/#0f172a
Card claro:   #ffffff             Card escuro:  #1e293b
Bordas:       slate-200 (claro) / slate-700 (escuro)
Tipografia:   Inter — título 36px/800; subtítulo 16px/400; label 14px/600
Raios:        cards rounded-3xl (24px); inputs/botões rounded-xl (12px)
```

Regras: respeitar dark mode com prefixos `dark:`; **não usar roxo** em botões/controles (diretriz de marca); layout horizontal no desktop e empilhado no mobile. Observação prática: as telas de **login/cadastro** usam a cor de marca `#0056c6`; o restante do app interno usa **emerald** como cor de ação e **slate** como neutro.

O logo do sidebar é um componente SVG (`SistenLogo`, com prop `iconOnly`). As telas de login/cadastro usam imagens em `/public`: `bg-app.png` (fundo), `logo-ten.png` (logo grande).

---

## 2. Arquitetura de dados (o coração do app)

### 2.1 Camada `localDb` (singleton `src/db/localDb.ts`)

Toda a aplicação lê e escreve através de um **singleton síncrono** `localDb`. Ele mantém um `Map` em memória (`cache`) que é o espelho do IndexedDB. Padrão essencial:

- **Leitura** `getStorageItem(key, default)` → lê do `Map` (síncrono).
- **Escrita** `setStorageItem(key, value)` → grava no `Map` imediatamente **e** persiste no IndexedDB em segundo plano (`idbSet`), sem bloquear a UI e sem a cota de ~5-10 MB do localStorage.
- **`ready: Promise<void>`** — resolve quando o cache foi populado a partir do IndexedDB (com migração única de dados legados de `localStorage`, exceto a chave `theme`). O `App.tsx` só aguarda `ready` (rápido) para o primeiro render; a sincronização com o Supabase roda em background.
- **`subscribe(cb)`** — permite à UI re-renderizar quando a sincronização em background traz dados novos.

**Chaves de armazenamento** (prefixo `sisten_`): `sectors`, `profiles`, `materials`, `requests`, `request_items`, `comments`, `history`, `notifications`, `requisicoes`, `pedidos`, `obs_history`, `import_logs`, `buyer_groups`, `activity_logs`, `favorites_<userId>`, `sequences`, `pedidos_forn`, `contatos`, `current_user`, `custom_passwords`, `notification_prefs`, `attachments`, `draft_<userId>`.

### 2.2 Sincronização com o Supabase (`syncFromSupabase`)

Chamada após o primeiro render. Cada tabela é sincronizada **em paralelo** com `Promise.allSettled` (uma falha isolada não aborta as demais). Tabelas/views sincronizadas → chave local:

| Origem Supabase | Chave local | Observação |
|---|---|---|
| `sectors` | sectors | se vazio, faz upsert dos `INITIAL_SECTORS` |
| `profiles` | profiles | mapeia `roles` para `[]` se nulo |
| `buyer_groups` | buyer_groups | |
| `materials` | materials | paginado (>1000 linhas); se vazio, semeia 200 gerados |
| `view_enriched_requisicoes` | requisicoes | view enriquecida no banco |
| `view_enriched_pedidos` | pedidos | |
| `requests`, `request_items`, `request_status_history`, `notifications`, `import_logs`, `activity_logs` | respectivas | genérico |
| `request_comments` | comments | mapeia `user_roles` |
| `obs_historico` | obs_history | `valor_novo` é JSON `{obs,date}` |
| `sequences` | sequences | mapa `{key:value}` |
| `pedidosforn` | pedidos_forn | consulta de fornecedores |
| `contatos` | contatos | contatos de fornecedores |

**Paginação obrigatória** (`fetchAllFromTable`): PostgREST limita cada `select` a ~1000 linhas. Para tabelas grandes (catálogo com 180k+ linhas) é preciso paginar com `.range(from, from+pageSize-1)` até esgotar.

> **Regra de projeto crucial:** para catálogos e requisições grandes, o cache local pode estar incompleto (cota do navegador). Portanto, telas de busca pesada (**Catálogo de Materiais**, **autocomplete de Nova Solicitação**, **Consulta de Fornecedores**) consultam o **Supabase diretamente** com `ilike`/`range`, e **não** o array em memória. As importações também buscam o estado atual direto do Supabase antes de reconciliar.

### 2.3 Roteamento (hash router em `App.tsx`)

`window.location.hash` no formato `#/caminho?query`. `handleHashChange` extrai só o path (antes do `?`). `handleNavigate(path)` seta o hash. Views são carregadas com `React.lazy` + `<Suspense>`. Login/Signup são eager.

O `<main>` usa `key={path:dataVersion}` para forçar remontagem quando novos dados chegam do background — **exceto** em `/solicitacoes/nova`, cuja remontagem destruiria o rascunho em edição.

Gate de autenticação: sem `user` → renderiza `Login` (ou `Signup` se path `/cadastro`). Cada rota protegida checa papel/permissão e cai para o Dashboard se não autorizado.

### 2.4 Mapa de rotas → view (permissão exigida)

| Path | View | Guarda |
|---|---|---|
| `/` | Dashboard | qualquer autenticado |
| `/materiais/busca` | Materials | `materiais.visualizar` |
| `/relatorios` | Reports | qualquer autenticado |
| `/solicitacoes/nova` | NewRequest | `solicitacoes.criar` |
| `/solicitacoes/minhas` | MyRequests | `solicitacoes.visualizar_proprias` |
| `/solicitacoes/aprovacoes` | Approvals | `gestor` \| `admin` \| `coordenador_suprimentos` |
| `/suprimentos/cadastros-sap` | CadastrosSap | `admin` \| `coordenador_suprimentos` \| `comprador` |
| `/suprimentos/painel` | SapPanel | `sap.visualizar_painel` |
| `/suprimentos/fornecedores` | SuppliersLookup | `sap.fornecedores` |
| `/suprimentos/dashboards` | SapDashboards | `sap.dashboards` |
| `/suprimentos/importar` + `/log` + `/grupos-comprador` | AdminPanel (aba) | `admin` \| `coordenador_suprimentos` |
| `/helpdesk` + `/helpdesk/relatorios` | Helpdesk | `atendente` \| `admin` |
| `/perfil` | ProfileView | qualquer autenticado |
| `/admin/usuarios` `/setores` `/permissoes` `/importacao-materiais` `/helpdesk` | AdminPanel (aba) | `admin` \| `coordenador_suprimentos` |

---

## 3. Modelo de domínio (tipos TypeScript)

Definidos em `src/types.ts`. Reproduza-os exatamente.

### 3.1 Papéis, status, setores, perfil

```ts
type Role = 'admin' | 'visualizador' | 'solicitante' | 'gestor'
          | 'comprador' | 'coordenador_suprimentos' | 'atendente' | 'pendente';
type UserStatus = 'pendente' | 'ativo' | 'inativo';

interface Sector { id; name; is_support: boolean; helpdesk_enabled: boolean; }
interface Profile { id; email; name; cargo; sector_id; roles: Role[]; status: UserStatus; created_at; }
interface UserBuyerGroup { id; user_id; group_code; is_primary: boolean; } // group_code: 314,358,447,575,588
interface ActivityLog { id; user_id; user_name; email; module; action; details; created_at; }
```

### 3.2 Materiais

```ts
interface Material {
  id; material_code;      // 8 dígitos
  description; technical_text?;
  category;               // auto-classificado por palavra-chave
  company: 'TEN2'|'AG'|'AMBAS';
  unit;                   // UN, KG, M, L, M2...
  is_active: boolean; created_at;
}
interface MaterialCategory { id; name; keywords: string[]; }
```

### 3.3 Motor de solicitações

```ts
type RequestType = 'compra' | 'cadastro_sap' | 'chamado';
type RequestStatus =
  'rascunho' | 'pendente' | 'aprovada' | 'rejeitada' | 'em_revisao'
| 'aberto' | 'em_atendimento' | 'aguardando_solicitante'
| 'resolvido' | 'fechado' | 'reaberto' | 'cancelada';

interface RequestItem {
  id; request_id; description; sap_code?; has_no_sap_code: boolean;
  quantity; unit; brand?; is_similar_allowed?; suggested_supplier?; estimated_value;
}
interface RequestComment { id; request_id; user_id; user_name; user_roles: Role[]; content; is_internal: boolean; created_at; }
interface RequestStatusHistory { id; request_id; from_status; to_status; user_id; user_name; comment?; created_at; }
interface RequestAttachment { id; request_id; name; url; size; created_at; }

interface Request {
  id; number;             // 7 dígitos: 1º dígito = criticidade
  type: RequestType; status: RequestStatus; criticality: number; // 1-5
  solicitante_id; solicitante_name; solicitante_sector_id; created_at; updated_at;
  data_necessidade?;      // compra (S2)
  comprador_id?; tipo_compra?: 'Estoque'|'Direta'|'Serviço'; justificativa?;
  local?; category_id?;   // helpdesk
  target_sector_id?;      // helpdesk / cadastro sap
  registration_type?: 'Item'|'Fornecedor';
  linked_rm_number?;      // RM SAP de 10 dígitos vinculada
  rating?; rating_comment?;                 // avaliação helpdesk 1-5
  atendente_id?; atendente_name?;
  first_response_at?; resolved_at?; paused_minutes?; last_paused_at?;
}

interface Notification { id; user_id; title; description; type:'info'|'success'|'alert'|'critical'; is_read; request_id?; request_number?; created_at; }
```

### 3.4 SAP (ME5A / ZL0132 e derivados)

```ts
interface SAPRequisicao {          // linha ME5A
  ri;                              // chave única = requisicao_de_compra + item_reqc (5 díg.)
  requisicao_de_compra;            // 10 dígitos
  item_reqc; material_code; texto_breve;
  qtd_requisicao; unidade_medida; grupo_comprador;   // 314,358,447,575,588
  data_solicitacao; data_remessa; requisitante_name;
  tipo_documento;                  // ZR01..ZR17
  codigo_de_eliminacao: boolean; presente_ultima_carga: boolean;
  campos_extras: Record<string,any>;
  // campos operacionais do comprador:
  obs_comprador?; data_entrega_prevista?; obs_updated_at?; obs_updated_by?; pedido?;
}
interface SAPPedido {              // linha ZL0132 (pedido)
  ri; documento_compra; item_pedido; fornecedor_code; fornecedor_name;
  data_pedido; data_entrega_sap; valor_brl?; preco_liquido?; campos_extras;
}
interface EnrichedSAPRecord extends SAPRequisicao {   // requisição + pedido + indicadores calculados
  documento_compra?; item_pedido?; fornecedor_code?; fornecedor_name?; data_pedido?; data_entrega_sap?;
  natureza; status_requisicao:'Sem PO'|'Processado';
  lead_time_compras_meta; dias_em_aberto; atraso_comprador; faixa_atraso; alerta; status_atualizado;
}
interface SAPObsHistory { id; ri; obs_comprador?; data_entrega_prevista?; user_name; created_at; }
interface SAPImportLog {
  id; type:'ME5A'|'ZL0132'|'PEDIDOSFORN'|'CONTATOS'; user_name; filename;
  records_read; records_inserted; records_updated; records_unchanged; records_eliminated;
  columns_missing: string[]; columns_new: string[];
  quantity_changes?; missing_ris?; ignored_rows?; created_at;
}
interface PedidoForn { id; material; txt_breve?; cod_forn?; cnpj?; fornecedor?; regiao_uf?; data_pedido?; created_at; updated_at?; }
interface ContatoFornecedor { id; cod_vendor; fornecedor?; telefone?; email?; classificacao?; created_at; updated_at?; }
interface FornecedorMaterialRow { cod_forn; cnpj; fornecedor; regiao_uf; telefone; email; classificacao; ultima_data; }
interface MaterialFornecedoresGroup { codigo; descricao?; encontrado: boolean; fornecedores: FornecedorMaterialRow[]; }
```

---

## 4. RBAC — papéis e permissões

`localDb.hasPermission(user, module, action)`: `admin` sempre retorna `true`. Caso contrário, combina as permissões de todos os papéis do usuário e checa `"module.action"`.

**Matriz `role → permissões`:**

| Papel | Permissões |
|---|---|
| `admin` | `*` (tudo) |
| `visualizador` | `materiais.visualizar`, `solicitacoes.visualizar_proprias`, `sap.visualizar_painel` |
| `solicitante` | `materiais.visualizar`, `solicitacoes.criar`, `solicitacoes.visualizar_proprias` |
| `gestor` | as de solicitante + `compras.aprovar_setor`, `compras.visualizar_setor` |
| `comprador` | as de solicitante + `compras.vincular_rm`, `sap.visualizar_painel`, `sap.editar_campos_comprador`, `cadastro_sap.atender`, `sap.fornecedores` |
| `coordenador_suprimentos` | as de solicitante + `sap.visualizar_painel`, `sap.editar_campos_comprador`, `sap.editar_todos_grupos`, `sap.importar`, `sap.dashboards`, `sap.gerenciar_grupos`, `sap.exportar`, `cadastro_sap.atender`, `sap.fornecedores` |
| `atendente` | as de solicitante + `chamados.atender_setor` |
| `pendente` | nenhuma (usuário recém-cadastrado aguardando aprovação) |

O **Sidebar** filtra cada item de menu por `hasPermission`. Se um grupo fica sem itens visíveis, o grupo some.

---

## 5. Autenticação e sessão

Fluxo simplificado (não usa Supabase Auth de fato; valida contra a tabela `profiles` + mapa de senhas custom):

- **`login(email, pass)`** → acha perfil por email (case-insensitive). Senha esperada = `profile.password` OU `custom_passwords[id]` OU default `'ten123'`. Aceita também `pass === 'admin'` ou `'ten123'` como mestre (ambiente demo). Se `status==='pendente'` → mensagem "aguarde autorização"; se `'inativo'` → "conta inativa". Sucesso grava `current_user` e loga atividade.
- **`signup(name,email,sector_id,cargo,password?)`** → cria perfil `roles:['pendente'], status:'pendente'`, grava senha custom, faz `insert` assíncrono no Supabase (`profiles`), loga atividade. Retorna `'sucesso'` ou mensagem de erro (email duplicado).
- **`logout()`**, **`getCurrentUser()`**, **`switchUser(userId)`** (impersonação — usado no header/demo).

**Tela Login** (`Login.tsx`): fundo `bg-app.png`; lado esquerdo institucional (logo TEN, tagline "Solução integrada para uma gestão **eficiente**", 4 features: Solicitações, Helpdesk, Suprimentos, Relatórios); lado direito o card branco de login (email, senha com olho, "lembrar", link "esqueci minha senha" inerte, botão Entrar com spinner de 800ms). Estados de erro renderizam blocos específicos "cadastro pendente" (âmbar) e "conta inativa" (vermelho). Bloco "Acesso rápido (demo — senha: ten123)" com botões que pré-preenchem: Admin/Coord./Gestor/Comprador/Solicitante/Atendente. Link "Solicitar cadastro" → `/cadastro`.

**Tela Signup** (`Signup.tsx`): card centralizado; campos nome, email, cargo, setor (select de setores), senha (mín. 6) + confirmação, com validação de email por regex e coincidência de senha. Sucesso mostra tela de confirmação "Cadastro solicitado! Aguardando aprovação".

---

## 6. Layout do app (shell)

Estrutura: `Sidebar` (esquerda, colapsável) + coluna com `Header` (topo) + `<main>` rolável.

### 6.1 Sidebar (`components/Sidebar.tsx`)
- Largura `w-64` (expandida) / `w-20` (colapsada); fundo `slate-900`, texto slate.
- Topo: logo (`SistenLogo`) + botão hambúrguer para colapsar.
- Grupos de navegação (cada item tem `perm {module, action}`, filtrado por `hasPermission`):
  - **GERAL**: Início (`/`), Catálogo SAP (`/materiais/busca`), Relatórios (`/relatorios`).
  - **SOLICITAÇÕES**: Nova Solicitação, Minhas Solicitações, Aprovações.
  - **SUPRIMENTOS**: Cadastros SAP, Painel SAP, Fornecedores, Dashboards, Importar SAP.
  - **HELPDESK**: Atendimento (`/helpdesk`), Relatórios Helpdesk (`/helpdesk/relatorios`).
  - **ADMINISTRAÇÃO**: Usuários, Setores, Permissões, Import. Materiais, Log Importação SAP, Grupos Comprador, Config. Helpdesk.
- Item ativo: borda esquerda `emerald-500` + fundo `slate-800` + texto emerald.
- Rodapé: nome/email do usuário + botão **toggle de tema** (Sol/Lua).

### 6.2 Header (`components/Header.tsx`)
- Sino de **notificações** com badge de não lidas (polling a cada 4s via `getNotifications(user.id)`). Ao clicar numa notificação → marca lida e navega (para aprovações se for compra e o usuário é gestor; senão para `/solicitacoes/minhas?id=`).
- **Menu de perfil** (avatar com inicial): "Meu Perfil" e "Sair".
- (Busca global existe no código mas o input não está montado no header atual; a lógica: nº de 7 dígitos → abre a solicitação; senão → catálogo `?q=`).
- Dark mode aplicado adicionando/removendo classe `dark` no `<html>`; persistido em `localStorage['theme']`. **Só aplica dark quando há usuário logado** (login/signup sempre claros).

---

## 7. Telas — detalhamento funcional

### 7.1 Dashboard (`/`)
KPIs no topo (cards): **Aguardando Aprovação** (compras `pendente` do setor do usuário; destaca quantas de criticidade ≥4), **Compras Aprovadas Atribuídas** (status `aprovada` do comprador/coordenador), **Painel SAP — Em Aberto** (RIs `Sem PO`), **Minhas Solicitações** (total do usuário). Se `admin`: linha extra com Usuários Pendentes/Ativos, Materiais, Total de Solicitações. Banner âmbar para gestores com aprovações pendentes → botão "Ir para aprovações". Lista "Minhas solicitações recentes" (5 últimas, com badges de criticidade e status) e painel lateral de **Ações rápidas** (Nova solicitação, Buscar material, Aprovações [gestor], Painel/Dashboards SAP conforme permissão) + card "Status Painel SAP".

Badges de status/criticidade seguem paletas fixas (criticidade 1 cinza → 5 vermelho; status com cores próprias — ver `getStatusBadge`).

### 7.2 Catálogo de Materiais (`/materiais/busca`) — `Materials.tsx`
Busca **paginada no servidor (Supabase)**, não no array local. Recursos:
- **Chips cumulativos (AND)**: cada termo digitado + Enter vira um chip; a query aplica `.or(material_code.ilike / description.ilike / technical_text.ilike)` para cada chip (termos sanitizados removendo `,()."%*\`). Aceita `?q=termo+termo` na URL.
- Filtros: **Categoria** (8 categorias fixas), **Empresa** (TEN2/AG, sempre inclui AMBAS via `.or`), **Meus favoritos** (`.in('material_code', favoritos)`).
- Paginação de 50/página com `range()` e `count:'exact'`; banner quando >500 resultados.
- Tabela: Favoritar (estrela; `toggleFavorite` local por usuário), Código SAP (com botão copiar), Descrição (com **highlight** dos termos), Texto técnico (expansível "Ver mais"), Empresa (badge), Unidade.
- **Exportar CSV**: refaz a busca sem paginação em lotes de 1000 (cap 20.000), gera CSV `;`-separado com BOM.

### 7.3 Nova Solicitação (`/solicitacoes/nova`) — `NewRequest.tsx`
Formulário com **3 abas** (tipo): **Compra**, **Cadastro SAP**, **Chamado**. Seções S1 (o que precisa), S2 (pra quando — só compra), S3 (criticidade).

- **Autosave de rascunho** a cada 30s em `localStorage['sisten_draft_<userId>']` (indicador "salvando/salvo"); carrega ao montar; `clearDraft` ao enviar/cancelar.
- **Compra**: setor solicitante (select), **comprador responsável** (carregado da tabela `compradores` no Supabase, resolvendo `profileId` via `buyer_groups`), tipo de compra (Estoque/Direta/Serviço), **itens repetíveis** (cada um: Código SAP 8 díg. + Descrição com **autocomplete no catálogo SAP** buscando direto no Supabase com debounce 300ms; qtd; unidade; marca "ou similar"; fornecedor sugerido; estimativa R$). Digitar 8 dígitos válidos auto-preenche descrição/unidade. Justificativa obrigatória. S2: data limite de necessidade.
- **Cadastro SAP**: tipo `Item`/`Fornecedor`; nome/razão social; marca ou CNPJ; fornecedor/contato de referência; especificações técnicas (só Item); justificativa. O payload monta a `justificativa` concatenando nome/specs.
- **Chamado**: setor solicitante; **destino** (cards dos setores com `helpdesk_enabled`: TI 💻, Facilities 🏢, Manutenção ⚙️); categoria (varia por setor — TI: Acesso/Senha, Equipamento, Software, Rede, E-mail, Outro; Facilities: Elétrica, Hidráulica, Climatização, Mobiliário, Limpeza, Chaves/Acesso, Outro; demais: Elétrica, Hidráulica, Climatização, Equipamento, Outro); local (obrigatório p/ Facilities); descrição.
- **Criticidade (S3)**: 5 cards com textos diferentes para chamado vs. compra (grau 1 "posso aguardar" → grau 5 "produção parada/risco"). Grau ≥4 mostra alerta laranja.
- Submit chama `localDb.submitRequest(payload, isDraft=false)` e navega para `/solicitacoes/minhas?id=`.

### 7.4 Minhas Solicitações (`/solicitacoes/minhas`) — `MyRequests.tsx`
Layout mestre-detalhe. Lista à esquerda (filtro por texto/nº, status, tipo). A visibilidade (`getFilteredUserRequests`): chamados só do próprio solicitante; demais tipos visíveis também para gestor do mesmo setor, admin, coordenador, comprador atribuído, atendente do setor destino. Deep-link `?id=`.

Painel de detalhe: cabeçalho + **stepper dinâmico** (etapas variam por tipo: compra 5 passos; cadastro_sap 3; chamado 4). Blocos: **avaliação de satisfação** (só chamado resolvido/fechado — 1-5 estrelas + comentário, grava com `evaluateTicket`), especificações/justificativa, **itens** (só compra), **histórico de movimentações** (timeline), **thread de mensagens** (`addComment`).

### 7.5 Aprovações (`/solicitacoes/aprovacoes`) — `Approvals.tsx`
Apenas compras. Abas **Fila Pendente** / **Histórico do Setor** (filtra por setor do gestor, ou tudo p/ admin/coordenador). Ordenação da fila: **criticidade DESC, depois data de necessidade ASC**. Painel de decisão: textarea de parecer + 3 ações — **Aprovar** (→ `aprovada`), **Devolver p/ Revisão** (→ `em_revisao`), **Rejeitar** (→ `rejeitada`). Justificativa **obrigatória** para revisar/rejeitar. Mostra soma estimada (`Σ estimated_value*quantity`).

### 7.6 Cadastros SAP (`/suprimentos/cadastros-sap`) — `CadastrosSap.tsx`
Fila coletiva do setor Suprimentos para solicitações `type==='cadastro_sap'`. Abas **Fila Pendente** / **Meus Atendimentos** / **Ver Todos**; filtros status, tipo (Item/Fornecedor) e busca. Tabela com **SLA** e badges. Drawer de ação: **Assumir** (`assignAtendente` → `em_atendimento`), **Solicitar esclarecimento** (`transitionRequestStatus → aguardando_solicitante`, "pausa SLA"), **Resolver** (nota + código SAP gerado opcional → `resolvido`).

**SLA por criticidade (horas)**: `{1:120, 2:72, 3:24, 4:8, 5:2}`. Restante = allowed − horas decorridas desde `created_at`. Estados: resolvido/fechado → "Resolvido"; aguardando_solicitante → "Pausado"; negativo → "Atrasado Xh".

### 7.7 Painel SAP (`/suprimentos/painel`) — `SapPanel.tsx`
Tela mais densa. Duas abas: **ME5A** (requisições enriquecidas) e **ZL0132** (pedidos). Fonte: `localDb.getEnrichedSAPRequisicoes()`.

- **Filtros**: busca textual; status (Todos / Com PO / Sem PO); grupo de comprador; alerta; "somente meus" (grupos do comprador logado).
- **Colunas configuráveis** (menu de visibilidade) e **ordenação** por qualquer coluna (o alerta ordena por severidade: ⚠️=3, ⚡=2, resto=1).
- **Edição inline dos campos do comprador** (`obs_comprador` e `data_entrega_prevista`) com **autosave** (blur/manual) via `updateBuyerFields`, que também grava histórico (`obs_history`/`obs_historico`) e faz update assíncrono no Supabase, recarregando a `view_enriched_requisicoes`.
- **Drawer de detalhamento** por linha (mostra histórico de obs).
- **Exportar XLSX** (SheetJS) da aba ativa.
- **Modal de upload** ME5A/ZL0132 (lê `.xlsx` com XLSX ou CSV) chamando as importações (seção 8).
- Card de KPIs (total, críticos = Sem PO com atraso>15 ou alerta ⚠️/⚡).

### 7.8 Dashboards SAP (`/suprimentos/dashboards`) — `SapDashboards.tsx`
Indicadores sobre `getEnrichedSAPRequisicoes()`: **Índice de Conversão** (Processado/total %), **Atrasos Críticos**, **Tempo Médio em Aberto** (média `dias_em_aberto`), **Atendidos** (com PO). Gráficos: **funil** Sem PO → Com PO (clicável → filtra o painel via `?status=`); **donut de níveis de alerta** (SVG) com legenda clicável (`?alert=`); **leaderboard** dos top 5 grupos de compras por volume (`?buyer=`). Cada drill-down navega para `/suprimentos/painel?...`.

### 7.9 Consulta de Fornecedores (`/suprimentos/fornecedores`) — `SuppliersLookup.tsx`
Cola-se uma lista de **códigos de material** (separados por espaço/vírgula/;/quebra). Lógica:
1. Parseia e deduplica códigos (mantém ordem).
2. `select * from pedidosforn where material in (...)`.
3. Coleta `cod_forn` únicos → `select * from contatos where cod_vendor in (...)`.
4. `select material_code,description,technical_text from materials where material_code in (...)` (enriquecer descrição/texto técnico).
5. Agrupa por material; **deduplica fornecedores** por `cnpj` (ou `cod_forn`), mantendo o registro de **data mais recente**; ordena por data desc.
Renderiza cards colapsáveis por material (marca "Sem Histórico" quando não achou); tabela de fornecedores (cód, CNPJ, nome, UF, telefone [tel:], e-mail [mailto:], classificação [badge], última compra). **Exporta XLSX** (uma linha por fornecedor; materiais sem histórico geram linha informativa).

### 7.10 Helpdesk (`/helpdesk`, `/helpdesk/relatorios`) — `Helpdesk.tsx`
Dois modos (`initialView`): **atendimento** e **dashboard**.
- **Atendimento**: fila de chamados (`type==='chamado'`) com abas **Não atribuídos / Meus / Resolvidos**. Ações no detalhe: **Assumir** (`assignAtendente`), **Resolver**, **Pausar SLA**, **Transferir de setor** (`transferTicketSector`), **postar nota** (pública/interna). SLA exibido (meta 24h padrão na UI).
- **Dashboard**: KPIs (total, SLA no prazo %, tempo médio resposta ~1.8h, avaliação média) + gráficos por setor destinatário, por criticidade, por categoria, e atividades recentes.

### 7.11 Relatórios (`/relatorios`) — `Reports.tsx`
Três painéis: **Catálogo SAP** (itens ativos, categorias, distribuição por empresa TEN2/AG com barras, top 5 categorias) — exporta CSV; **Fluxo de Solicitações** (total, compras, cadastro SAP; distribuição por status) — exporta CSV; **Desempenho do Helpdesk** (**% SLA**, avaliação média em estrelas, resumo de chamados). 

**Cálculo de SLA nos relatórios**: horas permitidas por criticidade `{1:120,2:72,3:24,4:8,5:2}`; um chamado resolvido/fechado cumpre o SLA se `(resolved_at − created_at) ≤ allowedHours`. `slaComplianceRate = slaMet / totalChamados`.

### 7.12 Meu Perfil (`/perfil`) — `ProfileView.tsx`
Coluna esquerda (somente leitura): avatar, email, setor, status, papéis, grupos de compras (se comprador). Direita: **editar dados** (nome, cargo → `updateProfileFields`, sincroniza Supabase), **alterar senha** (`changePassword`, valida senha atual, mín. 4), **preferências de notificação** (`in-app` ou `both` → `setNotificationPreferences`).

### 7.13 Administração (`/admin/*`, `/suprimentos/importar*`) — `AdminPanel.tsx`
Uma única view com **abas** sincronizadas por hash: **Usuários**, **Setores**, **Permissões**, **Importar Materiais**, **Importar SAP**, **Log Importação SAP**, **Grupos Comprador**, **Config. Helpdesk**.
- **Usuários**: aprovar/rejeitar pendentes (`updateUserStatus`), editar papel (`updateUserRole` — 1 papel por vez neste painel).
- **Setores**: toggles `is_support` e `helpdesk_enabled`.
- **Permissões**: matriz RBAC (leitura).
- **Importar Materiais**: drag-drop/seleção de `.xlsx/.csv`, preview de 10 linhas, resumo pós-import (lidos/inseridos/atualizados/desativados/falhas de sync). Ver seção 8.5.
- **Importar SAP**: quatro fluxos — ME5A, ZL0132, Histórico de Pedidos (PEDIDOSFORN), Contatos — com botões de "simular" e upload real (xlsx/csv), barra de progresso (`onProgress`). Ver seção 8.
- **Log Importação SAP**: lista `import_logs` (expansível: colunas faltantes/novas, mudanças de quantidade, RIs sumidos, linhas ignoradas).
- **Grupos Comprador**: associa códigos de grupo (314…) a um comprador, definindo o principal (`updateBuyerGroups`).

---

## 8. Lógicas de importação de dados (SAP) — detalhado

Todas as importações compartilham o mesmo pipeline: **ler planilha → normalizar cabeçalhos → reconciliar schema → mapear linhas → reconciliar com estado atual (buscado do Supabase) → upsert em lotes → gravar `import_logs` → recarregar view enriquecida**. Cada uma registra um `SAPImportLog` com métricas.

### 8.1 Leitura de arquivo (frontend)
- `.xlsx/.xls`: `XLSX.read(uint8, {type:'array'})` → primeira aba → `XLSX.utils.sheet_to_json(ws, {header:1, defval:''})` (matriz linha×coluna, **cabeçalho na linha 0**).
- `.csv`: split por `\n`, filtra vazias, split por `;` removendo aspas.
- A matriz `rawRows` (array de arrays) é passada para o método de import correspondente.

### 8.2 Reconciliação de schema (`reconcileSchema`)
Compara os **cabeçalhos do arquivo** com uma lista esperada `{header, field}[]` (case-insensitive, trim). Suporta **cabeçalhos duplicados** (ex.: várias colunas "Criado por"/"UMP"/"Moeda" no ZL0132) casando por ordem de ocorrência. Retorna:
- `mappedFields[]`: para cada coluna do arquivo, o `field` interno ou `null`;
- `missingColumns[]`: colunas esperadas ausentes;
- `newColumns[]`: colunas do arquivo sem correspondência (vão para `campos_extras`).

Datas Excel numéricas são convertidas: `new Date((serial − 25569) * 86400 * 1000).toISOString().split('T')[0]`. Booleano de eliminação: `val === 'X'|'x'|true|'true'`.

### 8.3 Importação ME5A (`importME5ARaw`) — requisições
Colunas esperadas (`ME5A_COLUMNS`) — as chaves são: `tipo_de_documento, requisicao_de_compra, item_reqc, data_da_solicitacao, requisitante, area_solicitante, material, texto_breve, qtd_solicitada, unidade_de_medida, status_processamento, codigo_de_eliminacao, categoria_do_item, ctg_class_cont, tipo_data_de_remessa, remessas_de_ate, grupo_de_mercadorias, centro, deposito, grupo_de_compradores, n_acompanhamento, fornecedor_fixo, centro_fornecedor, organiz_compras, contrato_basico, it_contrato_superior, n_de_reqsc, criado_por, data_do_pedido, moeda, pedido, item_do_pedido, apelido, aplicacao, data_de_remessa, codigo_de_bloqueio, codigo_de_liberacao, concluida, data_da_liberacao, data_pedido_origem, descricao_do_grupo_de_compradores, marca_da_peca, modelo, n_material_fornecedor, n_peca_fabricante, nome_do_fornecedor, peca_original, quantidade_pedida, sugestao_local_compra, tipo_de_transporte, requisicao_externa` (cabeçalhos em PT-BR conforme SAP: "Tipo de documento", "Requisição de compra", "Item ReqC", "Qtd.solicitada", etc.).

Regras:
1. Rejeita se <2 linhas ou se faltar `requisicao_de_compra`/`item_reqc`.
2. **Chave `ri` = requisicao_de_compra + item_reqc.padStart(5,'0')**. Linhas com chave inválida/vazia vão para `ignored_rows`.
3. Busca o estado atual **direto do Supabase** (`fetchAllFromTable('requisicoes')`) para não tratar como "novo" algo já existente (que apagaria `obs_comprador` do comprador ou duplicaria a linha).
4. Para cada linha: se `ri` existe → **atualiza** preservando campos do comprador; registra mudança de quantidade (`qtd_requisicao` antiga vs `qtd_solicitada` nova) em `quantity_changes`. Se novo → **insere** com `obs_comprador:''`. Marca `presente_ultima_carga:true`.
5. RIs presentes no banco mas **ausentes** do arquivo → `presente_ultima_carga:false` (soft; entram em `missing_ris`, contam como `eliminated`).
6. Upsert em lotes de 50 (`onConflict:'ri'`), reportando progresso 10→85%. Grava `import_logs`, recarrega `view_enriched_requisicoes` (mapeando nomes de colunas da view: `tipo_de_documento→tipo_documento`, `requisitante→requisitante_name`, `qtd_solicitada→qtd_requisicao`, `unidade_de_medida→unidade_medida`, `grupo_de_compradores→grupo_comprador`, `data_da_solicitacao→data_solicitacao`, `remessas_de_ate→data_remessa`, `material→material_code`).

### 8.4 Importação ZL0132 (`importZL0132Raw`) — pedidos
Colunas esperadas (`ZL0132_COLUMNS`) — dezenas de campos com **cabeçalhos repetidos** (vários "Criado por", "UMP", "Moeda", "Doc.compra", "Item", "Itm"). Chaves internas incluem: `n_acomp, eflag_e, reqc, data_rc, tpdc, requisitante, criado_por_rc, item, material, txt_breve, ..., doc_compra, data_doc, dt_remessa, data_migo, qtd_pedido, qtd_fornecida, preco_liquido_unit, valor_em_brl, valor_liquido, fornecedor_codigo, cnpj_fornecedor, fornecedor_nome, regiao_uf, condicao_pagamento`, etc.

Regras:
1. Chave `ri = reqc + item.padStart(5,'0')`.
2. **Ignora pedidos excluídos**: se coluna `Eflag_e`/`E` = `'L'` → `ignored_rows`.
3. Duplicatas de `ri` no arquivo: mantém o de **`data_doc` mais recente** (a outra vira `ignored_rows`).
4. Reconcilia com pedidos atuais do Supabase; conta insert/update; registra `quantity_changes` (`qtd_pedido`).
5. Faz merge com os pedidos existentes e upsert em lotes de 50 (`onConflict:'ri'`). Recarrega `view_enriched_requisicoes` **e** `view_enriched_pedidos`.

### 8.5 Importação do Catálogo de Materiais (`importMaterials` + `parseMaterialsRows`)
Parsing (`parseMaterialsRows` em AdminPanel): cabeçalhos normalizados (lower/trim). Colunas: `material` (código, obrigatória), contém "texto breve" (descrição, obrigatória), contém "texto longo" (texto técnico), `empresa`. Empresa validada contra `VALID_COMPANIES` (senão `TEN2`). Categoria via `getAutoCategory(description)`. Unidade fixa `'UN'`.

`importMaterials`:
1. Busca catálogo completo **do Supabase** (paginado) como fonte de verdade (cache pode estar incompleto).
2. **Deduplica por `material_code`** (última ocorrência vence — a planilha SAP pode repetir código).
3. Para cada importado: se existe → atualiza (mantém id/created_at) e `is_active:true`; senão → insere novo. Conta inserted/updated.
4. **Soft delete**: códigos existentes ausentes do import → `is_active:false` (deactivated).
5. Upsert em lotes de **500** (`onConflict:'material_code'`), tolerando falha por lote (`syncFailed`). Grava `import_logs` (tipo "Importar Catálogo" via activity log). Retorna `{read, inserted, updated, deactivated, syncFailed}`.

### 8.6 Importação Histórico de Pedidos por Fornecedor (`importPedidosForn`)
Colunas (`PEDIDOSFORN_COLUMNS`): `Material→material` (obrig.), `TxtBreve→txt_breve`, `Cod Forn→cod_forn` (obrig.), `CNPJ→cnpj`, `Fornecedor→fornecedor`, `Rg→regiao_uf`, `Data→data_pedido` (obrig.). Deduplica por chave `material_cod_forn_data_pedido` para evitar erro de "ON CONFLICT afetar linha duas vezes". Upsert lotes de 50 (`onConflict:'material,cod_forn,data_pedido'`). Alimenta a **Consulta de Fornecedores**.

### 8.7 Importação de Contatos de Fornecedores (`importContatos`)
Colunas (`CONTATOS_COLUMNS`): `N° VENDOR→cod_vendor` (obrig.), `FORNECEDORES→fornecedor`, `TELEFONE→telefone`, `E-MAIL→email`, `CLASSIFICAÇÃO→classificacao`. Deduplica por `cod_vendor`. Upsert lotes de 50 (`onConflict:'cod_vendor'`). Enriquece os fornecedores na consulta por material.

---

## 9. Enriquecimento SAP (`getEnrichedSAPRequisicoes`) — regras de indicadores

Junta requisições (`getRequisicoes()`, exclui `codigo_de_eliminacao`) com pedidos (`getPedidos()`, por `ri`). Data "atual" fixada em `2026-07-05` (ambiente demo). Para cada requisição calcula:

**Natureza** (por `tipo_documento`): `ZR01=Normal, ZR02=Urgente, ZR03=Máquina Parada, ZR04=Equipamento pesado, ZR05=Exportação normal, ZR06=Exportação urgente, ZR07=Exportação máquina parada, ZR08=Exportação equipamento pesado, ZR09=Orçamento, ZR10=Subempreitada, ZR11=Serviço - Normal, ZR16=Serviço - Urgente, ZR17=Serviço - MP` (senão `Outros`).

**Status da requisição**: `Processado` se há pedido válido (`pedido`/`documento_compra` não vazio, `≠ —/0/undefined/null`), senão `Sem PO`.

**Lead time meta (dias)**: contém "urgente"→6; "máquina parada"/"mp"→2; "normal"→15; senão 30.

**Entrega**: `data_migo` presente ⇒ "Entregue". `data_referencia_prazo` = `data_migo` se (com PO e entregue), senão a data atual.

**Dias em aberto** = `floor((hoje − data_solicitacao)/dia)` (mín. 0).

**Atraso do comprador** = `max(0, floor((data_referencia_prazo − data_solicitacao)/dia) − lead_time_meta)`.

**Faixa de atraso**: `>30`→"Acima 30 dias"; `>15`→"16-30 dias"; `>7`→"8-15 dias"; `>0`→"1-7 dias"; senão "Sem Atraso".

**Alerta**: atraso>15 e natureza Urgente/Serviço-Urgente → `⚠️ ESCALAR IMEDIATAMENTE`; atraso>30 → `⚠️ AÇÃO URGENTE`; atraso>15 → `⚡ ACOMPANHAR`; atraso>7 → `📋 MONITORAR`; senão `✅ OK`.

**Status atualizado**: Processado+entregue → "Concluído"; `status_processamento==='A'` → "Em Cotação"; atraso>30 → "Crítico - Ação Urgente"; atraso>15 → "Atrasado"; atraso>0 → "Em Andamento"; senão "No Prazo".

---

## 10. Motor de solicitações — regras

### 10.1 Numeração (`generateRequestNumber(criticality)`)
Sequências por criticidade (seed inicial `{1..5: 1000}`). Próximo = seq+1. **Número = criticidade (1 dígito) + seq.padStart(6,'0')** → 7 dígitos. Rascunhos recebem número temporário `draft_xxxxx` até serem enviados.

### 10.2 Envio (`submitRequest(draft, isDraft)`)
Status inicial por tipo: **compra→`pendente`**, **cadastro_sap→`aberto`**, **chamado→`aberto`** (ou `rascunho` se isDraft). Cria/atualiza a request, regrava os itens, loga histórico e atividade, e dispara **notificações**:
- **compra**: notifica **gestores do setor do solicitante** (criticidade≥4 = `critical`); se criticidade 5 e setor Saúde(12)/Segurança(13), alerta SESMT a toda a equipe EHS.
- **cadastro_sap**: notifica coordenadores + compradores (fila geral).
- **chamado**: notifica atendentes do `target_sector_id`.

### 10.3 Transições (`transitionRequestStatus`, `assignAtendente`)
Ao mudar status: grava `updated_at`; se `em_atendimento` e sem `first_response_at`, seta agora; se `resolvido`, seta `resolved_at`; loga histórico + atividade; **notifica o solicitante** (rejeitada=`alert`, resolvido=`success`, senão `info`). `assignAtendente` seta atendente e move para `em_atendimento`. Comentário do solicitante em chamado `aguardando_solicitante` **reativa** para `em_atendimento` (SLA retomado). `updateLinkedRM` vincula nº de RM SAP e adiciona comentário de sistema.

### 10.4 Notificações, favoritos, logs
- `createNotification` (cap 100), `getNotifications(userId)`, `markNotificationAsRead`.
- `logActivity` (cap 500, mais recente primeiro).
- Favoritos por usuário (`toggleFavorite`/`getFavorites`).
- `evaluateTicket(reqId, rating, comment)` grava avaliação + comentário de sistema.

---

## 11. Dados-semente (seed) — para o app "nascer preenchido"

Se as chaves não existem no cache, `initialize()` semeia:

**Setores** (`INITIAL_SECTORS`, 16): RH(1), Almoxarifado(2,support), Facilities(3,support,helpdesk), Comunicação(4), Suprimentos(5,support), Financeiro(6), Contabilidade(7), Planejamento(8), TI(9,support,helpdesk), Engenharia(10), Qualidade(11), Saúde(12,support), Segurança(13,support), Produção(14), Manutenção(15,support,helpdesk), Diretoria(16).

**Perfis** (13, senha demo `ten123`): `admin@ten.com.br` (admin), `coord@ten.com.br` (coordenador_suprimentos), `gestor1/2@ten.com.br` (gestor — Diretoria/Produção), `comprador1/2/3@ten.com.br` (comprador — grupos 314/358/447), `atendente1/2@ten.com.br` (atendente — TI/Facilities), `solicitante1/2/3@ten.com.br` (solicitante — Diretoria/Manutenção/Qualidade), `usuario.pendente@ten.com.br` (status pendente). Todos ativos têm também `visualizador`.

**Grupos de comprador**: u5→314, u6→358, u7→447, u2→575 (principais).

**Materiais**: `generateMaterials()` cria **200 itens** determinísticos (código `10000001+`), 13 bases realistas (chapas, parafusos, cabos, EPI, tintas, sensores, mangueiras, válvulas...), empresa TEN2/AG alternada, categoria auto. As 10 primeiras têm descrições fixas específicas.

**Categorias de material** (8, com keywords): CHAPAS, PARAFUSOS E FIXADORES, CABOS E CONECTORES, EPI E SEGURANÇA, PINTURA E QUÍMICOS, AUTOMAÇÃO E SENSORES, VALVULAS E TUBULAÇÕES, OUTROS. `getAutoCategory(desc)` = primeira categoria cujas keywords aparecem na descrição em maiúsculas.

**SAP** (`generateSAPSeedData`): 100 requisições (`ri = 45000000xx + item`), grupos 314/358/447/575/588, tipos ZR01/02/03/11, datas mai-jul/2026; ~60 pedidos correspondentes com fornecedores fictícios (AÇO BRASIL, METALÚRGICA NORDESTE, FIXACAMP, ELÉTRICA JACOBINA, QUÍMICA INDUSTRIAL BA, SOUZA AUTOMATIZAÇÃO).

**Solicitações** (13 requests r1..r13) cobrindo todos os status/tipos (compras pendentes/aprovada/rejeitada/rascunho/em_revisao; chamados aberto/em_atendimento/resolvido/fechado/aguardando; cadastro SAP aberto/resolvido), com itens, histórico e comentários de exemplo.

---

## 12. Passo a passo para reconstruir

1. **Scaffold**: `npm create vite@latest` (React+TS), instalar deps da seção 1.1. Config Tailwind v4 via plugin Vite. `index.html` com `<div id="root">` e `<script src="/src/main.tsx">`.
2. **Tipos** (`src/types.ts`) — copiar seção 3.
3. **Dados seed** (`src/data/`): `sectors.ts`, `materials.ts` (com `MATERIAL_CATEGORIES`, `getAutoCategory`, `generateMaterials`), `sapData.ts` (`generateSAPSeedData`).
4. **Supabase client** (`src/db/supabaseClient.ts`) lendo env; export `null` seguro se ausente.
5. **`localDb`** (`src/db/localDb.ts`) — a classe singleton com: cache/IndexedDB, `ready`, migração de localStorage, `syncFromSupabase` (allSettled + paginação), seeds em `initialize()`, auth, RBAC (`hasPermission`), CRUD de requests/itens/comentários/histórico, notificações, numeração, enriquecimento SAP, `updateBuyerFields`, e **todas as importações** da seção 8 com `reconcileSchema` e as listas de colunas ME5A/ZL0132/PEDIDOSFORN/CONTATOS.
6. **Shell** (`App.tsx`, `Sidebar`, `Header`, `SistenLogo`) — hash router, lazy views, tema, gate de auth.
7. **Views** (`src/views/`) — as 15 telas da seção 7 (Login, Signup, Dashboard, Materials, NewRequest, MyRequests, Approvals, CadastrosSap, SapPanel, SapDashboards, SuppliersLookup, Helpdesk, Reports, ProfileView, AdminPanel).
8. **Assets** em `/public`: `bg-app.png`, `logo-ten.png`.
9. **Backend Supabase** (opcional para persistência real): tabelas `sectors, profiles, buyer_groups, materials, requisicoes, pedidos, requests, request_items, request_comments, request_status_history, notifications, import_logs, obs_historico, activity_logs, sequences, pedidosforn, contatos, compradores` + **views** `view_enriched_requisicoes` e `view_enriched_pedidos` (que reproduzem no SQL o enriquecimento da seção 9). Constraints únicas: `materials.material_code`, `requisicoes.ri`, `pedidos.ri`, `pedidosforn(material,cod_forn,data_pedido)`, `contatos.cod_vendor`.

> **Nota sobre o backend:** o app funciona 100% offline com os seeds (IndexedDB). O Supabase é a fonte de verdade para persistência multiusuário e para os catálogos grandes. As telas de busca pesada e as importações devem consultar/escrever no Supabase diretamente, conforme detalhado; o cache local é apenas para render rápido.

---

## 13. Convenções e detalhes finais

- **Idioma**: toda a UI em **português (Brasil)**; datas `toLocaleDateString('pt-BR')`.
- **Cor de ação** interna: emerald; **marca**: `#0056c6`. Sem roxo em controles.
- **IDs** gerados com `prefixo_ + Math.random().toString(36).substr(2,9)`.
- **Escritas no Supabase** são assíncronas e não bloqueiam a UI (fire-and-forget com log de erro), exceto as importações que aguardam para reportar métricas/progresso.
- **Caps**: notificações 100, activity logs 500, export de materiais 20.000, lotes de upsert 50 (SAP) / 500 (materiais).
- **Data "atual" mockada**: `2026-07-05` no enriquecimento SAP (ajustar para `new Date()` num app de produção).
</content>
</invoke>
