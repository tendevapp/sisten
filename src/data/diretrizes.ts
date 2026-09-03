/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Conteúdo da página "Diretrizes" (AdminPanel) — manual técnico interno do SISTEN.
 *
 * Isto é DADO, não UI: quem for atualizar uma regra de negócio documentada aqui deve
 * editar este arquivo (e adicionar uma entrada em CHANGELOG) junto com a mudança de
 * código correspondente. O componente que renderiza isso é `src/components/admin/Diretrizes.tsx`.
 */

export interface DiretrizesSecao {
  titulo: string;
  itens: string[];
}

export interface DiretrizesPagina {
  id: string;
  nome: string;
  arquivo?: string;
  secoes: DiretrizesSecao[];
}

export interface DiretrizesDominio {
  id: string;
  nome: string;
  icone: string;
  resumo: string;
  paginas: DiretrizesPagina[];
}

export interface ChangelogEntry {
  data: string;
  resumo: string;
}

// Entradas mais recentes primeiro.
export const CHANGELOG: ChangelogEntry[] = [
  {
    data: '2026-09-03',
    resumo: 'Formulários > RH / ASE Hora Extra (`RhAseHoraExtra.tsx`, `rhApi.ts`): Implementados controles de preenchimento em lote no cabeçalho da lista de colaboradores (desktop e mobile). Permite marcar/desmarcar Transporte e Refeição para todos com 1 clique, e definir horários de Entrada, Saída e Intervalo preenchendo todos os colaboradores simultaneamente com recálculo automático de horas.',
  },
  {
    data: '2026-09-03',
    resumo: 'Formulários > RH / ASE Hora Extra (`RhAseHoraExtra.tsx`, `rhApi.ts`): Adicionada inclusão automática em lote de todos os colaboradores operacionais da Produção (97 colaboradores da fábrica) ao selecionar o setor "PRODUÇÃO" no formulário de ASE, com botão dedicado para recarregar quando necessário. O botão de exclusão foi reposicionado para a primeira coluna da tabela (com exclusão instantânea para linhas sem horários preenchidos), acelerando a triagem de quem participará do expediente.',
  },
  {
    data: '2026-09-03',
    resumo: 'Formulários Operacionais > Exclusão Lógica e Permissões (`RhAseHoraExtra.tsx`, `LogisticaExpedicao.tsx`, `PortariaPassagemPlantao.tsx`, `PortariaRelatorio.tsx`, `ExcluidosControls.tsx`, `softDelete.ts`): 1. Permitida a exclusão de lançamentos de formulários tanto para Administradores quanto para o usuário que criou o registro (via `podeEditarFormulario`); 2. Exclusão 100% lógica (soft delete) persistindo `excluido_em` e `excluido_por` no Supabase sem remover os dados físicos; 3. Adicionados botões de exclusão direta por lixeira nos cartões das listagens com diálogo de confirmação; 4. Adicionado alternador "Mostrar excluídos" exclusivo para administradores com selo de data de exclusão e botão de restauração imediata; 5. Na ASE, remoção do bloqueio de exclusão em status ENVIADO para correções operacionais.',
  },
  {
    data: '2026-09-03',
    resumo: 'Formulários > RH / ASE Hora Extra (`RhAseHoraExtra.tsx`, `exportAseHoraExtraPdf.ts`): Atualizado o rótulo do campo de data para "Data do Expediente" (formulário, e-mail e relatórios PDF/Excel) e aprimorada a visibilidade e ergonomia do botão Voltar com visualização destacada, micro-interação no ícone e inclusão de botão Voltar na barra fixa de ações inferior.',
  },
  {
    data: '2026-09-03',
    resumo: 'Suprimentos > Pendências de Processamento (`PendenciasProcessamento.tsx`, `PendenciasProcessamentoAnalise.tsx`): Adicionado filtro multi-select de Comprador nas abas Fila e Análise, permitindo filtrar chamados e notas pelo comprador responsável com totalizadores e gráficos reativos.',
  },
  {
    data: '2026-09-02',
    resumo: 'Admin > Cadastros Gerais > aba "Suprimentos — Lead Time de Entregas" (`CadastrosAdmin.tsx`, `data/prazosEntregaPadrao.ts`, `diligenciamentoApi.ts`, `sup_prazos_transporte`): Nova aba para cadastrar/editar o lead time de entrega por UF de origem (previsão = data de remessa + N dias corridos). Semeado com SP +8, MG +6, PE +4, BA +2 e por região Sudeste +8 / Sul +10 / Norte +10 / Centro-Oeste +10 / demais do Nordeste +4; inclui prazo padrão global, adicionar UF, botão "Preencher UFs faltantes" e edição/remoção linha a linha. Reaproveita a tabela usada no Diligenciamento (transportadora vazia = padrão da UF).',
  },
  {
    data: '2026-09-02',
    resumo: 'Painel Admin > Gestão de Setores da ASE (`rhApi.ts`, `AdminPanel.tsx`, `RhAseHoraExtra.tsx`, `rh_setores`): Adicionada sub-aba dedicada a "Setores da ASE / RH" na aba Setores do painel administrativo, permitindo adicionar novos setores, editar nome e status, inativar/reativar com 1 clique e excluir com validação de vínculo histórico em solicitações de ASE. No formulário de ASE, setores inativos são ocultados para novas seleções preservando o histórico existente.',
  },
  {
    data: '2026-09-02',
    resumo: 'Início & Notificações (`notificationRouting.ts`, `Dashboard.tsx`, `Header.tsx`, `SolicitacoesCentral.tsx`): Implementado roteamento inteligente e unificado para abertura da tela de destino ao clicar em qualquer notificação na página de Início e no Header. Suporta context_key, ID de solicitação (abrindo o modal correspondente), número de chamado (#1234567) e inferência de assuntos, tornando todos os itens interativos.',
  },
  {
    data: '2026-09-02',
    resumo: 'Logística - Expedição > Log de Envio de E-mail (`types.ts`, `expedicaoApi.ts`, `LogisticaExpedicao.tsx`, `expedicao_carregamentos`): Adicionadas colunas enviado_por, enviado_por_nome e historico_envios (JSONB), registrando quem disparou cada e-mail (aviso de chegada ou expedição final), data/hora, assunto e destinatários, com exibição de card detalhado no topo do formulário e quem enviou nos cards da lista.',
  },
  {
    data: '2026-09-02',
    resumo: 'Suprimentos > Pendências de Processamento (`types.ts`, `supPendenciasApi.ts`, `PendenciasProcessamento.tsx`, `RequestDetailsModal.tsx`): Implementado log de auditoria de ações completo (`historico_acoes` JSONB no Supabase), registrando cada baixa (com resolução) e reabertura com nome do usuário, data/hora e motivos, com visualização de timeline e histórico na tela.',
  },
  {
    data: '2026-09-02',
    resumo: 'Logística - Expedição > Campo CNH do Motorista (`types.ts`, `database.types.ts`, `TramoCard.tsx`, `LogisticaExpedicao.tsx`, `expedicaoEmail.ts`, `expedicao_tramos`): Adicionado campo de CNH após o nome do motorista no formulário de expedição com persistência no Supabase, badge indicativo no cabeçalho do tramo e integração aos e-mails automáticos.',
  },
  {
    data: '2026-09-02',
    resumo: 'Logística - Expedição > Opção "Escada / Plataforma" nos Tramos (`types.ts`, `TramoCard.tsx`, `expedicao_tramos`): Adicionada a opção "Escada / Plataforma" no dropdown de seleção de tramos do formulário de expedição e atualizada a restrição de verificação (check constraint) no banco de dados Supabase.',
  },
  {
    data: '2026-09-02',
    resumo: 'Administração, APIs & Cotações > Layout de Alçadas de Usuário, Conversão Dólar/Real e Ampliação da Tabela de Cotação (`UserEditGovernanceModal.tsx`, `format.ts`, `DataTable.tsx`, `PropostaItensGrid.tsx`, `apiUsageApi.ts`, `UsageAnalyticsSection.tsx`, `ImportarPropostasPanel.tsx`, `extrair-cotacao`): 1. Redesign completo da aba "Alçadas de Aprovação" no modal de governança de usuários (`UserEditGovernanceModal.tsx`), substituindo o dropdown flutuante estreito que cortava na borda por uma seleção ampla em grade com busca em tempo real, chips de setores selecionados com remoção direta, botões "Selecionar Todos"/"Limpar" e rodapé de ações fixo; 2. Conversão de custos de chamadas de IA e telemetria de USD para BRL multiplicando pela taxa fixa de 6, com novo formatador `formatCustoBrl` (2 a 4 casas decimais para micro-custos de tokens em R$); 3. Aumento do tamanho e altura mínima da tabela de itens da cotação (`minHeight="24rem"`) em `PropostaItensGrid`, com coluna e menu de Vínculo de RI expandidos e inteligentes.'
  },
  {
    data: '2026-09-01',
    resumo: 'Administração > Gestão de Usuários e Permissões por Módulo (`AdminPanel.tsx`, `UsersByModuleView.tsx`, `pages.ts`): 1. Implementado seletor de visualização na aba Usuários alternando entre "Visão por Colaborador" e "Visão por Módulo & Permissões"; 2. Nova visão por módulo centralizando a auditoria de acesso de todas as telas e recursos do SISTEN; 3. Exibição de estatísticas de acesso por página, identificação da origem da permissão (Admin Global, Papel Padrão, Override Manual) e ações rápidas inline de liberação/bloqueio com persistência no Supabase; 4. Restrição do módulo Facilities exclusivamente a Administradores e ao responsável Adriano.'
  },
  {
    data: '2026-09-01',
    resumo: 'Helpdesk & Atendimento > Redesign Modular, Relatórios e Avaliação CSAT (`Helpdesk.tsx`, `HelpdeskAtendimento.tsx`, `HelpdeskRelatorios.tsx`, `HelpdeskSatisfactionCard.tsx`, `helpdeskUtils.ts`): 1. Nova estrutura modular separando Atendimento Operacional Split-View e Relatórios Executivos; 2. Fila inteligente de chamados com contagem regressiva e alertas visuais de SLA por criticidade (Níveis 1 a 5); 3. Linha do tempo unificada com respostas ao solicitante, notas internas confidenciais TI/Suporte e respostas rápidas (Canned Responses); 4. Dashboard executivo com KPIs de MTTR real, SLA Compliance %, CSAT 1-5 estrelas, evolução temporal e exportação CSV; 5. Formato estruturado de avaliação de satisfação (CSAT) no fechamento de chamados com tags específicas para TI e Facilities (agilidade, solução eficaz, cordialidade, organização do local) e ação de reabertura rápida; 6. Filtro rigoroso de atendentes ativos na atribuição de chamados.'
  },
  {
    data: '2026-09-01',
    resumo: 'Administração & Autenticação > Padronização de Nomes em MAIÚSCULAS (`localDb.ts`, `Signup.tsx`, `ProfileView.tsx`, `UserEditGovernanceModal.tsx`, `core_perfis`): 1. Todos os cadastros e atualizações de usuários agora convertem e persistem obrigatoriamente o nome completo em letras maiúsculas (`UPPER`); 2. Campos de entrada de nome no Signup, Meu Perfil e Modal de Governança forçam exibição e digitação em maiúsculas; 3. Criada trigger no PostgreSQL do Supabase (`trg_core_perfis_upper_name_trigger`) garantindo que qualquer inserção/atualização mantenha os nomes normalizados em caixa alta; 4. Executado script de migração atualizando 100% dos usuários existentes no Supabase e no cache local para caixa alta.'
  },
  {
    data: '2026-09-01',
    resumo: 'Administração > Redesign Completo da Gestão de Usuários (`AdminPanel.tsx`, `UserEditGovernanceModal.tsx`): 1. Reformulação visual e ergonômica seguindo design enterprise contemporâneo com cartões executivos de métricas (KPIs de Total, Pendentes, Ativos e Admins); 2. Fila de Aprovações Pendentes em formato "Inbox de Cadastros" com avatares dinâmicos, resumo de cargo e setor solicitado, e aprovação/configuração rápida; 3. Barra unificada de filtros com chips de status (Todos, Ativos, Pendentes, Admins, Compradores, Gestores, Inativos), busca global em tempo real e seletor com contadores de colaboradores por setor; 4. Tabela de usuários refinada com avatares coloridos por hash, badges semânticos para cada papel (Role) e alçadas de aprovação, e menu de ações integrado; 5. Novo modal completo de governança e edição de usuário (`UserEditGovernanceModal`) centralizando dados cadastrais, cargo, setor corporativo, papel de acesso, grupo SAP, alçadas de aprovação e reset de senha.'
  },
  {
    data: '2026-09-01',
    resumo: 'Administração > Gestão de Usuários (`AdminPanel.tsx`, `localDb.ts`): 1. Exibição clara e formatada do nome do setor (com ícone e badge visual) tanto na lista de Perfis Ativos quanto na Fila de Aprovações Pendentes; 2. Edição rápida de setor inline por usuário (seletor dinâmico com confirmação e persistência direta no Supabase `core_perfis`); 3. Botão "Editar Setor" adicionado na coluna de ações da tabela de usuários; 4. Inclusão de campo de busca global (nome, e-mail, cargo, setor, grupo SAP) e filtro de visualização por setor corporativo.'
  },
  {
    data: '2026-08-31',
    resumo: 'Almoxarifado > Perfil de Consumo Semanal (`consumoSemanal.ts`, `ConsumoSemanal.tsx`, `ConsumoSemanalChart.tsx`): 1. Extensão automática da série temporal de consumo até a semana atual do calendário (mesmo sem saídas recentes registradas na MB51), garantindo visibilidade completa e sem omissão de semanas recentes; 2. Destaque visual da "Semana atual" com linha de referência dedicada no gráfico Recharts, indicação no tooltip e selo "Atual" na tabela de valores; 3. Inclusão de badge com a data dos dados da base ("Base com dados até DD/MM/AAAA") e metadados da última importação SAP MB51 (data/hora e nome do arquivo) no cabeçalho e descrição do gráfico para clareza sobre o frescor das informações.'
  },
  {
    data: '2026-08-31',
    resumo: 'Financeiro > Reconciliação de Pedidos (`vw_pedidos_conciliacao_pagamentos`, `vw_pedidos_conciliacao_detalhes`, `ReconciliacaoPedidos.tsx`): 1. Implementado o cruzamento automático de Pedidos de Compras (PO) com Notas Fiscais (MIRO) e liquidação no Contas a Pagar (FBL1N); 2. Resolução estrita 1:1 de materiais e deduplicação de partidas financeiras (eliminada multiplicação de linhas por movimentações de estoque); 3. Classificação consolidada por pedido (Totalmente Pago, Parcialmente Pago, Em Aberto); 4. Tabela expansível com detalhamento individual por NF/fatura (vencimento, compensação, status); 5. KPIs consolidados e exportação em Excel (.xlsx).'
  },
  {
    data: '2026-08-31',
    resumo: 'Contas a Pagar & Gráficos (`ChartCard.tsx`, `ContasPagarAnalise.tsx`, `MultiSelectFilter.tsx`, `index.css`): 1. Gráficos com muitos dados agora iniciam automaticamente com o scroll à direita exibindo as semanas/meses mais recentes; 2. Filtro de Fornecedor transformado em seleção múltipla com dropdown pesquisável (`MultiSelectFilter`), checkboxes, contador e suporte à busca por razão social e código SAP; 3. Scrollbar customizada, elegante e visível (`custom-scrollbar`); 4. Removido seletor redundante de empresas.'
  },
  {
    data: '2026-08-30',
    resumo: 'Portaria > Livro de Ocorrências & Briefing de Segurança: 1. Integração da Saída de Colaboradores com `rh_pessoas` (busca inteligente por nome ou matrícula e preenchimento automático de cargo/empresa/matrícula); 2. Validação estrita de 30 dias de validade do Briefing de Segurança com cálculo de data de realização e dias restantes/expirados em tela; 3. Multi-seleção de sessões e exportação em PDF Consolidado com renderização real das assinaturas digitais colhidas; 4. Compressão automática de fotos de câmera/galeria com anexo dedicado nos PDFs dos formulários operacionais.'
  },
  {
    data: '2026-08-30',
    resumo: 'Portaria > Cadastro de Vigilantes (`port_vigilantes`): 1. Atualização completa da base de vigilantes com a equipe oficial (Cassio Bruno, Diego Alves, Douglas da Rocha, Edinei Rodrigues, Eduardo Inacio, Evandro Rocha, Osmario Cardoso, Rafael Messias, Ricardo Andre, Simone Pedreira); 2. Inclusão e suporte a colunas `data_admissao` e `data_nascimento` no banco e na interface administrativa (`/admin/cadastros`).'
  },
  {
    data: '2026-08-27',
    resumo: 'Notificações & Header (Roteamento Completo e Deep Links): 1. O clique nas notificações do Header agora redireciona com precisão para todas as telas correspondentes (`/admin/importacao-materiais`, `/admin/usuarios`, `/admin/feedback?id=...`, `/suprimentos/cadastros-sap?id=...`, `/solicitacoes/aprovacoes?id=...`, `/solicitacoes/minhas?id=...`, `/solicitacoes/todas?id=...`, `/rastreio?ri=...`, `/formularios/rh-ase-hora-extra?id=...`, `/formularios/logistica-expedicao?id=...`, etc.); 2. Implementado suporte a deep-link `?id=...` para abertura e seleção automática de solicitações e formulários.'
  },
  {
    data: '2026-08-27',
    resumo: 'RH > ASE - Hora Extra (Vínculo Automático com `rh_rotas` & Organização de Transporte): 1. Criação das Views `vw_rh_ase_itens` e `vw_rh_rotas_colaboradores` com junção inteligente e insensível a acentos pelo nome do colaborador; 2. Enriquecimento automático em tempo real de `rota_transporte`, `ponto_embarque_transporte`, `horario_embarque_transporte` e `contato_transporte` em `rhApi.ts`; 3. Relatório PDF Consolidado atualizado com colunas completas de transporte (Colaborador + Telefone/Contato, Rota + Ponto de Embarque, Setor/Turno, Horário HE e Protocolo); 4. Exportação Excel com colunas completas de transporte; 5. Envio de e-mail e interface web agora detalham ponto, rota e telefone de contato de cada passageiro.'
  },
  {
    data: '2026-08-27',
    resumo: 'RH > Transporte (Tabela `rh_rotas` & Cadastro de Pontos de Embarque): 1. Criação e migração da tabela `rh_rotas` no Supabase com suporte a RLS e indexação de colaboradores e rotas; 2. Carga inicial de 156 registros mapeando funcionários, pontos de embarque, horários, contatos e rotas ("Rota 01", "Rota 02", "Rota 03", "Rota 04" e "Rota Turno"); 3. Tipagem TypeScript `RhRota` em `types.ts` e métodos de API (`listarRhRotas`, `buscarRotaPorFuncionario`, `criarRhRota`, `atualizarRhRota`, `excluirRhRota`, `importarRhRotas`) em `rhApi.ts`.'
  },
  {
    data: '2026-08-27',
    resumo: 'RH > ASE - Hora Extra (Novo Padrão de Protocolo Inteligente ASE-DDMMAA-SETOR): 1. Criação das funções `gerarProtocoloAse`, `extrairSiglaSetor` e `formatarDataDDMMAA` em `rhApi.ts`; 2. Formato padronizado e intuitivo: prefixo `ASE-`, data no formato `DDMMAA` (ex: `270826`) e sigla limpa do setor (ex: `SUPR`, `ALMOX`, `MANUT`, `RH`, `PROD`, `PORT`, `SEG`), com sufixo sequencial automático (`-01`, `-02`) apenas se houver mais de uma ASE no mesmo dia para o mesmo setor; 3. Sincronização dinâmica no formulário durante o preenchimento/edição do rascunho conforme o setor e a data são selecionados.'
  },
  {
    data: '2026-08-27',
    resumo: 'RH > ASE - Hora Extra (Exportação Consolidada do Dia em PDF e Excel): 1. Implementação de exportação consolidada em PDF (`exportAseConsolidadoDiaPdf`) e Excel (.xlsx via `exportAseConsolidadoDiaExcel`) com todas as informações e ASEs de uma data de execução; 2. Relatórios estruturados com 4 seções/abas completas: Resumo Geral das Solicitações com Totais, Programação de Transporte do Dia (apenas colaboradores com transporte solicitado), Programação de Refeição do Dia (apenas colaboradores com refeição solicitada) e Relação Geral de Colaboradores; 3. Botões de ação direta "PDF Consolidado" e "Excel Consolidado" incorporados nos cabeçalhos de cada grupo de data na listagem principal e na barra de ação da tela de edição.'
  },
  {
    data: '2026-08-27',
    resumo: 'Admin > Usuários (Edição em Massa de Módulos de Acesso): 1. Implementação de seleção múltipla por checkboxes na tabela de perfis ativos em `/admin/usuarios`; 2. Barra de ações em massa com contador de selecionados, botão "Editar Acessos em Massa" e "Desmarcar todos"; 3. Novo componente `BulkPageAccessModal.tsx` permitindo aplicar regras granulares de acesso (Manter inalterado, Liberar, Bloquear ou Restaurar Padrão) para múltiplos usuários de uma só vez, com suporte a todas as páginas, subpermissões de formulários e controle de escopo ASE; 4. Método transacional `updateBulkPageAccess` em `localDb.ts` com sincronização automática no Supabase e auditoria de atividades.'
  },
  {
    data: '2026-08-27',
    resumo: 'RH > ASE - Hora Extra (Agrupamento por Datas & Permissão de Visibilidade): 1. Lista de solicitações de ASE reestruturada com agrupamento por datas de execução em ordem decrescente, exibindo cabeçalhos com dia da semana, total de solicitações, colaboradores e horas por data; 2. Campo de busca em tempo real com filtros por status e alternador de escopo; 3. Controle de permissão de visibilidade em Módulos de Acesso (`PageAccessModal.tsx`): administradores podem definir se o usuário visualiza apenas as próprias solicitações criadas ou tem permissão de visão global para todas as ASEs (`rh_ase_ver_todas`); 4. Remoção do item isolado e legado "Formulário ASE - Hora Extra (Legado)" da seção de RH no modal de módulos de acesso.'
  },
  {
    data: '2026-08-27',
    resumo: 'RH > ASE - Hora Extra & Disparo de E-mail (Outlook): 1. Integração do botão "Enviar" com disparo automático de e-mail formatado para `ase@ten.ind.br` (configurado dinamicamente na aba Destinatários de E-mail em `/admin/cadastros`) contendo resumo da ASE, listagem geral e seções exclusivas destacando os colaboradores selecionados para Transporte e Refeição; 2. Habilitação de modo de edição pós-envio ("Editar Solicitação") permitindo atualizar colaboradores, horários e observações mesmo após a ASE ter sido enviada; 3. Limpeza visual das colunas de Transporte e Refeição na tabela PDF com marcadores neutros.'
  },
  {
    data: '2026-08-27',
    resumo: 'Relatórios & Exportação PDF: padronização da logo corporativa nos cabeçalhos de todos os relatórios e formulários exportados em PDF (ASE - Hora Extra, Portaria, Cadastro SAP e Solicitações de Compra) utilizando a identidade visual oficial `logo-adm.png` com cache e dimensionamento proporcional automático.'
  },
  {
    data: '2026-08-27',
    resumo: 'RH & Calendário de Horas Extras (`rh_hora_extra`): carga e configuração da tabela de percentuais por dia no Supabase cobrindo os anos de 2025, 2026 e 2027 com as regras padrão da empresa (Segunda a Sexta: 60%, Sábado: 80%, Domingo e Feriados Nacionais: 100%). Inclusão de fallback automático por dia da semana no método `buscarPercentualHE` para preenchimento ágil no formulário ASE - Hora Extra (FRM.RHU-0007).'
  },
  {
    data: '2026-08-31',
    resumo: 'Logística - Expedição & Otimização de Lançamento: 1. Adição dos campos "Nº Tramo (4 dígitos)" e "Número da NF" para identificação precisa nos registros e no e-mail; 2. Remoção do campo/botão de observação nas etapas de horário; 3. Prova de erros e sanitização automática de datas (normalização inteligente de anos digitados com 2 dígitos, ex: 0026 -> 2026, e restrições de intervalo no picker); 4. Cálculo automático de Lead Time das etapas (Portaria ➔ Pátio, Pátio ➔ Expedição e Lead Time Total) exibido em painel dedicado no card e incorporado ao fim do corpo do e-mail; 5. Atualização do formato de assunto do e-mail com prefixo, sequência, tramo, número do tramo, NF e placa.'
  },
  {
    data: '2026-08-27',
    resumo: 'Admin > Módulos de Acesso & Subpermissões de Formulários: criação de sistema de subpermissões granulares para os grupos de formulários em `PageAccessModal.tsx` e `pages.ts`. Permite ao administrador selecionar quais grupos operacionais exibir para cada usuário (Portaria & Segurança Patrimonial, Logística & Expedição, RH & Departamento Pessoal e Almoxarifado). Ao selecionar o módulo geral "Formulários", todos os grupos são liberados por padrão ("se selecionar formulários, mostrar todos"), permitindo restrição pontual e independente por usuário com proteção de rotas e visualização personalizada no Hub `/formularios`.'
  },
  {
    data: '2026-08-27',
    resumo: 'Logística - Expedição & UX no Pátio: 1. Inversão e pareamento dos botões nos campos de horário e data (Hoje ao lado de Data, Agora ao lado de Hora); 2. Diálogo de confirmação para alteração ou limpeza de horários/datas pré-existentes, prevenindo toques acidentais em dispositivos móveis; 3. Botão "Enviar chegada por e-mail" com animação pulsante (`animate-pulse`) e destaque visual imediato após preenchimento da chegada.'
  },
  {
    data: '2026-08-27',
    resumo: 'Logística - Expedição & Auto-Save: 1. Auto-save / salvamento contínuo em segundo plano (debounce 800ms) a cada campo alterado, com indicador visual de status ("Salvando rascunho...", "Rascunho salvo") para garantir que nenhum dado seja perdido caso a página seja recarregada ou fechada; 2. Validação para habilitar o botão "Salvar e enviar e-mail" apenas quando todos os tramos possuírem o horário de expedição preenchido; 3. Adição de campos de data individuais para cada etapa (Portaria, Pátio, Expedição) na tabela `expedicao_tramos` do Supabase e na interface com botões rápidos "Hoje" e "Agora"; 4. Reorganização visual dos links de fotos anexadas em seção dedicada com marcadores no corpo do e-mail Outlook.'
  },
  {
    data: '2026-08-27',
    resumo: 'Admin > Cadastros Gerais & Gestão de E-mails (Outlook): nova aba "Destinatários de E-mail (Outlook)" em `/admin/cadastros` integrada à tabela `config_envio_emails` no Supabase e módulo `emailConfigApi.ts`. Permite ao administrador cadastrar, editar, excluir, ativar/inativar e testar no Outlook os destinatários (Para), cópias (CC, BCC) e assuntos padrão utilizados em todos os fluxos de envio do SISTEN (Cadastro SAP, Aviso de Chegada de Expedição, Relatório de Carregamento de Tramos, Relatório de Portaria e Chamados do Jurídico).'
  },
  {
    data: '2026-08-26',
    resumo: 'Admin > Cadastros Gerais & Vigilantes: nova página `/admin/cadastros` para centralização e gestão de tabelas mestres e listas suspensas do SISTEN. Inclui cadastro completo de Vigilantes da Portaria (tabela `port_vigilantes`), controle de status ativo/inativo em tempo real, matrícula, turnos e empresas prestadoras, com integração automática em todos os formulários da Portaria através do seletor inteligente `VigilanteSelect`.'
  },
  {
    data: '2026-08-26',
    resumo: 'Módulo Portaria & Segurança Patrimonial: digitalização completa dos 5 formulários operacionais da portaria TEN: 1. Controle de Entrada de Equipamentos e Ferramentas de Terceiros (FRM.SGP-0011, tabela `port_controle_equipamentos`); 2. Registro de Chegada de Transportes (FRM.SGP-0009, tabela `port_registro_transportes`); 3. Controle de Chegada e Saída de Carretas de Chapas (FRM.SGP-0020, tabela `port_controle_carretas`); 4. Relatório de Portaria & Ocorrências (FRM.SGP-0010, tabelas `port_relatorio_portaria` e `port_relatorio_ocorrencias`); 5. Lista de Presença — Briefing de Segurança (FRM.SGP-0013, tabelas `port_briefing_sessoes` e `port_briefing_participantes`). Inclui coleta de assinatura digital touch/canvas, gerador de relatórios e comprovantes oficiais em PDF padrão TEN, validador instantâneo de CPF de integração, contadores de pátio ao vivo e hub integrado em Formulários.'
  },
  {
    data: '2026-08-26',
    resumo: 'Formulários > Logística - Expedição: novo módulo para registro de carregamento de tramos com dados do veículo (cavalo, carreta, dolly), motorista, três marcações de tempo (chegada portaria, entrada pátio, expedição) preenchidas em momentos diferentes ao longo do dia, fotos comprimidas em cada etapa, observações livres por horário e envio de aviso parcial via e-mail assim que o caminhão encosta (portaria). Mobile-first: tramos recolhíveis, campos de placa maiores, câmera integrada no celular (capture="environment") + galeria. Tabelas: `expedicao_carregamentos`, `expedicao_tramos`, `expedicao_fotos` + bucket privado `expedicao-fotos`. Link assinado (90d) no e-mail (formato preservado: Segue dados para carregamento do T1 e T4...).'
  },
  {
    data: '2026-08-24',
    resumo: 'Gestão de APIs & IA: adicionada coluna "Usuário" na tabela de chamadas recentes de IA e no histórico de conversões markdown, permitindo auditar exatamente qual usuário/sessão realizou cada requisição às APIs (Gemini, OCR, Extrator).'
  },
  {
    data: '2026-08-24',
    resumo: 'Conversor Markdown: novo fluxo em duas etapas (carregar arquivos primeiro → conferir pré-visualização de qualquer documento na lista → botão "Converter tudo" para iniciar). Inclui leitor integrado de PDF/imagem lado a lado e reaproveitamento inteligente de cotações já convertidas no Supabase.'
  },
  {
    data: '2026-08-24',
    resumo: 'Gestão de APIs & IA: nova Edge Function `gemini-generate` no Supabase com proxy seguro para Google Gemini AI Studio (chaves AQ...). Nova aba "Gestão de APIs & IA" no Painel Administrativo com visão de endpoints, métricas de latência, playground de testes em tempo real e guia de segredos Supabase CLI.'
  },
  {
    data: '2026-08-23',
    resumo: 'Almoxarifado & Chegadas Físicas: nova tabela `almoxarifado_chegadas` no Supabase para registro de chegada física de itens com PO emitida antes do lançamento da MIGO no SAP. Nova aba "Almoxarifado" no Rastreio de Compras com marcação individual e em lote por data de chegada, e selo de auditoria "Chegou no almoxarifado" na Central de Compras (Sem MIGO).'
  },
  {
    data: '2026-08-20',
    resumo: 'Rastreio de Compras: aumento e fixação de larguras mínimas em pixels nas colunas da tabela e remoção do truncamento indevido nos números de RM, PO, datas e valores, garantindo visualização integral dos dados tanto no mobile quanto no desktop.'
  },
  {
    data: '2026-08-20',
    resumo: 'Fornecedores: habilitação de pesquisa pelo campo Nome Fantasia (`nome_fantasia`) no campo de busca textual da listagem de fornecedores cadastrados.'
  },
  {
    data: '2026-08-19',
    resumo: 'Nova importação SAP ZL0170 (Reconciliação Pedido x MIGO x MIRO): tabela `zl0170_miro`, módulo de parsing `src/lib/zl0170Miro.ts`, card de upload em AdminPanel e log tipo "ZL0170". Permite identificar a qual Pedido (PO) uma fatura/nota fiscal MIRO se refere — o FBL1N sozinho não tem essa informação (campo "Documento de compras" vem sempre vazio na extração usada).'
  },
  {
    data: '2026-08-19',
    resumo: 'Reportes de feedback (bugs e sugestões): disparo automático de notificações (in-app e Supabase) para todos os administradores ativos ao criar novo reporte, com deep link direto via context_key para a aba Reportes do AdminPanel (`/admin/feedback?id=...`).'
  },
  {
    data: '2026-08-19',
    resumo: 'Solicitações (fila coletiva): adição de campo para digitação e persistência do Número da RM SAP (`linked_rm_number`) no painel lateral de atendimento com sincronização no Supabase, indicador visual de RM na tabela e ampliação horizontal do modal de detalhes da solicitação (`RequestDetailsModal`) com grid responsivo multi-colunas.'
  },
  {
    data: '2026-08-16',
    resumo: 'Higienização e sanitização automática de textos técnicos SAP (materials): remoção de artefatos de truncamento/codificação do SAP ALV (ex: "旰掳籷" e ideogramas asiáticos decorrentes de estouro do limite de 255 caracteres) substituindo por "..." na ingestão (AdminPanel/ZL0169/ZL0162/localDb), na busca e em todas as telas de cotação/catálogo (Compras, SapDetailModal, Materials).'
  },
  {
    data: '2026-08-16',
    resumo: 'Expansão do módulo Almoxarifado: novas telas de Movimentações de Estoque (MB51 - 5 abas: Visão Geral, Giro & Cobertura, Idade do Estoque, Urgência de Compra, Estoque Mínimo) e Perfil de Consumo Semanal (mestre-detalhe por material com sparklines). Novas views SQL (`movimentacoes_analise.sql`, `estoque_reposicao.sql`) e módulos de cálculo (`movimentacoes.ts`, `giroEstoque.ts`, `reposicao.ts`, `consumoSemanal.ts`).'
  },
  {
    data: '2026-08-15',
    resumo: 'Nova importação SAP MB51 (Movimentação de Estoque): tabela `mb51_mov_estoque`, módulo de parsing `src/lib/mb51.ts`, modos de carga (Apenas Novos / Upsert vs Substituição Total), card de upload em AdminPanel e log tipo "MB51".'
  },
  {
    data: '2026-08-15',
    resumo: 'Criação da página Diretrizes: levantamento completo de regras de negócio, exibição, importação e tabelas do banco de todas as páginas do app (28 telas + rotinas de import do localDb.ts).'
  },
  {
    data: '2026-08-15',
    resumo: 'RM de serviço (começa com "17") nunca recebe MIGO no SAP — passou a ser excluída do grupo/contagem "Sem MIGO" na Central de Compras e no relatório Novidades.'
  },
  {
    data: '2026-08-15',
    resumo: 'RM de serviço (começa com "17") sem PO via ZL0132: passa a usar como fallback o número do campo "Pedido" do próprio ME5A para marcar a RM como "Processado".'
  },
  {
    data: '2026-08-15',
    resumo: 'Novo botão "Novidades" na Central de Compras: relatório por comprador (escopo por grupo SAP do usuário; admin vê tudo) com itens sem PO/MIGO, novas RMs/itens, exclusões e mudanças de quantidade da última importação ME5A. Nova coluna `import_logs.new_ris` (jsonb).'
  }
];

