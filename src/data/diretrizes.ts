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
              'Filtros combináveis e dependentes entre si: RM, Comprador, Status, Alerta, Grupo de Mercadoria, Prioridade (1-5, pedida pelo solicitante no Rastreio de Compras).',
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
        id: 'solicitacoes-fila',
        nome: 'Solicitações (fila coletiva)',
        arquivo: 'src/views/Solicitacoes.tsx, src/lib/solicitacoes.ts',
        secoes: [
          {
            titulo: 'Visão geral',
            itens: ['Fila de todas as solicitações "em aberto" do sistema (compra, cadastro SAP, chamado), para quem opera o atendimento.']
          },
          {
            titulo: 'Regras de negócio',
            itens: [
              'Recorte por papel: admin vê tudo; um usuário que é SÓ `gestor` (sem também ser requisitante/comprador/coordenador) vê só as solicitações do próprio setor; os demais papéis da fila veem tudo — regra espelha a mesma usada em Aprovações, deliberadamente, "para não criar duas verdades sobre o que um gestor enxerga".',
              '"Em aberto" = tudo que não está em fechado, cancelada, rejeitada ou rascunho.',
              'Ordenação: mais crítica primeiro; empatando, a mais antiga primeiro.',
              'Só `comprador`, `coordenador_suprimentos`, `atendente` ou `admin` podem marcar uma resposta como "nota interna" (não visível ao solicitante).',
              'Vínculo de RM SAP: o atendente/comprador pode informar e salvar o Nº da RM (`linked_rm_number`) diretamente no painel lateral de atendimento, persistindo no Supabase para correlação com ME5A e Central de Compras.',
              'A janela de detalhes suspensa (`RequestDetailsModal`) possui largura ampliada (`max-w-4xl`/`max-w-5xl`) e layout de grid responsivo multi-colunas para identificação, dados de compra e itens.'
            ]
          },
          {
            titulo: 'Tabelas do banco (Supabase)',
            itens: ['`requests` (inclui `linked_rm_number`), `request_items`, `request_comments`, `request_attachments`, `sectors`.']
          }
        ]
      },
      {
        id: 'my-requests',
        nome: 'Minhas Solicitações',
        arquivo: 'src/views/MyRequests.tsx',
        secoes: [
          {
            titulo: 'Visão geral',
            itens: ['Tela do solicitante: lista as próprias solicitações (e, por tipo, de terceiros que deve acompanhar), com stepper, histórico, anexos e avaliação de satisfação.']
          },
          {
            titulo: 'Regras de negócio',
            itens: [
              'Visibilidade por tipo: `chamado` é estritamente privado ao autor; `cadastro_sap` também aparece para quem atende a página (senão a solicitação "some" pro atendente); `compra` também aparece para gestor do setor, comprador designado e atendente do setor de destino.',
              'Stepper: compra tem 5 passos, cadastro SAP tem 3, chamado tem 4. Fica sem passo ativo se o status é `rejeitada`/`cancelada`.',
              'Avaliação de satisfação só aparece para chamado resolvido/fechado (1-5 estrelas); uma vez avaliado, vira somente leitura.',
              'Reabertura automática: se o chamado está `aguardando_solicitante` e o próprio solicitante comenta, o status volta automaticamente para `em_atendimento` ("SLA retomado").'
            ]
          },
          {
            titulo: 'Tabelas do banco (Supabase)',
            itens: ['`requests`, `request_items`, `request_comments`, `request_status_history`, `request_attachments`.']
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
        id: 'approvals',
        nome: 'Aprovações',
        arquivo: 'src/views/Approvals.tsx',
        secoes: [
          {
            titulo: 'Visão geral',
            itens: ['Fila de aprovação de compras para gestores de setor, coordenador de suprimentos e admin — só `type==="compra"` passa por aqui.']
          },
          {
            titulo: 'Regras de negócio',
            itens: [
              'Quem vê/decide: `user.aprovador_setores` inclui o setor do solicitante, OU é `admin`, OU é `coordenador_suprimentos`.',
              'Fila pendente ordenada por criticidade desc, depois data de necessidade asc.',
              'Ações: Aprovar → "aprovada"; Rejeitar → "rejeitada" (justificativa obrigatória); Devolver → "em_revisao" (justificativa obrigatória).',
              'Toda decisão notifica o solicitante (severidade alert se rejeitada, success se resolvido, senão info).'
            ]
          },
          {
            titulo: 'Tabelas do banco (Supabase)',
            itens: ['`requests`, `request_items`, `sectors`; sinais de catálogo via `materials`.']
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
