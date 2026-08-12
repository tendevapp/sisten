# Especificação UML — Sistema de Informação TEN (SISTEN)

> **Documentação de Diagramas UML (Unified Modeling Language)**  
> **Projeto:** SISTEN — Sistema de Informação TEN S.A.  
> **Versão:** 1.0.0  
> **Data:** Agosto / 2026  

---

## 1. Visão Geral

Este documento apresenta a modelagem de software baseada em **UML (Unified Modeling Language)** do sistema SISTEN. Ele cobre os diagramas estruturais (Classes e Componentes/Pacotes) e diagramas comportamentais (Sequências e Máquinas de Estado) que governam o ecossistema da aplicação.

---

## 2. Diagrama de Arquitetura e Pacotes UML

O diagrama de pacotes ilustra a organização em camadas do sistema, com separação clara entre a camada de apresentação, regras de negócio puras, persitência/cache local e banco de dados em nuvem.

```mermaid
package "SISTEN System" {

    package "Presentation Layer (React 19 Views)" {
        [App Router (Hash)]
        [Views: Requests & Approvals]
        [Views: Suprimentos & Painel SAP]
        [Views: Histórico & Auditoria IPCA]
        [Views: Almoxarifado & Financeiro]
        [Views: Helpdesk & Admin]
    }

    package "Business Logic Layer (src/lib)" {
        [auditoriaPrecos.ts]
        [suprimentos.ts]
        [rastreio.ts]
        [fbl1n.ts]
        [almoxarifado.ts]
        [pages.ts (RBAC & Feature Flags)]
        [imageCompression.ts]
    }

    package "Data Access & Cache Layer (src/db)" {
        [localDb.ts (Data Service)]
        [IndexedDB Cache (idb-keyval)]
        [Background Sync Engine]
    }

    package "Backend Persistence (Supabase Cloud)" {
        [Supabase Postgres 17 DB]
        [Supabase Auth (JWT)]
        [Supabase Storage Buckets]
        [Edge Functions (Deno)]
    }
}

[Presentation Layer (React 19 Views)] --> [Business Logic Layer (src/lib)]
[Presentation Layer (React 19 Views)] --> [Data Access & Cache Layer (src/db)]
[Data Access & Cache Layer (src/db)] --> [IndexedDB Cache (idb-keyval)]
[Data Access & Cache Layer (src/db)] <--> [Backend Persistence (Supabase Cloud)]
```

---

## 3. Diagrama de Classes UML (Class Diagram)

O diagrama de classes reflete o modelo de domínio do SISTEN (conforme definido em `src/types.ts` e no schema relacional Postgres).