export const DIRETRIZES: DiretrizesDominio[] = [
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'conceitos-centrais',
    nome: 'Conceitos Centrais (leia primeiro)',
    icone: 'BookOpen',
    resumo:
      'Regras reutilizadas por muitas páginas diferentes. Documentadas uma única vez aqui; as seções de cada página abaixo só referenciam este bloco em vez de repetir a explicação.',
    paginas: [
      {
        id: 'motor-enriquecimento-sap',
        nome: 'Motor de status SAP — localDb.getEnrichedSAPRequisicoes()',
        arquivo: 'src/db/localDb.ts (~linha 3481)',
        secoes: [
          {
            titulo: 'O que é',
            itens: [
              'Função única que transforma as requisições SAP (ME5A) cruas em `EnrichedSAPRecord[]`, calculando status, atraso e alertas. É consumida por praticamente todas as telas de Suprimentos: Painel SAP, Central de Compras, Dashboards de Suprimentos, Rastreio de Compras, Dashboard inicial, e o relatório Novidades.',
              'Fonte do PO (`documento_compra`): 1º o servidor (`view_enriched_requisicoes`, join com `pedidosforn`/ZL0132); 2º fallback para o cache local de `pedidosforn`; 3º — só para RM de serviço (RM começando com "17") e só quando os dois anteriores não têm PO — o número do campo "Pedido" do próprio ME5A.'
            ]
          },
          {
            titulo: 'Campos calculados',
            itens: [
              '`hasPO`: verdadeiro quando existe `documento_compra` válido (não vazio, "0" ou "null") e a linha não foi marcada eliminada no SAP (`eflag_e = "L"` em pedidosforn, controlado por RI+documento, não pelo PO inteiro).',
              '`status_requisicao`: "Processado" se `hasPO`, senão "Sem PO". É o campo mais usado do sistema — quase toda tela usa esse booleano como corte "tem pedido / não tem pedido".',
              'Entregue: item é considerado entregue quando existe `data_migo` (data de recebimento físico/MIGO), independente do `item_status` manual do comprador. RM de serviço (prefixo "17") nunca recebe MIGO no SAP — por isso é excluída de qualquer grupo/contagem "Sem MIGO" (Central de Compras e relatório Novidades).',
              '`natureza`: derivada de `tipo_documento` — ZR01 Normal, ZR02 Urgente, ZR03 Máquina Parada, ZR04 Equipamento Pesado, ZR05–ZR08 variantes de Exportação, ZR09 Orçamento, ZR10 Subempreitada, ZR11/ZR16/ZR17 Serviço Normal/Urgente/MP.',
              '`lead_time_compras_meta` (dias-meta para o comprador colocar o PO): 6 dias se natureza contém "urgente"; 2 dias se "máquina parada"/"MP"; 15 dias se "normal"; 30 dias (default) nos demais casos.',
              '`dias_em_aberto`: dias entre `data_solicitacao` e a "data de referência" (data do MIGO se entregue; senão data do pedido; senão "hoje").',
              '`atraso_comprador` = max(0, `dias_em_aberto` − `lead_time_compras_meta`).',
              '`faixa_atraso` (escala ordinal): Sem Atraso / 1-7 dias / 8-15 dias / 16-30 dias / Acima de 30 dias.',
              '`alerta` (usado em badges/filtros em quase todas as telas de Suprimentos): atraso > 15 dias E natureza Urgente/Serviço-Urgente → "⚠️ ESCALAR IMEDIATAMENTE"; atraso > 30 → "⚠️ AÇÃO URGENTE"; atraso > 15 → "⚡ ACOMPANHAR"; atraso > 7 → "📋 MONITORAR"; senão → "✅ OK".',
              '`status_atualizado`: "Concluído" (processado + entregue) / "Em Cotação" (flag `status_processamento="A"`) / "Crítico - Ação Urgente" (atraso>30) / "Atrasado" (atraso>15) / "Em Andamento" (atraso>0) / "No Prazo".'
            ]
          },
          {
            titulo: 'RM de serviço (prefixo "17")',
            itens: [
              'RM/requisição cujo número começa com "17" é considerada de Serviço (as demais, "11"/"12"/"13", são Material — ver também `src/lib/demandas.ts`).',
              'Nunca recebe registro de MIGO no SAP — todo lugar que calcula "Sem MIGO" precisa excluir explicitamente RM de serviço, senão ela aparece permanentemente como pendência que nunca vai ser resolvida.',
              'Pode ter o PO lançado diretamente no campo "Pedido" do próprio ME5A, sem passar pelo ZL0132 — por isso o fallback de PO descrito acima existe só para esse prefixo.'
            ]
          }
        ]
      },
      {
        id: 'transicoes-item-status',
        nome: 'Transições de status do item (pipeline do comprador)',
        arquivo: 'src/db/localDb.ts — isValidStatusTransition (~linha 3705)',
        secoes: [
          {
            titulo: 'Mapa de transições válidas de item_status',
            itens: [
              'aguardando cotação → cotação enviada',
              'cotação enviada → análise de cotações | aguardando cotação (volta)',
              'análise de cotações → aguardando aprovação PO | cotação enviada (volta)',
              'aguardando aprovação PO → pedido enviado | análise de cotações (volta)',
              'pedido enviado → aguardando coleta | aguardando aprovação PO (volta)',
              'aguardando coleta → em rota de entrega | pedido enviado (volta)',
              'em rota de entrega → entregue | aguardando coleta (volta)',
              'entregue → inativo',
              'inativo → nenhuma (estado terminal)',
              'Escape: de/para "inativo" ou "aguardando solicitante" é sempre permitido, de qualquer estado (arquivar e pausar de SLA funcionam de qualquer ponto do pipeline).',
              '⚠️ Atenção: essa função está definida no código mas hoje NÃO é chamada em nenhum lugar do app — `updateBuyerFields` grava `item_status` direto, sem validar a transição. É uma regra "desenhada" mas não aplicada em runtime; não presuma que o sistema bloqueia uma transição inválida de item.',
              'Não confundir com o status de `Request` (solicitações/chamados) — são duas máquinas de estado independentes. Ver domínio "Solicitações, Demandas & Aprovações".'
            ]
          }
        ]
      },
      {
        id: 'sistema-permissoes',
        nome: 'Sistema de permissões e roles',
        arquivo: 'src/lib/pages.ts, src/db/localDb.ts, src/types.ts',
        secoes: [
          {
            titulo: 'Valores de Role',
            itens: [
              '`admin`, `visualizador`, `solicitante`, `requisitante` (opera a fila coletiva — vê/responde TODAS as solicitações abertas, não só as próprias), `gestor`, `comprador`, `coordenador_suprimentos`, `atendente`, `pendente`.',
              '`Profile.roles` é um array (suporta múltiplos papéis), mas a única UI de edição (AdminPanel → Usuários → coluna "Nível de Acesso") é um `<select>` de valor único — na prática, cada usuário tem efetivamente 1 role.',
              '`UserStatus`: `pendente` | `ativo` | `inativo` — ortogonal ao role. Só `status === "ativo"` consegue logar.'
            ]
          },
          {
            titulo: '⚠️ Dois sistemas de permissão coexistem (importante para manutenção)',
            itens: [
              '1) `canAccessPage(user, pageId)` em `src/lib/pages.ts` — o mecanismo "oficial"/mais novo. Cada página tem `defaultRoles: Role[] | "*"` e, opcionalmente, `alwaysAdmin: true`. Admin sempre passa; senão checa override em `profiles.page_access[pageId]`; senão cai no `defaultRoles`. Usado por `Sidebar.tsx` (menu) e `PageAccessModal.tsx` ("Módulos de acesso").',
              '2) `hasPermission(user, module, action)` em `src/db/localDb.ts` — sistema RBAC mais antigo, matriz fixa por role (strings tipo `"materiais.visualizar"`, `"sap.visualizar_painel"`). NÃO considera `page_access` (overrides por usuário). Usado por `Sobre.tsx` (a tela Início migrou para `canAccessPage`).',
              'Consequência prática: um admin que restringe manualmente o acesso de um usuário via "Módulos de acesso" (mexe em `page_access`) NÃO afeta o que `Sobre.tsx`/`Dashboard.tsx` mostram como liberado para esse usuário, porque essas duas telas consultam o sistema antigo. Ao dar manutenção em permissões, sempre checar as DUAS fontes.',
              'A aba "Permissões (Matrix)" do AdminPanel é uma TERCEIRA fonte — uma tabela estática/hardcoded só para exibição, não lida de nenhum dos dois sistemas acima. Pode ficar desatualizada; não é fonte de verdade operacional.'
            ]
          },
          {
            titulo: 'Páginas com alwaysAdmin: true',
            itens: [
              'Não podem ser habilitadas via override de `page_access` para não-admins (o checkbox fica desabilitado no modal "Módulos de acesso") — mesmo assim, um role incluído no `defaultRoles` dessa página continua vendo-a normalmente; `alwaysAdmin` só bloqueia a customização por usuário, não restringe além do `defaultRoles`.',
              'Exemplos: todas as páginas do grupo Administração, como `admin_importacao_materiais` (Importação de Planilhas).'
            ]
          },
          {
            titulo: 'Grupo de compras SAP do usuário (comprador ↔ grupo)',
            itens: [
              '⚠️ Existem DOIS campos redundantes para a mesma ideia: `profiles.grupo_compras` (texto livre, um único código, editável para QUALQUER usuário ativo na aba Usuários — não só quem tem role comprador) e a tabela `buyer_groups`/`UserBuyerGroup` (relação N:N — `{user_id, group_code, is_primary}`, gerenciada só para quem tem role `comprador` na aba "Grupos de Comprador"). Os dois não são sincronizados automaticamente entre si.',
              'O padrão real usado no código para "este usuário é comprador do grupo X" (ex.: giulia.aquino → grupo 610) é `localDb.getBuyerGroupsForUser(user.id)` → lista de `group_code` — é essa função que o relatório Novidades e o filtro "Minhas RMs" do Painel SAP usam.',
              '`aprovador_setores?: string[]` (lista de `Sector.id`) é a única regra que decide quem aprova cada solicitação de compra em Aprovações — além de `admin`/`coordenador_suprimentos`, que sempre aprovam tudo independente dessa lista.'
            ]
          }
        ]
      },
      {
        id: 'mecanica-importacao',
        nome: 'Mecânica comum de todas as importações de planilha',
        arquivo: 'src/db/localDb.ts — reconcileSchema (~linha 4176)',
        secoes: [
          {
            titulo: 'Como o parser reconhece colunas',
            itens: [
              'Cada rotina de import declara uma lista fixa `{ header, field }[]` (ex.: `ME5A_COLUMNS`, `ZL0132_COLUMNS`, `FBL1N_COLUMNS`). `reconcileSchema` casa por IGUALDADE EXATA de string (minúsculas + trim) — não é fuzzy/aproximado.',
              'Suporta cabeçalhos duplicados na planilha (ex.: "Criado por" aparece 4x no ZL0132, "Item" 2x): o N-ésimo header repetido casa com o N-ésimo campo esperado com esse nome, na ordem declarada.',
              '`missingColumns`: headers esperados que não vieram na planilha (o campo fica `null`). `newColumns`: colunas da planilha sem correspondência conhecida — não são descartadas, viram `campos_extras[header]` (coluna JSONB "flex"), EXCETO em ZL0132/PedidosForn/ME3N, onde os autores optaram por não gravar `campos_extras` para não duplicar dado já mapeado em coluna própria.',
              'Detecção de delimitador de CSV NÃO é automática dentro de `localDb.ts` — quem escolhe é a tela de upload (`AdminPanel.tsx`) antes de chamar a função de import: `.csv` é sempre tratado como separado por `;`; `.xlsx`/`.xls` é lido via `XLSX.utils.sheet_to_json`.',
              'ME3N é a exceção: tem uma camada extra de tolerância por aliases textuais alternativos para nomes de coluna de data (ex.: aceita "fim da validade", "fim per.validade", "dt.fim validade" como sinônimos de `fim_validade`).'
            ]
          },
          {
            titulo: 'Padrões de carga: upsert incremental vs. substituição total',
            itens: [
              'Upsert incremental (compara com o que já existe, decide insert/update por chave, sem apagar o resto): ME5A (`onConflict: ri`), ZL0132/PedidosForn (`onConflict: ri,doc_compra`), Contatos (`onConflict: cod_vendor`), CidadeForn (`onConflict: forn_codigo`), ME3N/ME3M (`onConflict: documento_compras,item`), Materiais ZL0169 (`onConflict: material_code`).',
              'Substituição total (DELETE de tudo + INSERT do arquivo inteiro — usado quando a planilha é uma "foto" pontual, não incremental): ZL0024 (Estoque), FBL1N (Contas a Pagar), Tabela de Frete, ZL0170 (Reconciliação Pedido x MIGO x MIRO).',
              'Toda importação grava um registro em `import_logs` com tipo, usuário, arquivo, contagens (lidos/inseridos/atualizados/eliminados), colunas ausentes/novas detectadas, e o detalhe das linhas ignoradas.'
            ]
          },
          {
            titulo: 'Log de importação: leitura leve vs. pesada',
            itens: [
              '`syncImportLogs()` (sync geral) busca só colunas leves dos 50 logs mais recentes — sem os campos JSONB pesados (`ignored_rows`, `missing_ris`, `new_ris`). Alimenta a listagem no AdminPanel com badges de contagem.',
              '`fetchImportLogDetail(id)` busca sob demanda o conteúdo pesado de UM log específico, só quando o admin expande a linha na UI (ou quando o relatório Novidades busca o último log ME5A). Motivo: a coluna `ignored_rows` sozinha já passou de 12MB no banco — baixar isso para todos os logs a cada sync seria o maior consumidor de egress do projeto.'
            ]
          }
        ]
      }
    ]
  },

  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'sap-compras',
    nome: 'Central de Compras & Painéis SAP',
    icone: 'ShoppingCart',
    resumo:
      'Ferramentas operacionais do comprador: acompanhar RMs, cotar fornecedores, rastrear entregas e visualizar indicadores gerenciais do setor de Suprimentos.',
    paginas: [
      {
        id: 'central-compras',
        nome: 'Central Compras',
        arquivo: 'src/views/Compras.tsx',
        secoes: [
          {
            titulo: 'Visão geral',
            itens: [
              'Ferramenta de cotação do comprador: agrupa itens por RM, cruza cada material com o histórico de fornecedores que já forneceram aquele código, e gera/envia "Carta Convite" (e-mail/WhatsApp) a um fornecedor ou em lote. Tem o botão "Novidades" (ver seção própria abaixo).'
            ]
          },
          {
            titulo: 'Regras de negócio',
            itens: [
              'Toggle "Sem PO" / "Sem MIGO" / "Todos": Sem PO = `status_requisicao==="Sem PO"`; Sem MIGO = Processado sem `data_migo` E que NÃO seja RM de serviço (prefixo "17" — nunca recebe MIGO, ver Conceitos Centrais).',
              'Match de fornecedor por material: busca em `pedidosforn` com `crf ilike "x"` (linha confirmada no SAP), por código de material com/sem zeros à esquerda, deduplicado por CNPJ mantendo o pedido mais recente.',
              'Para item já com PO, mostra o fornecedor do próprio pedido (não o histórico geral de material) — lógica: "quem tem o pedido, fala com ele para cobrar entrega".',
              'Texto técnico do material é injetado no corpo da Carta Convite; histórico de cotações já enviadas ao mesmo fornecedor é consultado para avisar o comprador antes de reenviar.',
              'Edição em lote: seleção múltipla de itens aplica status/data de uma vez.'
            ]
          },
          {
            titulo: 'Regras de exibição',
            itens: [
              'Filtros combináveis e dependentes entre si: RM, Comprador, Status, Alerta, Grupo de Mercadoria, Prioridade (1-5, pedida pelo solicitante no Rastreio de Compras) e Promessa de Entrega (intervalo de/até, estados com/sem data, atrasadas e prazos rápidos).',
              'Dois modos de visualização (cards/tabela); itens Sem PO sempre ordenados antes dos Processados.',
              'Ações de cotação: item único, item para todos os fornecedores históricos (BCC), ou lote selecionado.'
            ]
          },
          {
            titulo: 'Tabelas do banco (Supabase)',
            itens: [
              '`sap_requisicoes`/`pedidosforn` (via `getEnrichedSAPRequisicoes()`).',
              '`materials` — texto técnico do material, buscado sob demanda só para os códigos em tela.',
              '`pedidosforn` (`crf="x"`) — histórico de fornecedores por material.',
              '`cotacao_historico` — cotações já enviadas (auditoria).',
              '`contatos`/`cidadeforn` — telefone, e-mail, endereço do fornecedor.'
            ]
          },
          {
            titulo: 'Relatório "Novidades" (botão no topo da página)',
            itens: [
              'Componente `src/components/NovidadesModal.tsx`. Escopo por comprador: admin vê tudo; demais usuários veem só o(s) grupo(s) SAP vinculados a eles (`getBuyerGroupsForUser`).',
              'Cards "Itens sem PO" / "Itens sem MIGO": contagem de itens (não RMs), no escopo do usuário, já excluindo RM de serviço do "sem MIGO".',
              'Seções sempre relativas à ÚLTIMA importação ME5A (não é histórico acumulado — uma novidade só aparece uma vez, some na importação seguinte): "Novas RMs e itens" (lidos de `import_logs.new_ris`, distinguindo RM totalmente nova de item novo em RM já existente), "Excluídas" (de `import_logs.missing_ris`), "Mudança de quantidade" (de `import_logs.quantity_changes`).',
              'Para o campo `new_ris` ser populado, a importação precisa ter rodado com a versão do código que já grava esse campo — logs antigos (anteriores a 2026-08-15) ficam com essa lista vazia mesmo tendo itens novos, porque a coluna não existia ainda.'
            ]
          }
        ]
      },
      {
        id: 'sap-dashboards',
        nome: 'Gestão de Suprimentos (Dashboards)',
        arquivo: 'src/views/SapDashboards.tsx',
        secoes: [
          {
            titulo: 'Visão geral',
            itens: [
              'Painel gerencial em 5 abas para o coordenador/gestor de suprimentos: Visão Geral, Demandas (fluxo RM→PO), Carteira & Compradores, Fornecedores & Spend, Análise de Compras (histórico de preços).'
            ]
          },
          {
            titulo: 'Regras de negócio',
            itens: [
              'Classificação de demanda pelos 2 primeiros dígitos da RM: "11"/"12"/"13" → material, "17" → serviço. Criticidade por prefixo: "11"→normal, "12"→urgente, "13"→máquina parada.',
              'Item de projeto: código de material começando em "100000" (ignorando zeros à esquerda).',
              '`resolveDataCorte`: uma vez com PO colocado, o registro passa a "pertencer" ao período da `data_pedido`, não mais `data_solicitacao` — evita que uma RM antiga reapareça fora do período só por ter ganhado PO recentemente.',
              '`resolveComprador`: atribui o comprador por quem lançou o PO (`criado_por_pedido`), caindo para o `grupo_comprador` nominal da RM se ainda sem PO — cobre casos de troca/cobertura entre compradores.',
              'Spend soma `valor_total` só de itens com PO. Lead Time RM→PO é medido só sobre itens já convertidos em pedido.',
              'OTD (On Time Delivery): sem tolerância — 1 dia de atraso já conta. Duas bases: "fornecedor" (MIGO real vs. data prometida no PO) e "cliente" (real vs. o que o solicitante pediu).',
              'Aging da carteira aberta em faixas 0-7/8-15/16-30/31-60/>60 dias; 30 dias marca item como crítico.',
              'Janela padrão de análise: últimos 90 dias, comparada contra os 90 dias anteriores.'
            ]
          },
          {
            titulo: 'Regras de exibição',
            itens: [
              'Aba "Análise de Compras" não responde ao filtro global (usa base e filtros próprios).',
              'Aba ativa persistida na URL para ser compartilhável.',
              'Clique em gráfico faz drill-down (navega pro Painel SAP filtrado) ou abre modal de composição.'
            ]
          },
          {
            titulo: 'Tabelas do banco (Supabase)',
            itens: [
              '`sap_requisicoes`/`pedidosforn` (via `getEnrichedSAPRequisicoes()`).',
              '`compradores` (`grupo_compras, nome_comprador, usuario_sistema`) — mapa de comprador para atribuição de responsabilidade.'
            ]
          }
        ]
      },
      {
        id: 'rastreio-compras',
        nome: 'Rastreio de Compras',
        arquivo: 'src/views/RastreioCompras.tsx',
        secoes: [
          {
            titulo: 'Visão geral',
            itens: [
              'Tela do solicitante/usuário final: acompanha o ciclo de vida de cada compra até a entrega, com cronograma visual e canal de conversa por item com o comprador. Foco em materiais (RM de serviço é filtrada fora).'
            ]
          },
          {
            titulo: 'Regras de negócio',
            itens: [
              'Status exibido: "Entregue" se há `data_migo`; senão `item_status` (ou "Sem status").',
              '`dataPrevista` usa SÓ `data_entrega_prevista` (a promessa que o comprador digita manualmente) — nunca cai para `data_entrega_sap` (data de remessa do SAP), para não confundir a origem do prazo mostrado ao solicitante.',
              'Cronograma inclui só itens com data prevista válida e ainda sem MIGO — é agenda do que falta chegar, não histórico.',
              'Prioridade (1-5) pode ser pedida pelo próprio solicitante direto no item; a mais recente por RI prevalece.'
            ]
          },
          {
            titulo: 'Regras de exibição',
            itens: [
              'Filtros: busca, Tipo (Consumíveis/Projeto/Todos — default Consumíveis), Status, Setor, Ano, Escopo (Aberto = ainda sem entrega).',
              'Colunas de PREÇO/VALOR só aparecem para roles `comprador`, `coordenador_suprimentos`, `gestor` e `admin` (feature flag `rastreio_valores`) — demais usuários não veem valores monetários nesta tela.',
              'Deep-link `?ri=` abre direto o modal do item (usado em notificações).'
            ]
          },
          {
            titulo: 'Tabelas do banco (Supabase)',
            itens: [
              '`sap_requisicoes`/`pedidosforn` (via `getEnrichedSAPRequisicoes()`).',
              'Tabela local de prioridades pedidas pelo solicitante.',
              'Grupos de mercadoria — decodifica código em descrição legível.'
            ]
          }
        ]
      },
      {
        id: 'historico-pedidos',
        nome: 'Histórico de Pedidos',
        arquivo: 'src/views/HistoricoPedidos.tsx',
        secoes: [
          {
            titulo: 'Visão geral',
            itens: [
              'Consulta histórica de compras por material (aba Consulta) e comparação de preços contra referência histórica corrigida pelo IPCA (aba Auditoria de Preços).'
            ]
          },
          {
            titulo: 'Regras de negócio',
            itens: [
              'Fonte é a view agregada `vw_historico_pedidos` (uma linha por fornecedor+pedido, `CRF="x"`) — base diferente de `EnrichedSAPRecord`.',
              '`pedido_parcial`: marca quando `0 < qtd_fornecida < qtd_pedido` — quantidade/valor ainda podem mudar até a entrega fechar.',
              'Auditoria de preços: cada compra passada é trazida a valor de hoje pelo IPCA. Confiança da referência: "Alta" = ≥5 compras e desvio-padrão em log <0.35; "Média" = ≥3 compras e <0.80; senão "Baixa". Só confiáveis (Alta/Média) entram no número de manchete.',
              'Veredito comparado contra faixa P25–P75 (não a mediana): abaixo de P25 = "Bom"; acima de P75 = "Atenção"; dentro = "Na faixa"; sem referência = "Sem referência".',
              'Lote atípico: quantidade fora de [mediana/3, mediana×3] — marca só informativa.',
              'Cálculo pesado (percentis sobre ~66 mil linhas) roda no Postgres (`mv_benchmark_material`); o cliente só reclassifica/agrega.'
            ]
          },
          {
            titulo: 'Tabelas do banco (Supabase)',
            itens: [
              '`vw_historico_pedidos` — base da aba Consulta.',
              '`mv_benchmark_material` / `vw_auditoria_compras` — percentis pré-calculados para Auditoria de Preços.',
              '`contatos`/`cidadeforn` — contato e endereço do fornecedor.'
            ]
          }
        ]
      },
      {
        id: 'estoque',
        nome: 'Estoque',
        arquivo: 'src/views/Estoque.tsx',
        secoes: [
          {
            titulo: 'Visão geral',
            itens: [
              'Posição atual de estoque por material e depósito, importada da transação SAP ZL0024 (é uma "foto" pontual — ver Importação ZL0024 no domínio Materiais/Almoxarifado).'
            ]
          },
          {
            titulo: 'Regras de negócio',
            itens: [
              'Classificação ABC (`classifyABC`, `src/lib/almoxarifado.ts`): por valor imobilizado acumulado — Classe A até 80% do valor total, B até 95%, C o resto. SEMPRE calculada sobre a posição inteira, nunca sobre o subconjunto filtrado — evita que um item "troque de classe" só por causa de um filtro de depósito.',
              'Item de projeto: código começando em "100000" (mesma regra do resto do sistema). `normalizeCode` remove zeros à esquerda para casar o mesmo material com formatações diferentes.'
            ]
          },
          {
            titulo: 'Regras de exibição',
            itens: [
              'Filtros: busca, Depósito, Tipo de Material, Classe do Item, Curva ABC, Grupo de Mercadorias, "Apenas com saldo".',
              'Deep-link vindo dos dashboards de almoxarifado pré-aplica filtros via querystring.'
            ]
          },
          {
            titulo: 'Tabelas do banco (Supabase)',
            itens: ['`estoque` (sincronizada da ZL0024).']
          }
        ]
      },
      {
        id: 'cadastros-sap',
        nome: 'Cadastros SAP',
        arquivo: 'src/views/CadastrosSap.tsx',
        secoes: [
          {
            titulo: 'Visão geral',
            itens: [
              'Fila de atendimento de Suprimentos para solicitações internas de cadastro de novo item/fornecedor no SAP — reaproveita a entidade `Request` genérica (`type === "cadastro_sap"`), não é dado SAP importado.'
            ]
          },
          {
            titulo: 'Regras de negócio',
            itens: [
              'SLA por criticidade 1-5: {1: 120h, 2: 72h, 3: 24h, 4: 8h, 5: 2h} (default 24h). Pausado enquanto `status === "aguardando_solicitante"`.',
              'Fluxo: aberto → em_atendimento (ao "Assumir") → aguardando_solicitante (pede esclarecimento, pausa SLA) → resolvido (nota + código SAP opcional) → fechado.',
              'Só o atendente que assumiu (`atendente_id === user.id`) vê os formulários de esclarecimento/resolução; itens sem atendente mostram "Assumir".'
            ]
          },
          {
            titulo: 'Tabelas do banco (Supabase)',
            itens: ['`requests` filtrado por `type="cadastro_sap"`; `sectors`; anexos via tabela de attachments.']
          }
        ]
      }
    ]
  },

  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'materiais-almoxarifado',
    nome: 'Materiais & Almoxarifado',
    icone: 'Package',
    resumo: 'Catálogo mestre de materiais do SAP, posição de estoque/valor imobilizado, análise de movimentações MB51 (giro, cobertura, idade, urgência, estoque mínimo) e perfil de consumo semanal.',
    paginas: [
      {
        id: 'materials',
        nome: 'Catálogo de Materiais SAP',
        arquivo: 'src/views/Materials.tsx',
        secoes: [
          {
            titulo: 'Visão geral',
            itens: [
              'Busca no catálogo mestre de materiais (180 mil+ linhas), acessível a praticamente todos os perfis — é a base para abrir solicitações. Busca sempre via RPC no servidor (nunca em memória, tabela grande demais).'
            ]
          },
          {
            titulo: 'Regras de negócio',
            itens: [
              'Busca cumulativa "AND" por chips: cada termo digitado vira um chip; a RPC `buscar_materiais_catalogo` filtra por materiais que casam com TODOS os chips.',
              'Status "Obsoleto": `status_sap==="Obsoleto"` OU `status_geral==="Z1"` OU `status_centro==="Z1"`; caso contrário "Ativo".',
              'Busca por texto técnico é opt-in (default desligado) — por padrão casa só na descrição breve.',
              'Paginação de 50/página; exportação CSV refaz a busca em lotes de 200 até um teto de 20.000 linhas.',
              'Sinais ao lado do material (saldo, RM aberta, "pedido a caminho") vêm da matview `mv_material_sinais`. "Pedido a caminho" = linha da `sap_zl0132_po` com entrega pendente (`qtd_fornecida` < `qtd_pedido`), sem MIGO, não eliminada (`eflag_e` diferente de L) e com `data_rc >= 2026-01-01`. Havendo mais de um PO aberto para o material, mostra a PRÓXIMA chegada (menor `dt_remessa`).',
              'O corte `data_rc >= 2026-01-01` não é arbitrário: é o mesmo horizonte que o cliente aplica a esse dataset no sync. Sem ele, o SAP devolve pedidos que nunca foram formalmente fechados — remessas chegando a 2015 — e o sinal viraria ruído. Ver `db/sql/views/material_sinais.sql`.'
            ]
          },
          {
            titulo: 'Regras de exibição',
            itens: [
              'Filtros: Status SAP, Unidade, TMAT/Tipo de Material, NCM, Categoria, Empresa (TEN2/AG).',
              'Praticamente todos os perfis logados enxergam esta página (permissão `materiais.visualizar` concedida a quase todos os roles).',
              '"Meus favoritos" é por usuário, persistido localmente.'
            ]
          },
          {
            titulo: 'Tabelas do banco (Supabase)',
            itens: ['RPC `buscar_materiais_catalogo` (abstrai a tabela `materials`); matview `mv_material_sinais` (saldo/demanda/RM/PO por material), recalculada pela RPC `refresh_material_sinais` após cada importação SAP.']
          }
        ]
      },
      {
        id: 'almoxarifado-dashboards',
        nome: 'Dashboards do Almoxarifado',
        arquivo: 'src/views/AlmoxarifadoDashboards.tsx, src/lib/almoxarifado.ts',
        secoes: [
          {
            titulo: 'Visão geral',
            itens: [
              'Painel analítico de onde está o valor imobilizado em estoque, com KPIs, Curva ABC, e dois painéis de ação: "Compra Evitável" e "Divergência de PMM".'
            ]
          },
          {
            titulo: 'Regras de negócio',
            itens: [
              'Curva ABC sempre calculada sobre a posição INTEIRA (não sobre o filtro ativo) — decisão deliberada para manter estabilidade da classificação.',
              '"Compra Evitável": material com saldo em estoque > 0 E requisição de compra aberta (`status_requisicao==="Sem PO"`) ao mesmo tempo.',
              '"Divergência de PMM": compara Preço Médio Móvel do estoque com o último preço realmente pago; sinaliza quando a variação absoluta ultrapassa 20% (tolerância hardcoded).',
              '"Qualidade de Cadastro": sinaliza item sem `class_item`, sem `grupo_mercadorias` ou sem `preco_medio` preenchido.',
              'Gráficos de Top N (Grupo/Aplicação) mostram só os 10 maiores por valor, agregando o resto em "Outros".'
            ]
          },
          {
            titulo: 'Regras de exibição',
            itens: [
              'Controle de acesso restrito: permissão `almoxarifado.visualizar` concedida só a `comprador`, `coordenador_suprimentos` e `admin`.',
              'Drill-down por clique em qualquer gráfico abre modal com listagem agrupada por Grupo de Mercadoria.'
            ]
          },
          {
            titulo: 'Tabelas do banco (Supabase)',
            itens: [
              '`estoque` — posição bruta.',
              '`vw_estoque_analise` — último preço pago/fornecedor/data por material.',
              '`requisicoes` (via `getEnrichedSAPRequisicoes()`) — usado no painel Compra Evitável.'
            ]
          }
        ]
      },
      {
        id: 'almoxarifado-movimentacoes',
        nome: 'Movimentações de Estoque (MB51)',
        arquivo: 'src/views/Movimentacoes.tsx, src/lib/movimentacoes.ts, src/lib/giroEstoque.ts, src/lib/reposicao.ts',
        secoes: [
          {
            titulo: 'Visão geral',
            itens: [
              'Análise completa da base de movimentações SAP MB51 (`mb51_mov_estoque`) organizada em 5 abas especializadas: Visão Geral, Giro & Cobertura, Idade do Estoque, Urgência de Compra e Estoque Mínimo.',
              'Dados alimentados pelas views SQL `vw_mb51_classificada`, `vw_estoque_camada_fifo`, `vw_estoque_giro` e `vw_estoque_reposicao` (`db/sql/views/movimentacoes_analise.sql` e `db/sql/views/estoque_reposicao.sql`).'
            ]
          },
          {
            titulo: 'Abas e Regras de negócio',
            itens: [
              '1) Visão Geral: fluxo bruto de entradas/saídas por tipo de movimento (TMV), gráfico de série mensal, filtro por centro, depósito, categoria TMV e cálculo do lag NF→MIGO.',
              '2) Giro & Cobertura: identifica capital sem consumo (sem saída na janela), itens intocados na retomada da produção (sem movimento), materiais em excesso (cobertura > 365 dias) e ruptura iminente (cobertura < 15 dias).',
              '3) Idade do Estoque (FIFO Layering): rastreia a idade das camadas de estoque remanescentes por ordem de entrada MIGO. Lotes anteriores à reabertura da obra são sinalizados como "Anterior à reabertura / ≥ 3 anos". Exibe painel de conciliação entre a soma das camadas MB51 e o saldo atual no ZL0024.',
              '4) Urgência de Compra (Permanência do Lote): mede o tempo de permanência do lote até o consumo total. Classifica em Cross-docking (≤7d), Giro Normal (8-60d), Giro Lento (61-180d), Estoque Parado (>180d) e Entrada Antecipada (lotes consumidos rapidamente mas comprados com urgência/máquina parada).',
              '5) Estoque Mínimo (Reposição Heurística): calcula o ponto de pedido e estoque mínimo com base no consumo diário (médio/mediano), variabilidade da demanda, lead time real de reposição e dias de cobertura desejados. Recomenda: Repor Agora, Atenção, OK, Excessivo, Sob Demanda (demanda rara) ou Sem Demanda.'
            ]
          },
          {
            titulo: 'Regras de exibição & Filtros',
            itens: [
              'Filtros globais compartilhados: busca de material (com auto-complete por código e descrição), Grupo de Mercadorias, recorte de tipo de item (Projeto — código iniciante em "100000" — vs. Consumo).',
              'Aba ativa persistida na URL via querystring `?tab=geral|giro|idade|urgencia|minimo` para suporte a links diretos e compartilhamento.',
              'Acesso restrito aos perfis `admin`, `comprador` e `coordenador_suprimentos` (permissão `almox_movimentacoes`).'
            ]
          },
          {
            titulo: 'Tabelas e Views do banco (Supabase)',
            itens: [
              '`mb51_mov_estoque` — movimentações puras importadas.',
              '`tipo_mov_estoque` — classificação mestre dos tipos de movimento (TMV).',
              '`vw_mb51_classificada` — movimentações enriquecidas com categoria e flag de movimentação física.',
              '`vw_estoque_camada_fifo` — cálculo de camadas FIFO por MIGO.',
              '`vw_estoque_giro` — métricas de consumo, cobertura em dias, giro anualizado e dias sem movimento.',
              '`vw_estoque_reposicao` — estatísticas de consumo e lead time para dimensionamento de estoque mínimo.'
            ]
          }
        ]
      },
      {
        id: 'almoxarifado-consumo-semanal',
        nome: 'Perfil de Consumo Semanal',
        arquivo: 'src/views/ConsumoSemanal.tsx, src/lib/consumoSemanal.ts',
        secoes: [
          {
            titulo: 'Visão geral',
            itens: [
              'Interface mestre-detalhe para análise do comportamento semanal de consumo por material ao longo do tempo.',
              'A lista lateral esquerda exibe sparklines miniaturas para preview visual da forma da curva de consumo antes de selecionar o item, permitindo diferenciar consumo regular de picos isolados.'
            ]
          },
          {
            titulo: 'Regras de negócio',
            itens: [
              'Agrupamento por semana de calendário ISO (segunda a domingo), cobrindo o histórico de movimentações MB51.',
              'Cálculo de semanas ativas (semanas com saída > 0), média por semana ativa (exclui semanas zeradas), pico semanal e saldo acumulado semana a semana.',
              'Linha de referência visual no gráfico destacando a semana de início da produção (`2026-05-01`).',
              'Normalização da escala vertical dos sparklines da lista pelo maior consumo semanal dentre os itens visíveis no filtro (garante comparação proporcional entre materiais de alto e baixo volume).'
            ]
          },
          {
            titulo: 'Regras de exibição',
            itens: [
              'Filtros: tipo de item (Projeto vs. Consumo), Grupo de Mercadorias, ordenação (Maior consumo, Mais regular, Consumo mais recente), filtro "Só com série (5+ semanas ativas)" e busca por texto/código.',
              'Painel de detalhe com 4 KPI Cards (Consumo no período, Semanas com saída, Média por semana ativa, Pico semanal) e gráfico de barras interativo de consumo x entradas por semana.',
              'Tabela expandível de valores para inspeção numérica direta dos dados do gráfico por semana.',
              'Acesso restrito aos perfis `admin`, `comprador` e `coordenador_suprimentos` (permissão `almox_consumo_semanal`).'
            ]
          },
          {
            titulo: 'Tabelas do banco (Supabase)',
            itens: [
              '`mb51_mov_estoque` (via `localDb.fetchMb51()`).',
              '`vw_estoque_giro` (para cruzamento de Grupo de Mercadorias).'
            ]
          }
        ]
      }
    ]
  },

  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'fornecedores-contratos',
    nome: 'Fornecedores, Contratos & Frete',
    icone: 'Truck',
    resumo: 'Cadastro mestre de fornecedores, vigência de contratos, demandas jurídicas e simulação de custo de frete.',
    paginas: [
      {
        id: 'fornecedores',
        nome: 'Fornecedores',
        arquivo: 'src/views/Fornecedores.tsx',
        secoes: [
          {
            titulo: 'Visão geral',
            itens: [
              'Cadastro mestre de fornecedores em duas sub-abas: "Cadastrados" (com ficha em `contatos`) e "Não Cadastrados" (aparecem em pedidos SAP mas sem ficha).'
            ]
          },
          {
            titulo: 'Regras de negócio',
            itens: [
              'Detecção de "Não Cadastrados": cruza `contatos` (código SAP + CNPJ sem máscara) com `pedidosforn`; só entra na lista se NEM o código NEM o CNPJ existirem em `contatos`.',
              'Se a ficha não tem cidade/UF, busca fallback em `cidadeforn` pelo código do fornecedor.',
              'Status obrigatório (5 valores): Atualizado, Em Atualização, Pendente, Sem SAP, Inativo — novo cadastro nasce "Pendente".',
              'Código SAP (`cod_vendor`) é chave única — erro de duplicidade ao tentar cadastrar um já existente.'
            ]
          },
          {
            titulo: 'Regras de exibição',
            itens: [
              'Só `admin` ou `comprador` podem cadastrar/editar/promover um "não cadastrado" — demais usuários veem em modo somente leitura.',
              'Filtros: busca, Classificação, Status, UF, Cidade (dependente da UF), "Com telefone"/"Com e-mail".'
            ]
          },
          {
            titulo: 'Tabelas do banco (Supabase)',
            itens: ['`contatos` (leitura/escrita); `pedidosforn` (leitura); `cidadeforn` (leitura/cache local).']
          }
        ]
      },
      {
        id: 'contratos-demandas',
        nome: 'Contratos — sub-página Demandas (Kanban Jurídico)',
        arquivo: 'src/components/contratos/TabDemandas.tsx',
        secoes: [
          {
            titulo: 'Visão geral',
            itens: ['Quadro Kanban dos chamados abertos para o setor Jurídico (minutas, aditivos, distratos, consultas).']
          },
          {
            titulo: 'Regras de negócio',
            itens: [
              'Uma `Request` entra no quadro se `type==="chamado"` E (setor de destino é Jurídico OU `category_id` está entre as categorias jurídicas OU o setor é considerado jurídico por `isJuridicoSector`).',
              'A coluna "Aberto" é fixa (primeira, não reordenável); as demais são customizáveis por usuário (ordem, rótulo, visibilidade).',
              'Status é único e real: mover um card grava direto o `status` da `request` — reflete automaticamente em "Minhas Solicitações", não existe "status só do quadro".',
              'Ordenação dentro da coluna: criticidade desc, depois mais recente primeiro.'
            ]
          },
          {
            titulo: 'Tabelas do banco (Supabase)',
            itens: ['`requests`; `sectors`.']
          }
        ]
      },
      {
        id: 'contratos-lista',
        nome: 'Contratos — sub-página Lista (vigência ME3N)',
        arquivo: 'src/components/contratos/TabContratosLista.tsx, src/lib/contratos.ts',
        secoes: [
          {
            titulo: 'Visão geral',
            itens: ['Lista consolidada de contratos de fornecimento (SAP ME3N) por documento, com foco em controle de vigência.']
          },
          {
            titulo: 'Regras de negócio',
            itens: [
              'Unidade de análise é o CONTRATO, não o item: linhas de `me3n_contratos` (fallback `me3m_contratos`) são agrupadas por `documento_compras`, somando valores. Itens eliminados no SAP (`codigo_eliminacao==="L"`) são descartados antes de agrupar.',
              'Vigência (`calcStatusVigencia`): sem `fim_validade` → "Sem vigência informada"; dias restantes <0 → "Vencido"; ≤90 dias (constante `DIAS_ALERTA_VENCIMENTO`) → "Vencendo em breve"; senão → "Vigente".',
              'Status exibido: se existir edição manual em `contratos_detalhes`, ela prevalece (Ativo/Inativo/Em Processamento); sem edição, é derivado da vigência (Vigente/Vencendo→Ativo; Vencido/Sem info→Inativo — nunca sugere "Em Processamento" sozinho).',
              'Ordenação padrão: urgência primeiro (Vencido > Vencendo em breve > Vigente > Sem vigência informada).',
              'Campos complementares (Gestor, Escopo, PO, Modalidade, Vigência texto livre, Status) ficam em tabela separada (`contratos_detalhes`, upsert por `documento_compras`) — sobrevivem a reimportações do ME3N.'
            ]
          },
          {
            titulo: 'Tabelas do banco (Supabase)',
            itens: ['`me3n_contratos` (fallback `me3m_contratos`); `contratos_detalhes`.']
          }
        ]
      },
      {
        id: 'frete-estimator',
        nome: 'Estimador & Calculadora de Frete',
        arquivo: 'src/views/FreteEstimator.tsx',
        secoes: [
          {
            titulo: 'Visão geral',
            itens: ['Simulação de custo de frete rodoviário (Fracionado ou Veículo Dedicado) origem→destino, com base em tabela de tarifas importada.']
          },
          {
            titulo: 'Regras de negócio',
            itens: [
              'Fracionado: faixa de peso decide a tarifa (≤10/20/30/50/70/100kg, acima disso R$/kg); se a tarifa "acima de 100kg" não estiver cadastrada, usa a de 71-100kg como teto.',
              'Dedicado: usa direto o valor do veículo escolhido (Fiorino, 3/4, Toco, Truck, Carreta até/acima de determinada tonelagem).',
              'Pedágio cobrado por fração de 100kg (arredondado para cima, mínimo 1 fração).',
              'ICMS "por dentro" (gross-up): `total = subtotal / (1 − icms%/100)` — não é um percentual simples sobre o subtotal.',
              'Comparativo Fracionado vs. Dedicado é sempre contra o Fiorino (menor veículo dedicado cadastrado), não contra o veículo atualmente selecionado pelo usuário.'
            ]
          },
          {
            titulo: 'Tabelas do banco (Supabase)',
            itens: ['Tabela de frete via `localDb.getTabelaFrete()` (importada por planilha própria — ver Importação Tabela de Frete).']
          }
        ]
      },
      {
        id: 'diligenciamento',
        nome: 'Diligenciamento (dentro da Central de Compras, filtro "Sem MIGO")',
        arquivo: 'src/components/suprimentos/DiligenciamentoSemMigoTable.tsx, src/lib/diligenciamento.ts, src/lib/diligenciamentoApi.ts, src/views/Compras.tsx',
        secoes: [
          {
            titulo: 'Visão geral',
            itens: [
              'Não é página própria: é o conteúdo do filtro "Sem MIGO" da Central de Compras (`Compras.tsx`, `poFilter === \'Sem MIGO\'`) — esse recorte já É "PO emitido, ainda sem chegada", então virou a mesma pergunta do Diligenciamento, sem precisar de uma segunda tela. A rota histórica `/suprimentos/diligenciamento` continua viva (redireciona para `/suprimentos/compras` com o filtro já selecionado, via prop `poFilterInicial`), mas não existe mais como página nem como entrada em `lib/pages.ts` — o acesso é o mesmo de Central de Compras (`sup_central_compras`).',
              'Acompanhamento de pedidos de compra (PO/ZL0132) já emitidos e ainda sem chegada: fornecedor, valor, remessa, previsão de chegada calculada, transportadora e faturamento da transportadora.',
              'Não importa dado novo do SAP: `Compras.tsx` já filtra `poFilter === \'Sem MIGO\'` como `status_requisicao === \'Processado\' && !data_migo && !isServicoRM(...)` sobre `getEnrichedSAPRequisicoes()` (o mesmo dado que Rastreio Compras e a chegada no almoxarifado usam) — a tabela de diligenciamento recebe esse resultado já filtrado/buscado pelos filtros da própria Central de Compras (RM, comprador, alerta, grupo de mercadoria, prioridade, promessa, busca) e só acrescenta as colunas novas.',
              'Uma linha por item (RI), não por PO agrupado — mais simples que o desenho original em página própria, e mais parecido com o resto da Central de Compras.'
            ]
          },
          {
            titulo: 'Regras de negócio',
            itens: [
              'Previsão de chegada = `dt_remessa (data_entrega_sap) + dias corridos`. Os dias vêm de `sup_prazos_transporte`, chaveada por (UF do fornecedor, transportadora), com cascata: (1) UF+transportadora exatos; (2) UF com transportadora em branco (padrão da UF); (3) UF e transportadora em branco (padrão global). Sem remessa OU sem prazo cadastrado, a tela mostra o motivo em vez de inventar uma data (`motivoSemPrevisao`).',
              'UF do fornecedor: prioriza `cidadeforn.estado_uf` (populado pela própria importação da ZL0132, coluna Rg); cai para a `regiao_uf` bruta do próprio pedido quando o fornecedor ainda não tem linha em `cidadeforn` — mesma prioridade de `lib/historicoAnalytics.ts`.',
              'Decisão de produto: **não** usa `sup_fretes` (tabela do Estimador de Frete, com lead time por rota) como fonte deste prazo — o prazo do diligenciamento é mantido pelo próprio comprador, sem depender do cadastro de frete. As duas tabelas coexistem de propósito; não unificar sem revisitar a decisão.',
              'Transportadora é texto livre por item (`sup_diligenciamento_itens.transportadora`), sem tela de cadastro: o autocompletar (`<datalist>`) é a lista das já digitadas antes, deduplicada por `normalizarChaveTransportadora` (trim + minúsculas + espaços colapsados). Trocar a transportadora de um item limpa a previsão manual dele — uma data digitada à mão para uma transportadora não deve sobreviver escondida atrás da escolha de outra.',
              'Previsão manual (`previsao_manual`) sobrepõe a calculada quando o comprador edita a data diretamente; `null`/vazio volta a usar o cálculo. Edição é sempre por item (RI) — não existe mais edição em lote por PO (existia no desenho original em página própria; a tabela plana por item não precisa disso).',
              'Chegada confirmada é só leitura aqui: vem de `almoxarifado_chegadas` (mesma tabela que o botão "Confirmar chegada" do Rastreio Compras grava, uma linha por RI) — o mesmo mapa que `Compras.tsx` já carregava para o selo "Chegou no almoxarifado" do badge de PO é reaproveitado, sem buscar de novo.',
              'Toda mudança de previsão (manual ou por troca de transportadora) é levada automaticamente ao Rastreio Compras: grava `data_entrega_prevista` via `localDb.updateBuyerFields` (preservando `obs_comprador`/`item_status` do RI — essa função sempre regrava a observação inteira) e em seguida confirma com `localDb.confirmDeliveryDate`, que copia para `data_entrega_confirmada` — a única data que o Rastreio exibe ao solicitante. Nunca escreve em `dt_remessa` (ZL0132): é dado bruto do SAP, sobrescrito na próxima importação, e o Rastreio deliberadamente nunca usa a remessa do SAP como prazo (ver módulo Rastreio Compras).'
            ]
          },
          {
            titulo: 'Tabelas do banco (Supabase)',
            itens: [
              '`sup_diligenciamento_itens` (por `ri`: transportadora, faturamento da transportadora, previsão manual — CRUD direto via `lib/diligenciamentoApi.ts`, fora do cache do `localDb`, mesmo padrão de `rhApi.ts`/`portariaApi.ts`).',
              '`sup_prazos_transporte` (chave `uf, transportadora`, ambos podendo ser vazios para os níveis genéricos da cascata; `dias_corridos`), mantida pelo comprador na própria tabela ("Prazos de trânsito").',
              'Leitura: `sap_zl0132_po`/`pedidosforn`, `vw_sap_requisicoes_enriquecidas`, `cidadeforn`, `almoxarifado_chegadas`, `sap_me5a_rc` (via os métodos já existentes do `localDb`).'
            ]
          }
        ]
      }
    ]
  },

  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'solicitacoes',
    nome: 'Solicitações, Demandas & Aprovações',
    icone: 'ClipboardList',
    resumo: 'Fluxo completo de uma solicitação: criação, fila de atendimento, aprovação, acompanhamento pelo solicitante e relatórios agregados.',
    paginas: [
      {
        id: 'solicitacoes-central',
        nome: 'Central de Solicitações',
        arquivo: 'src/views/SolicitacoesCentral.tsx, src/components/solicitacoes/RequestDetailPanel.tsx, src/lib/solicitacoesCentral.ts, src/lib/solicitacoes.ts',
        secoes: [
          {
            titulo: 'Visão geral',
            itens: [
              'Tela única do módulo, em `/solicitacoes`. Substitui as três telas anteriores — Minhas Solicitações (`MyRequests.tsx`), a fila coletiva (`Solicitacoes.tsx`) e Aprovações (`Approvals.tsx`) —, que liam a mesma tabela `requests` com três recortes escritos em lugares diferentes e divergentes entre si.',
              'A lista é agrupada por *o que precisa de você*, não por status: faixas "Aguardando você", "Novidades desde a sua última visita", "Em andamento" e "Concluídas" (esta última recolhida por padrão).',
              'Abas de escopo: "Precisa de mim", "Minhas", "Do meu setor" e "Todas". Cada uma é um recorte do mesmo universo, não uma página diferente.',
              'Rotas históricas `/solicitacoes/minhas`, `/solicitacoes/todas` e `/solicitacoes/aprovacoes` continuam atendidas e abrem a Central já no escopo correspondente — links salvos, e-mails antigos e notificações já enviadas seguem funcionando.'
            ]
          },
          {
            titulo: 'Permissões',
            itens: [
              'Os ids `sol_minhas`, `sol_todas` e `sol_aprovacoes` deixaram de ser páginas e viraram feature flags em `lib/pages.ts`, com os mesmos ids e papéis padrão de antes: o `page_access` já gravado nos perfis continua valendo, só que agora libera abas em vez de itens de menu.',
              'A aba "Todas" usa o mesmo `solicitacoesVisiveis` de antes (admin vê tudo; gestor "puro" vê só o próprio setor), deliberadamente: o redesenho reorganiza a navegação, não afrouxa nem aperta quem vê o quê.',
              'O recorte pessoal (`podeVer`) soma: quem abriu, quem aprova aquele setor, o gestor dos setores acompanhados e quem opera a fila daquele tipo. Rascunho é sempre privado ao autor, nem admin vê.'
            ]
          },
          {
            titulo: 'Pendências ("Aguardando você")',
            itens: [
              'Compra `pendente` → "Aprovar ou devolver", para quem aprova aquele setor.',
              'Para quem abriu: `em_revisao` → "Ajustar e reenviar"; `aguardando_solicitante` → "Responder ao atendente"; `rascunho` → "Terminar o rascunho"; chamado resolvido/fechado sem nota → "Avaliar o atendimento".',
              'Para quem opera: chamado `aberto`/`reaberto` → "Assumir o chamado"; chamado `em_atendimento` cujo último comentário público é do solicitante → "Responder o solicitante"; cadastro SAP em triagem → "Triar o cadastro"; compra `aprovada` sem comprador → "Assumir a compra".',
              'Distinção deliberada entre pendência e novidade: uma mensagem nova é aviso, não tarefa — só vira pendência quando o status diz que a bola está com aquela pessoa. Sem isso a aba "Precisa de mim" encheria de coisas que não exigem ação e perderia o sentido.'
            ]
          },
          {
            titulo: 'Novidades e leitura',
            itens: [
              'Estado de leitura por usuário em `sisten_sol_leitura_<userId>` (IndexedDB, via `localDb`): `marco_zero`, `por_solicitacao` e `ultima_visita`.',
              '`marco_zero` é gravado no primeiro acesso e tudo anterior conta como lido — sem ele, o primeiro uso mostraria anos de histórico como novidade e o recurso nasceria sem credibilidade.',
              'É novidade o comentário ou a mudança de status feita por OUTRA pessoa depois da última abertura daquela solicitação. Nota interna só é novidade para quem pode lê-la.',
              'A faixa "Novidades" usa um retrato do estado de leitura congelado na montagem da tela: sem isso, a linha sumiria embaixo do cursor no instante do clique.',
              'Abrir uma solicitação também marca como lidas as notificações do sino ligadas a ela — ler é dar ciência.'
            ]
          },
          {
            titulo: 'Painel de detalhe (`RequestDetailPanel`)',
            itens: [
              'Um só painel para todo mundo; o que muda é o que a pessoa pode fazer. Reúne o stepper e o histórico (que eram de Minhas), os itens com "copiar itens" e a nota interna (que eram da fila) e o painel de decisão com sinais do catálogo SAP e exportação em PDF (que eram de Aprovações).',
              'Stepper: compra tem 5 passos, cadastro SAP tem 3, chamado tem 4. `rejeitada`/`cancelada` saem do trilho e exibem um aviso em vez de etapa ativa.',
              'Decisão de compra: Aprovar → "aprovada"; Devolver → "em_revisao"; Rejeitar → "rejeitada". As duas últimas exigem justificativa. Toda decisão notifica o solicitante.',
              'Avaliação de satisfação: só para chamado resolvido/fechado, 1 a 5 estrelas, somente leitura depois de enviada.',
              'Ações operacionais profundas continuam no módulo de origem: o painel oferece o link "Abrir em Cadastros SAP / no Helpdesk / na Central de Compras" para quem opera aquela fila.',
              'Reabertura automática segue valendo: chamado `aguardando_solicitante` volta para `em_atendimento` quando o próprio solicitante comenta.'
            ]
          },
          {
            titulo: 'Tabelas do banco (Supabase)',
            itens: ['`requests` (inclui `linked_rm_number`), `request_items`, `request_comments`, `request_status_history`, `request_attachments`, `sectors`, `core_notificacoes`; sinais de catálogo via `materials`.']
          }
        ]
      },
      {
        id: 'new-request',
        nome: 'Nova Solicitação',
        arquivo: 'src/views/NewRequest.tsx',
        secoes: [
          {
            titulo: 'Visão geral',
            itens: ['Formulário único para os três canais — Compra, Cadastro SAP, Chamado — com autosave de rascunho e reaproveitamento em modo edição.']
          },
          {
            titulo: 'Regras de negócio',
            itens: [
              'Criticidade é sempre obrigatória, nos 3 canais.',
              '"Item Genérico" (sem código SAP) torna o campo Observação obrigatório.',
              '`has_no_sap_code`: código SAP só é considerado completo com exatamente 8 caracteres.',
              'Status inicial: compra nasce "pendente" (aguardando aprovação do gestor); cadastro SAP e chamado nascem "aberto" (vão direto pra fila, sem aprovação).',
              'Numeração: RPC `proximo_numero_solicitacao(criticidade)`, com fallback local por contador de criticidade.',
              'Notificações automáticas na criação: compra notifica aprovadores do setor (severidade crítica se criticidade≥4); compra criticidade=5 em setor SESMT/Saúde-Segurança dispara alerta extra 🚨 para todo o staff desses setores; chamado ao Jurídico notifica também quem tem a permissão `juridico_notificar`.',
              'Editar uma compra já aprovada DESFAZ a aprovação e volta para "pendente", notificando quem já trabalhava nela.'
            ]
          },
          {
            titulo: 'Tabelas do banco (Supabase)',
            itens: ['`compradores`, `materials` (busca); `requests`, `request_items`, `request_attachments`, `sectors`, `profiles`; RPC `proximo_numero_solicitacao`.']
          }
        ]
      },
      {
        id: 'reports',
        nome: 'Relatórios',
        arquivo: 'src/views/Reports.tsx',
        secoes: [
          {
            titulo: 'Visão geral',
            itens: ['Dashboard agregado de 3 domínios: catálogo de materiais, fluxo de solicitações, desempenho do helpdesk.']
          },
          {
            titulo: 'Regras de negócio',
            itens: [
              'Agregados do catálogo vêm de uma view leve (`vw_materials_stats`), não da tabela `materials` inteira; exportação do catálogo completo pagina em lotes de 1000.',
              'SLA do helpdesk por criticidade 1-5: {120h, 72h, 24h, 8h, 2h} (default 24h). Taxa de conformidade = resolvidos dentro do prazo / total (exibe 100% se não há chamados).',
              '⚠️ O filtro de período (30/90 dias/tudo) existe na tela mas NÃO é de fato aplicado aos números exibidos — é uma limitação conhecida, não uma regra de negócio.'
            ]
          },
          {
            titulo: 'Tabelas do banco (Supabase)',
            itens: ['`vw_materials_stats`, `materials`; `requests` (via `getRequests()`).']
          }
        ]
      }
    ]
  },

  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'financeiro',
    nome: 'Financeiro',
    icone: 'Wallet',
    resumo: 'Consulta e análise gerencial das contas a pagar (relatório SAP FBL1N). Tabela `zl0170_miro` (ZL0170) importada à parte guarda a reconciliação Pedido x MIGO x MIRO — ainda sem tela própria, mas já é a fonte para ligar uma fatura FBL1N ao Pedido (PO) de origem.',
    paginas: [
      {
        id: 'contas-pagar',
        nome: 'Contas a Pagar',
        arquivo: 'src/views/ContasPagar.tsx',
        secoes: [
          {
            titulo: 'Visão geral',
            itens: ['Consulta operacional dos lançamentos FBL1N, agrupados por fornecedor com expansão para o detalhamento.']
          },
          {
            titulo: 'Regras de negócio',
            itens: [
              'Status: "Compensado" se há `data_compensacao` (ou `doc_compensacao` preenchido e válido); senão "Em aberto". "Vencido" = em aberto com `vencimento_liquido` < hoje.',
              'Total em Aberto = soma de `-montante_moeda_doc` (FBL1N vem com sinal de crédito/negativo, é invertido para exibir positivo) de tudo não compensado.',
              'Montante Pago por fornecedor soma só compensações com valor positivo — estornos negativos não entram.',
              'Ordenação padrão (sem coluna escolhida): maior exposição em aberto primeiro.'
            ]
          },
          {
            titulo: 'Tabelas do banco (Supabase)',
            itens: [
              '`vw_fbl1n_c_pagar_analise` (única fonte, paginada em blocos de 1000).',
              'A coluna `documento_compras` do FBL1N (mapeada para o Pedido de compra) vem sempre vazia na extração usada — não dá pra ligar fatura a PO só com FBL1N. Para isso, cruzar com `zl0170_miro` por `numero_doc_contabil` (= `numero_documento` do FBL1N) ou `doc_miro`, que traz `numero_pedido` (ver import-zl0170 em Rotinas de Importação SAP).'
            ]
          }
        ]
      },
      {
        id: 'contas-pagar-analise',
        nome: 'Análise de Contas a Pagar',
        arquivo: 'src/views/ContasPagarAnalise.tsx',
        secoes: [
          {
            titulo: 'Visão geral',
            itens: ['Dashboards sobre as mesmas partidas do FBL1N: evolução temporal, distribuição por tipo, ranking de fornecedores, aging.']
          },
          {
            titulo: 'Regras de negócio',
            itens: [
              'Partida em aberto = sem `doc_compensacao` E sem `data_compensacao`. Exposição = `-montante_moeda_doc` das partidas abertas.',
              'Buckets de aging: Vencido / até 7 dias / até 30 dias / 30+ dias / sem vencimento informado.',
              'Série temporal usa a primeira data não nula entre `data_pagamento`, `data_compensacao`, `vencimento_liquido`, `data_lancamento`, nessa ordem de prioridade.',
              'Filtro de período padrão: ano corrente inteiro, com atalhos de 1º/2º semestre.'
            ]
          },
          {
            titulo: 'Tabelas do banco (Supabase)',
            itens: ['`vw_fbl1n_c_pagar_analise` (mesma fonte de Contas a Pagar).']
          }
        ]
      },
      {
        id: 'reconciliacao-pedidos',
        nome: 'Reconciliação PO x Pgto',
        arquivo: 'src/views/ReconciliacaoPedidos.tsx',
        secoes: [
          {
            titulo: 'Visão geral',
            itens: ['Rastreamento de liquidação financeira de pedidos de compra (PO x MIRO x FBL1N), permitindo verificar se todas as notas fiscais faturadas já foram pagas sem consultar documento a documento.']
          },
          {
            titulo: 'Regras de negócio',
            itens: [
              'Status Consolidado do Pedido: "Totalmente Pago" (todas as NFs compensadas/pagas), "Parcialmente Pago" (ao menos 1 NF paga e ao menos 1 em aberto), "Em Aberto" (nenhuma NF compensada) ou "Pendente Faturamento" (sem faturas MIRO lançadas).',
              'Cruzamento relacional: `sap_zl0170_miro.numero_doc_contabil` = `sap_fbl1n_pagar.numero_documento`.',
              'Total Faturado = soma de `montante_miro` das faturas do pedido.',
              'Total Pago = soma do montante de faturas com `data_compensacao`, `doc_compensacao` ou `data_pagamento` preenchidos.',
              'Total em Aberto = Total Faturado - Total Pago.'
            ]
          },
          {
            titulo: 'Tabelas do banco (Supabase)',
            itens: [
              '`vw_pedidos_conciliacao_pagamentos` (visão consolidada agrupada por `numero_pedido`).',
              '`vw_pedidos_conciliacao_detalhes` (visão detalhada com MIGO, MIRO, doc contábil, vencimento e compensação).'
            ]
          }
        ]
      }
    ]
  },

  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'admin',
    nome: 'Administração, Usuários & Permissões',
    icone: 'ShieldCheck',
    resumo: 'Gestão de usuários, setores, permissões, autenticação e ferramentas exclusivas de administrador.',
    paginas: [
      {
        id: 'admin-usuarios',
        nome: 'AdminPanel — Usuários',
        arquivo: 'src/views/AdminPanel.tsx (aba Usuários)',
        secoes: [
          {
            titulo: 'Regras de negócio',
            itens: [
              'Fila de "aprovações pendentes" = perfis com `status==="pendente"`.',
              'Coluna "Nível de Acesso": substitui o array `roles` inteiro do usuário por UM único role selecionado — mesmo o schema suportando múltiplos roles, esta é a única UI de edição.',
              'O usuário logado não pode se auto-inativar (botão desabilitado).',
              'Coluna "Grupo Compras" grava `profiles.grupo_compras` (texto livre) — ver ressalva de duplicidade com `buyer_groups` em Conceitos Centrais.',
              'Coluna "Aprovador" grava `aprovador_setores`/`aprovador_cadastro_sap`, salvando a cada interação (sem botão de confirmar).'
            ]
          }
        ]
      },
      {
        id: 'admin-setores',
        nome: 'AdminPanel — Setores',
        arquivo: 'src/views/AdminPanel.tsx (aba Setores)',
        secoes: [
          {
            titulo: 'Regras de negócio',
            itens: [
              'Cada setor tem dois toggles diretos: "É Apoio? (Suporte)" (`is_support`) e "Helpdesk Ativo?" (`helpdesk_enabled`), sem confirmação.',
              '`sap_area_code` (usado para cruzar com `vw_demandas.area_solicitante` nos Dashboards de Suprimentos) não é exibido nem editável nesta aba.'
            ]
          }
        ]
      },
      {
        id: 'admin-permissoes',
        nome: 'AdminPanel — Permissões (Matrix)',
        arquivo: 'src/views/AdminPanel.tsx (aba Permissões)',
        secoes: [
          {
            titulo: '⚠️ Atenção',
            itens: [
              'É uma tabela puramente ESTÁTICA/hardcoded no componente — não lê `lib/pages.ts` nem `hasPermission` nem `page_access`. Serve só como referência visual aproximada e pode ficar desatualizada em relação às regras reais. Não tratar como fonte de verdade operacional (ver Sistema de Permissões em Conceitos Centrais).'
            ]
          }
        ]
      },
      {
        id: 'admin-importacao-materiais',
        nome: 'AdminPanel — Importação de Catálogo (Materiais)',
        arquivo: 'src/views/AdminPanel.tsx (aba Importação Catálogo)',
        secoes: [
          {
            titulo: 'Regras de negócio',
            itens: [
              'Painel "Referência de Códigos SAP" mostra o maior código já cadastrado (7 dígitos e 18 dígitos/prefixo 100000) e sugere o próximo código de corte para a próxima extração incremental no SAP.',
              'Ver detalhamento completo em Materiais & Almoxarifado → Importação de Materiais (ZL0169/ZL0162).'
            ]
          }
        ]
      },
      {
        id: 'admin-grupos-comprador',
        nome: 'AdminPanel — Grupos de Comprador',
        arquivo: 'src/views/AdminPanel.tsx (aba Grupos de Comprador)',
        secoes: [
          {
            titulo: 'Regras de negócio',
            itens: [
              'Lista só usuários com role `comprador`. Grupo "principal" precisa necessariamente estar contido na lista de grupos relacionados (validado antes de salvar).',
              'Ver ressalva de duplicidade com `profiles.grupo_compras` em Conceitos Centrais → Sistema de permissões.'
            ]
          }
        ]
      },
      {
        id: 'admin-helpdesk-config',
        nome: 'AdminPanel — Config. Helpdesk',
        arquivo: 'src/views/AdminPanel.tsx (aba Config. Helpdesk)',
        secoes: [
          {
            titulo: '⚠️ Atenção — tela majoritariamente decorativa',
            itens: [
              'Só é possível selecionar setores já marcados com `helpdesk_enabled=true` na aba Setores.',
              'A matriz de SLA por criticidade e as listas de categorias de triagem exibidas são HARDCODED no componente (comparando o ID do setor contra strings literais "9"/"3") — não há CRUD real de categorias, apesar do texto da tela sugerir gestão. Nada aqui é persistido no banco a partir desta aba.'
            ]
          }
        ]
      },
      {
        id: 'admin-feedback',
        nome: 'AdminPanel — Reportes (Feedback)',
        arquivo: 'src/views/AdminPanel.tsx (aba Reportes)',
        secoes: [
          {
            titulo: 'Regras de negócio',
            itens: [
              'Consome `feedback_reports`: qualquer usuário autenticado pode INSERIR um reporte, mas só quem tem role `admin` pode LER (RLS) — tanto a tabela quanto os prints no bucket `feedback-screenshots`, porque os screenshots podem conter dados sensíveis (ex.: valores de compra atrás do flag `rastreio_valores`).',
              'Ao cadastrar um reporte novo (bug ou sugestão), o sistema dispara automaticamente uma notificação (`notifications`) para todos os administradores ativos com context_key no formato `feedback:<id>`. O clique na notificação abre diretamente os detalhes do reporte correspondente no AdminPanel.',
              'Admin pode mudar `status` (novo/em_analise/resolvido/arquivado) e escrever nota interna.'
            ]
          },
          {
            titulo: 'Tabelas do banco (Supabase)',
            itens: ['`feedback_reports`; `notifications`; bucket `feedback-screenshots`.']
          }
        ]
      },
      {
        id: 'auth-flow',
        nome: 'Autenticação — Login, Cadastro, Redefinição de Senha',
        arquivo: 'src/views/Login.tsx, Signup.tsx, ResetPassword.tsx',
        secoes: [
          {
            titulo: 'Regras de negócio',
            itens: [
              'Login via Supabase Auth; se o profile ainda não existir (trigger falhou), cria um default com `roles: ["visualizador"]`, `status: "ativo"` — é fallback defensivo, não o caminho normal.',
              'Gate de status no login: `pendente` → força logout com "Aguarde a autorização do administrador"; `inativo` → força logout com "Conta inativa. Procure o administrador". Só `ativo` completa o login.',
              'Signup chama `supabase.auth.signUp` e, em seguida, força `signOut()` imediatamente para impedir login automático — o usuário precisa aguardar aprovação.',
              'Auto-cadastro restrito aos domínios corporativos (`ten.ind.br`, `agnet.com.br`, `agterceiro.com.br`, incl. subdomínios) — ver `src/lib/authDomains.ts`. A checagem roda na tela Signup e também em `localDb.signup`, para não depender só da UI.',
              'Redefinição de senha usa `supabase.auth.updateUser` diretamente (usuário já autenticado pelo token do link de e-mail) — não pede a senha atual.',
              'Fluxo de redefinição de senha: `redirectTo` aponta para `window.location.origin/` (sem fragmentos de hash como `/#/reset-password`, evitando que o GoTrue do Supabase invalide o parâmetro e faça fallback para localhost). O App e o ResetPassword tratam eventos de recuperação de sessão e estados de erro/expiração de OTP diretamente.'
            ]
          },
          {
            titulo: 'Tabelas do banco (Supabase)',
            itens: ['`profiles`; `activity_logs`; Supabase Auth (`auth.users`).']
          }
        ]
      },
      {
        id: 'profile-view',
        nome: 'Meu Perfil',
        arquivo: 'src/views/ProfileView.tsx',
        secoes: [
          {
            titulo: 'Regras de negócio',
            itens: [
              'Troca de senha não pede a senha atual (mesma lógica do fluxo de redefinição).',
              'Bloco "Grupos de Compras SAP" (somente leitura) só aparece se o usuário tem role `comprador`.'
            ]
          },
          {
            titulo: 'Tabelas do banco (Supabase)',
            itens: ['`profiles`; Supabase Auth; `buyer_groups` (leitura).']
          }
        ]
      },
      {
        id: 'helpdesk',
        nome: 'Helpdesk (Atendimento)',
        arquivo: 'src/views/Helpdesk.tsx',
        secoes: [
          {
            titulo: 'Regras de negócio',
            itens: [
              'Escopo por setor: atendente só vê chamados com `target_sector_id === user.sector_id` — não vê todos os chamados do sistema.',
              'Fluxo: aberto → em_atendimento → (aguardando_solicitante ↔ em_atendimento) → resolvido/fechado. Transferência só lista setores com `helpdesk_enabled=true`.',
              '⚠️ KPIs do dashboard (MTTR, parte do SLA%, CSAT) são majoritariamente SIMULADOS/heurísticos no código atual — "MTTR: 1.8h" é hardcoded, `slaCompliance` é uma fórmula aproximada, não uma medição real de prazo por criticidade. Não interpretar como indicador confiável de SLA real.',
              '⚠️ Nomenclatura de criticidade 1-5 diverge entre telas (Helpdesk usa "Baixa/Média/Alta/Crítica/Parada de Setor"; Config. Helpdesk no AdminPanel usa "Baixa/Moderada/Urgente/Crítica/Impeditiva") — mesma escala numérica, rótulos diferentes.'
            ]
          },
          {
            titulo: 'Tabelas do banco (Supabase)',
            itens: ['`requests` (`type="chamado"`); `request_comments`; `sectors`.']
          }
        ]
      },
      {
        id: 'usage-dashboard',
        nome: 'Uso do App',
        arquivo: 'src/views/UsageDashboard.tsx',
        secoes: [
          {
            titulo: 'Regras de negócio',
            itens: [
              'Só admin. Todos os dados vêm de funções RPC do Postgres (`usage_kpis`, `usage_active_users`, `usage_page_ranking`, `usage_by_hour`, `usage_user_summary`, `usage_user_timeline`) sobre a tabela bruta `usage_events` — nunca select direto na tabela bruta pela UI.',
              'Tempo de permanência em página é derivado no SQL (diferença entre eventos consecutivos da mesma sessão), não gravado no client.'
            ]
          },
          {
            titulo: 'Tabelas do banco (Supabase)',
            itens: ['`usage_events` (via RPCs); `profiles`.']
          }
        ]
      },
      {
        id: 'dashboard-inicio',
        nome: 'Início (Dashboard pessoal)',
        arquivo: 'src/views/Dashboard.tsx',
        secoes: [
          {
            titulo: 'Regras de negócio',
            itens: [
              '"Aguardando Aprovação" conta pelo SETOR do usuário logado, não pela lista real de `aprovador_setores` — pode divergir do que a tela de Aprovações mostraria para o mesmo usuário.',
              'KPIs extras (Usuários Pendentes/Ativos, Materiais Cadastrados, Total de Solicitações) só aparecem para `admin`.',
              'Botões de ação rápida "Painel SAP"/"Dashboards SAP" usam o sistema de permissão antigo (`hasPermission`), não `canAccessPage` — ver ressalva em Conceitos Centrais.'
            ]
          }
        ]
      },
      {
        id: 'sobre',
        nome: 'Sobre o SISTEN',
        arquivo: 'src/views/Sobre.tsx',
        secoes: [
          {
            titulo: 'Regras de negócio',
            itens: [
              'Página institucional/onboarding — mostra a "trilha de uma compra" e quais módulos o usuário pode abrir. Usa `hasPermission` (sistema antigo) para decidir os cadeados, então pode divergir de um override feito em "Módulos de acesso" (que mexe no sistema novo).'
            ]
          }
        ]
      },
    ]
  },

  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'importacoes-sap',
    nome: 'Importações SAP (referência por rotina)',
    icone: 'UploadCloud',
    resumo:
      'Detalhamento de cada rotina de importação de planilha em src/db/localDb.ts — o que auditar quando algo "não bateu" depois de um import. Ver também "Mecânica comum de importação" em Conceitos Centrais.',
    paginas: [
      {
        id: 'import-me5a',
        nome: 'ME5A — Requisições de Compra',
        arquivo: 'localDb.importME5ARaw',
        secoes: [
          {
            titulo: 'Formato & chave',
            itens: [
              'Colunas obrigatórias: "Requisição de compra" e "Item ReqC" (item recebe zero-padding de 5 dígitos). Chave única: `ri = requisicao_de_compra + item_reqc`.',
              'Compara sempre com o estado atual buscado DIRETO do Supabase (não do cache local) — evita apagar `obs_comprador` de imports feitos por outro dispositivo/usuário.'
            ]
          },
          {
            titulo: 'Novo / atualizado / eliminado',
            itens: [
              'RI já existe → update (registra em `quantity_changes` se `qtd_solicitada` mudou). RI novo → insert; se não eliminado, entra em `new_ris` (com flag `is_new_rm`).',
              'RI do banco que NÃO apareceu no arquivo é marcado `presente_ultima_carga:false` (soft flag, não apaga fisicamente) e conta como eliminado.',
              '`codigo_de_eliminacao="X"` marca a linha como eliminada mas ela ainda é upsertada (não é rejeitada).'
            ]
          },
          {
            titulo: 'Tabela & log',
            itens: [
              'Upsert em `requisicoes` (`onConflict: ri`), lotes de 50.',
              'Log `import_logs` tipo "ME5A": inclui `quantity_changes`, `missing_ris`, `new_ris` (desde 2026-08-15) e `ignored_rows`.',
              'Linha ignorada quando `requisicao_de_compra`/`item_reqc` vêm vazios ou inválidos.'
            ]
          }
        ]
      },
      {
        id: 'import-zl0132',
        nome: 'ZL0132 — Pedidos de Compra (PO)',
        arquivo: 'localDb.importZL0132Raw / localDb.importPedidosForn',
        secoes: [
          {
            titulo: 'Formato & chave',
            itens: [
              'Colunas obrigatórias: `reqc` + pelo menos um entre `item`/`itm_liberacao`/`item_rc_cotacao`. Chave composta: `ri + "_" + doc_compra`.',
              'Coluna de eliminação (`eflag_e`) é buscada com tolerância a variações de nome (fallback varrendo as 10 primeiras colunas por um header contendo "ELIMIN"/"E"/"EFLAG").'
            ]
          },
          {
            titulo: 'Novo / atualizado / eliminado',
            itens: [
              '`Eflag_e === "L"` (excluído no SAP) → linha ignorada, mas o valor "L" ainda é gravado no campo (fica marcada, não é descartada por completo).',
              'Duplicata da mesma chave dentro do arquivo: mantém só a de `data_doc` mais recente.',
              'Não existe detecção de "sumiu do arquivo" para pedidos — `records_eliminated` sempre 0.'
            ]
          },
          {
            titulo: 'Tabela & log',
            itens: [
              'Upsert em `pedidosforn` (`onConflict: ri,doc_compra`). `importZL0132Raw` roda em lotes de 50; `importPedidosForn` (mesmo layout, usado no fluxo de Histórico de Fornecedores) busca o estado atual em lotes paralelos de 400 e faz upsert em lotes de 300.',
              'Efeito colateral: também atualiza `cidadeforn.estado_uf` a partir da coluna "Rg", só quando o valor bate com regex de UF (2 letras).',
              'Log `import_logs` tipo "ZL0132" ou "PEDIDOSFORN".'
            ]
          }
        ]
      },
      {
        id: 'import-contatos',
        nome: 'Contatos de Fornecedor',
        arquivo: 'localDb.importContatos',
        secoes: [
          {
            titulo: 'Formato, chave e tabela',
            itens: [
              'Coluna obrigatória: "N° VENDOR" (`cod_vendor`, chave única). Telefone/e-mail passam por `normalizeMultiValue` (separa por `;`, `,`, `/`, quebra de linha, rejunta com `"; "`).',
              'Sempre tratado como upsert simples — não distingue insert de update de fato (`records_updated` sempre 0).',
              'Upsert em `contatos` (`onConflict: cod_vendor`), lotes de 50. Log tipo "CONTATOS".'
            ]
          }
        ]
      },
      {
        id: 'import-cidadeforn',
        nome: 'Cidade/Endereço de Fornecedor',
        arquivo: 'localDb.importCidadeForn',
        secoes: [
          {
            titulo: 'Formato, chave e tabela',
            itens: [
              'Coluna obrigatória: "Fornecedor" (`forn_codigo`, chave única). `estado_uf` só é gravado se bater com regex de UF de 2 letras (evita sobrescrever com código numérico de fornecedor estrangeiro).',
              'Upsert em `cidadeforn` (`onConflict: forn_codigo`), lotes de 50, com fallback para insert puro se o upsert falhar (RLS/chave única). Log tipo "CIDADEFORN".'
            ]
          }
        ]
      },
      {
        id: 'import-zl0024',
        nome: 'ZL0024 — Posição de Estoque',
        arquivo: 'localDb.importZL0024Raw',
        secoes: [
          {
            titulo: 'Formato, chave e tabela',
            itens: [
              'Coluna obrigatória: "Material". NÃO é incremental — é uma "foto" pontual: cada importação faz DELETE de tudo + INSERT do arquivo inteiro na tabela `estoque` (lotes de 500).',
              '`records_eliminated` no log = contagem anterior da tabela (o que foi substituído), não detecção linha a linha. Log tipo "ZL0024".'
            ]
          }
        ]
      },
      {
        id: 'import-fbl1n',
        nome: 'FBL1N — Contas a Pagar',
        arquivo: 'localDb.importFBL1NRaw, src/lib/fbl1n.ts',
        secoes: [
          {
            titulo: 'Formato, chave e tabela',
            itens: [
              'Colunas obrigatórias: "Nº documento" e "Empresa". Também "foto" pontual: DELETE total + INSERT do arquivo inteiro em `fbl1n_c_pagar` (lotes de 500).',
              'Datas via `excelSerialToISO` (aceita serial Excel, ISO, ou BR dd/mm/yyyy). Números via `parseFbl1nNumber` (formato BR, sinal negativo do SAP antes OU depois do número).',
              'Log tipo "FBL1N"; `records_eliminated` = contagem anterior da tabela.'
            ]
          }
        ]
      },
      {
        id: 'import-zl0170',
        nome: 'ZL0170 — Reconciliação Pedido x MIGO x MIRO',
        arquivo: 'localDb.importZL0170MiroRaw, src/lib/zl0170Miro.ts',
        secoes: [
          {
            titulo: 'Formato, chave e tabela',
            itens: [
              'Colunas obrigatórias: "Nº Pedido" e "Itm". "Foto" pontual: DELETE total + INSERT do arquivo inteiro em `zl0170_miro` (lotes de 500).',
              'Planilha tem 45 colunas com cabeçalhos repetidos ("Moeda" 3x, "UMP" 2x, "Ano" 2x) — `ZL0170_COLUMNS` declara a ordem exata do export SAP para que `reconcileSchema` case cada ocorrência pela posição certa (ex.: a 1ª "Moeda" é `moeda_preco`, a 2ª é `moeda_valor_liquido`, a 3ª é `moeda_migo`).',
              'Uma linha por combinação Pedido/Item x Doc. MIRO — um mesmo item de pedido pode aparecer em várias linhas (uma por fatura recebida contra ele).',
              'É a única fonte que liga PO a fatura: FBL1N tem a coluna "Documento de compras" mapeada mas ela vem sempre vazia na extração usada. Para achar o Pedido de uma fatura FBL1N, junta por `numero_doc_contabil` (= `numero_documento` do FBL1N) ou por `doc_miro`.',
              'Log tipo "ZL0170"; `records_eliminated` = contagem anterior da tabela.'
            ]
          }
        ]
      },
      {
        id: 'import-me3n',
        nome: 'ME3N / ME3M — Contratos',
        arquivo: 'localDb.importME3NRaw (importME3MRaw é alias)',
        secoes: [
          {
            titulo: 'Formato, chave e tabela',
            itens: [
              'Coluna obrigatória: "Documento de compras" (sem alias de fallback). Chave composta: `documento_compras + "||" + item`.',
              'Único fluxo com tolerância extra de nomes de coluna por alias textual (datas de vigência aceitam várias variações de escrita).',
              'RI ausente no arquivo é só CONTABILIZADO como eliminado no log — nada é apagado do banco (para não quebrar a referência de `contratos_detalhes`, que é uma tabela separada amarrada por `documento_compras`).',
              'Tenta gravar em `me3n_contratos`; se a tabela não existir, cai automaticamente para `me3m_contratos` (fallback transparente). Log sempre tipo "ME3N", mesmo no fallback.'
            ]
          }
        ]
      },
      {
        id: 'import-tabela-frete',
        nome: 'Tabela de Frete',
        arquivo: 'localDb.importTabelaFreteRaw',
        secoes: [
          {
            titulo: 'Formato, chave e tabela',
            itens: [
              'Não é planilha SAP — é tarifário comercial. Única regra de rejeição: linha sem Origem E sem Destino simultaneamente.',
              'Substituição total: DELETE + INSERT do arquivo inteiro em `tabela_frete`, lotes de 50. `records_eliminated` não é contado (fica 0). Log tipo "TABELA_FRETE".'
            ]
          }
        ]
      },
      {
        id: 'import-mb51',
        nome: 'MB51 — Movimentação de Estoque',
        arquivo: 'localDb.importMB51Raw, src/lib/mb51.ts',
        secoes: [
          {
            titulo: 'Formato, chave e tabela',
            itens: [
              'Coluna obrigatória: "Doc.material". Tabela no Supabase: `mb51_mov_estoque`. Mapeia 26 colunas incluindo quantidades, montantes, datas, PEP e tipo de movimento.',
              'Chave única composta (`chave_unica`): `[doc_material, item, data_lancamento, hora_registro, tipo_movimento, material, qtd_um_registro, montante_mi, deposito, elemento_pep, referencia]`.',
              'Suporta dois modos de carga configuráveis no card: 1) "Apenas Novos / Upsert" (onConflict: chave_unica) preservando movimentações anteriores; 2) "Substituir Tudo" (DELETE total + INSERT em lotes de 500).',
              'Log tipo "MB51" gravado na tabela `import_logs`.'
            ]
          }
        ]
      },
      {
        id: 'import-materiais',
        nome: 'ZL0169 / ZL0162 — Catálogo de Materiais',
        arquivo: 'localDb.importMaterials (ZL0169), localDb.importZL0162 (ZL0162)',
        secoes: [
          {
            titulo: '⚠️ Nota sobre a RPC não usada',
            itens: [
              'Existe a função SQL `db/sql/functions/importar_materiais_zl0169.sql` (RPC `importar_materiais_zl0169`), mas ela NÃO é chamada em lugar nenhum do frontend atual. O fluxo real (`localDb.importMaterials`) faz upsert direto via `supabase.from("sap_zl0169_162_catalogo").upsert(...)`, sem passar pela RPC — provavelmente resquício de versão anterior ou reservada para script externo.'
            ]
          },
          {
            titulo: 'ZL0169 — cadastro mestre',
            itens: [
              'Colunas obrigatórias: "Material" e a descrição breve do material (texto técnico agora opcional). Detecção da coluna de descrição é tolerante (`findMaterialDescriptionIndex`): tenta nomes canônicos exatos, depois qualquer coluna contendo "txtbreve"/"textobreve", depois um fallback genérico que evita confundir com "Descrição do Grupo" e afins.',
              '`company` fora de TEN2/AG/AMBAS cai para default TEN2 (não rejeita a linha). `status_sap` calculado como "Obsoleto" se `status_geral` ou `status_centro` = "Z1".',
              'Duplicado por `material_code` no mesmo arquivo: a ÚLTIMA ocorrência prevalece. Upsert (`onConflict: material_code`) preserva `id`/`created_at`/`technical_text` já existentes quando a nova linha não os traz.',
              'Sanitização de texto técnico (`sanitizeTechnicalText`): textos longos truncados pelo grid ALV do SAP GUI com artefatos de codificação/mojibake (ex: "旰掳籷" ou caracteres CJK) são automaticamente normalizados e substituídos por "..." tanto na ingestão de ZL0169 quanto ZL0162.'
            ]
          },
          {
            titulo: 'ZL0162 — texto técnico longo',
            itens: [
              'Colunas obrigatórias: "Material" e "Texto longo do material". É UPDATE-ONLY (não cria material novo) — material não encontrado só é contabilizado em `notFound`, não gera erro.',
              'Duplicado no arquivo com texto vazio NÃO apaga um texto já capturado de uma ocorrência anterior do mesmo material.',
              'Sanitiza automaticamente caracteres corrompidos de truncamento ALV antes de gravar.',
              'Usa a RPC `atualizar_textos_tecnicos_zl0162` (essa sim é chamada de fato).'
            ]
          }
        ]
      },
      {
        id: 'import-bahiasul',
        nome: 'Bahia Sul — Entregas e CTe de Compras',
        arquivo: 'localDb.importBahiaSulRaw, src/lib/bahiasul.ts, src/components/frete/BahiaSulAnalyticsPanel.tsx',
        secoes: [
          {
            titulo: 'Formato, chave e tabela',
            itens: [
              'Planilha de CTe da transportadora Bahia Sul com base de dados das entregas das compras da TEN.',
              'Tabela no Supabase: `sup_bahiasul_entregas`. Mapeia 29 colunas incluindo dados do CTe (CTO_FILIAL, CTO_SERIE, CTO_NUMERO), datas de emissão, previsão e chegada/entrega, dados de remetente/destinatário, pesos e valores.',
              'Chave única composta (`chave_unica`): `CTO_FILIAL_CTO_SERIE_CTO_NUMERO` (ex: `BHZ_1_42383`), permitindo reimportações com atualização de status operacionais sem duplicar registros.',
              'Upsert em lotes de 300 registros com cálculo de SLA e vínculo com pedidos SAP e notas fiscais.'
            ]
          },
          {
            titulo: 'Acompanhamento & Análise no Estimador de Frete',
            itens: [
              'Página Estimador de Frete organizada em duas janelas: 1) Janela Inicial de Acompanhamento & Análise das entregas Bahia Sul (KPIs, filtros, cruzamento com PO SAP, detalhes e upload rápido); 2) Janela do Simulador & Calculadora de frete fracionado/dedicado.',
              'Cruzamento inteligente por número de PO SAP (`nro_pedido` vs `documento_compra`) com exibição de fornecedor, valor em BRL e data do pedido, além de permitir vinculação manual direta na interface.'
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'portaria',
    nome: 'Portaria & Segurança Patrimonial',
    icone: 'Shield',
    resumo: 'Controle de acessos de veículos, visitantes, transportes, carretas de chapas, saída de colaboradores, rondas patrimoniais e listas de presença de briefing de segurança.',
    paginas: [
      {
        id: 'portaria-relatorio',
        nome: 'Relatório de Portaria e Ocorrências (FRM.SGP-0010)',
        arquivo: 'src/views/portaria/PortariaRelatorio.tsx',
        secoes: [
          {
            titulo: 'Regras de Lançamento e Tipos de Ocorrência',
            itens: [
              'Suporta 6 tipos de registro: Entrada de Veículo, Entrada de Visitante, Saída de Colaborador, Ronda Patrimonial, Ocorrência/Incidente e Outro Registro.',
              'Conversão automática para maiúsculas em todos os campos de texto.',
              'Seleção obrigatória do vigilante responsável a cada novo registro lançado.',
              'Compressão automática de imagens anexadas (câmera ou galeria) antes do upload.'
            ]
          },
          {
            titulo: 'Saída de Colaboradores (Integração com rh_pessoas)',
            itens: [
              'Autocompletar inteligente por Nome ou Matrícula/Registro conectado à tabela `rh_pessoas`.',
              'Preenchimento automático do nome, matrícula, cargo/função e vínculo com a empresa TEN.',
              'Chips de clique rápido para motivos frequentes de saída (Consulta Médica, Serviço Externo, Almoço, etc.).',
              'Campo obrigatório para responsável que autorizou a saída e registro de horário de retorno.'
            ]
          },
          {
            titulo: 'Validação de Briefing de Segurança (Validade: 30 dias)',
            itens: [
              'Validade estrita de 30 dias para treinamentos de integração/briefing.',
              'Botão "Checar Briefing" individual por visitante e botão geral "Checar Validade de Todos".',
              'Exibição visual da data do último treinamento e contagem de dias restantes ou expirados diretamente na interface.',
              'Ativação automática e obrigatória de "Fará Briefing" se qualquer visitante estiver vencido (>30 dias) ou sem histórico.',
              'Marcação opcional caso todos os visitantes estejam com o treinamento em dia.'
            ]
          }
        ]
      },
      {
        id: 'portaria-briefing',
        nome: 'Briefing de Segurança & Lista de Presença (FRM.SGP-0013)',
        arquivo: 'src/views/portaria/PortariaBriefing.tsx',
        secoes: [
          {
            titulo: 'Coleta de Assinaturas e Finalização',
            itens: [
              'Geração automática de sessões de briefing a partir dos lançamentos de ocorrências com "Fará Briefing" ativo.',
              'Modal de assinatura digital via canvas com registro de horário exato e finalização automática ao colher 100% das assinaturas.',
              'Consulta rápida por CPF para validação de visitantes na guarita.'
            ]
          },
          {
            titulo: 'Exportação em PDF Individual e Consolidado',
            itens: [
              'Suporte à multi-seleção de sessões na listagem.',
              'Exportação em PDF consolidado com cada turma em página A4 dedicada.',
              'Renderização visual das assinaturas digitais colhidas dentro do quadro de presença do PDF oficial.'
            ]
          }
        ]
      }
    ]
  }
];
