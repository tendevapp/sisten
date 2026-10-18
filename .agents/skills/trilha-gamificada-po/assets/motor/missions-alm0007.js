/* ================= Trilha PO.ALM-0007: Controle de Processos, Produtos e Serviços Providos Externamente =================
   Procedimento Operacional · Rev. 00 · 03/11/2022
   Emissor: Ana Paula De Araujo Nascimento · Aprovador: Fabio da Silva Muricy
   Foco: Diretrizes para qualificação e seleção de provedores externos (ISO 9001, sistema AG, auditoria TEN),
         análise de risco conjunta (Qualidade/Engenharia/Suprimentos), aprovação de MPP (Manufacturing Process Plan),
         alçadas de aprovação de materiais e serviços, informações mandatórias no Pedido de Compra,
         recebimento e inspeção no Almoxarifado, entrega ao solicitante e avaliação anual de desempenho no portal AG. */

const M = [
  // -------------------------------------------------------------------------
  // M01 · O Controle de Provedores Externos
  // -------------------------------------------------------------------------
  {
    n: 1,
    short: 'Provedores Externos',
    title: 'Por que Controlar Provedores? A <span>Qualidade Externa</span>',
    ic: 'wh',
    badge: 'Guardião da Cadeia de Valor',
    gameName: 'Critérios Fundamentais de Fornecimento',
    chips: [['4 cenas', ''], ['ISO 9001:2015', 'o'], ['≈ 4 min', 't']],
    intro: 'A integridade de uma torre eólica de mais de 100 metros depende diretamente da qualidade dos componentes providos por parceiros externos. Conheça as diretrizes mandatórias do PO.ALM-0007.',
    scenes: [
      {
        ic: 'wh',
        t: 'Objetivo e Escopo (Itens 1 e 2)',
        x: 'O <b>PO.ALM-0007</b> estabelece diretrizes para o <b>controle de processos, produtos e serviços de provedores externos</b> destinados à fabricação de torres e suporte fabril na TEN.',
        chips: [['Item 1 e 2', 'o'], ['Controle Estrito', 't']],
        vig: () => vf('C', 'Controle de Provedores', [['Objetivo', 'Diretrizes de Qualidade'], ['Escopo', 'Produtos e Serviços Externos']], 'ok', [['Meta', 'Garantir Aço e Serviços Conformes']])
      },
      {
        ic: 'truck',
        t: 'Itens Críticos para a Torre',
        x: 'Aplica-se a todos os itens críticos: <b>Chapas, Flanges, Door Frames, Consumíveis de Soldagem e Internos (Mecânicos, Soldáveis e Elétricos)</b>, além de subcontratações industriais.',
        chips: [['Itens Críticos', 'o'], ['Subcontratações', 't']],
        vig: () => vIcons([['truck', 'Chapas & Flanges'], ['wh', 'Door Frames'], ['sap', 'Consumíveis Solda'], ['folder', 'Internos da Torre']])
      },
      {
        ic: 'sap',
        t: 'Desempenho e Capacidade (Item 4.2)',
        x: '<b>Desempenho do fornecedor:</b> é a capacidade comprovada de atender a todos os requisitos do pedido de compra, com foco absoluto em <b>qualidade técnica e pontualidade no prazo</b>.',
        chips: [['Item 4.2', 'o'], ['Qualidade e Prazo', 'ok']],
        vig: () => vLanes([['Qualidade Técnica', 'Zero Defeitos', 100, 'var(--s-teal)', '#fff', '1s'], ['Pontualidade', 'Cumprimento do Cronograma', 100, 'var(--s-orange)', '#fff', '1.2s']])
      },
      {
        ic: 'folder',
        t: 'Integração Intersetorial',
        x: 'O controle exige atuação integrada entre <b>Comercial, Engenharia, Planejamento, Diligenciamento, Suprimentos, Qualidade e Almoxarifado</b> para blindar a fábrica contra não conformidades.',
        chips: [['Cadeia Integrada', 'o'], ['Gestão de Risco', 't']],
        vig: () => vChecklist('Atores do Processo', ['Engenharia define requisitos e MPP', 'Suprimentos qualifica e negocia', 'Qualidade analisa riscos (FMEA)', 'Almoxarifado inspeciona e recebe', 'Portal AG avalia desempenho'], -1, 'Fluxo Integrado', 'Atores')
      }
    ],
    game: {
      type: 'deck',
      title: 'Classifique as diretrizes gerais de contratação e controle de provedores',
      buckets: ['Diretriz Mandatória do PO.ALM-0007', 'Prática Proibida / Risco Grave'],
      cards: [
        { t: 'Controlar rigorosamente processos, produtos e serviços providos externamente', a: 0, s: 'Mandatório' },
        { t: 'Comprar materiais críticos de fornecedor sem qualificação prévia aprovada', a: 1, s: 'Proibido' },
        { t: 'Avaliar a capacidade do fornecedor de cumprir qualidade e prazos contratuais', a: 0, s: 'Mandatório' },
        { t: 'Aplicar controle especial a chapas, flanges, door frames e consumíveis', a: 0, s: 'Mandatório' },
        { t: 'Dispensar documentação técnica se o preço do fornecedor for o mais barato', a: 1, s: 'Proibido' },
        { t: 'Manter histórico e informação documentada de cada fornecedor na rede da TEN', a: 0, s: 'Mandatório' }
      ]
    },
    quiz: [
      {
        q: 'Qual é o principal objetivo estabelecido no item 1 do PO.ALM-0007?',
        o: [
          'Estabelecer diretrizes para o controle de processos, produtos e serviços de provedores externos.',
          'Terceirizar a totalidade da administração da TEN sem contratos formais.',
          'Comprar materiais no mercado informal sem emissão de notas fiscais.',
          'Eliminar todos os controles da qualidade para acelerar o faturamento.'
        ],
        a: 0,
        e: 'O item 1 estabelece expressamente: <b>"Estabelecer diretrizes para o controle de processos, produtos e serviços de provedores externos"</b>.'
      },
      {
        q: 'A quais tipos de insumos para fabricação de torres o procedimento dá ênfase especial?',
        o: [
          'Chapas, Flanges, Door Frames, Consumíveis e Internos (Mecânicos, Soldáveis e Elétricos).',
          'Apenas café e descartáveis do refeitório.',
          'Exclusivamente brindes institucionais de final de ano.',
          'Somente móveis de escritório da diretoria.'
        ],
        a: 0,
        e: 'O item 6.2 lista com precisão: <b>Chapas, Flanges, Door Frames, Consumíveis e Internos (Mecânicos, Soldáveis e Elétricos)</b>.'
      },
      {
        q: 'O que define o "Desempenho dos fornecedores" segundo o item 4.2?',
        o: [
          'É a capacidade do fornecedor de atender aos requisitos do pedido de compra quanto a qualidade e prazo.',
          'A simpatia do vendedor durante as reuniões comerciais.',
          'A distância física entre a fábrica da usina e a TEN.',
          'A quantidade de e-mails enviados por semana.'
        ],
        a: 0,
        e: 'Conforme item 4.2: desempenho é a <b>capacidade do fornecedor de atender aos requisitos do pedido de compra quanto a qualidade e prazo</b>.'
      },
      {
        q: 'Por que o controle de processos externos é vital na fabricação das torres eólicas?',
        o: [
          'Porque qualquer defeito metalúrgico ou dimensional em chapas ou flanges compromete a segurança estrutural da torre.',
          'Porque as torres eólicas não necessitam de testes de qualidade.',
          'Apenas para preencher relatórios burocráticos sem efeito prático.',
          'Para atrasar a entrega das torres aos clientes.'
        ],
        a: 0,
        e: 'A integridade da torre depende diretamente de componentes conformes, evitando colapsos catastróficos no parque eólico.'
      }
    ]
  },

  // -------------------------------------------------------------------------
  // M02 · Qualificação & Seleção
  // -------------------------------------------------------------------------
  {
    n: 2,
    short: 'Qualificação & Seleção',
    title: 'Qualificação & Seleção: <span>Os 4 Critérios de Entrada</span>',
    ic: 'check',
    badge: 'Inspetor de Qualificação',
    gameName: 'Fornecedor Apto vs Não Qualificado',
    chips: [['4 cenas', ''], ['Item 6.1 e 6.2', 'o'], ['Análise de Risco', 't']],
    intro: 'Nenhum parceiro fornece para a TEN sem comprovação técnica. Conheça os 4 critérios mandatórios de qualificação e a análise de risco intersetorial.',
    scenes: [
      {
        ic: 'check',
        t: 'Os 4 Critérios de Qualificação (Item 6.1)',
        x: 'O fornecedor é qualificado quando atende a <b>no mínimo um dos critérios</b>: a) Certificação ABNT NBR ISO 9001:2015; b) Homologado no sistema AG; c) Auditoria TEN aprovada; ou d) Experiência aceita pela TEN.',
        chips: [['Item 6.1', 'o'], ['Critérios Mandatórios', 'ok']],
        vig: () => vIcons([['check', 'ISO 9001:2015'], ['sap', 'Homologado AG'], ['form', 'Auditoria TEN'], ['wh', 'Experiência Aprovada']])
      },
      {
        ic: 'form',
        t: 'Seleção & Lista Oficial (Item 6.2)',
        x: 'Apenas fornecedores constantes na <b>lista oficial de qualificados</b> disponível no sistema podem ser selecionados para cotações e pedidos de compra.',
        chips: [['Lista Oficial', 'o'], ['Fornecedores Aptos', 't']],
        vig: () => vChecklist('Lista de Qualificados TEN', ['Usina Siderúrgica A · ISO 9001', 'Fornecedor de Flanges B · Auditado TEN', 'Fabricante Door Frames C · Portal AG', 'Consumíveis de Solda D · Homologado'], -1, 'Base Homologada', 'Fornecedores')
      },
      {
        ic: 'bad',
        t: 'Análise de Risco Intersetorial',
        x: '<b>Nota Mandatória:</b> antes de concluir a seleção do fornecedor, deve ser feita uma <b>análise de risco em conjunto entre Qualidade, Engenharia e Suprimentos</b>.',
        chips: [['Análise Tripartite', 'bad'], ['Qualidade + Eng + Supr', 'o']],
        vig: () => vf('R', 'Análise de Risco', [['Engenharia', 'Valida Capacidade Técnica'], ['Qualidade', 'FMEA e Histórico de Falhas'], ['Suprimentos', 'Saúde Financeira e Compliance']], 'ok', [['Decisão', 'Consenso Obrigatório']])
      },
      {
        ic: 'road',
        t: 'Bloqueio Imediato de Não Qualificados',
        x: 'O fluxograma do Anexo 1 prescreve: se o fornecedor <b>não for qualificado</b>, é <b>proibida a contratação</b>, devendo iniciar processo formal de qualificação prévia antes de qualquer pedido.',
        chips: [['Anexo 1', 'bad'], ['Bloqueio Automático', 'bad']],
        vig: () => vf('X', 'Contratação Proibida', [['Status', 'Não Qualificado'], ['Ação', 'Bloqueio de Pedido'], ['Próximo Passo', 'Iniciar Qualificação']], 'bad', [['Regra', 'Tolerância Zero']])
      }
    ],
    game: {
      type: 'deck',
      title: 'Classifique a condição de cada fornecedor para fornecimento de itens críticos',
      buckets: ['Fornecedor Apto para Seleção', 'Fornecedor Inapto / Contratação Proibida'],
      cards: [
        { t: 'Possui certificação ABNT NBR ISO 9001:2015 válida e análise de risco conjunta aprovada', a: 0, s: 'Apto' },
        { t: 'Empresa nova no mercado sem certificação, sem auditoria e reprovada na análise de risco', a: 1, s: 'Inapto' },
        { t: 'Fornecedor homologado no sistema corporativo AG com auditoria TEN favorável', a: 0, s: 'Apto' },
        { t: 'Fornecedor selecionado por Suprimentos sem consulta prévia à Engenharia e Qualidade', a: 1, s: 'Inapto' },
        { t: 'Fabricante de flanges com experiência suficiente demonstrada e aceita formalmente pela TEN', a: 0, s: 'Apto' },
        { t: 'Fornecedor com histórico recente de RNCs graves e bloqueado no sistema AG', a: 1, s: 'Inapto' }
      ]
    },
    quiz: [
      {
        q: 'Quantos critérios do item 6.1 o fornecedor deve atender no mínimo para ser qualificado?',
        o: [
          'No mínimo um dos critérios especificados no procedimento.',
          'Todos os 4 critérios simultaneamente sem exceção.',
          'Nenhum critério é necessário.',
          'Apenas ter sede na mesma cidade da fábrica.'
        ],
        a: 0,
        e: 'O item 6.1 estabelece: <b>"O fornecedor é qualificado quando atende, no mínimo, um dos critérios especificados abaixo"</b>.'
      },
      {
        q: 'Quais áreas devem realizar obrigatoriamente a Análise de Risco antes de concluir a seleção?',
        o: [
          'Em conjunto entre Qualidade, Engenharia e Suprimentos.',
          'Apenas a equipe de limpeza do galpão.',
          'Somente o motorista da transportadora.',
          'Apenas a portaria de acesso.'
        ],
        a: 0,
        e: 'Conforme nota do item 6.2: <b>"deve ser feito uma análise de risco em conjunto entre Qualidade, Engenharia e Suprimentos"</b>.'
      },
      {
        q: 'Quais são os 4 critérios de qualificação previstos no item 6.1?',
        o: [
          'ISO 9001:2015, Homologação no sistema AG, Auditoria pela TEN ou Experiência aceita pela TEN.',
          'Ter página em rede social, possuir frotas de carros luxuosos, aceitar pagamento parcelado e ter filial.',
          'Preço mais barato, entrega em 24 horas, ausência de nota fiscal e sem garantia.',
          'Apenas ter capital social registrado em cartório.'
        ],
        a: 0,
        e: 'Os 4 critérios são: <b>a) ISO 9001:2015; b) Homologado no sistema AG; c) Auditoria da TEN; d) Experiência aceita pela TEN</b>.'
      },
      {
        q: 'O que o fluxograma de aquisição (Anexo 1) determina caso o fornecedor NÃO seja qualificado?',
        o: [
          'Proíbe a contratação e orienta iniciar procedimentos de qualificação formal.',
          'Autoriza a compra imediata sem notas fiscais.',
          'Manda a fábrica produzir sem matéria-prima.',
          'Permite a contratação se o diretor autorizar verbalmente.'
        ],
        a: 0,
        e: 'Se não qualificado, o fluxograma prescreve o bloqueio: <b>"Proíbe contratação de fornecedor não qualificado"</b>.'
      }
    ]
  },

  // -------------------------------------------------------------------------
  // M03 · O MPP: Plano de Processos de Manufatura
  // -------------------------------------------------------------------------
  {
    n: 3,
    short: 'O Plano MPP',
    title: 'O MPP: <span>Plano de Processos de Manufatura</span>',
    ic: 'form',
    badge: 'Especialista em MPP',
    gameName: 'O Fluxo de Aprovação do MPP',
    chips: [['4 cenas', ''], ['Item 4.3 e Anexo 2', 'o'], ['Zero Falhas', 't']],
    intro: 'O fornecedor não pode iniciar a produção às cegas. Entenda a função do MPP (Manufacturing Process Plan) e o fluxo rigoroso de aprovação técnica pela Engenharia e Qualidade.',
    scenes: [
      {
        ic: 'form',
        t: 'Definição do MPP (Item 4.3)',
        x: '<b>MPP - Manufacturing Process Plan:</b> documento técnico listando todas as operações de fabricação, com a definição precisa dos parâmetros de processos e seus limites aceitáveis.',
        chips: [['Item 4.3', 'o'], ['Parâmetros e Limites', 'ok']],
        vig: () => vf('MPP', 'Manufacturing Plan', [['Operações', 'Etapas de Fabricação'], ['Parâmetros', 'Limites de Tolerância'], ['Controle', 'Pontos de Inspeção']], 'ok', [['Elaborado por', 'Fornecedor da Usina']])
      },
      {
        ic: 'sap',
        t: 'Envio e Recepção (Anexo 2)',
        x: 'O fornecedor elabora o MPP e envia a <b>Suprimentos</b>. Suprimentos recebe e encaminha formalmente à <b>Engenharia e Qualidade</b> para a competente análise de risco.',
        chips: [['Anexo 2', 'o'], ['Suprimentos > Engenharia', 't']],
        vig: () => vSend('MPP Fornecedor > Suprimentos > Engenharia/Qualidade')
      },
      {
        ic: 'bad',
        t: 'Se Reprovado · Correções Exigidas',
        x: 'Se a Engenharia e Qualidade identificarem riscos ou falhas, o MPP é <b>reprovado</b>: são levantados os comentários técnicos a corrigir e devolvidos ao fornecedor para retificação.',
        chips: [['Fluxo Reprovado', 'bad'], ['Retificação Obrigatória', 'bad']],
        vig: () => vf('X', 'MPP com Comentários', [['Status', 'Reprovado'], ['Ação', 'Levantar Correções'], ['Destino', 'Fornecedor Retificar']], 'bad', [['Produção', 'Bloqueada']])
      },
      {
        ic: 'check',
        t: 'Se Aprovado · Início da Fabricação',
        x: 'Somente após o <b>MPP ser 100% aprovado</b> pela Engenharia e Qualidade, Suprimentos comunica o fornecedor, autorizando o início formal do processo de fabricação.',
        chips: [['Fluxo Aprovado', 'ok'], ['Liberação de Produção', 't']],
        vig: () => vAppr('PLANO MPP', 'APROV-ENG', 'APROVADO', 'Engenharia / Qualidade', 'check', false)
      }
    ],
    game: {
      type: 'order',
      title: 'Ordene o ciclo regulamentar do MPP conforme o Fluxograma do Anexo 2'
    },
    quiz: [
      {
        q: 'O que significa a sigla MPP segundo o item 4.3 do PO.ALM-0007?',
        o: [
          'Manufacturing Process Plan (Plano de Processos de Manufatura).',
          'Manual de Pintura Predial da fábrica.',
          'Mapeamento de Preços Promocionais de compras.',
          'Movimentação de Pessoal e Pátio da guarita.'
        ],
        a: 0,
        e: 'O item 4.3 define: <b>MPP - Plano de Processos de Manufatura (Manufacturing Process Plan)</b>.'
      },
      {
        q: 'Quem são os responsáveis técnicos pela análise de risco e aprovação do MPP na TEN?',
        o: [
          'Engenharia e Qualidade.',
          'Apenas a equipe de vigilância patrimonial.',
          'O motorista terceirizado do caminhão.',
          'O banco pagador da fatura.'
        ],
        a: 0,
        e: 'O Anexo 2 e o item 6.7 definem que a <b>Engenharia e a Qualidade fazem a Análise de Risco do MPP</b>.'
      },
      {
        q: 'O que o fornecedor deve fazer caso o seu MPP receba comentários de não aprovação?',
        o: [
          'Corrigir todos os pontos apontados e encaminhar a versão retificada para nova análise.',
          'Iniciar a fabricação mesmo com o plano reprovado.',
          'Ignorar os comentários técnicos da Engenharia TEN.',
          'Apagar o pedido de compras do sistema.'
        ],
        a: 0,
        e: 'Conforme Anexo 2: <b>levantar os comentários a corrigir e encaminhar para retificação junto ao fornecedor</b>.'
      },
      {
        q: 'Quando o fornecedor está formalmente autorizado a iniciar a fabricação das peças?',
        o: [
          'Somente após o resultado do MPP ser aprovado pela Engenharia/Qualidade e efetivado por Suprimentos.',
          'No momento em que recebe a primeira cotação de preços.',
          'Antes mesmo de assinar qualquer contrato.',
          'Quando o caminhão sair para a entrega.'
        ],
        a: 0,
        e: 'O Anexo 2 prescreve expressamente: <b>"Após MPP aprovada... iniciar processo de fabricação"</b>.'
      }
    ]
  },

  // -------------------------------------------------------------------------
  // M04 · RM & Diligenciamento
  // -------------------------------------------------------------------------
  {
    n: 4,
    short: 'RM & Diligenciamento',
    title: 'Requisição de Materiais (RM) & <span>Diligenciamento</span>',
    ic: 'sap',
    badge: 'Controlador de Diligenciamento',
    gameName: 'Da Engenharia ao Diligenciamento',
    chips: [['4 cenas', ''], ['SAP ERP', 'o'], ['Controle de Prazos', 't']],
    intro: 'Como a necessidade de compra sai do projeto e vira pedido? Conheça a geração da RM via SAP, os anexos técnicos e o papel vital do diligenciamento.',
    scenes: [
      {
        ic: 'form',
        t: 'Instruções Técnicas da Engenharia',
        x: 'A Engenharia elabora as <b>instruções de subcontratação</b> para cada insumo e os <b>desenhos técnicos detalhados</b>, enviando tudo ao Planejamento com as RMs.',
        chips: [['Engenharia', 'o'], ['Instruções de Subcontratação', 't']],
        vig: () => vForm('Engenharia TEN', 'RM-ENG', 'Instruções Técnicas & Desenhos')
      },
      {
        ic: 'sap',
        t: 'Papel do Planejamento (Anexo 1)',
        x: 'O Planejamento: 1) Elabora o cronograma de insumos; 2) Define os prazos de entrega contratuais; 3) <b>Insere a RM no sistema</b> com instruções e desenhos anexados.',
        chips: [['Planejamento', 'o'], ['Cronograma de Insumos', 'ok']],
        vig: () => vLanes([['Cronograma', 'Insumos Definidos', 100, 'var(--s-teal)', '#fff', '0.8s'], ['Prazos', 'Data de Entrega na Fábrica', 100, 'var(--s-orange)', '#fff', '1s'], ['Sistema', 'RM Inserida', 100, 'var(--s-blue)', '#fff', '1.2s']])
      },
      {
        ic: 'wh',
        t: 'Diligenciamento Ativo',
        x: 'O <b>Diligenciamento alimenta e atualiza o SAP</b>, acompanhando os marcos de fabricação no fornecedor para garantir que não ocorram atrasos na linha de produção.',
        chips: [['Item 6.4', 'o'], ['Diligenciamento SAP', 't']],
        vig: () => vf('D', 'Diligenciamento', [['Sistema', 'SAP Atualizado'], ['Foco', 'Prazos Contratuais'], ['Ação', 'Acompanhar Cronograma']], 'ok', [['Garantia', 'Prevenção de Atrasos']])
      },
      {
        ic: 'check',
        t: 'Passagem para Suprimentos',
        x: 'Suprimentos recebe as RMs com todos os anexos técnicos, valida a qualificação do fornecedor e <b>inicia paralelamente o processo de cotação comercial</b>.',
        chips: [['Suprimentos', 'o'], ['Cotação e Negociação', 't']],
        vig: () => vProps([['Fornecedor Homologado 1', 'R$ 480.000', 'Prazo 30d', 'Qualificado'], ['Fornecedor Homologado 2', 'R$ 510.000', 'Prazo 25d', 'Qualificado']])
      }
    ],
    game: {
      type: 'order',
      title: 'Ordene a esteira inicial desde a concepção do projeto até o início das cotações'
    },
    quiz: [
      {
        q: 'Qual sistema corporativo é utilizado para a criação e controle da Requisição de Materiais (RM)?',
        o: [
          'Sistema SAP ERP.',
          'Planilha manual não compartilhada.',
          'Bloco de notas pessoal do requisitante.',
          'Aplicativo de mensagens informais.'
        ],
        a: 0,
        e: 'O item 6.4 define expressamente: <b>"A Requisição de material é feita via SAP, descrevendo os requisitos dos materiais"</b>.'
      },
      {
        q: 'Quais documentos técnicos a Engenharia anexa obrigatoriamente à Requisição de Materiais?',
        o: [
          'Instruções de subcontratações e desenhos técnicos com requisitos de fornecimento.',
          'Apenas comprovantes de endereço dos engenheiros.',
          'Fotos de confraternizações da empresa.',
          'Nenhum documento é anexado.'
        ],
        a: 0,
        e: 'O fluxograma prescreve: <b>"Envia ao Planejamento as RMs com as documentações técnicas... instruções de subcontratações e desenhos"</b>.'
      },
      {
        q: 'Qual é o papel fundamental do Diligenciamento na cadeia de aquisições?',
        o: [
          'Alimentar o SAP e acompanhar o cumprimento dos prazos para evitar atrasos na fábrica.',
          'Cancelar pedidos sem consultar os setores envolvidos.',
          'Descarregar carretas na portaria.',
          'Emitir cheques manuais para os fornecedores.'
        ],
        a: 0,
        e: 'O item 6.4 e o Anexo 1 destacam o diligenciamento como <b>garantia de controle de prazos e alimentação do SAP</b>.'
      },
      {
        q: 'O que Suprimentos faz em paralelo logo após receber a RM com os anexos técnicos?',
        o: [
          'Verifica a qualificação dos fornecedores e inicia o processo formal de cotação.',
          'Paga antecipadamente o primeiro fornecedor que ligar.',
          'Rasga as instruções da engenharia.',
          'Suspende a produção da fábrica por tempo indeterminado.'
        ],
        a: 0,
        e: 'Conforme Anexo 1: Suprimentos <b>"Faz Seleção/Qualificação de Fornecedor - Em paralelo inicia processo de cotação"</b>.'
      }
    ]
  },

  // -------------------------------------------------------------------------
  // M05 · Alçadas de Aprovação & Pedidos
  // -------------------------------------------------------------------------
  {
    n: 5,
    short: 'Alçadas & Aprovações',
    title: 'Alçadas de Aprovação & <span>Governança de Pedidos</span>',
    ic: 'sap',
    badge: 'Gestor de Alçadas',
    gameName: 'Alçadas e Níveis de Aprovação',
    chips: [['4 cenas', ''], ['Item 6.6', 'o'], ['Simulador Interativo', 't']],
    intro: 'Quem pode aprovar compras na TEN? Experimente o simulador de alçadas e conheça os limites regulamentares para contratação de materiais e serviços.',
    scenes: [
      {
        ic: 'check',
        t: 'Análise Crítica Prévia (Item 6.6)',
        x: 'Antes de qualquer aprovação de Pedido de Compras, deverá ser realizada uma <b>análise crítica rigorosa</b> de conformidade contratual, técnica e orçamentária.',
        chips: [['Item 6.6', 'o'], ['Análise Crítica', 'ok']],
        vig: () => vAppr('PEDIDO DE COMPRA', 'ANALISE-CRITICA', 'AUDITADO', 'Suprimentos / Gestão', 'check', false)
      },
      {
        ic: 'wh',
        t: 'Simulador Interativo de Alçadas',
        x: 'Mova os seletores abaixo para simular os níveis de alçada e os aprovadores necessários para compra de materiais e contratação de serviços.',
        chips: [['Simulador', 'o'], ['Materiais x Serviços', 't']],
        widget: 'provedores',
        hold: true
      },
      {
        ic: 'sap',
        t: 'Alçadas para Materiais (Item 6.6)',
        x: '<b>Materiais:</b> N1 (Até R$ 10k): Gerentes; N2 (Até R$ 300k): Diretor da Obra; N3 (Até R$ 600k): Superintendente Comercial Energia; N4 (Acima de R$ 600k): Presidente.',
        chips: [['Alçada Materiais', 'o'], ['Teto N4', 'bad']],
        k: 600,
        kl: 'mil R$ (alçada Presidente)',
        vig: () => vLanes([['N1: Até 10k', 'Gerentes', 10, 'var(--s-teal)', '#fff', '0.8s'], ['N2: Até 300k', 'Diretor Obra', 50, 'var(--s-blue)', '#fff', '1s'], ['N3: Até 600k', 'Superintendente', 75, 'var(--s-orange)', '#fff', '1.2s'], ['N4: > 600k', 'Presidente', 100, 'var(--s-bad)', '#fff', '1.4s']])
      },
      {
        ic: 'road',
        t: 'Alçadas para Serviços (Item 6.6)',
        x: '<b>Serviços:</b> N1 (Até R$ 10k): Gerente Adm/Fin; N2 (Até R$ 1M): Gerente Unidade; N3 (Até R$ 3M): Superintendente; N4 (Até R$ 6M): Diretores; N5 (Acima de R$ 6M): Presidente.',
        chips: [['Alçada Serviços', 'o'], ['Teto N5', 'bad']],
        k: 6,
        kl: 'milhões R$ (alçada Presidente)',
        vig: () => vLanes([['N1: Até 10k', 'Gerente Adm/Fin', 5, 'var(--s-teal)', '#fff', '0.6s'], ['N2: Até 1M', 'Gerente Unidade', 25, 'var(--s-blue)', '#fff', '0.8s'], ['N3: Até 3M', 'Superintendente', 50, 'var(--s-orange)', '#fff', '1s'], ['N4: Até 6M', 'Diretores', 75, 'var(--s-bad)', '#fff', '1.2s'], ['N5: > 6M', 'Presidente', 100, 'var(--s-bad)', '#fff', '1.4s']])
      }
    ],
    game: {
      type: 'deck',
      title: 'Classifique a autoridade competente para aprovação de cada pedido de compra',
      buckets: ['Alçada de Nível 01 ou 02', 'Alçada de Nível 03, 04 ou 05'],
      cards: [
        { t: 'Compra de material de consumo no valor total de R$ 8.500,00', a: 0, s: 'Nível 01' },
        { t: 'Compra de chapas estruturais de aço no valor total de R$ 850.000,00', a: 1, s: 'Nível 04 (Presidente)' },
        { t: 'Contratação de serviço de usinagem industrial no valor de R$ 450.000,00', a: 0, s: 'Nível 02 (Gerente Unidade)' },
        { t: 'Compra de flanges forjados no valor de R$ 520.000,00', a: 1, s: 'Nível 03 (Superintendente)' },
        { t: 'Contratação de grande subcontrato de montagem no valor de R$ 4.200.000,00', a: 1, s: 'Nível 04 (Diretores)' },
        { t: 'Aquisição de consumíveis de soldagem no valor de R$ 180.000,00', a: 0, s: 'Nível 02 (Diretor Obra)' }
      ]
    },
    quiz: [
      {
        q: 'Para a compra de MATERIAIS, a partir de qual valor a aprovação exige o Presidente da TEN?',
        o: [
          'Valores acima de R$ 600.000,00 (Nível 04).',
          'Qualquer valor acima de R$ 1.000,00.',
          'Apenas acima de R$ 50.000.000,00.',
          'O Presidente nunca precisa aprovar compras de materiais.'
        ],
        a: 0,
        e: 'O item 6.6 estabelece para materiais: <b>"04 - Acima de R$ 600.000,00 - Presidente"</b>.'
      },
      {
        q: 'Qual autoridade aprova compras de materiais na faixa entre R$ 10.000,01 e R$ 300.000,00?',
        o: [
          'Diretor da obra (Nível 02).',
          'Gerente da unidade.',
          'Superintendente comercial.',
          'Almoxarife sênior.'
        ],
        a: 0,
        e: 'Conforme tabela do item 6.6 para materiais: <b>"02 - Até R$ 300.000,00 - Diretor da obra"</b>.'
      },
      {
        q: 'Para a contratação de SERVIÇOS, qual é o teto máximo de aprovação do Gerente da Unidade (Nível 02)?',
        o: [
          'Até R$ 1.000.000,00.',
          'Até R$ 50.000,00.',
          'Até R$ 10.000.000,00.',
          'Até R$ 10.000,00.'
        ],
        a: 0,
        e: 'Na tabela de serviços do item 6.6: <b>"02 - Até R$ 1.000.000,00 - Gerente da Unidade"</b>.'
      },
      {
        q: 'O que deve ser realizado obrigatoriamente antes de submeter o pedido de compra à alçada de aprovação?',
        o: [
          'Uma análise crítica formal de conformidade técnica, comercial e orçamentária.',
          'O pagamento integral adiantado ao fornecedor.',
          'O descarte de todas as cópias da cotação.',
          'A emissão da nota fiscal pelo fornecedor.'
        ],
        a: 0,
        e: 'O item 6.6 determina: <b>"Antes da aprovação do pedido de compras, deverá ser feita uma análise crítica"</b>.'
      }
    ]
  },

  // -------------------------------------------------------------------------
  // M06 · Informações no Pedido (PC)
  // -------------------------------------------------------------------------
  {
    n: 6,
    short: 'Informações no PC',
    title: 'Informações ao Fornecedor: <span>Requisitos no Pedido</span>',
    ic: 'form',
    badge: 'Auditor de Contratação',
    gameName: 'Requisitos Mandatórios no Pedido de Compras',
    chips: [['4 cenas', ''], ['Item 6.7', 'o'], ['Cláusulas Críticas', 't']],
    intro: 'O Pedido de Compra não é apenas um documento financeiro: é um contrato técnico vinculante. Saiba quais informações são obrigatórias segundo o item 6.7.',
    scenes: [
      {
        ic: 'form',
        t: 'Cláusulas Técnicas no Pedido',
        x: 'O Pedido de Compras deve conter: a) <b>Especificações técnicas documentadas</b>; b) <b>Desenhos com requisitos</b> para fornecimento; c) <b>Condições gerais de fornecimento</b>.',
        chips: [['Item 6.7', 'o'], ['Desenhos e Requisitos', 'ok']],
        vig: () => vForm('Pedido de Compras TEN', 'PC-TEN', 'Especificações, Desenhos & Condições Gerais')
      },
      {
        ic: 'road',
        t: 'Cronograma e Obrigatoriedade do MPP',
        x: 'O PC deve informar: d) <b>Cronograma e data de entrega</b>; e e) A <b>obrigatoriedade formal de envio e aprovação do MPP</b> antes de iniciar a fabricação das peças.',
        chips: [['Cronograma Estrito', 'o'], ['Cláusula MPP', 'bad']],
        vig: () => vf('MPP', 'Cláusula Contratual', [['Cronograma', 'Data Limite no Pátio'], ['Exigência', 'Envio Obrigatório de MPP'], ['Condição', 'Fabricação Só Após Aprovação']], 'ok', [['Penalidade', 'Recusa de Peças']])
      },
      {
        ic: 'check',
        t: 'Inspeções nas Instalações do Fornecedor',
        x: 'O pedido deve registrar: f) As <b>inspeções e atividades previstas</b> nas instalações do fornecedor conforme o MPP; e g) A <b>data agendada para inspeções in loco</b> pela TEN.',
        chips: [['Auditoria Fabril', 'o'], ['Inspeção In Loco', 't']],
        vig: () => vChecklist('Auditoria no Fornecedor', ['Verificação de matéria-prima e corrida', 'Acompanhamento de processos de solda', 'Testes não destrutivos (ultrassom)', 'Inspeção dimensional pré-embarque'], -1, 'Plano de Auditoria', 'Atividades')
      },
      {
        ic: 'folder',
        t: 'Blindagem Jurídica e Rastreabilidade',
        x: 'Essas 7 informações garantem que qualquer desvio fabril dê à TEN o <b>direito contratual e legal de recusar o lote</b>, sem ônus financeiro por atrasos do parceiro.',
        chips: [['Garantia Legal', 'ok'], ['Rastreabilidade Total', 't']],
        vig: () => vf('TEN', 'Proteção Jurídica', [['Rastreabilidade', '100% Documentada'], ['Direito de Recusa', 'Assegurado no PC'], ['Garantia', 'Conformidade da Torre']], 'ok', [['Auditoria Externa', 'Aprovada']])
      }
    ],
    game: {
      type: 'deck',
      title: 'Classifique as cláusulas que devem constar obrigatoriamente no Pedido de Compras (Item 6.7)',
      buckets: ['Cláusula Obrigatória no Pedido (PC)', 'Item Indevido / Não Regulamentar'],
      cards: [
        { t: 'Informar ao fornecedor a obrigatoriedade de enviar o MPP para aprovação prévia', a: 0, s: 'Obrigatório' },
        { t: 'Omitir desenhos técnicos e tolerâncias dimensionais para economizar páginas', a: 1, s: 'Indevido' },
        { t: 'Especificar cronograma contratual com datas de entrega na fábrica da TEN', a: 0, s: 'Obrigatório' },
        { t: 'Informar inspeções previstas a serem realizadas nas instalações do fornecedor', a: 0, s: 'Obrigatório' },
        { t: 'Dispensar condições gerais de fornecimento por acordo verbal não registrado', a: 1, s: 'Indevido' },
        { t: 'Anexar desenhos técnicos com requisitos documentados para o fornecimento', a: 0, s: 'Obrigatório' }
      ]
    },
    quiz: [
      {
        q: 'O que o Pedido de Compras deve exigir obrigatoriamente sobre o MPP segundo o item 6.7?',
        o: [
          'Informar a obrigatoriedade de enviar o MPP para aprovação antes do início da fabricação do pedido.',
          'Dispensar o MPP se o fornecedor prometer entregar rápido.',
          'Autorizar o envio do MPP apenas após a entrega das peças no pátio.',
          'Cobrar uma taxa financeira pelo envio do plano.'
        ],
        a: 0,
        e: 'O item 6.7.e prescreve: <b>"Informar ao fornecedor a obrigatoriedade de enviar o MPP para aprovação antes do início da fabricação do pedido"</b>.'
      },
      {
        q: 'Quais dados de inspeção nas instalações do fornecedor devem constar no Pedido de Compras?',
        o: [
          'As inspeções previstas conforme o MPP e a data agendada para vistorias nas instalações.',
          'Apenas o cardápio do almoço durante a visita.',
          'Nenhuma informação de inspeção deve ser informada.',
          'Apenas o itinerário de viagem da equipe.'
        ],
        a: 0,
        e: 'Conforme itens 6.7.f e 6.7.g: <b>informar as inspeções previstas conforme o MPP e as datas para inspeções nas instalações</b>.'
      },
      {
        q: 'Por que os desenhos e especificações técnicas documentadas devem fazer parte do Pedido de Compras?',
        o: [
          'Para vincular legalmente o fornecedor às tolerâncias dimensionais e propriedades mecânicas exigidas.',
          'Apenas para ocupar espaço em anexo no e-mail.',
          'Porque os fornecedores não sabem o que fabricam.',
          'Não há utilidade técnica em anexar desenhos.'
        ],
        a: 0,
        e: 'Os desenhos e especificações <b>definem o padrão de aceitação e os limites de rejeição</b> da peça recebida.'
      },
      {
        q: 'Qual é o impacto contratual de omitir o cronograma ou data de entrega no Pedido de Compras?',
        o: [
          'Impede a cobrança de multas por atraso e prejudica gravemente o planejamento de montagem das torres.',
          'Melhora o relacionamento com o fornecedor.',
          'Acelera a fabricação das peças.',
          'Nenhum impacto contratual.'
        ],
        a: 0,
        e: 'A definição formal do cronograma é a <b>base jurídica para cobrança de prazos e gestão de penalidades por atraso</b>.'
      }
    ]
  },

  // -------------------------------------------------------------------------
  // M07 · Recepção no Almoxarifado
  // -------------------------------------------------------------------------
  {
    n: 7,
    short: 'Recepção no Almox',
    title: 'Recepção no Almoxarifado & <span>Inspeção de Entrada</span>',
    ic: 'wh',
    badge: 'Guardião do Recebimento',
    gameName: 'O Fluxo de Recebimento no Almoxarifado',
    chips: [['4 cenas', ''], ['Anexo 1', 'o'], ['Conferência Física', 't']],
    intro: 'A mercadoria chegou na fábrica! Conheça as atribuições do Almoxarifado na inspeção física, liberação para o solicitante e encaminhamento para avaliação.',
    scenes: [
      {
        ic: 'wh',
        t: 'Recepção, Verificação e Inspeção',
        x: 'O <b>Almoxarifado recebe, verifica e inspeciona</b> o material recebido contra a DANFE, o Pedido de Compra e os certificados técnicos da usina/fabricante.',
        chips: [['Anexo 1', 'o'], ['Recebe e Inspeciona', 'ok']],
        vig: () => vWH('Material recebido e inspecionado no Almoxarifado TEN!')
      },
      {
        ic: 'sap',
        t: 'Trâmites de Pagamento ao Fornecedor',
        x: 'Com a carga conferida fisicamente, o Almoxarifado <b>encaminha o processo fiscal para a Controladoria e Financeiro</b> efetuarem o lançamento e programação de pagamento.',
        chips: [['Processamento Fiscal', 'o'], ['Fluxo de Pagamento', 't']],
        vig: () => vSend('DANFE Atestada > Lançamento Fiscal / Pagamento Fornecedor')
      },
      {
        ic: 'check',
        t: 'Entrega do Material ao Solicitante',
        x: 'O Almoxarifado <b>entrega o material aprovado à Área Solicitante</b> para aplicação imediata na linha de fabricação das torres ou guarda segura em almoxarifado.',
        chips: [['Entrega Formal', 'ok'], ['Área Solicitante', 't']],
        vig: () => vAppr('MATERIAL APROVADO', 'ENTREGA-SOLIC', 'ENTREGUE', 'Almoxarifado > Solicitante', 'check', false)
      },
      {
        ic: 'form',
        t: 'Encaminhamento para Avaliação',
        x: 'O Almoxarifado <b>encaminha os dados do fornecedor a Suprimentos</b> para registro de ocorrências e composição da <b>Avaliação Periódica de Desempenho</b>.',
        chips: [['Fechamento do Ciclo', 'o'], ['Avaliação Desempenho', 't']],
        vig: () => vf('A', 'Almox > Suprimentos', [['Entrega', 'Concluída'], ['Ocorrências', 'Registradas'], ['Destino', 'Avaliação de Desempenho']], 'ok', [['Portal', 'Portal AG']])
      }
    ],
    game: {
      type: 'order',
      title: 'Ordene a sequência regulamentar do Almoxarifado no Recebimento de Materiais (Anexo 1)'
    },
    quiz: [
      {
        q: 'O que o Almoxarifado faz imediatamente após o caminhão posicionar na doca de descarregamento?',
        o: [
          'Recebe, verifica e inspeciona o material contra a DANFE, pedido e especificações.',
          'Manda o motorista descarregar sem checar nenhum documento.',
          'Autoriza o pagamento sem antes conferir o material físico.',
          'Guarda o material sem abrir as embalagens.'
        ],
        a: 0,
        e: 'O Anexo 1 prescreve expressamente: <b>"Almoxarifado: Recebe, verifica e inspeciona"</b>.'
      },
      {
        q: 'Para quem o Almoxarifado entrega o material após concluir a inspeção e conferência favorável?',
        o: [
          'Entrega o material aprovado à Área Solicitante da fábrica.',
          'Para qualquer pessoa que passar no pátio.',
          'Devolve para a transportadora.',
          'Leva para o estacionamento externo.'
        ],
        a: 0,
        e: 'Conforme fluxograma do Anexo 1: <b>"Entrega material ao solicitante"</b>.'
      },
      {
        q: 'O que o Almoxarifado encaminha a Suprimentos após a conclusão do recebimento físico?',
        o: [
          'Encaminha os dados do fornecedor e ocorrências para a Avaliação de Desempenho.',
          'Apenas reclamações informais sem registro.',
          'As chaves da empilhadeira.',
          'Nenhuma informação é encaminhada.'
        ],
        a: 0,
        e: 'O Anexo 1 determina: <b>"Encaminha fornecedor ao Suprimentos para Avaliação de Desempenho"</b>.'
      },
      {
        q: 'Como o pagamento ao fornecedor é viabilizado após o recebimento?',
        o: [
          'O Almoxarifado atesta a DANFE física e encaminha o processo à Controladoria/Financeiro.',
          'O almoxarife paga em dinheiro vivo ao motorista.',
          'O pagamento é feito sem emissão de nota fiscal.',
          'A TEN nunca paga seus fornecedores.'
        ],
        a: 0,
        e: 'O fluxo formal prevê o encaminhamento protocolado das notas fiscais para <b>efetivação do lançamento e pagamento regular</b>.'
      }
    ]
  },

  // -------------------------------------------------------------------------
  // M08 · Avaliação de Desempenho & RACI
  // -------------------------------------------------------------------------
  {
    n: 8,
    short: 'Avaliação & RACI',
    title: 'Avaliação Anual & <span>Matriz de Responsabilidades</span>',
    ic: 'folder',
    badge: 'Gestor de Performance',
    gameName: 'Gestão de Fornecedores e Avaliação Contínua',
    chips: [['4 cenas', ''], ['Portal AG', 'o'], ['Reavaliação Anual', 't']],
    intro: 'Manter a qualificação exige disciplina contínua. Conheça o portal AG de avaliação, o ciclo anual de reavaliação e a matriz de responsabilidades das áreas.',
    scenes: [
      {
        ic: 'form',
        t: 'Questionário no Portal AG (Item 6.3)',
        x: 'O monitoramento é feito através de um <b>questionário estruturado disponível no portal AG</b>, avaliando índices de qualidade, pontualidade e suporte técnico.',
        chips: [['Portal AG', 'o'], ['Índices de Entrega', 'ok']],
        vig: () => vForm('Portal AG Fornecedores', 'AVAL-DESEMP', 'Questionário Anual de Avaliação')
      },
      {
        ic: 'check',
        t: 'Reavaliação Anual Obrigatória',
        x: '<b>Periodicidade Mandatória:</b> a reavaliação de desempenho de todos os fornecedores qualificados é realizada <b>anualmente</b>, gerando planos de ação ou bloqueio.',
        chips: [['Item 6.3.b', 'o'], ['Ciclo Anual', 't']],
        vig: () => vLanes([['Ano 1', 'Desempenho Aprovado', 100, 'var(--s-teal)', '#fff', '0.8s'], ['Ano 2', 'Reavaliação Anual Portal AG', 100, 'var(--s-blue)', '#fff', '1s'], ['Melhoria', 'Planos de Ação Contínuos', 100, 'var(--s-orange)', '#fff', '1.2s']])
      },
      {
        ic: 'sap',
        t: 'Matriz RACI das Áreas (Anexo 3)',
        x: 'O Anexo 3 detalha papéis: Suprimentos é <b>Responsável (R)</b> pela lista de fornecedores; Engenharia <b>Aprova (A)</b> liberações e MPP; QMSS <b>Aprova (A)</b> a qualificação.',
        chips: [['Matriz RACI', 'o'], ['Responsabilidades', 't']],
        vig: () => vf('RACI', 'Matriz de Autoridades', [['Definir Críticos', 'Eng / QMSS / Supr (R)'], ['Análise FMEA', 'Eng / QMSS / Supr (R)'], ['Análise MPP', 'Engenharia (R)'], ['Qualificar Fornec.', 'Supr / QMSS / Compl (A)']], 'ok', [['Auditoria', 'Governança Estrita']])
      },
      {
        ic: 'folder',
        t: 'Informação Documentada na Rede (Item 6.5)',
        x: 'Devem permanecer arquivados na rede da TEN: lista de qualificados, certificados ISO 9001, avaliações de desempenho, sub tier, desenhos, MPPs, cotações e pedidos.',
        chips: [['Item 6.5', 'o'], ['Retenção na Rede', 'ok']],
        vig: () => vFolder('REDE-TEN/SUPRIM/FORNECEDORES', ['LISTA_QUALIFICADOS_2026.pdf', 'CERTIFICADOS_ISO9001.pdf', 'AVALIACOES_PORTAL_AG.pdf', 'MPP_APROVADOS_ENG.pdf'])
      }
    ],
    game: {
      type: 'deck',
      title: 'Classifique as responsabilidades e critérios de avaliação continuada de fornecedores',
      buckets: ['Prática Regulamentar de Avaliação', 'Não Conformidade na Gestão de Fornecedores'],
      cards: [
        { t: 'Aplicar questionário de avaliação de desempenho via portal AG com reavaliação anual', a: 0, s: 'Regulamentar' },
        { t: 'Manter fornecedor com sucessivas entregas em atraso sem aplicar avaliação ou plano de ação', a: 1, s: 'Não Conformidade' },
        { t: 'Armazenar certificados ISO 9001 e avaliações na rede TEN para consulta das áreas', a: 0, s: 'Regulamentar' },
        { t: 'Manter a lista de fornecedores qualificados permanentemente atualizada no sistema', a: 0, s: 'Regulamentar' },
        { t: 'Excluir avaliações negativas do portal para favorecer fornecedores com problemas recorrentes', a: 1, s: 'Não Conformidade' },
        { t: 'Submeter desqualificação ou bloqueio de fornecedor à aprovação das áreas competentes', a: 0, s: 'Regulamentar' }
      ]
    },
    quiz: [
      {
        q: 'Onde é realizado o monitoramento do desempenho dos fornecedores da TEN?',
        o: [
          'Através de um questionário disponível no portal AG.',
          'Em conversas informais pelo telefone.',
          'Em reuniões de condomínio da cidade.',
          'Em enquetes anônimas na internet.'
        ],
        a: 0,
        e: 'O item 6.3.a define com clareza: <b>"O monitoramento é feito através de um questionário disponível no portal AG"</b>.'
      },
      {
        q: 'Com qual periodicidade é realizada a reavaliação dos fornecedores da TEN?',
        o: [
          'A reavaliação é feita anualmente.',
          'Apenas a cada 10 anos.',
          'Somente quando o fornecedor encerrar as atividades.',
          'A cada 15 dias corridos.'
        ],
        a: 0,
        e: 'O item 6.3.b prescreve expressamente: <b>"A reavaliação é feita anualmente"</b>.'
      },
      {
        q: 'Segundo a Matriz RACI (Anexo 3), qual área é responsável pela análise crítica do MPP?',
        o: [
          'Engenharia (R).',
          'Recursos Humanos corporativo.',
          'Apenas a portaria física.',
          'O próprio fornecedor sem validação interna.'
        ],
        a: 0,
        e: 'Na matriz do Anexo 3, a linha "Fazer análise crítica do MPP" tem como responsável a <b>Engenharia (R)</b>.'
      },
      {
        q: 'Quais documentos devem estar disponíveis na rede TEN segundo o item 6.5?',
        o: [
          'Lista de qualificados, certificados ISO 9001, avaliações, desenhos técnicos, MPPs aprovados, cotações e pedidos.',
          'Apenas fotos do estacionamento da fábrica.',
          'Rascunhos sem assinatura de compras antigas.',
          'Nenhum documento precisa ser mantido na rede corporativa.'
        ],
        a: 0,
        e: 'O item 6.5 enumera os <b>9 tipos de informações documentadas obrigatórias disponíveis na rede TEN</b>.'
      }
    ]
  },

  // -------------------------------------------------------------------------
  // M09 · Desafio Final dos Provedores Externos
  // -------------------------------------------------------------------------
  {
    n: 9,
    short: 'Desafio Final',
    title: 'Desafio Final: <span>Mestre em Controle de Provedores</span>',
    ic: 'check',
    badge: 'Especialista em Controle de Provedores TEN',
    gameName: 'Rodada Mista de Provedores Externos',
    chips: [['Revisão & Quiz', ''], ['8 perguntas', 'o'], ['15s / questão', 'bad']],
    qtime: 15,
    intro: 'Chegou o teste final! Prove seu domínio completo sobre a qualificação, análise de risco, MPP, alçadas, recebimento e avaliação anual do PO.ALM-0007 para liberar seu certificado.',
    scenes: [
      {
        ic: 'check',
        t: 'Visão Sistêmica do Procedimento',
        x: 'Você dominou todas as etapas do <b>PO.ALM-0007</b>: Qualificação de fornecedores, Análise de Risco tripartite, aprovação de MPP, Diligenciamento, Alçadas, Inspeção no Almoxarifado e Portal AG.',
        chips: [['Visão Sistêmica', 'o'], ['Ciclo Consolidado', 'ok']],
        vig: () => vIcons([['check', 'Qualificação ISO'], ['form', 'MPP Aprovado'], ['sap', 'Alçadas & Diligenciamento'], ['wh', 'Almox & Portal AG']])
      },
      {
        ic: 'sap',
        t: 'Regras Decisivas Revisitadas',
        x: 'Lembre-se: Fornecedor deve ter <b>ISO 9001 ou ser homologado</b>; Análise de risco é conjunta; <b>fabricação só após MPP aprovado</b>; compras acima de 600k (materiais) vão ao Presidente; reavaliação é <b>anual</b>.',
        chips: [['Pontos Decisivos', 'o'], ['Conformidade 100%', 't']],
        vig: () => vf('TEN', 'Regras de Ouro', [['Critérios', 'ISO / Homologado AG'], ['MPP', 'Aprovação Prévia Mandatória'], ['Alçada Máxima', 'Presidente > 600k'], ['Monitoramento', 'Anual Portal AG']], 'ok', [['Auditoria', '100% Conforme']])
      }
    ],
    game: {
      type: 'deck',
      title: 'Rodada mista decisiva: classifique as condutas na gestão de provedores externos',
      buckets: ['Conduta Conforme / Padrão TEN', 'Conduta Inconforme / Não Autorizada'],
      cards: [
        { t: 'Realizar análise de risco em conjunto entre Qualidade, Engenharia e Suprimentos', a: 0, s: 'Conforme' },
        { t: 'Autorizar início da fabricação antes da aprovação do plano de processos MPP', a: 1, s: 'Inconforme' },
        { t: 'Submeter pedido de compra de materiais de R$ 750.000,00 à aprovação do Presidente', a: 0, s: 'Conforme' },
        { t: 'Comprar de fornecedor não homologado sem prévia qualificação pelas áreas', a: 1, s: 'Inconforme' },
        { t: 'Inserir a obrigatoriedade do MPP e cronograma nas cláusulas do Pedido de Compras', a: 0, s: 'Conforme' },
        { t: 'Almoxarifado receber, inspecionar fisicamente e encaminhar à avaliação de desempenho', a: 0, s: 'Conforme' },
        { t: 'Dispensar a reavaliação anual do fornecedor no portal AG por excesso de trabalho', a: 1, s: 'Inconforme' },
        { t: 'Manter lista atualizada de qualificados e relatórios de auditoria na rede TEN', a: 0, s: 'Conforme' }
      ]
    },
    quiz: [
      {
        q: 'Qual é a regra mandatória sobre o início da fabricação do pedido de compras pelo fornecedor?',
        o: [
          'A fabricação só pode iniciar após o envio e aprovação formal do MPP pela Engenharia/Qualidade.',
          'O fornecedor pode fabricar antes do MPP para adiantar o cronograma.',
          'O MPP é opcional e não precisa de aprovação prévia.',
          'Basta enviar um e-mail informal solicitando início da produção.'
        ],
        a: 0,
        e: 'O item 6.7.e e o Anexo 2 estabelecem que <b>a fabricação só inicia após o MPP estar 100% aprovado</b>.'
      },
      {
        q: 'Quais áreas realizam obrigatoriamente a Análise de Risco prévia de novos fornecedores de chapas e flanges?',
        o: [
          'Qualidade, Engenharia e Suprimentos em conjunto.',
          'Apenas a equipe comercial externa.',
          'Somente o motorista do frete.',
          'Apenas a segurança patrimonial da portaria.'
        ],
        a: 0,
        e: 'Conforme nota do item 6.2: <b>análise de risco tripartite em conjunto entre Qualidade, Engenharia e Suprimentos</b>.'
      },
      {
        q: 'Para compras de MATERIAIS, a partir de qual valor a alçada exige a aprovação do Diretor da Obra?',
        o: [
          'Acima de R$ 10.000,00 até R$ 300.000,00 (Nível 02).',
          'Até R$ 500,00 apenas.',
          'Somente acima de R$ 20.000.000,00.',
          'Qualquer compra requer aprovação do Diretor.'
        ],
        a: 0,
        e: 'Na tabela do item 6.6 para materiais: <b>"02 - Até R$ 300.000,00 - Diretor da obra"</b>.'
      },
      {
        q: 'Para compras de MATERIAIS, qual autoridade aprova valores superiores a R$ 600.000,00?',
        o: [
          'Presidente da TEN (Nível 04).',
          'Gerente administrativo apenas.',
          'Comprador júnior.',
          'Almoxarife de pátio.'
        ],
        a: 0,
        e: 'Conforme tabela do item 6.6: <b>"04 - Acima de R$ 600.000,00 - Presidente"</b>.'
      },
      {
        q: 'Qual ferramenta corporativa é utilizada para o monitoramento e avaliação do desempenho de fornecedores?',
        o: [
          'Questionário estruturado no portal AG.',
          'Troca de mensagens de texto não oficiais.',
          'Formulário impresso descartável.',
          'Nenhum acompanhamento é realizado.'
        ],
        a: 0,
        e: 'O item 6.3.a estabelece: <b>"O monitoramento é feito através de um questionário disponível no portal AG"</b>.'
      },
      {
        q: 'Com qual periodicidade regulamentar deve ser feita a reavaliação dos fornecedores qualificados?',
        o: [
          'Anualmente.',
          'Semestralmente.',
          'A cada 5 anos.',
          'Nunca precisa ser reavaliado.'
        ],
        a: 0,
        e: 'O item 6.3.b prescreve de forma categórica: <b>"A reavaliação é feita anualmente"</b>.'
      },
      {
        q: 'Qual é o papel do Almoxarifado após a inspeção e conferência favorável do material recebido?',
        o: [
          'Entregar o material ao solicitante, liberar processo para pagamento e encaminhar fornecedor à avaliação de desempenho.',
          'Descartar o material no pátio de sucatas.',
          'Devolver tudo ao fornecedor sem justificativa.',
          'Reter os certificados sem cadastrar no sistema.'
        ],
        a: 0,
        e: 'O Anexo 1 prescreve: <b>recebe/inspeciona, encaminha para pagamento, entrega ao solicitante e aciona avaliação de desempenho</b>.'
      },
      {
        q: 'O que o fluxograma prescreve expressamente caso o fornecedor cotado NÃO seja qualificado?',
        o: [
          'Proíbe a contratação de fornecedor não qualificado até regularização do processo formal.',
          'Autoriza a compra imediata com desconto.',
          'Transfere a compra para uma empresa terceirizada sem contrato.',
          'Permite a contratação se o fornecedor for amigo do comprador.'
        ],
        a: 0,
        e: 'O fluxograma do Anexo 1 é taxativo: <b>proíbe a contratação de fornecedores que não atendam aos critérios de qualificação</b>.'
      }
    ]
  }
];