```mermaid
classDiagram
    class Profile {
        +string id
        +string email
        +string name
        +string cargo
        +string sector_id
        +Role[] roles
        +UserStatus status
        +string grupo_compras
        +Record~string, boolean~ page_access
        +string[] aprovador_setores
        +boolean aprovador_cadastro_sap
        +Record~string, boolean~ tours_seen
    }

    class Sector {
        +string id
        +string name
        +boolean is_support
        +boolean helpdesk_enabled
        +string sap_area_code
    }

    class Request {
        +string id
        +string number
        +RequestType type
        +RequestStatus status
        +int criticality
        +string solicitante_id
        +string solicitante_name
        +string solicitante_sector_id
        +string created_at
        +string justificativa
        +string comprador_id
        +string tipo_compra
        +string target_sector_id
        +string linked_rm_number
        +int rating
    }

    class RequestItem {
        +string id
        +string request_id
        +string description
        +string sap_code
        +boolean has_no_sap_code
        +double quantity
        +string unit
        +string brand
        +boolean is_similar_allowed
        +double estimated_value
    }

    class RequestAttachment {
        +string id
        +string request_id
        +string request_item_id
        +string name
        +string url
        +string storage_path
        +string mime_type
        +long size
        +long size_original
    }

    class RequestComment {
        +string id
        +string request_id
        +string user_id
        +string user_name
        +Role[] user_roles
        +string content
        +boolean is_internal
        +string created_at
    }

    class Material {
        +string id
        +string material_code
        +string description
        +string technical_text
        +string category
        +string company
        +string unit
        +boolean is_active
    }

    class SAPRequisicao {
        +string ri
        +string requisicao_de_compra
        +string item_reqc
        +string material_code
        +string texto_breve
        +double qtd_requisicao
        +string grupo_comprador
        +string area_solicitante
        +string obs_comprador
        +string data_entrega_prevista
        +ItemStatus item_status
    }

    class SAPPedido {
        +string ri
        +string documento_compra
        +string item_pedido
        +string fornecedor_code
        +string fornecedor_name
        +string data_pedido
        +double valor_brl
    }

    class EnrichedSAPRecord {
        +string natureza
        +string status_requisicao
        +int lead_time_compras_meta
        +int dias_em_aberto
        +int atraso_comprador
        +string alerta
    }

    class AuditoriaCompra {
        +string material
        +string doc_compra
        +double valor
        +double preco_unit
        +double ref_p25
        +double ref_p50
        +double ref_p75
        +ConfiancaBenchmark confianca
        +VereditoCompra veredito
    }

    class ContratoME3N {
        +int id
        +string documento_compras
        +string fornecedor
        +string material
        +string texto_breve
        +double valor_efetivo
        +string fim_validade
    }

    class ContratoDetalhes {
        +string documento_compras
        +string gestor
        +string escopo_servico
        +double valor_parcela
        +ContratoModalidade modalidade
        +ContratoStatus status
    }

    class ContatoFornecedor {
        +string id
        +string cod_vendor
        +string fornecedor
        +string cnpj
        +string telefone
        +string email
        +string cidade
        +string estado_uf
    }

    Sector "1" <-- "0..*" Profile : pertence
    Profile "1" <-- "0..*" Request : cria
    Sector "1" <-- "0..*" Request : setor_solicitante
    Request "1" *-- "1..*" RequestItem : possui
    Request "1" *-- "0..*" RequestAttachment : possui
    Request "1" *-- "0..*" RequestComment : possui
    Material "1" <-- "0..*" RequestItem : referencia
    SAPRequisicao <|-- EnrichedSAPRecord : herda / enriquece
    SAPPedido "0..1" <-- "1" EnrichedSAPRecord : casa_por_ri
    ContratoME3N "1" <-- "0..1" ContratoDetalhes : complementa
```

---

## 4. Diagramas de Sequência UML (Sequence Diagrams)

### 4.1 Sequência 1: Criação e Aprovação de Solicitação de Compra

Este diagrama detalha a interações entre o Solicitante, a interface React, a camada de dados localDb, o Supabase e o perfil Gestor durante o envio e aprovação de uma requisição.

```mermaid
sequenceDiagram
    autonumber
    actor Solicitante
    participant UI as NewRequest View
    participant LocalDB as localDb (Cache IndexedDB)
    participant Backend as Supabase Postgres 17
    actor Gestor
    participant ApprovalsUI as Approvals View

    Solicitante->>UI: Preenche itens de compra e justifica
    Solicitante->>UI: Anexa imagem de cotação
    UI->>UI: Compressão Client-Side (imageCompression.ts)
    UI->>LocalDB: createRequest(payload)
    LocalDB->>Backend: INSERT INTO requests & request_items
    Backend-->>LocalDB: Confirmado (ID & Request Number #7xxxxx)
    LocalDB-->>UI: Sucesso
    Backend->>Backend: Dispara Trigger de Notificação (aprovador_setores)
    
    Note over Gestor, ApprovalsUI: Notificação recebida em tempo real
    Gestor->>ApprovalsUI: Acessa tela de Aprovações
    ApprovalsUI->>LocalDB: getPendingApprovals(gestor_id)
    LocalDB->>Backend: SELECT * FROM vw_demandas WHERE status='pendente'
    Backend-->>ApprovalsUI: Retorna solicitações pendentes
    Gestor->>ApprovalsUI: Clica em "Aprovar Solicitação"
    ApprovalsUI->>LocalDB: updateRequestStatus(id, 'aprovada')
    LocalDB->>Backend: UPDATE requests SET status='aprovada'
    Backend-->>LocalDB: Status atualizado
    LocalDB-->>ApprovalsUI: Interface atualizada (Card movido)
```

