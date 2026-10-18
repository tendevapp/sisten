/* ================= Trilha PO.ALM-0003: Preservação de Materiais =================
   Procedimento Operacional · Rev. 03 · 04/06/2026
   Emissor: JAMILLE DA SILVA BATISTA · Aprovador: Gilmara Moura de Souza
   Foco: Preservação, armazenagem, manuseio, controle de contaminação,
         embalagem, transporte, validade FIFO/FEFO, FRM.ALM-0023 e FRM.SUP-0001. */

const M = [
  // -------------------------------------------------------------------------
  // M01 · Por que Preservar? O Guardião da Torre
  // -------------------------------------------------------------------------
  {
    n: 1,
    short: 'Por que Preservar',
    title: 'Por que <span>Preservar</span>?',
    ic: 'ishield',
    badge: 'Guardião da Torre',
    gameName: 'Os 4 Pilares da Preservação',
    chips: [['4 cenas', ''], ['Segurança Estrutural', 'o'], ['≈ 4 min', 't']],
    intro: 'Uma torre eólica opera a 120 metros de altura sob ventos severos por mais de 20 anos. A preservação correta dos materiais no almoxarifado é a garantia de que nenhuma falha estrutural comprometa vidas ou a operação.',
    scenes: [
      {
        ic: 'iwind',
        t: 'O Propósito Maior',
        x: 'O <b>PO.ALM-0003</b> estabelece a metodologia para a preservação de todos os materiais aplicados à torre eólica, assegurando suas conformidades de acordo com os rigorosos <b>requisitos do cliente</b>.',
        chips: [['Item 1', 'o'], ['Conformidade Total', 't'], ['Torres Eólicas', '']],
        vig: () => vf('iwind', 'Preservação de Materiais', [['PO.ALM-0003', 'o'], ['Rev. 03', ''], ['Torres de 120m', 't']], 'ok')
      },
      {
        ic: 'iboxes',
        t: 'Escopo Abrangente',
        x: 'Aplica-se ao controle de <b>preservação, armazenagem, manuseio, controle de contaminação, embalagem, transporte e proteção</b> de todos os materiais destinados à fabricação de torres.',
        chips: [['Item 2', 'o'], ['Da Doca à Linha', 't']],
        vig: () => vf('iboxes', 'Escopo Completo', [['Armazenagem', 'o'], ['Manuseio & 5S', 't'], ['Contaminação', 'bad'], ['Transporte', '']], '')
      },
      {
        ic: 'iusers',
        t: 'Responsabilidade do Almoxarifado',
        x: 'Cabe ao <b>Almoxarifado</b> identificar, verificar, proteger e salvaguardar materiais internos e de clientes/fornecedores, além de armazenar contra danos físicos e manter controle de propriedades externas.',
        chips: [['Item 3.a', 'o'], ['Salvaguarda', 't']],
        vig: () => vf('iusers', 'Papel do Almoxarifado', [['Identificar & Verificar', 'o'], ['Proteger contra danos', 't'], ['Controlar terceiros', '']], 'ok')
      },
      {
        ic: 'ifac',
        t: 'Responsabilidade da Solicitante',
        x: 'A <b>Área Solicitante (Produção)</b> também é corresponsável: deve manusear, armazenar e proteger materiais contra danos, seguir procedimentos de preservação e cuidar do transporte do produto final.',
        chips: [['Item 3.b', 'o'], ['Área Solicitante', 't'], ['Corresponsabilidade', '']],
        vig: () => vf('ifac', 'Área Solicitante', [['Manuseio cuidadoso', 'o'], ['Preservação interna', 't'], ['Transporte final', '']], '')
      }
    ],
    game: {
      type: 'order',
      title: 'Coloque as 4 etapas do ciclo de preservação na sequência correta'
    },
    quiz: [
      {
        q: 'Qual é o objetivo central do procedimento PO.ALM-0003?',
        o: [
          'Estabelecer metodologia para a preservação dos materiais aplicados à torre e assegurar suas conformidades com requisitos do cliente.',
          'Controlar exclusivamente os veículos leves da frota de transporte da fábrica.',
          'Substituir o processo de compras de suprimentos na seleção de novos fornecedores.'
        ],
        a: 0,
        e: 'O item 1 define claramente o objetivo de <b>preservação dos materiais aplicados à torre</b> conforme os requisitos do cliente.'
      },
      {
        q: 'Qual das responsabilidades abaixo é EXCLUSIVA da área de Almoxarifado segundo o PO?',
        o: [
          'Ter controle sobre as propriedades de clientes externos enquanto estiverem sendo usadas pela organização.',
          'Garantir cuidados específicos no transporte do produto final montado.',
          'Montar as flanges e soldar os anéis da torre na fábrica.'
        ],
        a: 0,
        e: 'O controle e salvaguarda de <b>propriedades de clientes externos</b> no estoque é responsabilidade explícita do Almoxarifado (Item 3).'
      },
      {
        q: 'A quem se aplica o escopo do PO.ALM-0003?',
        o: [
          'À preservação, armazenagem, manuseio, controle de contaminação, embalagem, transporte e proteção de materiais da torre.',
          'Apenas aos materiais de escritório e informática do prédio administrativo.',
          'Somente às chapas de aço estocadas ao ar livre na área do porto.'
        ],
        a: 0,
        e: 'O escopo cobre todo o ciclo de <b>armazenagem, manuseio, contaminação, embalagem e transporte</b> de materiais para fabricação de torres.'
      },
      {
        q: 'De acordo com o PO, qual é o papel da Área Solicitante na preservação?',
        o: [
          'Manusear, armazenar e proteger materiais contra danos, e garantir cuidados no transporte do produto final.',
          'Comprar materiais no mercado livre sem solicitação oficial.',
          'Descartar qualquer sobra sem documentar não conformidade.'
        ],
        a: 0,
        e: 'A área solicitante é <b>corresponsável pela integridade</b> durante manuseio interno e transporte do produto acabado.'
      }
    ]
  },

  // -------------------------------------------------------------------------
  // M02 · Fatores de Degradação & Contaminação
  // -------------------------------------------------------------------------
  {
    n: 2,
    short: 'Controle de Contaminação',
    title: 'Controle de <span>Contaminação</span>',
    ic: 'ialert',
    badge: 'Escudo Anti-Contaminação',
    gameName: 'Separando Riscos e Agentes',
    chips: [['4 cenas', ''], ['Item 4.2', 'o'], ['Químicos & Aços', 't']],
    intro: 'Em uma fábrica de torres, umidade, poeira e contato inadequado entre substâncias químicas podem condenar soldas e revestimentos inteiros. Conheça as definições e barreiras de contenção.',
    scenes: [
      {
        ic: 'idrop',
        t: 'Materiais com Risco Crítico',
        x: 'O item 4.2 destaca os materiais mais sensíveis à <b>contaminação ambiental e química</b>: tintas industriais, granalhas de jateamento, fluxos de solda e arames de solda sujeitos à <b>oxidação acelerada</b>.',
        chips: [['Tintas & Granalhas', 'o'], ['Solda & Oxidação', 'bad']],
        vig: () => vf('idrop', 'Risco de Contaminação', [['Tintas industriais', 'o'], ['Granalhas', ''], ['Fluxos de solda', 't'], ['Arames oxidados', 'bad']], 'bad')
      },
      {
        ic: 'itag',
        t: 'Identificação Obrigatória',
        x: '<b>Identificação do produto (Item 4.4):</b> nenhum material pode permanecer no armazém sem descrição clara do que é, lote, código e data. Material sem identificação vira risco imediato e deve ser segregado.',
        chips: [['Item 4.4', 'o'], ['Código & Lote', 't'], ['Rastreabilidade', '']],
        vig: () => vf('itag', 'Identificação Inviolável', [['Descrição clara', 'o'], ['Código TEN', 't'], ['Lote e validade', ''], ['Sem etiqueta = Segregar', 'bad']], 'ok')
      },
      {
        ic: 'iboxes',
        t: 'Embalagem por Criticidade',
        x: '<b>Embalagem (Item 4.3):</b> a forma de acondicionamento dos materiais deve ser determinada conforme sua <b>criticidade</b> para garantir a preservação contínua contra choques mecânicos e umidade.',
        chips: [['Item 4.3', 'o'], ['Acondicionamento', 't']],
        vig: () => vf('iboxes', 'Criticidade da Embalagem', [['Insumo comum: pallet padrão', ''], ['Químico: barreira vedada', 'o'], ['Consumível solda: selado', 't']], '')
      },
      {
        ic: 'ishield',
        t: 'Condições de Preservação',
        x: '<b>Preservação (Item 4.6):</b> conjunto de medidas e condições físicas para proteger os materiais contra corrosão, radiação solar excessiva, contato com água e acúmulo de poeiras industriais.',
        chips: [['Item 4.6', 'o'], ['Proteção Física', 't']],
        vig: () => vf('ishield', 'Proteção Ativa', [['Longe do chão direto', 'o'], ['Abrigo de chuvas', 't'], ['Sem contato com terra', '']], 'ok')
      }
    ],
    game: {
      type: 'deck',
      title: 'Classifique cada material no seu respectivo risco de contaminação',
      buckets: ['Químicos & Tintas', 'Consumíveis de Solda', 'Peças & Granel'],
      cards: [
        { t: 'Tinta epóxi bicomponente em tambor', a: 0, s: 'Químicos' },
        { t: 'Arame tubular para arco submerso exposto à umidade', a: 1, s: 'Solda' },
        { t: 'Granalha de aço para jateamento em big-bag rasgado', a: 2, s: 'Granel' },
        { t: 'Solvente PU para diluição de acabamento', a: 0, s: 'Químicos' },
        { t: 'Fluxo em pó aglomerado para soldagem', a: 1, s: 'Solda' },
        { t: 'Flanges usinadas com protetivo oleoso no pátio', a: 2, s: 'Peças' },
        { t: 'Verniz selador de base poliuretano', a: 0, s: 'Químicos' },
        { t: 'Eletrodo revestido para solda manual', a: 1, s: 'Solda' }
      ]
    },
    quiz: [
      {
        q: 'Quais materiais são nominalmente citados no item 4.2 como sujeitos a risco de contaminação?',
        o: [
          'Tintas, granalhas, fluxos de solda e arames de solda (oxidação).',
          'Apenas folhas de papel A4 e toners de impressora do escritório.',
          'Uniformes de brim e botas de couro dos operadores.'
        ],
        a: 0,
        e: 'O item 4.2 destaca expressamente <b>tintas, granalhas, fluxos de solda e arames de solda (oxidação)</b>.'
      },
      {
        q: 'O que o procedimento determina sobre a embalagem dos materiais (Item 4.3)?',
        o: [
          'Determinar a forma de acondicionamento de acordo com sua criticidade para garantir sua preservação.',
          'Descartar todas as embalagens plásticas imediatamente na entrada na doca.',
          'Usar sempre o mesmo tipo de papelão ondulado para qualquer tipo de peça.'
        ],
        a: 0,
        e: 'A embalagem e o acondicionamento devem respeitar o <b>nível de criticidade do material</b>.'
      },
      {
        q: 'O que deve ser feito caso um material seja encontrado no almoxarifado sem identificação (Item 5)?',
        o: [
          'Deve ser imediatamente segregado como material não conforme até sua regularização.',
          'Deve ser enviado diretamente para a linha de produção sem avisar ninguém.',
          'Deve ser colocado na prateleira de itens de alto giro sem etiqueta.'
        ],
        a: 0,
        e: 'Materiais sem identificação, avariados ou vencidos devem ser <b>obrigatoriamente segregados</b>.'
      },
      {
        q: 'Por que o arame de solda exige cuidado redobrado quanto à contaminação por umidade?',
        o: [
          'A oxidação do arame introduz hidrogênio e defeitos graves na poça de solda estrutural da torre.',
          'O arame oxida e simplesmente fica com uma cor mais escura sem impacto estrutural.',
          'Não há impacto estrutural, é apenas uma exigência estética da embalagem externa.'
        ],
        a: 0,
        e: 'A oxidação e umidade em arames causam <b>trincas e porosidades severas</b> nas soldas estruturais da torre.'
      }
    ]
  },

  // -------------------------------------------------------------------------
  // M03 · Químicos, Validade & Soldagem
  // -------------------------------------------------------------------------
  {
    n: 3,
    short: 'Químicos & Soldagem',
    title: 'Químicos, Validade & <span>Soldagem</span>',
    ic: 'iflame',
    badge: 'Inspetor Químico',
    gameName: 'Regras de Tintas e Solda',
    chips: [['4 cenas', ''], ['FRM.ALM-0023', 'o'], ['PO.ENG-0001', 't']],
    intro: 'Tintas industriais e consumíveis de soldagem são o coração da durabilidade da torre. Uma lata de tinta vencida ou um fluxo úmido custam milhões em retrabalho de campo.',
    scenes: [
      {
        ic: 'idrop',
        t: 'Controle de Validade de Tintas',
        x: '<b>Tintas Industriais (Item 6.3):</b> é obrigatório controlar a data de vencimento dos produtos. O acompanhamento formal é registrado no <b>FRM.ALM-0023 – Controle de Validade de Produtos</b>.',
        chips: [['FRM.ALM-0023', 'o'], ['Controle Formal', 't'], ['Validade Rígida', 'bad']],
        vig: () => vForm('Validade de Produtos', 'FRM.ALM-0023', 'Tinta Poliuretano · Lote 2026/08')
      },
      {
        ic: 'iwrench',
        t: 'Consumíveis de Soldagem',
        x: 'O recebimento e armazenamento de insumos de soldagem devem seguir estritamente o <b>PO.ENG-0001 – Recebimento e Condicionamento de Consumíveis de Soldagem</b> (estufas térmicas e proteção de arames).',
        chips: [['PO.ENG-0001', 'o'], ['Engenharia de Solda', 't']],
        vig: () => vf('iwrench', 'PO.ENG-0001', [['Estufas de secagem', 'o'], ['Manutenção de fluxo', 't'], ['Arames selados', '']], 'ok')
      },
      {
        ic: 'ical',
        t: 'Monitoramento Periódico',
        x: '<b>Validade do Material (Item 4.9):</b> avaliar e verificar periodicamente a validade e a condição dos materiais que aguardam aplicação na montagem das seções das torres.',
        chips: [['Item 4.9', 'o'], ['Rondas Periódicas', 't']],
        vig: () => vf('ical', 'Ronda de Validades', [['Verificação semanal', 'o'], ['Alerta pré-vencimento', 't'], ['Zero vencidos na linha', 'bad']], '')
      },
      {
        ic: 'ifold',
        t: 'Acesso a Formulários SoftExpert',
        x: '<b>Acesso a documentos (Item 6.5):</b> todos os formulários oficiais (FRMs) e instruções de trabalho citados no procedimento estão disponíveis centralizados no sistema <b>SoftExpert (SeSuite)</b>.',
        chips: [['Item 6.5', 'o'], ['SoftExpert', 't'], ['Versão Vigente', '']],
        vig: () => vFolder('SoftExpert // Almoxarifado', ['FRM.ALM-0023 Validade', 'FRM.SUP-0001 Propriedades', 'PO.ENG-0001 Soldagem'])
      }
    ],
    game: {
      type: 'deck',
      title: 'Direcione a ação correta para cada caso de químico ou consumível de solda',
      buckets: ['FRM.ALM-0023 (Validade)', 'PO.ENG-0001 (Soldagem)', 'Segregar Imediatamente'],
      cards: [
        { t: 'Lata de catalisador epóxi a 30 dias do vencimento', a: 0, s: 'Validade' },
        { t: 'Fluxo aglomerado retirado da embalagem que irá para estufa', a: 1, s: 'Soldagem' },
        { t: 'Balde de primer de poliuretano com data de validade ultrapassada', a: 2, s: 'Segregar' },
        { t: 'Novo lote de tinta acabamento recebido do fornecedor com laudo', a: 0, s: 'Validade' },
        { t: 'Carretel de arame tubular com sinais evidentes de ferrugem/oxidação', a: 2, s: 'Segregar' },
        { t: 'Condicionamento de eletrodos em estufa portátil térmica', a: 1, s: 'Soldagem' },
        { t: 'Tinta com embalagem estufada e sem rótulo legível', a: 2, s: 'Segregar' },
        { t: 'Aferição de temperatura da estufa de manutenção de consumíveis', a: 1, s: 'Soldagem' }
      ]
    },
    quiz: [
      {
        q: 'Qual formulário é utilizado para controlar a validade de tintas industriais (Item 6.2 e 6.3)?',
        o: [
          'FRM.ALM-0023 – Controle de Validade de Produtos.',
          'FRM.SUP-0004 – Mapa de Cotações de Suprimentos.',
          'FRM.ENG-9999 – Relatório de Manutenção Elétrica.'
        ],
        a: 0,
        e: 'O item 6.3 cita expressamente o <b>FRM.ALM-0023 – Controle de Validade de Produtos</b>.'
      },
      {
        q: 'Qual procedimento complementar rege o recebimento e condicionamento de consumíveis de soldagem?',
        o: [
          'PO.ENG-0001 – Recebimento e Condicionamento de Consumíveis de Soldagem.',
          'PO.FIN-0002 – Fluxo de Caixa e Tesouraria.',
          'PO.RH-0005 – Normas de Admissão e Integração.'
        ],
        a: 0,
        e: 'O item 6.2 aponta diretamente para o <b>PO.ENG-0001</b> da Engenharia de Soldagem.'
      },
      {
        q: 'Onde os colaboradores encontram as versões oficiais e vigentes dos formulários citados no PO?',
        o: [
          'No sistema SoftExpert (SeSuite).',
          'Em cópias impressas guardadas em gavetas particulares sem carimbo.',
          'Em mensagens soltas de grupos de mensagens instantâneas.'
        ],
        a: 0,
        e: 'O item 6.5 estabelece que os FRMs estão disponíveis centralizados no sistema <b>SoftExpert</b>.'
      },
      {
        q: 'O que deve ser feito se um tambor de tinta vencer antes de ser consumido?',
        o: [
          'Identificar a não conformidade, segregar imediatamente e não liberar para produção.',
          'Diluir com solvente extra para tentar reativar a tinta e usar na torre.',
          'Alterar a etiqueta de validade com caneta para liberar o lote.'
        ],
        a: 0,
        e: 'Produto vencido é não conforme: deve ser <b>segregado imediatamente</b> sem ir para a fábrica.'
      }
    ]
  },

  // -------------------------------------------------------------------------
  // M04 · Regra de Ouro: FIFO & FEFO
  // -------------------------------------------------------------------------
  {
    n: 4,
    short: 'Giro FIFO & FEFO',
    title: 'A Regra de Ouro: <span>FIFO & FEFO</span>',
    ic: 'iflow',
    badge: 'Mestre do Giro',
    gameName: 'Despachando pelo Giro Certo',
    chips: [['4 cenas', ''], ['Simulador FEFO', 'o'], ['Rotatividade', 't']],
    intro: 'Materiais parados no fundo da prateleira envelhecem e perdem propriedades. O PO.ALM-0003 exige a aplicação rigorosa do FIFO e do FEFO para garantir o frescor dos insumos da torre.',
    scenes: [
      {
        ic: 'iflow',
        t: 'Garantia de Rotatividade',
        x: 'O item 5 determina expressamente: <b>garantir a aplicação do FIFO/FEFO para correta rotatividade dos materiais</b>. O objetivo é impedir que lotes antigos fiquem encalhados sob lotes novos.',
        chips: [['Item 5', 'o'], ['Rotatividade Ativa', 't']],
        vig: () => vf('iflow', 'Rotatividade Obrigatória', [['FIFO: Primeiro que entra', 'o'], ['FEFO: Primeiro que expira', 't'], ['Zero encalhe no fundo', 'bad']], 'ok')
      },
      {
        ic: 'iboxes',
        t: 'FIFO: Itens Não Perecíveis',
        x: '<b>FIFO (First In, First Out):</b> primeiro a entrar, primeiro a sair. Aplicado a materiais com vida útil longa ou sem data crítica de expiração (parafusos, arruelas, chapas, flanges, perfis metálicos).',
        chips: [['FIFO', 'o'], ['Ordem de Chegada', 't']],
        vig: () => vf('iboxes', 'Regra FIFO', [['Lote mais antigo na frente', 'o'], ['Lote novo atrás/abaixo', 't'], ['Consumo cronológico', '']], '')
      },
      {
        ic: 'ical',
        t: 'FEFO: Itens com Validade',
        x: '<b>FEFO (First Expired, First Out):</b> primeiro que expira é o primeiro a sair! Mesmo que um lote novo tenha chegado ontem, se a validade dele for mais curta que a dos outros, ele sai primeiro.',
        chips: [['FEFO', 'o'], ['Validade Crítica', 'bad'], ['Tintas & Químicos', 't']],
        vig: () => vf('ical', 'Regra FEFO', [['Data de validade manda', 'bad'], ['Mesmo se chegou depois', 'o'], ['Protege químicos e tintas', 't']], 'ok')
      },
      {
        ic: 'iscale',
        t: 'Simulador Interativo de Giro FEFO',
        x: 'Arraste o controle para simular os dias de consumo e observe qual lote de tinta primer deve ser separado pela regra do <b>FEFO</b> para abastecer a pintura.',
        widget: 'fefo',
        hold: true,
        chips: [['Simulador', 'o'], ['Interativo', 't']]
      }
    ],
    game: {
      type: 'order',
      title: 'Ordene os lotes de tinta conforme a prioridade de consumo FEFO (do mais urgente ao menos urgente)',
      cards: [
        { t: 'Lote X: Vence em 15 dias (Chegou há 20 dias)', a: 0, s: '1º a Sair (FEFO)' },
        { t: 'Lote Y: Vence em 40 dias (Chegou há 60 dias)', a: 1, s: '2º a Sair' },
        { t: 'Lote Z: Vence em 90 dias (Chegou há 10 dias)', a: 2, s: '3º a Sair' },
        { t: 'Lote W: Vence em 180 dias (Recém-chegado hoje)', a: 3, s: 'Último a Sair' }
      ]
    },
    quiz: [
      {
        q: 'Qual é a principal diferença entre a regra FIFO e a regra FEFO?',
        o: [
          'FIFO prioriza a ordem de chegada; FEFO prioriza o lote cuja data de validade vence primeiro.',
          'FIFO é para produtos químicos e FEFO é exclusivamente para chapas de aço.',
          'FIFO exige autorização da gerência e FEFO é feito sem nenhum registro.'
        ],
        a: 0,
        e: 'FIFO = First-In First-Out (ordem de entrada); FEFO = First-Expired First-Out (prioridade por data de expiração).'
      },
      {
        q: 'Em um armazém de tintas, um novo lote B chegou hoje com validade de 2 meses. O lote A em estoque vence em 5 meses. Qual lote sai primeiro?',
        o: [
          'Lote B sai primeiro, pois a regra FEFO determina que o item com validade mais próxima seja consumido antes.',
          'Lote A sai primeiro porque o FIFO manda consumir sempre quem chegou antes, ignorando o vencimento.',
          'Ambos os lotes devem ser misturados no mesmo tambor para equalizar a validade.'
        ],
        a: 0,
        e: 'Pelo <b>FEFO</b>, o Lote B vence mais cedo (2 meses vs 5 meses) e deve ser despachado primeiro para não perder validade.'
      },
      {
        q: 'O que o item 5 do PO.ALM-0003 diz sobre a rotatividade dos materiais?',
        o: [
          'Garantir a aplicação do FIFO/FEFO para correta rotatividade dos materiais.',
          'Consumir sempre os materiais que estiverem mais fáceis de pegar na frente da porta.',
          'Aguardar o material vencer para então solicitar a compra de um novo lote.'
        ],
        a: 0,
        e: 'O item 5 estabelece a obrigatoriedade de <b>garantir a aplicação do FIFO/FEFO</b> para a rotatividade.'
      },
      {
        q: 'Qual é a consequência de não aplicar FIFO/FEFO no almoxarifado da TEN?',
        o: [
          'Materiais encalhados vencem no armazém, gerando desperdício financeiro e risco de aplicação de insumo vencido na torre.',
          'Aumento desnecessário de horas extras dos operadores de empilhadeira.',
          'Nenhuma, pois os materiais de fábrica nunca perdem as propriedades com o tempo.'
        ],
        a: 0,
        e: 'Sem rotatividade, itens químicos e protetivos <b>perdem a eficácia</b> e geram prejuízos severos e riscos à qualidade.'
      }
    ]
  },

  // -------------------------------------------------------------------------
  // M05 · Acondicionamento, Embalagem & Manuseio Seguro
  // -------------------------------------------------------------------------
  {
    n: 5,
    short: 'Acondicionamento & Manuseio',
    title: 'Acondicionamento & <span>Manuseio</span>',
    ic: 'iwrench',
    badge: 'Mestre da Movimentação',
    gameName: 'Boas Práticas de Movimentação',
    chips: [['4 cenas', ''], ['Itens 4.5 e 5', 'o'], ['Prevenção de Avarias', 't']],
    intro: 'Embalagens rompidas por empilhamento excessivo e peças danificadas por garfo de empilhadeira são prejuízos evitáveis. O PO define regras de movimentação segura e preservação física.',
    scenes: [
      {
        ic: 'iwrench',
        t: 'Manuseio Cuidadoso (Item 6.1)',
        x: 'Para todos os materiais, o <b>manuseio deverá ser realizado com cuidados específicos</b> visando garantir a proteção e preservação contra choques mecânicos, deformações e avarias de superfícies.',
        chips: [['Item 6.1', 'o'], ['Cuidado Específico', 't']],
        vig: () => vf('iwrench', 'Manuseio Preventivo', [['Sem pancadas', 'o'], ['Sem arrastar no chão', 'bad'], ['Proteção de roscas/usinados', 't']], 'ok')
      },
      {
        ic: 'iboxes',
        t: 'Preservação de Embalagens',
        x: '<b>Item 5:</b> preservar embalagens e acondicionamentos, <b>evitando danos por empilhamento inadequado</b> ou movimentação incorreta. Caixas inferiores não podem ser esmagadas pelo peso do conjunto.',
        chips: [['Item 5', 'o'], ['Limite de Carga', 't'], ['Estabilidade', '']],
        vig: () => vf('iboxes', 'Empilhamento Seguro', [['Respeitar altura máxima', 'o'], ['Paletes alinhados', 't'], ['Sem sobrepeso na base', 'bad']], '')
      },
      {
        ic: 'i7',
        t: 'Movimentação com Equipamentos Adequados',
        x: 'Realizar a movimentação segura dos materiais utilizando <b>equipamentos adequados</b>: empilhadeiras com capacidade balanceada, pontes rolantes com cintas apropriadas (sem cantos vivos sem proteção).',
        chips: [['Equipamentos Certificados', 'o'], ['Pontes & Empilhadeiras', 't']],
        vig: () => vf('i7', 'Movimentação Segura', [['Cintas têxteis protegidas', 'o'], ['Garfo na largura correta', 't'], ['Velocidade controlada', '']], 'ok')
      },
      {
        ic: 'i6',
        t: 'Transporte Protegido (Item 4.8)',
        x: '<b>Transporte:</b> definir a forma de acondicionamento do material e o tipo de manuseio adequado para garantir a preservação contra danos durante deslocamentos internos entre pátio, almoxarifado e fábrica.',
        chips: [['Item 4.8', 'o'], ['Amarração Segura', 't']],
        vig: () => vf('i6', 'Transporte Interno', [['Carga amarrada', 'o'], ['Calços de borracha/madeira', 't'], ['Protegido da chuva', '']], '')
      }
    ],
    game: {
      type: 'deck',
      title: 'Classifique a atitude como Prática Conforme ou Risco de Avaria',
      buckets: ['Prática Conforme (PO)', 'Risco de Avaria (Proibido)'],
      cards: [
        { t: 'Empilhar caixas até o limite recomendado pelo fabricante no pallet', a: 0, s: 'Conforme' },
        { t: 'Arrastar chapa ou tubo no chão de concreto com cabo de aço', a: 1, s: 'Proibido' },
        { t: 'Usar proteção de cantos de borracha nas cintas de içamento de peças usinadas', a: 0, s: 'Conforme' },
        { t: 'Colocar pallet de peças pesadas em cima de tambores de químicos lacrados', a: 1, s: 'Proibido' },
        { t: 'Ajustar o espaçamento dos garfos da empilhadeira para o tamanho do pallet', a: 0, s: 'Conforme' },
        { t: 'Trafegar em velocidade excessiva no pátio com carga alta sem amarração', a: 1, s: 'Proibido' },
        { t: 'Manter a película protetora de flanges até o momento da montagem', a: 0, s: 'Conforme' },
        { t: 'Deixar caixas de papelão expostas à chuva na doca descoberta', a: 1, s: 'Proibido' }
      ]
    },
    quiz: [
      {
        q: 'O que o item 5 orienta especificamente sobre o empilhamento de materiais?',
        o: [
          'Preservar embalagens e acondicionamentos, evitando danos por empilhamento inadequado ou movimentação incorreta.',
          'Empilhar até atingir o teto do galpão para economizar espaço de piso.',
          'Nunca empilhar mais de 1 caixa, independentemente do tipo de material.'
        ],
        a: 0,
        e: 'O item 5 determina expressamente <b>evitar danos por empilhamento inadequado</b>.'
      },
      {
        q: 'Qual é o requisito para movimentação segura de materiais no almoxarifado?',
        o: [
          'Realizar movimentação segura dos materiais utilizando equipamentos adequados.',
          'Utilizar qualquer trator agrícola disponível no momento sem checar capacidade.',
          'Realizar o transporte de cargas de 2 toneladas manualmente com operadores.'
        ],
        a: 0,
        e: 'Movimentações devem empregar <b>equipamentos adequados e certificados</b> (Item 5).'
      },
      {
        q: 'De acordo com o item 6.1, como deve ser realizado o manuseio de todos os materiais?',
        o: [
          'Com cuidados específicos visando garantir a proteção e preservação contra danos.',
          'De forma rápida, mesmo que ocorram pequenos impactos nas quinas.',
          'Somente por funcionários terceirizados contratados por hora.'
        ],
        a: 0,
        e: 'O manuseio exige <b>cuidados específicos contra danos e avarias</b> em todos os materiais.'
      },
      {
        q: 'Ao transportar componentes com superfícies usinadas na fábrica, qual é o cuidado mandatório?',
        o: [
          'Garantir proteção contra atrito, batidas mecânicas e oxidação com calços e protetivos.',
          'Remover todo o óleo protetivo antes de sair do almoxarifado.',
          'Arrastar as peças para acelerar o tempo de ciclo da ponte rolante.'
        ],
        a: 0,
        e: 'Usinados exigem <b>calços, proteção física e preservação do protetivo superficial</b>.'
      }
    ]
  },

  // -------------------------------------------------------------------------
  // M06 · Rondas de 5S, Estrutura Física & Prevenção
  // -------------------------------------------------------------------------
  {
    n: 6,
    short: 'Rondas 5S & Estrutura',
    title: 'Rondas 5S & <span>Estrutura Física</span>',
    ic: 'ichk',
    badge: 'Vigilante do 5S',
    gameName: 'Ronda de Inspeção no Almoxarifado',
    chips: [['4 cenas', ''], ['Item 5', 'o'], ['Prevenção & 5S', 't']],
    intro: 'Uma goteira silenciosa no telhado ou um ninho de pragas atrás dos pallets pode arruinar toneladas de insumos. O PO.ALM-0003 estabelece inspeções preventivas e rotinas contínuas de 5S.',
    scenes: [
      {
        ic: 'ichk',
        t: 'Rotinas de Limpeza e 5S',
        x: 'O item 5 determina: <b>executar rotinas de limpeza e 5S nas áreas de armazenagem</b>. Piso limpo, vias desobstruídas e ausência de poeira e resíduos são pré-requisitos para preservar materiais.',
        chips: [['Item 5', 'o'], ['Metodologia 5S', 't'], ['Organização', '']],
        vig: () => vf('ichk', 'Rotinas de 5S', [['Limpeza diária', 'o'], ['Demarcações no piso', 't'], ['Vias de circulação livres', ''], ['Sem resíduos soltos', 'bad']], 'ok')
      },
      {
        ic: 'ialert',
        t: 'Inspeção da Estrutura Física',
        x: '<b>Prevenção de Infiltrações e Pragas:</b> inspecionar periodicamente a estrutura física do almoxarifado para prevenção de <b>infiltrações de chuva, pragas (pombos, roedores, cupins)</b> e demais riscos.',
        chips: [['Item 5', 'o'], ['Estrutura Física', 'bad'], ['Zero Infiltração', 't']],
        vig: () => vf('ialert', 'Inspeção Predial', [['Telhado e calhas', 'o'], ['Paredes e vedações', 't'], ['Controle de pragas ativo', 'bad']], 'bad')
      },
      {
        ic: 'itag',
        t: 'Endereçamento Logístico Padronizado',
        x: '<b>Item 5:</b> manter a organização e o <b>endereçamento logístico dos materiais conforme padrão definido</b>. Item fora do endereço perde a rastreabilidade e fica vulnerável ao esquecimento e degradação.',
        chips: [['Endereçamento', 'o'], ['Padrão TEN', 't']],
        vig: () => vf('itag', 'Endereçamento Padrão', [['Cada item em seu box', 'o'], ['Identificação no rack', 't'], ['Rastreabilidade total', '']], 'ok')
      },
      {
        ic: 'idb',
        t: 'Inventários Preventivos',
        x: '<b>Acuracidade e Conservação:</b> executar <b>inventários preventivos</b> não apenas para contar peças, mas para garantir a <b>acuracidade e a conservação</b> física de todos os itens guardados.',
        chips: [['Inventário Preventivo', 'o'], ['Acuracidade', 't']],
        vig: () => vf('idb', 'Inventário & Inspeção', [['Contagem física', 'o'], ['Inspeção de estado', 't'], ['Verificação de embalagem', '']], 'ok')
      }
    ],
    game: {
      type: 'deck',
      title: 'Identifique a anomalia encontrada na ronda do almoxarifado',
      buckets: ['Risco Estrutural / Infiltração', 'Desvio de 5S / Limpeza', 'Conforme / Preservado'],
      cards: [
        { t: 'Pingo de água caindo do telhado sobre prateleira de conectores elétricos', a: 0, s: 'Estrutural' },
        { t: 'Pedaços de fita adesiva, plástico e restos de pallet bloqueando a via de trânsito', a: 1, s: '5S' },
        { t: 'Materiais organizados nas estantes com etiquetas legíveis e piso demarcado', a: 2, s: 'Conforme' },
        { t: 'Presença de fezes de pássaros ou roedores próximo ao lote de EPIs', a: 0, s: 'Estrutural' },
        { t: 'Caixas vazias acumuladas no chão ao lado da bancada de recebimento', a: 1, s: '5S' },
        { t: 'Racks limpos com itens armazenados respeitando o endereçamento padrão', a: 2, s: 'Conforme' },
        { t: 'Rachadura na parede externa com umidade e mofo atingindo caixas', a: 0, s: 'Estrutural' },
        { t: 'Óleo derramado no piso do corredor sem absorvente ou isolamento', a: 1, s: '5S' }
      ]
    },
    quiz: [
      {
        q: 'O que o PO determina expressamente sobre a inspeção da estrutura física do armazém?',
        o: [
          'Inspecionar periodicamente a estrutura física para prevenção de infiltrações, pragas e demais riscos.',
          'Apenas olhar as portas no final do ano na época do inventário geral.',
          'A manutenção predial só deve agir após o telhado desabar completamente.'
        ],
        a: 0,
        e: 'O item 5 exige <b>inspeções periódicas na estrutura física</b> contra infiltrações e pragas.'
      },
      {
        q: 'Por que o endereçamento logístico correto é fundamental para a preservação de materiais?',
        o: [
          'Garante que o material seja facilmente localizado, inspecionado e rotacionado sem ficar esquecido até deteriorar.',
          'Serve apenas para preencher o sistema SAP sem relação com a vida útil.',
          'Facilita a venda de sucata de forma rápida para o mercado.'
        ],
        a: 0,
        e: 'Item endereçado corretamente <b>não se perde, não é esquecido</b> e cumpre a rotatividade correta.'
      },
      {
        q: 'Qual é o papel dos inventários preventivos segundo o item 5 do PO.ALM-0003?',
        o: [
          'Garantir acuracidade do estoque e verificar a conservação dos materiais armazenados.',
          'Apenas auditar os custos financeiros para a controladoria central da sede.',
          'Parar a fábrica durante duas semanas sem gerar relatórios.'
        ],
        a: 0,
        e: 'Os inventários preventivos servem para <b>acuracidade e fiscalização da conservação</b> dos itens estocados.'
      },
      {
        q: 'Quais são os benefícios diretos do programa 5S no almoxarifado?',
        o: [
          'Eliminação de resíduos, desobstrução de corredores, prevenção de contaminação e maior agilidade e segurança.',
          'Permitir que os operadores usem sapatos sem biqueira de aço.',
          'Diminuir a quantidade de iluminação artificial nas estantes.'
        ],
        a: 0,
        e: 'O 5S mantém o ambiente <b>limpo, organizado, seguro e livre de contaminantes</b>.'
      }
    ]
  },

  // -------------------------------------------------------------------------
  // M07 · Incidentes Internos & Fluxo de Segregação
  // -------------------------------------------------------------------------
  {
    n: 7,
    short: 'Danos Internos & Segregação',
    title: 'Incidentes Internos & <span>Segregação</span>',
    ic: 'ialert',
    badge: 'Mestre da Quarentena',
    gameName: 'O Fluxo dos 5 Passos de Dano',
    chips: [['4 cenas', ''], ['Item 6.3', 'o'], ['5 Passos Obrigatórios', 't']],
    intro: 'Se um material for danificado por manuseio incorreto ou preservação inadequada, o que fazer? Esconder o dano é proibido. O PO.ALM-0003 define um fluxo obrigatório e transparente de 5 passos.',
    scenes: [
      {
        ic: 'ialert',
        t: 'Identificar a Não Conformidade',
        x: '<b>Passo 1 (Item 6.3):</b> no caso de material danificado internamente por manuseio ou preservação inadequada, o primeiro ato é <b>identificar a não conformidade e descrever detalhadamente o ocorrido</b>.',
        chips: [['Passo 1', 'o'], ['Descrever o Fato', 't'], ['Transparência', '']],
        vig: () => vf('ialert', '1. Identificar a NC', [['Descrever o ocorrido', 'o'], ['Registrar fotos/fatos', 't'], ['Zero omissão', 'bad']], 'bad')
      },
      {
        ic: 'i1',
        t: 'Documentar a Ação a Ser Tomada',
        x: '<b>Passo 2:</b> documentar formalmente a ação corretiva e preventiva a ser adotada. Nenhum material danificado pode ser movimentado sem um plano de ação registrado no sistema.',
        chips: [['Passo 2', 'o'], ['Ação Documentada', 't']],
        vig: () => vf('i1', '2. Documentar Ação', [['Definir ação corretiva', 'o'], ['Responsável e prazo', 't'], ['Registro no sistema', '']], '')
      },
      {
        ic: 'iban',
        t: 'Segregar na Área Específica',
        x: '<b>Passo 3:</b> <b>segregar o material para a área específica do Almoxarifado</b> (quarentena/segregação com bloqueio físico). O material avariado NUNCA pode ficar misturado com o estoque liberado!',
        chips: [['Passo 3', 'o'], ['Área Específica', 'bad'], ['Bloqueio Físico', 't']],
        vig: () => vf('iban', '3. Segregar no Almox', [['Área demarcada', 'bad'], ['Etiqueta vermelha/amarela', 'o'], ['Bloqueio no SAP', 't']], 'bad')
      },
      {
        ic: 'irep',
        t: 'Destinação & Reposição de Quantidade',
        x: '<b>Passos 4 e 5:</b> para compras externas, efetivar devolução ao fornecedor/fabricante; para fabricação interna, descartá-lo adequadamente. Em ambos os casos: <b>repor a quantidade para a produção!</b>',
        chips: [['Passos 4 e 5', 'o'], ['Devolução ou Descarte', 't'], ['Repor Quantidade', '']],
        vig: () => vf('irep', '4 e 5. Destinar & Repor', [['Devolver ao fornecedor', 'o'], ['Descarte interno adequado', ''], ['Repor quantidade imediata', 't']], 'ok')
      }
    ],
    game: {
      type: 'order',
      title: 'Ordene a sequência obrigatória do Item 6.3 para material danificado internamente',
      cards: [
        { t: '1º Identificar a não conformidade (descrever o ocorrido)', a: 0, s: 'Identificar' },
        { t: '2º Documentar a ação a ser tomada', a: 1, s: 'Documentar' },
        { t: '3º Segregar o material para a área específica do Almoxarifado', a: 2, s: 'Segregar' },
        { t: '4º Efetivar devolução ao fornecedor ou descarte adequado', a: 3, s: 'Destinar' },
        { t: '5º Repor a quantidade para não parar a fábrica', a: 4, s: 'Repor' }
      ]
    },
    quiz: [
      {
        q: 'Segundo o item 6.3, qual é o PRIMEIRO passo ao constatar material danificado internamente?',
        o: [
          'Identificar a não conformidade (descrever o ocorrido).',
          'Vender o material para o ferro velho sem avisar a liderança.',
          'Repor o estoque tirando de outra ordem sem comunicar ninguém.'
        ],
        a: 0,
        e: 'O fluxo começa obrigatoriamente por <b>identificar a NC e descrever o ocorrido</b>.'
      },
      {
        q: 'Onde o material com dano interno deve ser colocado enquanto aguarda destinação?',
        o: [
          'Segregado na área específica do Almoxarifado (quarentena).',
          'Misturado na estante normal de peças aprovadas.',
          'Escondido atrás da doca de expedição.'
        ],
        a: 0,
        e: 'O item 6.3 exige <b>segregar o material para a área específica do Almoxarifado</b>.'
      },
      {
        q: 'Para materiais de fabricação interna danificados internamente, qual é a destinação correta?',
        o: [
          'Descartá-lo de maneira adequada e repor a quantidade necessária.',
          'Tentar vender para o cliente externo fingindo ser novo.',
          'Devolver para o fornecedor de matéria-prima cobrando garantia.'
        ],
        a: 0,
        e: 'O PO define: para itens internos, <b>descartar de maneira adequada e repor quantidade</b>.'
      },
      {
        q: 'Qual é o último passo obrigatório comum a todos os casos de dano interno (Item 6.3)?',
        o: [
          'Repor quantidade para garantir que a linha de produção não seja desabastecida.',
          'Cobrar o valor diretamente do salário do operador na folha.',
          'Cancelar o projeto da torre eólica no cliente.'
        ],
        a: 0,
        e: 'O ciclo só se encerra com a <b>reposição da quantidade</b> para assegurar o fluxo fabril.'
      }
    ]
  },

  // -------------------------------------------------------------------------
  // M08 · Propriedades de Clientes e Provedores Externos
  // -------------------------------------------------------------------------
  {
    n: 8,
    short: 'Propriedades de Clientes',
    title: 'Propriedades de <span>Clientes & Terceiros</span>',
    ic: 'ishield',
    badge: 'Salvaguarda de Terceiros',
    gameName: 'Tratamento de Propriedade Externa',
    chips: [['4 cenas', ''], ['Item 6.4', 'o'], ['FRM.SUP-0001', 't']],
    intro: 'Muitos componentes montados na torre (geradores, sensores, inversores ou chapas consignadas) pertencem aos clientes. Cuidar do patrimônio alheio exige rigor contratual absoluto e formulário próprio.',
    scenes: [
      {
        ic: 'ishield',
        t: 'Salvaguarda de Patrimônio Alheio',
        x: '<b>Item 4.7 e 6.4:</b> determinar a forma de proteger e salvaguardar materiais e equipamentos pertencentes a <b>clientes externos ou provedores externos</b> enquanto estiverem sob custódia da TEN.',
        chips: [['Item 4.7', 'o'], ['Custódia Fiel', 't']],
        vig: () => vf('ishield', 'Propriedade de Terceiro', [['Equipamento de cliente', 'o'], ['Material de fornecedor', 't'], ['Custódia e proteção total', '']], 'ok')
      },
      {
        ic: 'i1',
        t: 'O Formulário FRM.SUP-0001',
        x: 'As atividades para manter a preservação dos materiais de clientes estão descritas no <b>FRM.SUP-0001 – Propriedades Pertencentes a Clientes ou Provedores Externos</b>, disponível no SoftExpert.',
        chips: [['FRM.SUP-0001', 'o'], ['SoftExpert', 't']],
        vig: () => vForm('Propriedades de Terceiros', 'FRM.SUP-0001', 'Equipamento Cliente Vestas / Nordex')
      },
      {
        ic: 'ialert',
        t: 'Quando a Propriedade for Perdida ou Danificada',
        x: 'Se a propriedade externa for perdida, danificada ou inadequada para uso: <b>1) Identificar a NC; 2) Documentar a ação; 3) Segregar na área específica; 4) Remeter ocorrência ao cliente externo!</b>',
        chips: [['Item 6.4', 'o'], ['Notificar Cliente', 'bad'], ['Transparência Contratual', 't']],
        vig: () => vf('ialert', 'Ocorrência com Terceiro', [['1. Identificar NC', 'o'], ['2. Documentar', ''], ['3. Segregar no Almox', 'bad'], ['4. Notificar cliente', 't']], 'bad')
      },
      {
        ic: 'ifold',
        t: 'Reter Informação Documentada',
        x: '<b>Passo 5 (Item 6.4): reter informação documentada</b>. Toda a troca de e-mails, fotos, laudos e formulários deve ficar arquivada para respaldar a TEN perante auditorias de qualidade e seguros.',
        chips: [['Reter Informação', 'o'], ['Auditoria ISO', 't']],
        vig: () => vFolder('SoftExpert // Registros Clientes', ['FRM.SUP-0001 Assinado', 'Fotos da ocorrência', 'Notificação ao cliente externo', 'Laudo técnico'])
      }
    ],
    game: {
      type: 'deck',
      title: 'Classifique a exigência para cada tipo de material em estoque',
      buckets: ['Propriedade de Cliente (FRM.SUP-0001)', 'Material Próprio da TEN (Estoque Geral)'],
      cards: [
        { t: 'Inversor fornecido pelo cliente para montagem no tramo inferior', a: 0, s: 'Cliente' },
        { t: 'Chapas estruturais compradas pela TEN diretamente da usina siderúrgica', a: 1, s: 'Próprio' },
        { t: 'Transformador consignado pertencente ao operador do parque eólico', a: 0, s: 'Cliente' },
        { t: 'Parafusos sextavados de fixação adquiridos no distribuidor padrão', a: 1, s: 'Próprio' },
        { t: 'Eletrodo e fluxo de solda comprados via Solicitação de Compras TEN', a: 1, s: 'Próprio' },
        { t: 'Sensor meteorológico enviado pelo cliente com dano constatado na embalagem', a: 0, s: 'Cliente' },
        { t: 'Equipamento de medição de terceiros calibrado para teste de campo', a: 0, s: 'Cliente' },
        { t: 'Lote de tinta poliuretano comprada para o estoque geral da pintura', a: 1, s: 'Próprio' }
      ]
    },
    quiz: [
      {
        q: 'Qual formulário rege as atividades de preservação de propriedades de clientes (Item 6.4)?',
        o: [
          'FRM.SUP-0001 – Propriedades Pertencentes a Clientes ou Provedores Externos.',
          'FRM.FIN-0010 – Reembolso de Despesas de Viagem.',
          'FRM.SEG-0002 – Comunicação de Incidente de Trânsito.'
        ],
        a: 0,
        e: 'O item 6.4 cita expressamente o <b>FRM.SUP-0001</b>.'
      },
      {
        q: 'O que o PO.ALM-0003 exige fazer quando uma propriedade de cliente é danificada ou perdida?',
        o: [
          'Identificar NC, documentar ação, segregar no almoxarifado, remeter ocorrência ao cliente e reter informação.',
          'Comprar uma peça qualquer no mercado local e substituir em segredo.',
          'Aguardar o cliente vir fazer vistoria para ver se ele percebe o defeito.'
        ],
        a: 0,
        e: 'A regra exige <b>identificar, documentar, segregar, remeter ao cliente e reter informação documentada</b>.'
      },
      {
        q: 'Por que é obrigatório "reter informação documentada" sobre ocorrências com clientes (Item 6.4)?',
        o: [
          'Para garantir rastreabilidade, atendimento aos requisitos contratuais e respaldo em auditorias de clientes.',
          'Apenas para ocupar espaço nos servidores de arquivo da TI.',
          'Não é obrigatório, é apenas uma recomendação opcional.'
        ],
        a: 0,
        e: 'A retenção de documentação é requisito mandatório de <b>qualidade ISO e gestão contratual</b>.'
      },
      {
        q: 'Quem tem autoridade de guarda e salvaguarda sobre propriedades de clientes no armazém?',
        o: [
          'O Almoxarifado, conforme item 3.d e 4.7 do procedimento.',
          'Qualquer funcionário que estiver passando pelo portão principal.',
          'Apenas a equipe de vigilância patrimonial terceirizada.'
        ],
        a: 0,
        e: 'O Almoxarifado tem a <b>responsabilidade formal de salvaguardar</b> as propriedades externas.'
      }
    ]
  },

  // -------------------------------------------------------------------------
  // M09 · Desafio Final da Preservação
  // -------------------------------------------------------------------------
  {
    n: 9,
    short: 'Desafio Final',
    title: 'Desafio Final da <span>Preservação</span>',
    ic: 'iaward',
    badge: 'Mestre da Preservação TEN',
    gameName: 'Rodada Mista de Preservação',
    chips: [['Revisão 360°', 'o'], ['8 Perguntas · 15s', 'bad'], ['Certificado', 't']],
    intro: 'Você percorreu todos os pilares do PO.ALM-0003: contaminação, químicos, FIFO/FEFO, empilhamento, 5S, segregação de danos e patrimônio de clientes. Agora prove que domina o padrão de excelência da TEN.',
    qtime: 15,
    scenes: [
      {
        ic: 'iwind',
        t: 'A Cadeia de Valor da Torre',
        x: 'A preservação não é um ato isolado: ela conecta o recebimento na doca, o armazenamento técnico, a rotatividade de químicos e o abastecimento seguro da fabricação até o produto final.',
        chips: [['Revisão Completa', 'o'], ['Visão Sistêmica', 't']],
        vig: () => vf('iwind', 'Cadeia de Preservação', [['Doca & Recebimento', 'o'], ['Almoxarifado & 5S', 't'], ['Fábrica & Solda', ''], ['Torre Conforme no Campo', 'ok']], 'ok')
      },
      {
        ic: 'ishield',
        t: 'Os Documentos Mandatórios',
        x: 'Lembre-se dos formulários-chave: <b>FRM.ALM-0023</b> para validade de tintas, <b>FRM.SUP-0001</b> para patrimônio de clientes e <b>PO.ENG-0001</b> para consumíveis de soldagem, todos no <b>SoftExpert</b>.',
        chips: [['FRM.ALM-0023', 'o'], ['FRM.SUP-0001', 't'], ['SoftExpert', '']],
        vig: () => vForm('Documentos-Chave', 'PO.ALM-0003', 'Validade · Quarentena · Terceiros')
      },
      {
        ic: 'iaward',
        t: 'O Teste Cronometrado',
        x: 'A seguir você enfrentará uma rodada mista de decisão rápida e um <b>quiz final cronometrado com 15 segundos por pergunta</b>. Acertos rápidos garantem a pontuação máxima de XP!',
        chips: [['Atenção Total', 'bad'], ['15 Segundos', 'o'], ['Insígnia de Mestre', 't']],
        vig: () => vf('iaward', 'Desafio Decisivo', [['Rodada Mista', 'o'], ['8 perguntas de 15s', 'bad'], ['Certificado liberado', 'ok']], 'ok')
      }
    ],
    game: {
      type: 'deck',
      title: 'Decisão Rápida: selecione o destino correto para cada situação operacional',
      cards: [
        { t: 'Tinta epóxi com prazo de validade expirado há 3 dias', a: 1, b: ['Dispensar na pintura', 'Segregar no FRM.ALM-0023', 'Usar com solvente extra'], s: 'Químicos' },
        { t: 'Equipamento de medição de cliente externo que caiu do pallet', a: 0, b: ['Segregar e notificar cliente (FRM.SUP-0001)', 'Consertar na bancada sem avisar', 'Descartar na sucata'], s: 'Cliente' },
        { t: 'Novo lote de chapas de aço recém-chegado com laudo aprovado', a: 2, b: ['Colocar na quarentena', 'Jogar na área externa sem identificação', 'Armazenar no endereço com identificação'], s: 'Armazenagem' },
        { t: 'Lote de arames tubulares exposto à chuva na doca descoberta', a: 1, b: ['Enviar para a solda rápido', 'Segregar como NC e acionar PO.ENG-0001', 'Secar com pano e usar'], s: 'Soldagem' },
        { t: 'Dois lotes de selante: Lote 1 vence em 20 dias; Lote 2 vence em 90 dias', a: 0, b: ['Dispensar Lote 1 primeiro (FEFO)', 'Dispensar Lote 2 primeiro', 'Misturar os dois lotes'], s: 'Rotatividade' },
        { t: 'Goteira no telhado do armazém pingando próximo a caixas elétricas', a: 2, b: ['Ignorar pois a água evapora', 'Colocar plástico sobre as caixas e não avisar', 'Proteger material, abrir chamado predial e limpar via 5S'], s: 'Estrutura' },
        { t: 'Flange usinada danificada internamente por colisão da empilhadeira', a: 1, b: ['Esconder o dano e montar na torre', 'Identificar NC, segregar, documentar e repor', 'Enviar ao cliente sem laudo'], s: 'Dano Interno' },
        { t: 'Material em estoque sem etiqueta de identificação ou código', a: 0, b: ['Segregar até identificação correta', 'Inventar um código qualquer', 'Liberar sem etiqueta'], s: 'Identificação' }
      ]
    },
    quiz: [
      {
        q: 'Qual é o documento que orienta o controle de validade de produtos químicos no almoxarifado?',
        o: [
          'FRM.ALM-0023 – Controle de Validade de Produtos.',
          'FRM.SUP-0004 – Mapa de Cotações.',
          'FRM.FIN-0001 – Adiantamento de Fornecedores.'
        ],
        a: 0,
        e: 'O item 6.3 define o <b>FRM.ALM-0023</b> como o controle oficial de validade de produtos.'
      },
      {
        q: 'Qual procedimento da Engenharia rege o recebimento e condicionamento de consumíveis de soldagem?',
        o: [
          'PO.ENG-0001.',
          'PO.SUP-0010.',
          'PO.ALM-9999.'
        ],
        a: 0,
        e: 'O item 6.2 aponta expressamente para o <b>PO.ENG-0001</b>.'
      },
      {
        q: 'O que a regra FEFO determina como critério absoluto de prioridade na saída de materiais?',
        o: [
          'O material com data de validade mais próxima de expirar deve sair primeiro.',
          'O material que chegou primeiro na fábrica sai primeiro, independente da validade.',
          'O material com embalagem mais pesada sai primeiro.'
        ],
        a: 0,
        e: 'FEFO = First Expired, First Out: <b>validade mais próxima sai primeiro</b>.'
      },
      {
        q: 'Diante de um dano interno por manuseio inadequado, qual é a sequência correta?',
        o: [
          'Identificar NC -> Documentar ação -> Segregar no Almox -> Devolver/Descartar -> Repor quantidade.',
          'Repor quantidade -> Descartar sem fotos -> Não registrar nada no sistema.',
          'Entregar ao cliente e esperar que o cliente emita a nota de devolução.'
        ],
        a: 0,
        e: 'O fluxo de 5 passos do item 6.3: <b>Identificar -> Documentar -> Segregar -> Destinar -> Repor</b>.'
      },
      {
        q: 'Qual é o formulário aplicável quando uma propriedade de cliente externo é avariada?',
        o: [
          'FRM.SUP-0001 – Propriedades Pertencentes a Clientes ou Provedores Externos.',
          'FRM.ALM-0014 – Protocolo de Entrega de Materiais no Balcão.',
          'FRM.RH-0002 – Folha de Ponto e Banco de Horas.'
        ],
        a: 0,
        e: 'O item 6.4 determina o uso do <b>FRM.SUP-0001</b> para patrimônio de terceiros.'
      },
      {
        q: 'Onde todos os formulários oficiais (FRMs) vigentes do procedimento devem ser consultados?',
        o: [
          'No sistema SoftExpert (SeSuite).',
          'Em pastas pessoais de computadores de colegas.',
          'Em sites abertos de busca na internet.'
        ],
        a: 0,
        e: 'O item 6.5 especifica que os formulários oficiais estão centralizados no <b>SoftExpert</b>.'
      },
      {
        q: 'O que o item 5 orienta sobre inspeções na estrutura física do almoxarifado?',
        o: [
          'Inspecionar periodicamente para prevenção de infiltrações, pragas e demais riscos.',
          'Inspecionar apenas quando o cliente externo agendar auditoria presencial.',
          'Não inspecionar a estrutura, pois a responsabilidade é unicamente dos bombeiros.'
        ],
        a: 0,
        e: 'O item 5 estabelece <b>inspeções periódicas preventivas contra goteiras e pragas</b>.'
      },
      {
        q: 'Qual é a responsabilidade da Área Solicitante segundo o PO.ALM-0003?',
        o: [
          'Manusear, armazenar e proteger contra danos, e garantir cuidados no transporte do produto final.',
          'Alterar as especificações de engenharia dos componentes sem aprovação.',
          'Receber caminhões de terceiros diretamente na linha sem passar pela doca.'
        ],
        a: 0,
        e: 'A área solicitante é <b>corresponsável pela proteção e cuidados com o produto final</b>.'
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
  code: 'PO.ALM-0003',
  rev: '03',
  name: 'Preservação de Materiais',
  hero: 'Preservação de <span>Materiais</span>',
  hud: 'Preservação de Materiais',
  key: 'trilha-alm0003-v1',
  origem: 'trilha-alm0003',
  title:'Trilha PO.ALM-0003',
  levels: [
    [0, 'Novato do Almoxarifado'],
    [400, 'Guardião do 5S'],
    [1100, 'Controlador de Validade'],
    [2000, 'Especialista em Quarentena'],
    [3200, 'Inspetor de Preservação'],
    [4400, 'Mestre da Integridade TEN']
  ],
  guide: (t) => `
    <div class="gcard">
      <h3>${ic('ishield')}Objetivo & Responsabilidades</h3>
      ${t(
        ['Área', 'Papel no PO.ALM-0003'],
        [
          ['Almoxarifado', 'Identificar, verificar, proteger, salvaguardar materiais e controlar propriedades de clientes externos.'],
          ['Área Solicitante', 'Manusear e armazenar contra danos, seguir procedimentos e cuidar do transporte do produto final.'],
          ['Ambos', 'Cumprir as regras de preservação para assegurar a conformidade com os requisitos do cliente da torre.']
        ]
      )}
    </div>

    <div class="gcard">
      <h3>${ic('idrop')}Controle de Contaminação & Validade</h3>
      ${t(
        ['Material Crítico', 'Risco Principal', 'Controle Obrigatório'],
        [
          ['Tintas Industriais', 'Perda de validade e descolamento', 'FRM.ALM-0023 (Controle de Validade) no SoftExpert'],
          ['Arames de Solda', 'Oxidação e ferrugem por umidade', 'Embalagens seladas com dessecante / PO.ENG-0001'],
          ['Fluxos de Solda', 'Absorção de umidade (trincas)', 'Armazenamento seco e estufas térmicas / PO.ENG-0001'],
          ['Granalhas de Aço', 'Oxidação e contaminação cruzada', 'Big-bags intactos e protegidos de intempéries']
        ]
      )}
    </div>

    <div class="gcard">
      <h3>${ic('iflow')}Rotatividade: FIFO vs FEFO</h3>
      ${t(
        ['Critério', 'Significado', 'Aplicação Prática'],
        [
          ['FIFO', 'First In, First Out', 'Peças e insumos sem validade química (parafusos, chapas, perfis, flanges).'],
          ['FEFO', 'First Expired, First Out', 'Obrigatório para tintas, vernizes, catalisadores e químicos com validade controlada.'],
          ['Regra Chave', 'Validade prevalece', 'Mesmo que um lote novo tenha entrado ontem, se vence antes, sai primeiro!']
        ]
      )}
    </div>

    <div class="gcard">
      <h3>${ic('ialert')}Fluxo de Não Conformidade por Dano Interno</h3>
      ${t(
        ['Passo', 'Ação Obrigatória (Item 6.3)'],
        [
          ['1. Identificar', 'Identificar a não conformidade e descrever detalhadamente o ocorrido.'],
          ['2. Documentar', 'Documentar formalmente a ação corretiva a ser tomada.'],
          ['3. Segregar', 'Segregar o material para a área específica do Almoxarifado (quarentena física).'],
          ['4. Destinar', 'Efetivar devolução ao fornecedor/fabricante ou descarte adequado se fabricação interna.'],
          ['5. Repor', 'Repor imediatamente a quantidade necessária para garantir o suprimento da fábrica.']
        ]
      )}
    </div>

    <div class="gcard">
      <h3>${ic('i1')}Propriedades de Clientes e Provedores Externos</h3>
      ${t(
        ['Etapa', 'Diretriz do Item 6.4'],
        [
          ['Salvaguarda', 'Proteger e manter custódia fiel sob o FRM.SUP-0001 (SoftExpert).'],
          ['Em caso de avaria/perda', 'Identificar NC, documentar, segregar no almox e remeter ocorrência ao cliente externo.'],
          ['Retenção documental', 'Reter informação documentada completa para respaldo contratual e auditorias.']
        ]
      )}
    </div>

    <div class="gcard">
      <h3>${ic('ifold')}Formulários & Procedimentos Vinculados</h3>
      ${t(
        ['Código', 'Título', 'Onde Acessar'],
        [
          ['FRM.ALM-0023', 'Controle de Validade de Produtos', 'Sistema SoftExpert (SeSuite)'],
          ['FRM.SUP-0001', 'Propriedades Pertencentes a Clientes ou Provedores Externos', 'Sistema SoftExpert (SeSuite)'],
          ['PO.ENG-0001', 'Recebimento e Condicionamento de Consumíveis de Soldagem', 'Engenharia / SoftExpert'],
          ['PO.ALM-0003', 'Preservação de Materiais (Rev. 03)', 'Almoxarifado TEN / SoftExpert']
        ]
      )}
    </div>
  `
};
