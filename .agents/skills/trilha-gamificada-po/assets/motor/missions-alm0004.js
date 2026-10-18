/* ================= Trilha PO.ALM-0004: Mobilização e Desmobilização de Equipamento de Terceiros =================
   Procedimento Operacional · Rev. 01 · 01/11/2022
   Emissor: Ana Paula De Araujo Nascimento · Aprovador: Fabio da Silva Muricy
   Foco: Mobilização e desmobilização de equipamentos locados/terceiros,
         NF de remessa, check-list com fotos, SAP MIGO depósito 0070,
         etiqueta de rastreabilidade, manutenções, danos (FRM.SUP-0001),
         SEMINFE e dossiê de operação. */

const M = [
  // -------------------------------------------------------------------------
  // M01 · Por que Mobilizar? Suporte à Operação TEN
  // -------------------------------------------------------------------------
  {
    n: 1,
    short: 'Por que Mobilizar',
    title: 'Por que <span>Mobilizar</span>?',
    ic: 'ishield',
    badge: 'Guardião de Ativos',
    gameName: 'O Ciclo dos 3 Setores',
    chips: [['4 cenas', ''], ['Suporte Fabril', 'o'], ['≈ 4 min', 't']],
    intro: 'Guindastes, compressores, plataformas aéreas e geradores alugados são indispensáveis para erguer as torres da TEN. O PO.ALM-0004 padroniza a entrada, permanência e saída segura desses ativos de terceiros.',
    scenes: [
      {
        ic: 'i7',
        t: 'Objetivo do Procedimento',
        x: 'O <b>PO.ALM-0004</b> estabelece critérios rigorosos para a <b>Mobilização e Desmobilização de Equipamentos de Terceiros</b> na TEN, garantindo que estejam de acordo com diretrizes contratuais e responsabilidades claras.',
        chips: [['Item 1', 'o'], ['PO.ALM-0004', 't'], ['Rev. 01', '']],
        vig: () => vf('i7', 'Equipamentos de Terceiros', [['PO.ALM-0004', 'o'], ['Rev. 01', ''], ['Suporte à Fábrica', 't']], 'ok')
      },
      {
        ic: 'iboxes',
        t: 'Escopo Abrangente',
        x: 'Aplica-se a <b>todas as áreas da fábrica</b> que possuem equipamentos de terceiros utilizados como suporte na operação. O período de locação é definido pela necessidade técnica e contratual de cada setor.',
        chips: [['Item 2', 'o'], ['Todas as Áreas', 't'], ['Locação sob Demanda', '']],
        vig: () => vf('iboxes', 'Escopo de Locação', [['Muncks & Guindastes', 'o'], ['Plataformas aéreas', 't'], ['Geradores & Máquinas', '']], '')
      },
      {
        ic: 'iusers',
        t: 'Os Três Setores Integrados',
        x: 'O ciclo envolve três atores principais: o <b>Almoxarifado</b> (inspeção, SAP 0070 e dossiê), o <b>Setor Solicitante</b> (operação diária e zelo) e <b>Suprimentos</b> (gestão de contrato, manutenções e fretes).',
        chips: [['Item 3', 'o'], ['Almoxarifado', 't'], ['Solicitante', 'o'], ['Suprimentos', '']],
        vig: () => vf('iusers', 'Triângulo Operacional', [['Almox: Entrada & Dossiê', 'o'], ['Solicitante: Operação', 't'], ['Suprimentos: Gestão', '']], 'ok')
      },
      {
        ic: 'ishield',
        t: 'Salvaguarda e Custódia Fiel',
        x: 'Equipamento de terceiro não pertence à TEN: está sob nossa <b>custódia e responsabilidade jurídica</b>. Qualquer dano sem registro prévio na chegada pode gerar custos indenizatórios pesados.',
        chips: [['Custódia Legal', 'bad'], ['Proteção Contratual', 't']],
        vig: () => vf('ishield', 'Salvaguarda de Patrimônio', [['Inspeção na chegada', 'o'], ['Registro de avarias prévias', 'bad'], ['Devolução íntegra', 't']], 'ok')
      }
    ],
    game: {
      type: 'order',
      title: 'Coloque as etapas iniciais da mobilização na sequência correta do Anexo 1'
    },
    quiz: [
      {
        q: 'Qual é o objetivo principal do procedimento PO.ALM-0004?',
        o: [
          'Estabelecer critérios para mobilização e desmobilização de equipamentos de terceiros, garantindo diretrizes e responsabilidades.',
          'Cadastrar novos funcionários terceirizados de limpeza e segurança patrimonial.',
          'Autorizar compras de estoque sem necessidade de pedido de compras (PC).'
        ],
        a: 0,
        e: 'O item 1 define que o objetivo é estabelecer critérios formais para <b>mobilização e desmobilização de equipamentos de terceiros</b>.'
      },
      {
        q: 'A quem se aplica o escopo do PO.ALM-0004 na TEN?',
        o: [
          'A todas as áreas que possuem equipamentos de terceiros utilizados como suporte na operação da fábrica.',
          'Apenas aos veículos da diretoria executiva de Jacobina.',
          'Exclusivamente aos fornecedores de alimentação do refeitório.'
        ],
        a: 0,
        e: 'O escopo cobre <b>todas as áreas que utilizam equipamentos de terceiros</b> em suporte à operação.'
      },
      {
        q: 'Qual setor tem a responsabilidade de gerenciar as manutenções preventivas e corretivas de equipamentos de terceiros?',
        o: [
          'Suprimentos (setor contratante).',
          'A portaria de vigilância patrimonial.',
          'A área de Recursos Humanos.'
        ],
        a: 0,
        e: 'O item 3 estabelece que <b>Suprimentos monitora preventivas e providencia manutenções corretivas</b>.'
      },
      {
        q: 'Por que a salvaguarda e inspeção rigorosa na chegada são vitais para a TEN?',
        o: [
          'Para comprovar quais danos já existiam e não assumir custos de avarias causadas antes da entrega.',
          'Para evitar ter que devolver o equipamento ao final da vigência do contrato.',
          'Para alterar a cor original do equipamento antes de colocá-lo na fábrica.'
        ],
        a: 0,
        e: 'A inspeção na chegada <b>resguarda juridicamente a TEN</b> contra cobranças indevidas de avarias pré-existentes.'
      }
    ]
  },

  // -------------------------------------------------------------------------
  // M02 · Chegada & Documentos de Transporte
  // -------------------------------------------------------------------------
  {
    n: 2,
    short: 'Chegada & NF Remessa',
    title: 'Chegada & <span>Documentos de Transporte</span>',
    ic: 'i7',
    badge: 'Inspetor da Doca',
    gameName: 'Conferência Documental na Doca',
    chips: [['4 cenas', ''], ['Item 3.b', 'o'], ['NF de Remessa', 't']],
    intro: 'Nenhum equipamento de terceiro desce do caminhão prancha sem conferência minuciosa de documentos fiscais. A Nota Fiscal de Remessa para Locação é a certidão de nascimento da mobilização.',
    scenes: [
      {
        ic: 'i7',
        t: 'Chegada na Doca do Almoxarifado',
        x: 'O transporte do equipamento da origem até a TEN (Mobilização) finaliza na área de recebimento do <b>Almoxarifado</b>. A equipe isola o local para garantir descarga segura e sem transeuntes.',
        chips: [['Mobilização', 'o'], ['Doca Isolada', 't']],
        vig: () => vf('i7', 'Chegada do Equipamento', [['Caminhão prancha', 'o'], ['Doca isolada', 't'], ['Segurança na descarga', '']], 'ok')
      },
      {
        ic: 'i1',
        t: 'Checagem da NF de Remessa',
        x: '<b>Item 3.b: checar documentos de transporte (NF de remessa)</b>. Verificar CNPJ do locador, razão social, destinatário TEN, descrição detalhada do maquinário, modelo e número de série/chassi.',
        chips: [['NF de Remessa', 'o'], ['Número de Série', 't'], ['Item 3.b', '']],
        vig: () => vForm('NF de Remessa para Locação', 'Natureza 5.949 / 6.949', 'Guindaste Munck · Chassi 9BW...128')
      },
      {
        ic: 'ialert',
        t: 'Conferência de Acessórios e Implementos',
        x: 'Equipamentos móveis costumam acompanhar cabos de aço, controles remotos, lanças extras, baterias e carregadores. Todos devem estar discriminados no documento fiscal ou romaneio de carga.',
        chips: [['Romaneio', 'o'], ['Implementos', 't']],
        vig: () => vf('ialert', 'Implementos & Acessórios', [['Controles remotos', 'o'], ['Cabos e ganchos', 't'], ['Extintores e chaves', '']], '')
      },
      {
        ic: 'ifold',
        t: 'Abertura do Dossiê de Operação',
        x: '<b>Item 3.i:</b> o Almoxarifado retém a documentação de entrada e registra formalmente o <b>Dossiê de Operação</b>, que reunirá todos os registros técnicos e fiscais durante a vida útil do contrato na TEN.',
        chips: [['Item 3.i', 'o'], ['Dossiê Ativo', 't']],
        vig: () => vFolder('Dossiê // Equipamento Terceiro', ['1ª via NF Remessa', 'Romaneio de transporte', 'Laudo inicial', 'Contrato de locação'])
      }
    ],
    game: {
      type: 'deck',
      title: 'Classifique a situação documental encontrada no recebimento da carga',
      buckets: ['Documentação Conforme (Receber)', 'Irregularidade (Reter / Acionar Suprimentos)'],
      cards: [
        { t: 'NF de Remessa com número de chassi e placa batendo perfeitamente com o maquinário', a: 0, s: 'Conforme' },
        { t: 'Equipamento chega na portaria sem nenhuma Nota Fiscal ou documento de transporte', a: 1, s: 'Irregular' },
        { t: 'Romaneio listando todos os 4 controles remotos e implementos conferidos fisicamente', a: 0, s: 'Conforme' },
        { t: 'NF emitida com CNPJ de terceiros sem menção da TEN como destinatária', a: 1, s: 'Irregular' },
        { t: 'Equipamento acompanhado do manual de operação e ART do engenheiro mecânico', a: 0, s: 'Conforme' },
        { t: 'Número de série gravado no motor divergente do que consta impresso na NF', a: 1, s: 'Irregular' },
        { t: 'Laudo de inspeção estrutural vigente assinado pelo locador anexado à NF', a: 0, s: 'Conforme' },
        { t: 'Transportador exige assinar o canhoto antes de abrir as portas do caminhão', a: 1, s: 'Irregular' }
      ]
    },
    quiz: [
      {
        q: 'Qual documento fiscal deve acompanhar obrigatoriamente a chegada de um equipamento de terceiro na TEN?',
        o: [
          'Nota Fiscal de Remessa para Locação / Transporte (Item 3.b).',
          'Apenas uma mensagem informal no celular do motorista da transportadora.',
          'Nota Fiscal de Venda Direta com baixa patrimonial definitiva.'
        ],
        a: 0,
        e: 'O item 3.b exige checagem formal dos <b>documentos de transporte (NF de remessa)</b>.'
      },
      {
        q: 'O que o Almoxarifado deve fazer com a documentação do equipamento recebido (Item 3.i)?',
        o: [
          'Reter a informação documentada e registrar o dossiê de operação do equipamento.',
          'Descartar os papéis assim que o caminhão sair pelo portão da fábrica.',
          'Enviar a documentação original de volta dentro da cabine do motorista.'
        ],
        a: 0,
        e: 'O Almoxarifado deve <b>reter informação documentada e registrar o dossiê de operação</b>.'
      },
      {
        q: 'O que deve ser verificado na conferência física contra a NF de remessa?',
        o: [
          'Descrição do equipamento, modelo, número de série/chassi e integridade dos implementos.',
          'Apenas a cor da pintura externa da carroceria da máquina.',
          'Se o caminhão tem capacidade para rodar na lama sem atolar.'
        ],
        a: 0,
        e: 'A conferência deve bater <b>descrição, modelo, número de série e acessórios</b> com o documento fiscal.'
      },
      {
        q: 'O que fazer caso o número de série da máquina não coincida com o da NF?',
        o: [
          'Reter o recebimento, não descarregar e acionar imediatamente Suprimentos e o locador.',
          'Rasurar o número da NF com corretivo e inventar outro número.',
          'Descarregar o equipamento e colocá-lo para trabalhar na montagem da torre.'
        ],
        a: 0,
        e: 'Divergência de chassi/série exige <b>bloqueio imediato do recebimento</b> e acionamento de Suprimentos.'
      }
    ]
  },

  // -------------------------------------------------------------------------
  // M03 · Check List & Avaliação de Condição
  // -------------------------------------------------------------------------
  {
    n: 3,
    short: 'Check List & Vistoria',
    title: 'Check List & <span>Avaliação de Condição</span>',
    ic: 'ichk',
    badge: 'Perito em Vistoria',
    gameName: 'Ronda de Inspeção no Check List',
    chips: [['4 cenas', ''], ['FRM Específico', 'o'], ['Item 4.4 e 4.6', 't']],
    intro: 'Vistoriar é prevenir passivos. O Check List de entrada é o documento oficial que atesta as reais condições operacionais e estéticas do equipamento antes do início do contrato.',
    scenes: [
      {
        ic: 'ichk',
        t: 'O Check List Oficial (Item 4.4 e 4.6)',
        x: '<b>Check List:</b> lista de controle e inspeção para avaliar as boas condições do equipamento, descrevendo defeitos encontrados. Deve-se preencher a <b>FRM de avaliação da condição</b> específica para cada tipo de maquinário.',
        chips: [['FRM Específico', 'o'], ['Item 4.6', 't'], ['Condições de Uso', '']],
        vig: () => vChecklist('Check List de Recebimento', ['Pneus e esteiras intactos', 'Sem vazamento hidráulico', 'Horímetro / KM anotado', 'Extintor e freios testados'], -1, 'Aprovado para Operação', 'Pendente')
      },
      {
        ic: 'ialert',
        t: 'Inspeção de Itens Críticos',
        x: 'Verificar estado de pneus/esteiras, nível de óleo, sistema elétrico, mangueiras hidráulicas, buzina de ré, freio de estacionamento, iluminação e horímetro inicial (leitura do medidor de horas).',
        chips: [['Horímetro Inicial', 'o'], ['Sistemas Críticos', 't']],
        vig: () => vf('ialert', 'Itens Críticos Inspecionados', [['Vazamentos de óleo', 'bad'], ['Horímetro gravado', 'o'], ['Dispositivos de segurança', 't']], 'ok')
      },
      {
        ic: 'i1',
        t: 'Registro Fotográfico de Entrada',
        x: '<b>Evidência Visual Obrigatória:</b> qualquer arranhão, amassado, trinca de vidro ou desgaste excessivo deve ser fotografado em ângulo aberto e em detalhe, sendo anexado ao relatório do check-list.',
        chips: [['Fotos Obrigatórias', 'o'], ['Registro de Entrada', 't']],
        vig: () => vf('i1', 'Registro Fotográfico', [['Fotos dos 4 lados', 'o'], ['Detalhes de amassados', 'bad'], ['Foto do horímetro/placa', 't']], 'ok')
      },
      {
        ic: 'i5',
        t: 'Assinatura Conjunta e SoftExpert',
        x: 'O formulário de check-list é assinado pelo recebedor do Almoxarifado e pelo transportador/locador. As FRMs oficiais e atualizadas estão disponíveis no sistema <b>SoftExpert (Item 6.3)</b>.',
        chips: [['Assinatura', 'o'], ['SoftExpert', 't']],
        vig: () => vSign('Check List de Entrada', ['Almoxarifado TEN', 'Transportador / Locador'])
      }
    ],
    game: {
      type: 'deck',
      title: 'Decida como registrar cada anomalia encontrada na vistoria de entrada',
      buckets: ['Anotar no Check List + Fotos de Entrada', 'Recusar Entrada / Bloquear Descarga'],
      cards: [
        { t: 'Pequeno risco na pintura da lataria traseira do gerador', a: 0, s: 'Check List' },
        { t: 'Freio de emergência inoperante e mangueira de freio rompida', a: 1, s: 'Recusar' },
        { t: 'Desgaste normal de pneus com sulco dentro da margem segura', a: 0, s: 'Check List' },
        { t: 'Vazamento contínuo de óleo hidráulico gotejando no solo', a: 1, s: 'Recusar' },
        { t: 'Trinca leve no espelho retrovisor direito da cabine', a: 0, s: 'Check List' },
        { t: 'Cabo de aço de guincho com fios rompidos e alma exposta', a: 1, s: 'Recusar' },
        { t: 'Pequena mossa na tampa do painel de controle elétrico', a: 0, s: 'Check List' },
        { t: 'Estrutura da lança com solda trincada visível a olho nu', a: 1, s: 'Recusar' }
      ]
    },
    quiz: [
      {
        q: 'O que o item 4.4 define como Check List no PO.ALM-0004?',
        o: [
          'Lista de controle e inspeção para avaliar as boas condições do equipamento, descrevendo defeitos quando encontrados.',
          'Um recibo em papel de pão assinado pelo motorista sem detalhes.',
          'O comprovante de pedágio do caminhão transportador.'
        ],
        a: 0,
        e: 'Check List é a <b>lista de controle e inspeção para avaliar boas condições e registrar defeitos</b>.'
      },
      {
        q: 'Onde o colaborador do Almoxarifado acessa as FRMs oficiais de Check List (Item 6.3)?',
        o: [
          'No sistema SoftExpert (SeSuite).',
          'Em mensagens temporárias de redes sociais.',
          'Em formulários em branco de outras empresas terceiras.'
        ],
        a: 0,
        e: 'Todos os formulários e POs citados estão <b>centralizados no sistema SoftExpert</b>.'
      },
      {
        q: 'Qual é a importância de anotar a leitura exata do horímetro no Check List de entrada?',
        o: [
          'Para controlar a quantidade de horas rodadas na TEN e verificar o cumprimento das manutenções e limites contratuais.',
          'Apenas para saber que horas o equipamento chegou no pátio.',
          'Não tem utilidade, pois a locação é sempre por valor fixo ilimitado.'
        ],
        a: 0,
        e: 'O horímetro inicial é o <b>marco zero de consumo de horas e manutenções periódicas</b>.'
      },
      {
        q: 'O que deve ser feito se forem constatadas avarias graves de segurança no equipamento no ato do recebimento?',
        o: [
          'Bloquear a entrada, não autorizar o uso na fábrica e acionar Suprimentos para tratativas com o locador.',
          'Liberar imediatamente para a fábrica e torcer para não ocorrer acidente.',
          'Tentar consertar com fita isolante sem avisar a locadora.'
        ],
        a: 0,
        e: 'Defeitos graves de segurança exigem <b>bloqueio da entrada e acionamento imediato de Suprimentos</b>.'
      }
    ]
  },

  // -------------------------------------------------------------------------
  // M04 · Etiqueta de Rastreabilidade & Dossiê
  // -------------------------------------------------------------------------
  {
    n: 4,
    short: 'Etiqueta & Dossiê',
    title: 'Etiqueta de Rastreabilidade & <span>Dossiê</span>',
    ic: 'itag',
    badge: 'Mestre da Rastreabilidade',
    gameName: 'Identificação & Montagem do Dossiê',
    chips: [['4 cenas', ''], ['Item 3.e', 'o'], ['Rastreabilidade', 't']],
    intro: 'Um equipamento sem etiqueta na fábrica é um risco invisível. A Etiqueta de Rastreabilidade sinaliza visualmente a todos os operadores que o maquinário está inspecionado, liberado e sob vigência contratual.',
    scenes: [
      {
        ic: 'itag',
        t: 'Colagem da Etiqueta no Equipamento',
        x: '<b>Item 3.e:</b> colar <b>etiqueta de identificação e rastreabilidade no equipamento</b> em local visível, protegido de intempéries e atrito mecânico (geralmente próximo à cabine ou painel principal).',
        chips: [['Item 3.e', 'o'], ['Etiqueta Visível', 't'], ['Identificação', '']],
        vig: () => vf('itag', 'Etiqueta de Terceiro', [['Código do maquinário', 'o'], ['Locador parceiro', 't'], ['Data de entrada / vigência', ''], ['Status: LIBERADO', 'ok']], 'ok')
      },
      {
        ic: 'ishield',
        t: 'Identificação e Rastreabilidade (Item 6.2)',
        x: 'Ferramenta que permite <b>controlar de maneira documentada</b> as informações referentes ao equipamento: cronograma de manutenções, histórico de danos, horímetro e data limite de vigência do contrato.',
        chips: [['Item 6.2', 'o'], ['Histórico Completo', 't']],
        vig: () => vf('ishield', 'Controle Documentado', [['Manutenções preventivas', 'o'], ['Histórico de danos', 'bad'], ['Vigência contratual', 't']], '')
      },
      {
        ic: 'ifold',
        t: 'Composição Completa do Dossiê',
        x: 'O <b>Dossiê de Operação (Item 3.i)</b> é uma pasta física e digital que reúne: NF de Remessa, Check List com fotos assinado, cópia do contrato de locação, apólice de seguro e plano de manutenção.',
        chips: [['Item 3.i', 'o'], ['Pasta do Equipamento', 't']],
        vig: () => vFolder('Dossiê // Equipamentos Locados', ['NF Remessa Entrada', 'Check List + Fotos', 'Contrato Suprimentos', 'Etiqueta de Rastreabilidade'])
      },
      {
        ic: 'ichk',
        t: 'Guarda e Retenção até a Devolução',
        x: 'O dossiê permanece sob guarda ativa do Almoxarifado durante todo o período em que o maquinário operar na TEN. Ao fim do contrato e desmobilização, o dossiê é formalmente arquivado (Item 3.j).',
        chips: [['Item 3.j', 'o'], ['Arquivo Histórico', 't']],
        vig: () => vf('ichk', 'Arquivo de Custódia', [['Controle ativo no uso', 'o'], ['Anexar laudos de saída', 't'], ['Arquivar no encerramento', '']], 'ok')
      }
    ],
    game: {
      type: 'deck',
      title: 'Classifique o item como Obrigatório no Dossiê de Operação ou Descartável',
      buckets: ['Obrigatório no Dossiê de Operação', 'Não Pertence ao Dossiê'],
      cards: [
        { t: '1ª via ou cópia autenticada da Nota Fiscal de Remessa para Locação', a: 0, s: 'Dossiê' },
        { t: 'Formulário de Check List de entrada assinado com fotos das avarias', a: 0, s: 'Dossiê' },
        { t: 'Embalagem de papelão vazia e sacos plásticos descartados', a: 1, s: 'Descarte' },
        { t: 'Cópia das ordens de manutenção corretiva realizadas durante a locação', a: 0, s: 'Dossiê' },
        { t: 'Rascunho de papel com anotações telefônicas pessoais do motorista', a: 1, s: 'Descarte' },
        { t: 'Laudo de teste de carga ou certificação de içamento emitido por engenheiro', a: 0, s: 'Dossiê' },
        { t: 'Termo de liberação assinado pelo setor solicitante na entrega', a: 0, s: 'Dossiê' },
        { t: 'Ticket de abastecimento de lanchonete da estrada', a: 1, s: 'Descarte' }
      ]
    },
    quiz: [
      {
        q: 'O que o Almoxarifado deve colar no equipamento após a inspeção (Item 3.e)?',
        o: [
          'Etiqueta de identificação e rastreabilidade no equipamento.',
          'Um adesivo publicitário de concessionária de veículos.',
          'Nenhum tipo de identificação para não alterar o maquinário.'
        ],
        a: 0,
        e: 'O item 3.e exige expressamente <b>colar etiqueta de identificação e rastreabilidade no equipamento</b>.'
      },
      {
        q: 'O que a ferramenta de Identificação e Rastreabilidade permite controlar segundo o item 6.2?',
        o: [
          'De maneira documentada, as manutenções, danos, vigência do contrato e histórico do equipamento.',
          'Apenas a velocidade máxima permitida na rodovia durante a entrega.',
          'Os horários de almoço dos operadores da fábrica.'
        ],
        a: 0,
        e: 'Permite controlar documentalmente <b>manutenções, danos, vigência do contrato e condições de uso</b>.'
      },
      {
        q: 'Quais documentos devem compor o dossiê de operação do equipamento (Item 3.i)?',
        o: [
          'Todos os documentos pertencentes ao equipamento alugado: NF, check-list, fotos e laudos.',
          'Somente o comprovante de pagamento de pedágio do caminhão.',
          'Apenas o catálogo de propaganda do fabricante.'
        ],
        a: 0,
        e: 'O dossiê reúne <b>todos os documentos técnicos, fiscais e operacionais do equipamento alugado</b>.'
      },
      {
        q: 'O que é feito com o dossiê de operação ao término do contrato e desmobilização (Item 3.j)?',
        o: [
          'Após desmobilização e devolução ao terceiro, o dossiê é devidamente arquivado para retenção documental.',
          'O dossiê é destruído imediatamente para liberar espaço no armário.',
          'Os documentos são entregues para o motorista levar embora.'
        ],
        a: 0,
        e: 'O item 3.j determina: <b>ao fim da vigência, após desmobilização e devolução, arquivar o dossiê</b>.'
      }
    ]
  },

  // -------------------------------------------------------------------------
  // M05 · Entrada no SAP: MIGO & Depósito 0070
  // -------------------------------------------------------------------------
  {
    n: 5,
    short: 'Entrada SAP MIGO 0070',
    title: 'Entrada no SAP: <span>MIGO & Depósito 0070</span>',
    ic: 'idb',
    badge: 'Especialista SAP 0070',
    gameName: 'Lançamento Contábil no SAP',
    chips: [['4 cenas', ''], ['Item 3.g', 'o'], ['Depósito 0070', 't']],
    intro: 'Equipamento de terceiro não pode ser misturado ao ativo próprio da TEN. A transação MIGO com destinação ao Depósito de Terceiros 0070 garante conformidade contábil, fiscal e auditoria limpa.',
    scenes: [
      {
        ic: 'idb',
        t: 'A Transação SAP MIGO (Item 3.g)',
        x: '<b>Item 3.g:</b> dar entrada na NF de Remessa e <b>inserir o equipamento no Sistema SAP via transação MIGO – depósito de Terceiros (0070)</b>. Isso formaliza a posse temporária no ERP.',
        chips: [['Item 3.g', 'o'], ['MIGO SAP', 't'], ['Depósito 0070', 'bad']],
        vig: () => vForm('SAP ERP · Entrada de Mercadorias', 'MIGO · Depósito 0070', 'Equipamento Terceiros · NF Remessa')
      },
      {
        ic: 'iboxes',
        t: 'Por que o Depósito 0070?',
        x: 'O <b>Depósito 0070</b> é segregado logicamente no sistema: ele registra bens de terceiros em poder da TEN, sem gerar saldo de estoque próprio nem alterar os custos de ativos fixos da empresa.',
        chips: [['Segregação Lógica', 'o'], ['Depósito 0070', 't']],
        vig: () => vf('iboxes', 'Depósito de Terceiros 0070', [['Bens em custódia', 'o'], ['Sem custo de ativo próprio', 't'], ['Rastreio fiscal no ERP', '']], 'ok')
      },
      {
        ic: 'ichk',
        t: 'Vinculação ao Contrato e Fornecedor',
        x: 'Na entrada MIGO, o Almoxarifado amarra a NF de Remessa ao número do Pedido/Contrato de Locação gerenciado por Suprimentos, garantindo consistência com a Controladoria e Fiscal.',
        chips: [['Vínculo Contratual', 'o'], ['Fiscal & Contábil', 't']],
        vig: () => vf('ichk', 'Conexão Contratual', [['Contrato de Locação', 'o'], ['Fornecedor homologado', 't'], ['NF de Remessa vinculada', '']], 'ok')
      },
      {
        ic: 'i6',
        t: 'Liberação para o Solicitante (Item 3.f)',
        x: '<b>Item 3.f: liberar equipamento para o setor solicitante</b>. Somente após a MIGO concluída, etiqueta colada e check-list assinado o maquinário é formalmente entregue para operar na fábrica.',
        chips: [['Item 3.f', 'o'], ['Liberação Formal', 't']],
        vig: () => vf('i6', 'Liberado para a Fábrica', [['SAP concluído', 'o'], ['Etiqueta fixada', 't'], ['Entregue ao solicitante', 'ok']], 'ok')
      }
    ],
    game: {
      type: 'order',
      title: 'Ordene o fluxo correto de regularização no SAP e liberação na fábrica'
    },
    quiz: [
      {
        q: 'Qual transação do SAP é utilizada para inserir o equipamento de terceiro no sistema (Item 3.g)?',
        o: [
          'MIGO.',
          'ME51N.',
          'VA01.'
        ],
        a: 0,
        e: 'O item 3.g define a transação <b>MIGO</b> para dar entrada na NF de Remessa no SAP.'
      },
      {
        q: 'Qual é o depósito obrigatório no SAP para registrar equipamentos de terceiros (Item 3.g)?',
        o: [
          'Depósito de Terceiros (0070).',
          'Depósito Geral de Matéria-Prima (0010).',
          'Depósito de Sucata e Descarte (0099).'
        ],
        a: 0,
        e: 'O procedimento cita expressamente o <b>depósito de Terceiros (0070)</b>.'
      },
      {
        q: 'O que a entrada no depósito 0070 garante contabilisticamente para a TEN?',
        o: [
          'Garante a rastreabilidade fiscal e física da custódia do bem sem confundi-lo com o patrimônio próprio da TEN.',
          'Faz com que o equipamento se torne automaticamente propriedade da TEN sem pagar a locadora.',
          'Isenta a TEN de pagar qualquer tributo sobre a folha de pagamento.'
        ],
        a: 0,
        e: 'O depósito 0070 garante <b>segregação contábil e rastreabilidade fiscal de custódia</b>.'
      },
      {
        q: 'Quando o equipamento pode ser formalmente liberado para o setor solicitante operar na fábrica (Item 3.f)?',
        o: [
          'Somente após conferência física, check-list com fotos assinado, etiqueta colada e MIGO lançada no depósito 0070.',
          'Assim que o caminhão apontar na rodovia antes de descarregar.',
          'Sem precisar de check-list ou etiqueta, desde que a área esteja com pressa.'
        ],
        a: 0,
        e: 'A liberação ocorre <b>somente após vistoria, etiquetação e entrada no SAP</b>.'
      }
    ]
  },

  // -------------------------------------------------------------------------
  // M06 · Operação, Manutenções & Simulador de Ciclo
  // -------------------------------------------------------------------------
  {
    n: 6,
    short: 'Operação & Manutenção',
    title: 'Operação, Manutenção & <span>Simulador</span>',
    ic: 'iwrench',
    badge: 'Mestre da Operação',
    gameName: 'Responsabilidades na Operação',
    chips: [['4 cenas', ''], ['Simulador Interativo', 'o'], ['Preventivas', 't']],
    intro: 'Durante a vigência do contrato, o solicitante zela e opera enquanto Suprimentos comanda o cronograma de manutenções. Entenda como o ciclo de vida protege a produtividade da fábrica.',
    scenes: [
      {
        ic: 'ifac',
        t: 'Responsabilidade do Solicitante na Operação',
        x: '<b>Item 3 - Solicitante:</b> a área que solicitou o equipamento deve <b>manusear, proteger e salvaguardá-lo contra danos</b>, preencher check-list diário de uso e solicitar manutenção corretiva quando necessário.',
        chips: [['Solicitante', 'o'], ['Operação com Zelo', 't']],
        vig: () => vf('ifac', 'Operação na Fábrica', [['Check list diário', 'o'], ['Uso correto e seguro', 't'], ['Proteção contra avarias', '']], 'ok')
      },
      {
        ic: 'iwrench',
        t: 'Manutenções Preventivas por Suprimentos',
        x: '<b>Item 3 - Suprimentos, b: monitorar e controlar cronograma de manutenções PREVENTIVAS previstas</b>. Garantir que as revisões periódicas do locador sejam realizadas pontualmente nas horas previstas.',
        chips: [['Preventivas', 'o'], ['Cronograma Fiel', 't'], ['Suprimentos', '']],
        vig: () => vf('iwrench', 'Manutenção Preventiva', [['Revisões periódicas', 'o'], ['Troca de óleos/filtros', 't'], ['Garantia contratual', '']], 'ok')
      },
      {
        ic: 'ialert',
        t: 'Manutenções Corretivas',
        x: '<b>Item 3 - Suprimentos, a:</b> providenciar manutenções CORRETIVAS quando da necessidade. Caso ocorra pane mecânica, o solicitante avisa Suprimentos, que aciona o suporte técnico da locadora.',
        chips: [['Corretivas', 'bad'], ['Acionar Locadora', 't']],
        vig: () => vf('ialert', 'Manutenção Corretiva', [['Chamado do solicitante', 'o'], ['Suprimentos aciona locador', 't'], ['Reparo com peças originais', '']], 'bad')
      },
      {
        ic: 'iscale',
        t: 'Simulador Interativo do Ciclo de Terceiros',
        x: 'Arraste o controle para simular as 3 fases do ciclo do equipamento (<b>Mobilização, Operação e Desmobilização</b>) e confira os formulários, transações SAP e ações obrigatórias de cada setor.',
        widget: 'terceiros',
        hold: true,
        chips: [['Simulador', 'o'], ['Interativo', 't']]
      }
    ],
    game: {
      type: 'deck',
      title: 'Classifique a responsabilidade operacional para cada atividade na TEN',
      buckets: ['Almoxarifado', 'Setor Solicitante (Operação)', 'Suprimentos (Contratante)'],
      cards: [
        { t: 'Dar entrada na NF de Remessa no SAP via MIGO no depósito 0070', a: 0, s: 'Almox' },
        { t: 'Operar o equipamento no suporte à fábrica e zelar contra danos', a: 1, s: 'Solicitante' },
        { t: 'Monitorar e controlar o cronograma de manutenções preventivas do locador', a: 2, s: 'Suprimentos' },
        { t: 'Colar etiqueta de identificação e rastreabilidade na máquina', a: 0, s: 'Almox' },
        { t: 'Solicitar manutenção corretiva caso o equipamento apresente falha no turno', a: 1, s: 'Solicitante' },
        { t: 'Contratar frete e acionar locador para a desmobilização ao fim do contrato', a: 2, s: 'Suprimentos' },
        { t: 'Manter a guarda física e digital do dossiê de operação ativo', a: 0, s: 'Almox' },
        { t: 'Emitir a SEMINFE ao fim do contrato solicitando a NF de devolução', a: 0, s: 'Almox' }
      ]
    },
    quiz: [
      {
        q: 'Quem tem a responsabilidade de monitorar e controlar o cronograma de manutenções preventivas?',
        o: [
          'Suprimentos (setor contratante), conforme item 3.b.',
          'O operador de ponte rolante da fábrica.',
          'A equipe de Recursos Humanos no treinamento de integração.'
        ],
        a: 0,
        e: 'O item 3 estabelece que <b>Suprimentos monitora e controla o cronograma de manutenções preventivas</b>.'
      },
      {
        q: 'O que o setor solicitante deve fazer se o equipamento quebrar durante o turno de trabalho?',
        o: [
          'Solicitar manutenção corretiva formalmente, acionando o setor contratante (Suprimentos).',
          'Chamar um mecânico autônomo sem contrato para abrir o motor do equipamento.',
          'Abandonar a máquina na pista e pegar outra sem avisar a liderança.'
        ],
        a: 0,
        e: 'O solicitante deve <b>solicitar manutenção corretiva acionando Suprimentos</b> para tratativas com o locador.'
      },
      {
        q: 'Por que o setor solicitante não pode autorizar reparos mecânicos por conta própria em equipamentos de terceiros?',
        o: [
          'Porque intervenções não autorizadas pelo locador quebram a garantia contratual e geram cobranças indenizatórias.',
          'Porque as ferramentas da oficina TEN são pesadas demais.',
          'Não há restrição, qualquer colaborador pode soldar e alterar o equipamento alugado.'
        ],
        a: 0,
        e: 'Intervenções sem autorização do locador <b>violam cláusulas contratuais e anulam coberturas de seguro</b>.'
      },
      {
        q: 'Qual é o papel do Almoxarifado durante a fase em que o equipamento está operando na fábrica?',
        o: [
          'Reter a informação documentada e manter atualizado o dossiê de operação do maquinário.',
          'Dirigir o equipamento pelas ruas da cidade de Jacobina.',
          'Vender peças sobressalentes do equipamento no mercado paralelo.'
        ],
        a: 0,
        e: 'O Almoxarifado mantém a <b>guarda e retenção do dossiê de operação</b> do equipamento.'
      }
    ]
  },

  // -------------------------------------------------------------------------
  // M07 · Incidentes, Danos & Ocorrências
  // -------------------------------------------------------------------------
  {
    n: 7,
    short: 'Danos & FRM.SUP-0001',
    title: 'Incidentes, Danos & <span>FRM.SUP-0001</span>',
    ic: 'ialert',
    badge: 'Sentinela da Quarentena',
    gameName: 'O Fluxo de Tratativa de Danos',
    chips: [['4 cenas', ''], ['Item 6.1', 'o'], ['Fotos Obrigatórias', 'bad']],
    intro: 'Se ocorrer uma colisão ou avaria operacional na fábrica, omitir o fato é proibido. O PO.ALM-0004 exige registro fotográfico imediato e aplicação do protocolo de 5 passos do FRM.SUP-0001.',
    scenes: [
      {
        ic: 'ialert',
        t: 'Constatação de Dano na Operação',
        x: '<b>Item 3 - Solicitante, d:</b> se houver danos ao equipamento durante a operação, fazer <b>registro fotográfico imediato</b>, relatar o fato e acionar o setor contratante (Suprimentos) para tratativas.',
        chips: [['Item 3.d', 'o'], ['Registro Fotográfico', 'bad']],
        vig: () => vf('ialert', 'Ocorrência com Dano', [['Fotos imediatas', 'bad'], ['Paralisação preventiva', 'o'], ['Acionar Suprimentos', 't']], 'bad')
      },
      {
        ic: 'i1',
        t: 'Os 5 Passos Obrigatórios (Item 6.1)',
        x: 'Quando a propriedade de cliente ou provedor externo for danificada, perdida ou inadequada: <b>1) Identificar a NC; 2) Documentar a ação; 3) Segregar no Almoxarifado; 4) Remeter ocorrência ao cliente; 5) Reter documentação!</b>',
        chips: [['Item 6.1', 'o'], ['5 Passos', 't']],
        vig: () => vf('i1', '5 Passos da NC', [['1. Identificar NC', 'o'], ['2. Documentar ação', 't'], ['3. Segregar no Almox', 'bad'], ['4. Remeter ocorrência', ''], ['5. Reter documento', 'ok']], 'ok')
      },
      {
        ic: 'ishield',
        t: 'O Formulário FRM.SUP-0001',
        x: 'As atividades para manter a preservação e registrar avarias em bens de terceiros estão descritas no <b>FRM.SUP-0001 – Propriedades Pertencentes a Clientes ou Provedores Externos</b>, disponível no SoftExpert.',
        chips: [['FRM.SUP-0001', 'o'], ['SoftExpert', 't']],
        vig: () => vForm('Propriedades de Terceiros', 'FRM.SUP-0001', 'Ocorrência · Dano em Plataforma Elevatória')
      },
      {
        ic: 'iban',
        t: 'Segregação na Área Específica',
        x: 'Se o dano comprometer a operação segura ou exigir perícia do perito do locador, o equipamento é <b>segregado na área específica do Almoxarifado</b> até a conclusão do laudo e definição de conserto ou troca.',
        chips: [['Segregação Física', 'bad'], ['Perícia Técnica', 't']],
        vig: () => vf('iban', 'Segregação no Almoxarifado', [['Área específica', 'bad'], ['Bloqueio operacional', 'o'], ['Aguardando perito', 't']], 'bad')
      }
    ],
    game: {
      type: 'order',
      title: 'Ordene a sequência obrigatória do Item 6.1 quando um equipamento de terceiro é avariado',
      cards: [
        { t: '1º Identificar a não conformidade (descrever o ocorrido e tirar fotos)', a: 0, s: 'Identificar' },
        { t: '2º Documentar a ação corretiva a ser tomada', a: 1, s: 'Documentar' },
        { t: '3º Segregar o equipamento para a área específica do Almoxarifado', a: 2, s: 'Segregar' },
        { t: '4º Remeter a ocorrência formalmente ao cliente / locador externo', a: 3, s: 'Notificar' },
        { t: '5º Reter a informação documentada completa no dossiê (FRM.SUP-0001)', a: 4, s: 'Reter' }
      ]
    },
    quiz: [
      {
        q: 'O que o setor solicitante deve fazer imediatamente se ocorrer um dano ao equipamento alugado (Item 3 - Solicitante, d)?',
        o: [
          'Fazer registro fotográfico detalhado e acionar o setor contratante (Suprimentos) para tratativas.',
          'Passar tinta por cima do amassado para ninguém notar a batida.',
          'Dizer que o equipamento já chegou quebrado na semana anterior.'
        ],
        a: 0,
        e: 'O item 3 exige <b>fazer registro fotográfico e acionar Suprimentos imediatamente</b>.'
      },
      {
        q: 'Qual é o formulário aplicável para registrar ocorrências com propriedades de terceiros (Item 6.1)?',
        o: [
          'FRM.SUP-0001 – Propriedades Pertencentes a Clientes ou Provedores Externos.',
          'FRM.RH-0010 – Solicitação de Férias e Folgas.',
          'FRM.COM-0002 – Prestação de Contas de Viagem.'
        ],
        a: 0,
        e: 'O item 6.1 cita expressamente o <b>FRM.SUP-0001</b>.'
      },
      {
        q: 'O que o procedimento determina fazer com o equipamento avariado que não pode continuar operando?',
        o: [
          'Segregar o material para a área específica do Almoxarifado (Item 6.1).',
          'Continuar usando até quebrar de vez e parar a fábrica.',
          'Jogar em qualquer canto do pátio externo sem identificação.'
        ],
        a: 0,
        e: 'O equipamento avariado deve ser <b>segregado na área específica do Almoxarifado</b>.'
      },
      {
        q: 'Por que é obrigatório remeter a ocorrência formalmente ao cliente/locador externo?',
        o: [
          'Para garantir transparência, acionar seguros contratuais e viabilizar a perícia conjunta do locador.',
          'Apenas para perder tempo burocrático na fábrica.',
          'Não é obrigatório, o procedimento recomenda resolver tudo informalmente.'
        ],
        a: 0,
        e: 'A remessa formal é essencial para <b>transparência, acionamento de apólice de seguro e perícia</b>.'
      }
    ]
  },

  // -------------------------------------------------------------------------
  // M08 · Fim de Contrato & Desmobilização
  // -------------------------------------------------------------------------
  {
    n: 8,
    short: 'Fim de Contrato & Desmobilização',
    title: 'Fim de Contrato & <span>Desmobilização</span>',
    ic: 'i6',
    badge: 'Mestre da Desmobilização',
    gameName: 'O Ciclo de Desmobilização',
    chips: [['4 cenas', ''], ['Item 3.h e Anexo 1', 'o'], ['SEMINFE & Devolução', 't']],
    intro: 'A desmobilização é a mobilização inversa: o encerramento perfeito que garante que a máquina retorne ao locador com check-list conferido, SEMINFE emitida, NF de devolução e dossiê arquivado.',
    scenes: [
      {
        ic: 'ical',
        t: 'Fim da Vigência do Contrato',
        x: 'Ao término do contrato, o solicitante formaliza a desmobilização, solicita emissão de <b>SEMINFE</b> a Suprimentos e encaminha o equipamento fisicamente de volta ao <b>Almoxarifado</b>.',
        chips: [['Fim de Vigência', 'o'], ['Encaminhar ao Almox', 't']],
        vig: () => vf('ical', 'Fim de Vigência', [['Contrato encerrado', 'o'], ['Equipamento entregue no Almox', 't'], ['Acionar desmobilização', '']], 'ok')
      },
      {
        ic: 'ichk',
        t: 'Check List de Saída e Emissão de SEMINFE',
        x: 'O Almoxarifado recebe o maquinário, realiza o <b>Check List de Saída</b> (comparando com as fotos de entrada) e emite a <b>SEMINFE</b> encaminhando à Contabilidade.',
        chips: [['Check List de Saída', 'o'], ['SEMINFE Emitida', 't']],
        vig: () => vChecklist('Check List de Saída', ['Comparado com fotos de entrada', 'Horímetro final registrado', 'SEMINFE emitida pelo Almox', 'Sem avarias pendentes'], -1, 'Pronto para Devolução', 'Pendente')
      },
      {
        ic: 'i1',
        t: 'NF de Remessa de Retorno pela Contabilidade',
        x: '<b>Item 3.h:</b> com a SEMINFE, o Almoxarifado solicita à <b>Contabilidade a emissão da NF de Remessa de Retorno</b> (saída fiscal). Sem essa NF, a carreta não pode trafegar na rodovia.',
        chips: [['Item 3.h', 'o'], ['NF de Remessa Retorno', 't'], ['Contabilidade', '']],
        vig: () => vForm('NF de Retorno de Locação', 'Natureza 5.949 / 6.949', 'Devolução Equipamento · Chassi 9BW...128')
      },
      {
        ic: 'i7',
        t: 'Frete Reverso & Arquivamento do Dossiê',
        x: 'Suprimentos contrata o <b>frete para desmobilização (Item 3.d)</b>. Com o equipamento embarcado e canhoto assinado pelo locador, o Almoxarifado <b>arquiva o dossiê de operação (Item 3.j)</b>.',
        chips: [['Frete Suprimentos', 'o'], ['Dossiê Arquivado', 't'], ['Missão Cumprida', 'ok']],
        vig: () => vf('i7', 'Desmobilização Concluída', [['Frete reverso contratado', 'o'], ['Canhoto assinado pelo terceiro', 't'], ['Dossiê arquivado no SeSuite', 'ok']], 'ok')
      }
    ],
    game: {
      type: 'deck',
      title: 'Classifique cada documento e ação como pertencente à Mobilização ou Desmobilização',
      buckets: ['Mobilização (Entrada do Equipamento)', 'Desmobilização (Devolução ao Locador)'],
      cards: [
        { t: 'Entrada na NF de Remessa no SAP via transação MIGO depósito 0070', a: 0, s: 'Mobilização' },
        { t: 'Emissão de SEMINFE pelo Almoxarifado para solicitar NF de Retorno', a: 1, s: 'Desmobilização' },
        { t: 'Colagem de Etiqueta de Identificação e Rastreabilidade no maquinário', a: 0, s: 'Mobilização' },
        { t: 'Contratação de frete reverso por Suprimentos para devolução', a: 1, s: 'Desmobilização' },
        { t: 'Check List inicial avaliando condições com fotos de arranhões prévios', a: 0, s: 'Mobilização' },
        { t: 'Arquivamento definitivo do dossiê de operação após canhoto assinado', a: 1, s: 'Desmobilização' },
        { t: 'Abertura do Dossiê de Operação com laudos e cópia do contrato', a: 0, s: 'Mobilização' },
        { t: 'Emissão de NF de Remessa de Retorno pela Contabilidade', a: 1, s: 'Desmobilização' }
      ]
    },
    quiz: [
      {
        q: 'O que o Almoxarifado deve emitir para solicitar a emissão da NF de saída do equipamento (Item 3.h)?',
        o: [
          'Emitir SEMINFE e solicitar à Contabilidade a emissão da NF de Remessa de Retorno.',
          'Um bilhete informal escrito à mão entregue na guarita da portaria.',
          'Uma fatura de cobrança de serviço para o cliente pagar a devolução.'
        ],
        a: 0,
        e: 'O item 3.h estabelece: <b>emitir SEMINFE e solicitar à contabilidade a emissão da NF de Remessa</b>.'
      },
      {
        q: 'Qual setor tem a responsabilidade de contratar o frete para a desmobilização do equipamento (Item 3 - Suprimentos, d)?',
        o: [
          'Suprimentos (setor contratante).',
          'O departamento de medicina do trabalho.',
          'O motorista do caminhão por conta própria.'
        ],
        a: 0,
        e: 'O procedimento define que <b>Suprimentos contrata o frete para Desmobilização</b>.'
      },
      {
        q: 'Por que o Check List de saída deve ser comparado rigorosamente com o Check List de entrada?',
        o: [
          'Para verificar se surgiram novas avarias durante o uso na TEN ou se o maquinário está retornando nas mesmas condições.',
          'Apenas para conferir se o tanque de combustível está completamente vazio.',
          'Não há necessidade de comparar, basta olhar se a máquina ainda liga.'
        ],
        a: 0,
        e: 'A comparação comprova se <b>novas avarias ocorreram ou se o bem retorna íntegro</b>.'
      },
      {
        q: 'Quando o Almoxarifado deve finalmente arquivar o dossiê de operação do equipamento (Item 3.j)?',
        o: [
          'Ao fim da vigência do contrato, após a desmobilização e devolução formal do equipamento ao terceiro.',
          'Assim que o equipamento chega na fábrica no primeiro dia.',
          'Após o vencimento da primeira parcela mensal do aluguel.'
        ],
        a: 0,
        e: 'O item 3.j determina: <b>ao fim da vigência, após desmobilização e devolução ao terceiro, arquivar dossiê</b>.'
      }
    ]
  },

  // -------------------------------------------------------------------------
  // M09 · Desafio Final da Mobilização
  // -------------------------------------------------------------------------
  {
    n: 9,
    short: 'Desafio Final',
    title: 'Desafio Final da <span>Mobilização</span>',
    ic: 'iaward',
    badge: 'Mestre da Mobilização TEN',
    gameName: 'Rodada Mista de Mobilização',
    chips: [['Revisão 360°', 'o'], ['8 Perguntas · 15s', 'bad'], ['Certificado', 't']],
    intro: 'Você completou a jornada do PO.ALM-0004: da chegada na doca com NF de remessa, check-list, MIGO no depósito 0070, dossiê, manutenções, tratativa de danos e SEMINFE de desmobilização. Mostre seu domínio total!',
    qtime: 15,
    scenes: [
      {
        ic: 'i7',
        t: 'A Visão Sistêmica de Terceiros',
        x: 'Cuidar de ativos locados com o mesmo zelo dos ativos próprios fortalece a reputação da TEN, evita passivos financeiros com locadoras e garante segurança jurídica absoluta aos contratos operacionais.',
        chips: [['Visão Sistêmica', 'o'], ['Segurança Jurídica', 't']],
        vig: () => vf('i7', 'Ciclo Total de Terceiros', [['Doca & Inspeção', 'o'], ['SAP Depósito 0070', 't'], ['Operação & Zelo', ''], ['SEMINFE & Devolução', 'ok']], 'ok')
      },
      {
        ic: 'ishield',
        t: 'Os Pilares Invioláveis',
        x: 'Lembre-se: <b>NF de Remessa conferida</b>, <b>Check-list específico com fotos</b>, <b>MIGO no depósito 0070</b>, <b>etiqueta visível</b>, <b>FRM.SUP-0001 para danos</b> e <b>SEMINFE para desmobilizar</b>.',
        chips: [['Pilares do PO', 'o'], ['Zero Falha', 't']],
        vig: () => vForm('PO.ALM-0004 · Síntese', 'Rev. 01 · 01/11/2022', 'Mobilização e Desmobilização de Terceiros')
      },
      {
        ic: 'iaward',
        t: 'O Teste Decisivo',
        x: 'Você enfrentará a rodada mista de decisão rápida de 8 cartas e o <b>quiz cronometrado de 15 segundos por pergunta</b>. Agilidade e precisão garantem sua insígnia máxima e o Certificado oficial!',
        chips: [['15 Segundos', 'bad'], ['Insígnia Máxima', 't'], ['Certificado', 'ok']],
        vig: () => vf('iaward', 'Desafio Decisivo', [['Rodada Mista', 'o'], ['8 perguntas de 15s', 'bad'], ['Certificado liberado', 'ok']], 'ok')
      }
    ],
    game: {
      type: 'deck',
      title: 'Decisão Rápida: selecione a tratativa correta para cada situação com equipamentos de terceiros',
      cards: [
        { t: 'Gerador alugado chega na fábrica com NF de Remessa para Locação sem erros', a: 1, b: ['Recusar recebimento', 'Fazer Check List com fotos e MIGO no depósito 0070', 'Liberar sem vistoria'], s: 'Entrada' },
        { t: 'Plataforma elevatória colide na viga da fábrica e amassa o guarda-corpo', a: 0, b: ['Fotos imediatas, acionar Suprimentos e preencher FRM.SUP-0001', 'Tentar desentortar escondido', 'Pintar de azul para disfarçar'], s: 'Danos' },
        { t: 'Equipamento de terceiro recém-chegado aguardando liberação para a fábrica', a: 2, b: ['Rasurar a NF', 'Tirar a placa original', 'Colar Etiqueta de Identificação e Rastreabilidade'], s: 'Etiqueta' },
        { t: 'Munck alugado atinge as 250 horas previstas no manual para troca de óleo', a: 0, b: ['Suprimentos aciona locador conforme cronograma de preventiva', 'Continuar trabalhando até travar o motor', 'Colocar óleo vegetal de cozinha'], s: 'Manutenção' },
        { t: 'Contrato de locação de 6 meses encerrado e máquina pronta para devolução', a: 1, b: ['Doar a máquina para sucata', 'Almoxarifado emite SEMINFE e solicita NF à Contabilidade', 'Mandar embora sem NF'], s: 'Desmobilização' },
        { t: 'Local no SAP ERP onde os equipamentos de terceiros devem ser alocados na MIGO', a: 2, b: ['Depósito de Vendas 0001', 'Depósito de Almoxarifado Central 0010', 'Depósito de Terceiros 0070'], s: 'SAP ERP' },
        { t: 'Documento onde são anexados todos os laudos, NF de remessa e check-lists', a: 0, b: ['Dossiê de Operação sob custódia do Almoxarifado', 'Lixeira da portaria', 'Pasta pessoal de downloads'], s: 'Dossiê' },
        { t: 'Setor responsável por contratar o frete de desmobilização do equipamento', a: 1, b: ['Almoxarifado', 'Suprimentos (setor contratante)', 'Área Solicitante'], s: 'Frete' }
      ]
    },
    quiz: [
      {
        q: 'Qual é o depósito no SAP utilizado para registrar a entrada de equipamentos de terceiros (Item 3.g)?',
        o: [
          'Depósito de Terceiros (0070).',
          'Depósito de Estoque Próprio (0010).',
          'Depósito de Matéria-Prima Estrutural (0020).'
        ],
        a: 0,
        e: 'O item 3.g cita expressamente o <b>depósito de Terceiros (0070)</b> via transação MIGO.'
      },
      {
        q: 'O que deve ser colado obrigatoriamente no equipamento antes da liberação para a fábrica (Item 3.e)?',
        o: [
          'Etiqueta de identificação e rastreabilidade.',
          'Um cartaz com o preço do equipamento.',
          'Nenhuma identificação para não sujar a máquina.'
        ],
        a: 0,
        e: 'O item 3.e exige colar a <b>etiqueta de identificação e rastreabilidade</b>.'
      },
      {
        q: 'Se ocorrer dano ao equipamento durante a operação, qual é a primeira ação exigida do solicitante (Item 3 - Solicitante, d)?',
        o: [
          'Fazer registro fotográfico e acionar o setor contratante (Suprimentos).',
          'Consertar na bancada sem avisar ninguém.',
          'Esconder o equipamento atrás do armazém.'
        ],
        a: 0,
        e: 'O procedimento determina <b>fazer registro fotográfico imediato e acionar Suprimentos</b>.'
      },
      {
        q: 'Qual formulário é utilizado para registrar ocorrências e danos em propriedades de terceiros (Item 6.1)?',
        o: [
          'FRM.SUP-0001 – Propriedades Pertencentes a Clientes ou Provedores Externos.',
          'FRM.ALM-0023 – Controle de Validade.',
          'FRM.SEG-0001 – Permissão de Trabalho a Quente.'
        ],
        a: 0,
        e: 'O item 6.1 aponta formalmente para o <b>FRM.SUP-0001</b>.'
      },
      {
        q: 'O que o Almoxarifado deve emitir para a Contabilidade gerar a NF de devolução do equipamento (Item 3.h)?',
        o: [
          'Emitir a SEMINFE.',
          'Emitir um Pedido de Compra ME21N.',
          'Emitir um cupom de desconto comercial.'
        ],
        a: 0,
        e: 'O item 3.h exige <b>emitir SEMINFE e solicitar à Contabilidade a NF de Remessa de Retorno</b>.'
      },
      {
        q: 'Quem tem a responsabilidade de contratar o frete de desmobilização do equipamento (Item 3 - Suprimentos, d)?',
        o: [
          'Suprimentos (setor contratante).',
          'A portaria de vigilância.',
          'O setor de contabilidade.'
        ],
        a: 0,
        e: 'O procedimento atribui expressamente a <b>Suprimentos a contratação do frete de desmobilização</b>.'
      },
      {
        q: 'O que deve ser feito com o dossiê de operação do equipamento após a desmobilização (Item 3.j)?',
        o: [
          'Arquivar o dossiê de operação retendo a informação documentada.',
          'Descartar imediatamente em papel picado.',
          'Doar os papéis para o motorista da transportadora.'
        ],
        a: 0,
        e: 'O item 3.j determina: <b>ao fim da vigência, após desmobilização e devolução, arquivar dossiê</b>.'
      },
      {
        q: 'Onde todos os formulários oficiais (FRMs) vigentes deste procedimento podem ser acessados (Item 6.3)?',
        o: [
          'No sistema SoftExpert (SeSuite).',
          'Em mensagens temporárias de aplicativos.',
          'Em sites de busca abertos na web.'
        ],
        a: 0,
        e: 'O item 6.3 define que os formulários oficiais estão <b>disponíveis no sistema SoftExpert</b>.'
      }
    ]
  }
];