---

### 4.2 Sequência 2: Auditoria de Preços de Compras (2026 vs Histórico IPCA)

Demonstra a execução da auditoria de compras de 2026 calculada contra a mediana dos preços históricos corrigidos monetariamente.

```mermaid
sequenceDiagram
    autonumber
    actor Comprador
    participant UI as HistoricoPedidos View
    participant Analytics as auditoriaPrecos.ts
    participant LocalDB as localDb (IndexedDB)
    participant ViewDB as vw_auditoria_compras (Postgres)

    Comprador->>UI: Acessa Histórico de Pedidos
    Comprador->>UI: Seleciona filtro "Ver Auditoria IPCA"
    UI->>LocalDB: getAuditoriaCompras2026()
    LocalDB->>ViewDB: SELECT * FROM vw_auditoria_compras
    Note over ViewDB: Junta pedidos 2026 + taxa de inflação IPCA IBGE + P25/P50/P75
    ViewDB-->>LocalDB: Retorna linhas auditadas
    LocalDB-->>UI: Retorna dados brutos da view
    UI->>Analytics: calcularResumoAuditoria(compras)
    Note over Analytics: Agrupa por veredito (Bom, Na faixa, Atenção, Sem ref)<br/>Soma deltas financeiros em BRL
    Analytics-->>UI: Retorna KPIs (Saving total, Overpay estimado)
    UI-->>Comprador: Renderiza Tabela de Auditoria com Badges & Graficos Recharts
```

---

### 4.3 Sequência 3: Atendimento e Conclusão de Chamado de Helpdesk (com Ticket Jurídico)

Mostra o fluxo de vida de um chamado de Helpdesk direcionado ao setor Jurídico ou Suporte Operacional.

```mermaid
sequenceDiagram
    autonumber
    actor Solicitante
    participant UI as NewRequest (Helpdesk)
    participant Backend as Supabase Postgres
    actor Atendente as Atendente Jurídico
    participant HelpUI as Helpdesk View (Kanban)

    Solicitante->>UI: Abre chamado Tipo='chamado', Target='Juridico'
    Solicitante->>UI: Informa minuta de contrato e fornecedor terceiro
    UI->>Backend: INSERT INTO requests (contrato_tipo, fornecedor_terceiro)
    Backend->>Backend: Checa feature flag 'juridico_notificar' em profiles
    Backend-->>Atendente: Notificação enviada para o time Jurídico
    
    Atendente->>HelpUI: Abre Kanban de Atendimento
    HelpUI->>Backend: Fetch chamados abertos
    Atendente->>HelpUI: Move card para "Em Atendimento" (atendente_id = Atendente.id)
    HelpUI->>Backend: UPDATE requests SET status='em_atendimento', atendente_id=...
    
    Note over Atendente, HelpUI: Atendente analisa contrato e elabora minuta
    Atendente->>HelpUI: Registra solução e altera para "Resolvido"
    HelpUI->>Backend: UPDATE requests SET status='resolvido', resolved_at=NOW()
    
    Backend-->>Solicitante: Alerta: "Seu chamado foi resolvido"
    Solicitante->>UI: Acessa "Minhas Solicitações" e avalia (5 Estrelas)
    UI->>Backend: UPDATE requests SET rating=5, status='fechado'
```

---

### 4.4 Sequência 4: Sincronização Incremental Offline-First (Background Sync Engine)