const GINST = {
  order: 'Arraste os cartões para ordená-los na sequência correta do procedimento.',
  deck: 'Toque ou clique no balde correspondente para classificar cada caso.'
};

// Configuração geral da trilha
const CFG = {
  code: 'PO.ALM-0007',
  rev: '00',
  name: 'Controle de Processos, Produtos e Serviços Providos Externamente',
  hero: 'Provedores <span>Externos</span>',
  hud: 'Controle de Provedores Externos',
  key: 'trilha-alm0007-v1',
  origem: 'trilha-alm0007',
  title: 'Trilha PO.ALM-0007',
  levels: [
    [0, 'Observador de Compras'],
    [400, 'Analista de Qualificação'],
    [1100, 'Inspetor de MPP & Riscos'],
    [2000, 'Controlador de Alçadas'],
    [3200, 'Auditor de Fornecedores'],
    [4400, 'Mestre em Provedores TEN']
  ],
  guide: (t) => `
    <div class="gcard">
      <h3>${ic('ishield')}Critérios de Qualificação de Fornecedores (Item 6.1)</h3>
      ${t(
        ['Critério', 'Requisito Mínimo (ao menos 1 exigido)'],
        [
          ['a) ISO 9001:2015', 'Possuir certificação válida na norma ABNT NBR ISO 9001:2015.'],
          ['b) Homologação AG', 'Estar devidamente homologado no sistema corporativo AG.'],
          ['c) Auditoria TEN', 'Ter passado por auditoria formal da equipe técnica da TEN.'],
          ['d) Experiência Aceita', 'Demonstrar experiência suficiente e aceita formalmente pela TEN.']
        ]
      )}
    </div>

    <div class="gcard">
      <h3>${ic('iusers')}Análise de Risco & Processo MPP (Item 6.2 e Anexo 2)</h3>
      ${t(
        ['Etapa', 'Responsável', 'Regra Mandatória'],
        [
          ['Análise de Risco', 'Qualidade + Engenharia + Suprimentos', 'Obrigatória antes de concluir a seleção para chapas, flanges, door frames e consumíveis.'],
          ['Elaboração MPP', 'Fornecedor', 'Manufacturing Process Plan com todas as etapas, parâmetros e limites de processo.'],
          ['Análise do MPP', 'Engenharia e Qualidade', 'Valida riscos técnicos. Se reprovado: correção. Se aprovado: libera fabricação.'],
          ['Início de Produção', 'Suprimentos / Fornecedor', 'Terminantemente proibido iniciar fabricação sem o MPP 100% aprovado.']
        ]
      )}
    </div>

    <div class="gcard">
      <h3>${ic('idb')}Alçadas de Aprovação de Pedidos de Compras (Item 6.6)</h3>
      ${t(
        ['Nível', 'Compra de Materiais', 'Compra de Serviços'],
        [
          ['Nível 01', 'Até R$ 10.000,00 (Gerente Adm/Fin ou Plan/Custos)', 'Até R$ 10.000,00 (Gerente Adm/Fin)'],
          ['Nível 02', 'Até R$ 300.000,00 (Diretor da Obra)', 'Até R$ 1.000.000,00 (Gerente da Unidade)'],
          ['Nível 03', 'Até R$ 600.000,00 (Superintendente Comercial)', 'Até R$ 3.000.000,00 (Superintendente da Unidade)'],
          ['Nível 04', 'Acima de R$ 600.000,00 (Presidente)', 'Até R$ 6.000.000,00 (Diretores da Unidade)'],
          ['Nível 05', '—', 'Acima de R$ 6.000.000,00 (Presidente da Unidade)']
        ]
      )}
    </div>

    <div class="gcard">
      <h3>${ic('ifold')}Recepção no Almoxarifado & Avaliação Anual (Item 6.3 e Anexo 1)</h3>
      ${t(
        ['Fase', 'Ação Regulamentar'],
        [
          ['Recepção Física', 'Almoxarifado recebe, verifica e inspeciona material contra DANFE e certificados.'],
          ['Entrega ao Solicitante', 'Material conforme é disponibilizado imediatamente à linha de produção da torre.'],
          ['Trâmite Fiscal', 'DANFE original atestada segue para a Controladoria para pagamento tempestivo.'],
          ['Monitoramento Portal AG', 'Questionário estruturado no portal AG com reavaliação anual mandatória de desempenho.']
        ]
      )}
    </div>
  `
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CFG, GINST, M };
}