// Instruções dos jogos
const GINST = {
  order: 'Arraste os cartões para ordená-los na sequência correta do procedimento.',
  deck: 'Toque ou clique no balde correspondente para classificar cada caso.'
};

// Configuração geral da trilha
const CFG = {
  code: 'PO.ALM-0004',
  rev: '01',
  name: 'Mobilização e Desmobilização de Equipamento de Terceiros',
  hero: 'Equipamento de <span>Terceiros</span>',
  hud: 'Equipamento de Terceiros',
  key: 'trilha-alm0004-v1',
  origem: 'trilha-alm0004',
  title:'Trilha PO.ALM-0004',
  levels: [
    [0, 'Recepcionista da Doca'],
    [400, 'Inspetor de Check List'],
    [1100, 'Controlador SAP 0070'],
    [2000, 'Gestor de Dossiês'],
    [3200, 'Guardião do Patrimônio'],
    [4400, 'Mestre da Mobilização TEN']
  ],
  guide: (t) => `
    <div class="gcard">
      <h3>${ic('ishield')}Objetivo & Escopo (Itens 1 e 2)</h3>
      ${t(
        ['Item', 'Diretriz do PO.ALM-0004'],
        [
          ['Objetivo', 'Estabelecer critérios para mobilização e desmobilização de equipamentos de terceiros na TEN.'],
          ['Escopo', 'Aplicável a todas as áreas que utilizam equipamentos de terceiros como suporte à fabricação de torres.'],
          ['Locação', 'Período contratual definido de acordo com a necessidade específica de cada área solicitante.']
        ]
      )}
    </div>

    <div class="gcard">
      <h3>${ic('iusers')}Matriz de Responsabilidades (Item 3)</h3>
      ${t(
        ['Setor', 'Responsabilidades Principais'],
        [
          ['Almoxarifado', 'Receber, checar NF de remessa, fazer Check List com fotos, colar etiqueta, lançar SAP MIGO depósito 0070, dossiê e emitir SEMINFE.'],
          ['Setor Solicitante', 'Operar com zelo, fazer check-list diário, solicitar corretivas, registrar fotos imediatas de danos e encaminhar ao Almox ao fim.'],
          ['Suprimentos', 'Controlar cronograma de preventivas, providenciar corretivas com o locador, solicitar SEMINFE e contratar frete de desmobilização.']
        ]
      )}
    </div>

    <div class="gcard">
      <h3>${ic('idb')}Transação SAP ERP & Depósito de Custódia</h3>
      ${t(
        ['Parâmetro SAP', 'Regra Mandatória'],
        [
          ['Transação', 'MIGO (Entrada de Mercadorias com NF de Remessa do locador).'],
          ['Depósito', 'Depósito de Terceiros (0070) — segregação patrimonial sem integrar ativo próprio.'],
          ['Vínculo', 'Amarrar a entrada ao Pedido / Contrato de Locação gerenciado por Suprimentos.']
        ]
      )}
    </div>

    <div class="gcard">
      <h3>${ic('ialert')}Tratativa de Danos em 5 Passos (Item 6.1)</h3>
      ${t(
        ['Passo', 'Ação Obrigatória'],
        [
          ['1. Identificar', 'Identificar a não conformidade, descrever o ocorrido e tirar fotos imediatas.'],
          ['2. Documentar', 'Documentar a ação formal corretiva a ser tomada.'],
          ['3. Segregar', 'Segregar o equipamento para a área específica do Almoxarifado (quarentena física).'],
          ['4. Remeter', 'Remeter a ocorrência formalmente ao cliente ou provedor externo (locador).'],
          ['5. Reter Informação', 'Reter informação documentada no FRM.SUP-0001 (SoftExpert) e anexar ao dossiê.']
        ]
      )}
    </div>

    <div class="gcard">
      <h3>${ic('i6')}Ciclo de Desmobilização (Item 3 e Anexo 1)</h3>
      ${t(
        ['Etapa', 'Executante', 'Ação'],
        [
          ['1. Fim de Vigência', 'Solicitante', 'Solicita desmobilização e entrega o equipamento ao Almoxarifado.'],
          ['2. Vistoria Final', 'Almoxarifado', 'Aplica Check List de saída comparando com as fotos de entrada e emite SEMINFE.'],
          ['3. NF de Retorno', 'Contabilidade', 'Emite NF de Remessa de Retorno (devolução) com base na SEMINFE.'],
          ['4. Frete Reverso', 'Suprimentos', 'Contrata frete de desmobilização e coordena coleta da transportadora.'],
          ['5. Arquivamento', 'Almoxarifado', 'Arquiva o Dossiê de Operação com o canhoto assinado pelo locador.']
        ]
      )}
    </div>

    <div class="gcard">
      <h3>${ic('ifold')}Formulários & Procedimentos Vinculados</h3>
      ${t(
        ['Código', 'Título', 'Acesso'],
        [
          ['FRM Específico', 'Check List de Avaliação da Condição do Equipamento', 'SoftExpert (SeSuite)'],
          ['FRM.SUP-0001', 'Propriedades Pertencentes a Clientes ou Provedores Externos', 'SoftExpert (SeSuite)'],
          ['PO.QUA-0010', 'Informação Documentada', 'Qualidade / SoftExpert'],
          ['PO.ALM-0004', 'Mobilização e Desmobilização de Equipamento de Terceiros', 'Almoxarifado TEN']
        ]
      )}
    </div>
  `
};