Explicita o funcionamento da camada de resiliência e persistência local offline/online do SISTEN (`localDb.ts`).

```mermaid
sequenceDiagram
    autonumber
    participant ReactUI as React Component (View)
    participant LocalDB as localDb Layer
    participant IDB as IndexedDB (idb-keyval)
    participant Supabase as Supabase Client API
    participant Server as Supabase Postgres 17

    ReactUI->>LocalDB: loadMaterials()
    LocalDB->>IDB: get('sisten_materials')
    IDB-->>LocalDB: Retorna dados em cache (Instantâneo ~5ms)
    LocalDB-->>ReactUI: Exibe interface imediatamente para o usuário

    Note over LocalDB, Server: Sincronizador assíncrono dispara em 2º plano
    LocalDB->>Supabase: fetchDelta('materials', last_sync_timestamp)
    Supabase->>Server: SELECT * FROM materials WHERE updated_at > last_sync
    Server-->>Supabase: Retorna apenas registros alterados (Delta)
    
    alt Houve dados alterados
        Supabase-->>LocalDB: Recebe novos registros
        LocalDB->>IDB: set('sisten_materials', mergedData)
        LocalDB->>ReactUI: Emit Event / Trigger setDataVersion(v + 1)
        Note over ReactUI: Se a rota NÂO for STATE_PRESERVING_PATHS,<br/>atualiza a UI suavemente
    else Sem alterações
        Supabase-->>LocalDB: Resposta Vazia (304 / 0 rows)
        Note over LocalDB: Mantém cache inalterado
    end
```

---

## 5. Diagramas de Estados UML (State Machine Diagrams)

### 5.1 Máquina de Estados: Solicitação de Compra (`RequestStatus`)

```mermaid
stateDiagram-v2
    [*] --> Rascunho : Salvar como Rascunho
    Rascunho --> Pendente : Enviar para Aprovação
    
    state Pendente {
        [*] --> EmAnaliseGestor
        EmAnaliseGestor --> EmAnaliseCoordenador : Se valor > Alçada Setor
    }

    Pendente --> Aprovada : Aprovado por Gestor/Coordenador
    Pendente --> Rejeitada : Rejeitado com justificativa
    Pendente --> Em_Revisao : Solicitação de Esclarecimento
    
    Em_Revisao --> Pendente : Solicitante responde / reenvia
    
    Aprovada --> Processada_SAP : Comprador vincula RI / PO SAP
    
    Processada_SAP --> Concluida : Entrega MIGO confirmada
    Rejeitada --> [*]
    Concluida --> [*]
```

---

### 5.2 Máquina de Estados: Item de Requisição no SAP (`ItemStatus`)

```mermaid
stateDiagram-v2
    [*] --> Aguardando_Cotacao : Carga ME5A sem PO
    Aguardando_Cotacao --> Cotacao_Enviada : Comprador dispara RFQ
    Cotacao_Enviada --> Analise_Cotacoes : Propostas recebidas
    Analise_Cotacoes --> Aguardando_Aprovacao_PO : Fornecedor escolhido
    Aguardando_Aprovacao_PO --> Pedido_Enviado : PO emitido no SAP (ZL0132)
    Pedido_Enviado --> Aguardando_Coleta : Fornecedor faturou
    Aguardando_Coleta --> Em_Rota_Entrega : Despachado pela transportadora
    Em_Rota_Entrega --> Entregue : MIGO efetuada no Almoxarifado
    Entregue --> [*]
```

---

## 6. Conclusão e Rastreadores de Manutenção

Este documento UML reflete a arquitetura real do repositório `sisten`. Quaisquer alterações estruturais nos arquivos de domínio (`src/types.ts`), rotas (`src/lib/pages.ts`) ou esquema de banco de dados (`db/sql/`) devem ser refletidas nesta especificação para manter a documentação viva e sincronizada com o código em produção.
