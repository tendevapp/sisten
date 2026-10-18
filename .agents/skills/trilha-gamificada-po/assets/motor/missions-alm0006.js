/* ================= Trilha PO.ALM-0006: Procedimento Operacional e Sistêmico Chapas =================
   Procedimento Operacional · Rev. 00 · 31/10/2022
   Emissor: Ana Paula De Araujo Nascimento · Aprovador: Fabio da Silva Muricy
   Foco: Recebimento físico de chapas de aço, destinação aos pátios (Pátio A com Ponte Rolante
         ou Pátio B com Pórtico Mag 75 Ton), inspeção da Qualidade e RNC, mapeamento de tramos e virolas,
         lançamento nas planilhas de controle, protocolo fiscal com a Controladoria e arquivo por data ascendente. */

const M = [
  // -------------------------------------------------------------------------
  // M01 · O Coração da Torre
  // -------------------------------------------------------------------------
  {
    n: 1,
    short: 'O Coração da Torre',
    title: 'Por que o Recebimento de Chapas Existe? O <span>Coração de Aço</span>',
    ic: 'wh',
    badge: 'Guardião do Aço TEN',
    gameName: 'O Papel do Aço na TEN',
    chips: [['4 cenas', ''], ['Aço Estrutural', 'o'], ['≈ 4 min', 't']],
    intro: 'As chapas de aço são a espinha dorsal de cada torre eólica fabricada na TEN. Conheça o propósito do PO.ALM-0006 e o alinhamento comercial quadripartite que inicia cada projeto.',
    scenes: [
      {
        ic: 'wh',
        t: 'Objetivo do Procedimento (Item 1)',
        x: 'O <b>PO.ALM-0006</b> assegura o recebimento efetivo de todas as chapas adquiridas pela TEN ou enviadas por clientes, garantindo a conformidade física e documental negociada.',
        chips: [['Item 1', 'o'], ['Conformidade Total', 't']],
        vig: () => vf('C', 'Recebimento de Chapas', [['Objetivo', 'Assegurar Aço Conforme'], ['Negociação', 'Comercial X Cliente X Fornecedor']], 'ok', [['Escopo', '100% das Chapas']])
      },
      {
        ic: 'sap',
        t: 'Alinhamento Quadripartite',
        x: 'Cada compra nasce do fechamento entre <b>Comercial TEN, Cliente, Fornecedor/Fabricante da usina e Almoxarifado</b>, definindo especificações e cronogramas de entrega.',
        chips: [['Contrato', 'o'], ['Alinhamento Prévio', '']],
        vig: () => vIcons([['sap', 'Comercial TEN'], ['wh', 'Cliente Parque'], ['truck', 'Fornecedor Usina'], ['folder', 'Almoxarifado']])
      },
      {
        ic: 'road',
        t: 'A Matéria-Prima Vital',
        x: 'Cada torre eólica consome <b>centenas de toneladas de aço</b> divididas em dezenas de chapas pesadas. Uma divergência na espessura ou defeito físico compromete toda a seção da torre.',
        chips: [['Centenas de Toneladas', 'o'], ['Aço de Alta Resistência', 'bad']],
        k: 1731,
        kl: 'chapas em Seridó I',
        vig: () => vLanes([['Espessura', 'Conformidade Nominal', 100, 'var(--s-teal)', '#fff', '1s'], ['Qualidade', 'Zero Trincas e Oxidação', 100, 'var(--s-orange)', '#fff', '1.2s']])
      },
      {
        ic: 'folder',
        t: 'Papel do Almoxarifado (Item 4)',
        x: 'O Almoxarifado é responsável por <b>receber, destinar aos pátios corretos, reter documentação e manter as planilhas de controle rigorosamente atualizadas</b>.',
        chips: [['Item 4', 'o'], ['Custódia e Gestão', 't']],
        vig: () => vChecklist('Atribuições do Almoxarifado', ['Receber carretas de chapas', 'Destinar a Pátio A ou Pátio B', 'Acionar inspeção da Qualidade', 'Alimentar planilhas de projetos', 'Arquivar dossiê documental'], -1, 'Fluxo Completo', 'Atribuições')
      }
    ],
    game: {
      type: 'deck',
      title: 'Classifique as práticas no recebimento inicial de chapas de aço',
      buckets: ['Conduta Correta e Regulamentar', 'Conduta Incorreta / Risco Crítico'],
      cards: [
        { t: 'Assegurar o recebimento efetivo de todas as chapas adquiridas ou de clientes', a: 0, s: 'Correto' },
        { t: 'Descarregar qualquer chapa no pátio sem conferir a qual projeto pertence', a: 1, s: 'Incorreto' },
        { t: 'Seguir o acordo Comercial TEN x Cliente x Fornecedor no fechamento do pedido', a: 0, s: 'Correto' },
        { t: 'Reter a informação documentada e alimentar as planilhas de controle de chapas', a: 0, s: 'Correto' },
        { t: 'Dispensar a inspeção física da chapa se o motorista estiver com pressa', a: 1, s: 'Incorreto' },
        { t: 'Garantir que a chapa recebida atenda rigorosamente ao projeto da torre eólica', a: 0, s: 'Correto' }
      ]
    },
    quiz: [
      {
        q: 'Qual é o principal objetivo estabelecido no item 1 do PO.ALM-0006?',
        o: [
          'Assegurar o recebimento efetivo de todas as chapas adquiridas ou enviadas por clientes conforme negociado.',
          'Vender sobras de chapas de aço para sucata sem registro fiscal na fábrica.',
          'Pintar as chapas no pátio antes de qualquer conferência da qualidade.',
          'Substituir o aço estrutural por perfis de alumínio sem cálculo estrutural.'
        ],
        a: 0,
        e: 'O item 1 visa <b>assegurar o recebimento efetivo de todas as chapas</b> adquiridas ou enviadas por clientes conforme negociado.'
      },
      {
        q: 'Quem participa do alinhamento inicial no fechamento do pedido de torres?',
        o: [
          'Comercial TEN, Cliente e Fornecedor/Fabricante no fechamento do Pedido de Torres.',
          'Apenas a transportadora e a portaria da fábrica.',
          'Apenas o motorista autônomo da carreta.',
          'Somente o operador de pórtico do pátio.'
        ],
        a: 0,
        e: 'O alinhamento é negociado inicialmente entre <b>Comercial TEN X Cliente X Fornecedor/Fabricante</b> no fechamento do pedido.'
      },
      {
        q: 'Qual é o setor diretamente responsável por receber as chapas e destiná-las aos pátios?',
        o: [
          'Almoxarifado.',
          'Recursos Humanos.',
          'Segurança Patrimonial apenas.',
          'Contabilidade externa terceirizada.'
        ],
        a: 0,
        e: 'Conforme item 4, o <b>Almoxarifado</b> é responsável por receber, destinar aos pátios e reter a informação documentada.'
      },
      {
        q: 'Por que a integridade física e dimensional da chapa de aço é tão crítica na TEN?',
        o: [
          'Porque cada chapa forma as virolas estruturais que sustentam torres de mais de 100 metros de altura.',
          'Porque a chapa é apenas um item decorativo de fechamento.',
          'Porque a chapa não tem nenhuma função mecânica ou estrutural.',
          'Porque as chapas são descartadas logo após o recebimento no pátio.'
        ],
        a: 0,
        e: 'As chapas compõem as <b>virolas dos tramos estruturais</b> da torre eólica, suportando esforços eólicos e dinâmicos imensos.'
      }
    ]
  },

  // -------------------------------------------------------------------------
  // M02 · Chegada na Portaria & Rádio
  // -------------------------------------------------------------------------
  {
    n: 2,
    short: 'Portaria & Rádio',
    title: 'Chegada na Portaria & <span>Comunicação via Rádio</span>',
    ic: 'road',
    badge: 'Sentinela da Portaria',
    gameName: 'Protocolo Portaria x Almoxarifado',
    chips: [['4 cenas', ''], ['Check-in', 'o'], ['Rádio Comunicador', 't']],
    intro: 'A esteira de recebimento começa no portão da fábrica. Entenda o papel da Portaria no check-in da carreta e o aviso imediato ao Almoxarifado.',
    scenes: [
      {
        ic: 'truck',
        t: 'Chegada da Carreta Prancha',
        x: 'As carretas com chapas de aço chegam à Portaria da TEN. O porteiro realiza o <b>check-in do motorista</b> e solicita toda a documentação pessoal e do veículo.',
        chips: [['Check-in Inicial', 'o'], ['Controle de Acesso', '']],
        vig: () => vRoad(['Chegada na Portaria', 'Check-in Motorista', 'Acesso à Fábrica'])
      },
      {
        ic: 'form',
        t: 'Conferência Documental Prévia',
        x: 'A Portaria solicita e confere as <b>Notas Fiscais da Mercadoria (DANFE)</b> que acompanham o carregamento de chapas pesadas.',
        chips: [['DANFE de Chapas', 'o'], ['Conferência Física', 't']],
        vig: () => vForm('Portaria TEN', 'DOC-TRANS', 'Notas Fiscais & Documentos do Motorista')
      },
      {
        ic: 'wh',
        t: 'Aviso Imediato via Rádio',
        x: 'A Portaria <b>informa via rádio para o Almoxarifado</b> sobre a chegada da carreta e da mercadoria, garantindo prontidão da equipe de descarregamento.',
        chips: [['Comunicação Ágil', 'o'], ['Aviso via Rádio', 'ok']],
        vig: () => vf('R', 'Rádio Portaria > Almox', [['Canal', 'Almoxarifado'], ['Mensagem', 'Carreta de Chapas no Portão']], 'ok', [['Ação', 'Almoxarifado em Prontidão']])
      },
      {
        ic: 'check',
        t: 'Acesso e Pesagem',
        x: 'Após liberação da Portaria e confirmação pelo Almoxarifado, a carreta é direcionada para a <b>balança rodoviária</b> e segue para os pátios de descarregamento.',
        chips: [['Pesagem Bruta', 'o'], ['Encaminhamento', '']],
        vig: () => vSend('Carreta liberada da portaria para o Almoxarifado')
      }
    ],
    game: {
      type: 'order',
      title: 'Ordene a sequência exata de entrada e comunicação na Portaria (Anexo 1)'
    },
    quiz: [
      {
        q: 'O que a Portaria faz imediatamente após receber o motorista com as chapas?',
        o: [
          'Faz check-in, confere documentação pessoal/NFs e avisa o Almoxarifado via rádio.',
          'Manda o motorista descarregar sozinho sem autorização de ninguém.',
          'Guarda as notas fiscais na gaveta sem avisar a equipe do pátio.',
          'Envia a carreta de volta para a usina imediatamente.'
        ],
        a: 0,
        e: 'Conforme fluxograma, a Portaria faz <b>check-in, solicita documentos pessoais e NFs, e informa via rádio ao Almoxarifado</b>.'
      },
      {
        q: 'Qual meio de comunicação a Portaria utiliza para notificar o Almoxarifado?',
        o: [
          'Rádio comunicador.',
          'Carta registrada com aviso de recebimento.',
          'Aviso sonoro geral da cidade.',
          'Nenhum aviso formal é realizado.'
        ],
        a: 0,
        e: 'O fluxograma prescreve expressamente: <b>"Informa via Rádio para o Almoxarifado sobre a chegada da Carreta e Mercadoria"</b>.'
      },
      {
        q: 'Quais documentos fiscais a Portaria solicita do motorista na chegada?',
        o: [
          'Notas Fiscais da Mercadoria (DANFE de chapas).',
          'Apenas comprovante de pedágio rodoviário.',
          'Contrato de aluguel residencial do motorista.',
          'Certificado de reservista militar.'
        ],
        a: 0,
        e: 'A Portaria solicita a <b>documentação pessoal e as Notas Fiscais da mercadoria</b> transportada.'
      },
      {
        q: 'Por que a comunicação imediata via rádio entre Portaria e Almoxarifado é importante?',
        o: [
          'Para preparar a equipe de pátio, operadores e Qualidade antes do posicionamento da carreta.',
          'Apenas para testar se os rádios portáteis estão com bateria.',
          'Para registrar o motorista no refeitório da fábrica.',
          'Não tem nenhuma utilidade prática no fluxo operacional.'
        ],
        a: 0,
        e: 'O aviso via rádio dá <b>agilidade ao pátio para coordenar ponte, pórtico e os inspetores da qualidade</b>.'
      }
    ]
  },

  // -------------------------------------------------------------------------
  // M03 · Pátio A ou Pátio B?
  // -------------------------------------------------------------------------
  {
    n: 3,
    short: 'Pátio A ou B?',
    title: 'A Decisão dos Pátios: <span>Pátio A ou Pátio B?</span>',
    ic: 'wh',
    badge: 'Estrategista de Pátio',
    gameName: 'Triagem de Pátios: Pátio A ou B?',
    chips: [['4 cenas', ''], ['Ponte Rolante', 'o'], ['Pórtico 75 Ton', 't']],
    intro: 'Qual pátio recebe a carreta? Descubra o fator determinante que direciona as chapas para o Pátio A (Ponte Rolante) ou Pátio B (Pórtico Mag 75 Ton).',
    scenes: [
      {
        ic: 'wh',
        t: 'O Fator Determinante (Item 2 e Fluxo)',
        x: 'O Almoxarifado se certifica de qual <b>projeto corresponde a chapa</b>. O fator determinante para a escolha do pátio é se o projeto <b>está ou não em linha de fabricação</b>.',
        chips: [['Item 2 e Fluxo', 'o'], ['Status do Projeto', 't']],
        vig: () => vf('P', 'Fator de Pátio', [['Projeto em Linha', 'Pátio A (Ponte)'], ['Fora de Linha', 'Pátio B (Pórtico)']], 'ok', [['Regra', 'Destinação Obrigatória']])
      },
      {
        ic: 'sap',
        t: 'Pátio A · Ponte Rolante',
        x: 'Local onde se descarregam chapas para <b>alimentar a produção e linhas de fabricação</b>. Descarregamento realizado com <b>Ponte Rolante</b> operada por <b>Pontoneiro</b>.',
        chips: [['Projetos em Linha', 'o'], ['Ponte Rolante', 'ok'], ['Pontoneiro', '']],
        vig: () => vf('A', 'Pátio A · Galpão', [['Equipamento', 'Ponte Rolante'], ['Operador', 'Pontoneiro'], ['Destino', 'Alimentar Produção']], 'ok', [['Local', 'Galpão Principal']])
      },
      {
        ic: 'truck',
        t: 'Pátio B · Pórtico Mag 75 Ton',
        x: 'Pátio secundário para descarregar chapas de <b>projetos que não entraram em linha ainda</b>. Operação com o equipamento <b>Pórtico Mag 75 Ton</b> via <b>Operador de Pórtico</b>.',
        chips: [['Fora de Linha', 'o'], ['Pórtico Mag 75 Ton', 't'], ['Operador Pórtico', '']],
        vig: () => vf('B', 'Pátio B · Externo', [['Equipamento', 'Pórtico Mag 75 Ton'], ['Operador', 'Operador de Pórtico'], ['Destino', 'Projetos Futuros']], 'o', [['Local', 'Área Secundária']])
      },
      {
        ic: 'folder',
        t: 'Por que o Pátio B foi Criado? (Item 3)',
        x: 'Na projeção original das instalações da TEN, a área de chapas <b>ficou deficiente diante de novas demandas</b>. O Pátio B foi criado para garantir o recebimento efetivo sem gargalos.',
        chips: [['Item 3', 'o'], ['Capacidade Fabril', 't']],
        vig: () => vLanes([['Pátio A', 'Capacidade Original', 60, 'var(--s-teal)', '#fff', '1s'], ['Demanda TEN', 'Novos Parques Eólicos', 100, 'var(--s-orange)', '#fff', '1.2s']])
      }
    ],
    game: {
      type: 'deck',
      title: 'Destine cada cenário ao Pátio A (Ponte) ou Pátio B (Pórtico Mag 75T)',
      buckets: ['Pátio A · Ponte Rolante (Em Linha)', 'Pátio B · Pórtico 75T (Fora de Linha)'],
      cards: [
        { t: 'Projeto Seridó I já está sendo cortado na linha de produção hoje', a: 0, s: 'Pátio A' },
        { t: 'Projeto novo que iniciará fabricação apenas no próximo semestre', a: 1, s: 'Pátio B' },
        { t: 'Descarregamento realizado por Ponte Rolante via operador Pontoneiro', a: 0, s: 'Pátio A' },
        { t: 'Descarregamento com equipamento Pórtico Mag 75 Ton via Operador de Pórtico', a: 1, s: 'Pátio B' },
        { t: 'Chapas para alimentação imediata das linhas de corte e calandragem', a: 0, s: 'Pátio A' },
        { t: 'Estoque temporário de estruturais aguardando a entrada do projeto em linha', a: 1, s: 'Pátio B' }
      ]
    },
    quiz: [
      {
        q: 'Qual é o fator que determina se a chapa vai para o Pátio A ou Pátio B?',
        o: [
          'Se o projeto ao qual a chapa pertence já está ou não na linha de fabricação.',
          'A cor do caminhão que fez o transporte rodoviário.',
          'O valor do frete pago à transportadora.',
          'A hora do dia em que a carreta chegou na guarita.'
        ],
        a: 0,
        e: 'Conforme fluxograma: o fator que determina o local é o <b>tipo de projeto que estiver na linha de fabricação</b>.'
      },
      {
        q: 'Qual equipamento e operador realizam o descarregamento no Pátio A?',
        o: [
          'Ponte Rolante operada por Pontoneiro.',
          'Pórtico Mag 75 Ton operado por Operador de Pórtico.',
          'Empilhadeira manual de 1 tonelada sem cabine.',
          'Guincho de esteira de terceiros não autorizado.'
        ],
        a: 0,
        e: 'No Pátio A, o descarregamento é realizado com <b>Ponte Rolante via operador Pontoneiro</b>.'
      },
      {
        q: 'Para que finalidade foi criado o Pátio B na fábrica da TEN?',
        o: [
          'Como pátio secundário com Pórtico Mag 75 Ton para projetos que ainda não entraram em linha.',
          'Para estacionamento exclusivo de veículos leves da diretoria.',
          'Para descarte de sucatas contaminadas sem controle.',
          'Para armazenar apenas tintas e solventes inflamáveis.'
        ],
        a: 0,
        e: 'O Pátio B armazena <b>chapas de projetos que não entraram em linha ainda</b>, operado por Pórtico Mag 75 Ton.'
      },
      {
        q: 'Por que o Pátio B foi necessário na evolução da TEN?',
        o: [
          'Porque a projeção inicial ficou deficiente de espaço diante de novas demandas de torres eólicas.',
          'Porque a TEN não queria mais usar o galpão principal.',
          'Porque a ponte rolante foi permanentemente desativada.',
          'Para substituir todas as linhas de calandragem da fábrica.'
        ],
        a: 0,
        e: 'O item 3 relata que o pátio inicial <b>ficou deficiente de espaço mediante novas demandas</b>, criando-se o pátio secundário.'
      }
    ]
  },

  // -------------------------------------------------------------------------
  // M04 · Qualidade & RNC
  // -------------------------------------------------------------------------
  {
    n: 4,
    short: 'Qualidade & RNC',
    title: 'Inspeção da Qualidade: <span>Aprovado ou Reprovado?</span>',
    ic: 'check',
    badge: 'Inspetor da Qualidade',
    gameName: 'Fluxo de Inspeção da Qualidade',
    chips: [['4 cenas', ''], ['Inspeção Técnica', 'o'], ['RNC e Bloqueio', 'bad']],
    intro: 'Nenhuma chapa é descarregada sem o crivo da Qualidade. Conheça as verificações técnicas, a conferência do certificado da usina e o tratamento de reprovações.',
    scenes: [
      {
        ic: 'check',
        t: 'Acionamento da Qualidade',
        x: 'Assim que o Almoxarifado identifica o projeto e pátio, <b>aciona imediatamente a equipe de Controle de Qualidade</b> para comparecer ao local de descarregamento.',
        chips: [['Fluxograma', 'o'], ['Chamado Imediato', 't']],
        vig: () => vf('Q', 'Qualidade Acionada', [['Almoxarifado', 'Aciona Inspetor'], ['Objetivo', 'Inspeção e Validação Técnica']], 'ok', [['Status', 'Carreta no Pátio']])
      },
      {
        ic: 'form',
        t: 'Vistoria Física & Certificado',
        x: 'A Qualidade <b>inspeciona as chapas</b> (dimensões, espessura, oxidação, empeno) e valida as <b>documentações técnicas</b> (Certificados de Matéria-Prima e Testes da usina).',
        chips: [['Certificado da Usina', 'o'], ['Inspeção Dimensional', 'ok']],
        vig: () => vChecklist('Checklist da Qualidade', ['Espessura nominal e tolerância', 'Planicidade e ausência de empeno', 'Superfície sem trincas ou carepa', 'Certificado com corrida e tração', 'Conferência com DANFE'], -1, 'Tudo Conforme', 'Checklist')
      },
      {
        ic: 'bad',
        t: 'Se Reprovado · Abertura de RNC',
        x: 'Se houver inconformidade, a Qualidade <b>evidencia às áreas, abre RNC</b> e aguarda o fornecedor coletar o material ou regularizar as documentações fiscais/técnicas.',
        chips: [['Fluxo Reprovado', 'bad'], ['Abertura de RNC', 'bad'], ['Bloqueio Físico', 'o']],
        vig: () => vf('X', 'Chapas Reprovadas', [['Status', 'RNC Aberta'], ['Ação', 'Isolamento no Pátio'], ['Destino', 'Devolução ou Regularização']], 'bad', [['Notificação', 'Por E-mail']])
      },
      {
        ic: 'check',
        t: 'Se Aprovado · Entrega ao Almox',
        x: 'Sendo o material <b>aprovado</b>, a Qualidade retém cópias de informações documentadas e <b>entrega o certificado e a DANFE original para o Almoxarifado</b> prosseguir.',
        chips: [['Fluxo Aprovado', 'ok'], ['Liberação Física', 't']],
        vig: () => vAppr('DANFE & CERTIFICADO', 'APROV-QUAL', 'APROVADO', 'Inspetor Qualidade', 'check', false)
      }
    ],
    game: {
      type: 'order',
      title: 'Ordene as etapas do processo de inspeção e liberação pela Qualidade'
    },
    quiz: [
      {
        q: 'O que a Qualidade faz se a chapa inspecionada for REPROVADA no recebimento?',
        o: [
          'Evidencia para as áreas, abre RNC e aguarda fornecedor coletar ou regularizar documentação.',
          'Descarrega na linha de corte sem avisar nenhuma área da fábrica.',
          'Rasga as notas fiscais e incinera as chapas de aço.',
          'Muda a espessura na caneta para aprovar sem novos testes.'
        ],
        a: 0,
        e: 'Conforme fluxograma: <b>evidencia para as áreas, abre RNC e aguarda fornecedor coletar mercadoria ou regularizar</b>.'
      },
      {
        q: 'O que a Qualidade entrega ao Almoxarifado quando o material é APROVADO?',
        o: [
          'Entrega o certificado de matéria-prima e a DANFE original após reter cópias documentadas.',
          'Apenas um rascunho de papel de pão sem assinatura.',
          'Nenhum documento físico ou eletrônico.',
          'Somente o comprovante de pedágio do motorista.'
        ],
        a: 0,
        e: 'No fluxo de aprovado: <b>retém cópias documentadas, entrega certificado e DANFE original para o Almoxarifado</b>.'
      },
      {
        q: 'Quais parâmetros técnicos essenciais são verificados no Certificado de Matéria-Prima da chapa?',
        o: [
          'Composição química, limite de escoamento/tração e número da corrida da usina.',
          'Apenas a marca dos pneus do caminhão da transportadora.',
          'O nome da rua onde a fábrica fica localizada.',
          'A cor da lona de proteção da carroceria.'
        ],
        a: 0,
        e: 'O certificado garante que o aço possui as <b>propriedades metalúrgicas exigidas pelo projeto da torre</b>.'
      },
      {
        q: 'Como a reprovação de chapas e a abertura de RNC são comunicadas formalmente?',
        o: [
          'Evidenciadas para as áreas envolvidas e documentadas formalmente por e-mail.',
          'Apenas por conversa informal de corredor sem registro.',
          'Pelo quadro de recados do refeitório da fábrica.',
          'Nunca são comunicadas a nenhuma área.'
        ],
        a: 0,
        e: 'O fluxograma determina: <b>"Evidencia para as áreas, abre RNC... informações documentadas por e-mail"</b>.'
      }
    ]
  },

  // -------------------------------------------------------------------------
  // M05 · Descarregamento Seguro
  // -------------------------------------------------------------------------
  {
    n: 5,
    short: 'Descarregamento Seguro',
    title: 'Descarregamento Seguro & <span>Operação de Carga Pesada</span>',
    ic: 'wh',
    badge: 'Operador de Carga Pesada',
    gameName: 'Boas Práticas de Movimentação e Estocagem',
    chips: [['4 cenas', ''], ['Içamento Pesado', 'o'], ['Rigging e Caibros', 't']],
    intro: 'Chapas pesadas exigem regras severas de içamento e estocagem. Saiba como evitar acidentes, danos por empenamento e falhas de manuseio.',
    scenes: [
      {
        ic: 'wh',
        t: 'Descarregamento nos Pátios',
        x: 'Com a liberação técnica da Qualidade, o Almoxarifado realiza o <b>descarregamento seguro das chapas no Pátio correspondente</b> (Ponte no Pátio A ou Pórtico no Pátio B).',
        chips: [['Descarga Efetiva', 'o'], ['Segurança Operacional', 'ok']],
        vig: () => vWH('Chapas descarregadas com sucesso no pátio!')
      },
      {
        ic: 'truck',
        t: 'Acessórios e Garras Magnéticas',
        x: 'O Pórtico Mag 75 Ton utiliza <b>garras magnéticas de alta potência</b>, enquanto a Ponte utiliza garras, pinças ou cintas homologadas. É proibido improvisar ganchos sem trava.',
        chips: [['Pórtico Mag', 'o'], ['Içamento Homologado', 't']],
        vig: () => vf('M', 'Içamento Mag 75T', [['Capacidade', '75 Toneladas'], ['Acessório', 'Garras Magnéticas'], ['Segurança', 'Zona de Exclusão']], 'ok', [['Trava', 'Homologada']])
      },
      {
        ic: 'folder',
        t: 'Calçamento com Caibros de Madeira',
        x: 'As chapas são estocadas com <b>caibros de madeira alinhados verticalmente</b> entre as camadas. Isso evita empenamento permanente do aço e garante o engate seguro dos acessórios.',
        chips: [['Caibros Alinhados', 'o'], ['Anti-Empenamento', 'ok']],
        vig: () => vLanes([['Camada 1', 'Caibros Alinhados', 100, 'var(--s-teal)', '#fff', '0.8s'], ['Camada 2', 'Alinhamento Vertical', 100, 'var(--s-teal)', '#fff', '1s'], ['Camada 3', 'Estabilidade Máxima', 100, 'var(--s-teal)', '#fff', '1.2s']])
      },
      {
        ic: 'check',
        t: 'Organização por Projeto e Virola',
        x: 'O armazenamento nos pátios deve respeitar rigorosamente a <b>segregação por projeto e virolas</b>, evitando retrabalho de movimentação quando a linha de corte for alimentada.',
        chips: [['Endereçamento', 'o'], ['Logística Eficiente', 't']],
        vig: () => vChecklist('Padrão do Pátio', ['Isolamento da área de manobra', 'Inspeção prévia dos acessórios de içamento', 'Caibros nivelados e secos', 'Identificação visível de cada chapa', 'Respeito ao limite de altura de pilha'], -1, 'Pátio 100% Organizado', 'Regras')
      }
    ],
    game: {
      type: 'deck',
      title: 'Classifique as práticas de içamento e estocagem pesada de chapas',
      buckets: ['Prática Segura e Obrigatória', 'Risco Crítico / Prática Proibida'],
      cards: [
        { t: 'Alinhar verticalmente os caibros de madeira entre as camadas de chapas', a: 0, s: 'Seguro' },
        { t: 'Ficar posicionado embaixo da chapa suspensa durante o içamento', a: 1, s: 'Proibido' },
        { t: 'Utilizar equipamentos com capacidade nominal superior ao peso da carga', a: 0, s: 'Seguro' },
        { t: 'Empilhar chapas com caibros desalinhados, provocando empenamento do aço', a: 1, s: 'Proibido' },
        { t: 'Isolar a área de raio de giro da ponte rolante ou do pórtico Mag 75T', a: 0, s: 'Seguro' },
        { t: 'Misturar chapas de projetos diferentes na mesma pilha sem identificação', a: 1, s: 'Proibido' }
      ]
    },
    quiz: [
      {
        q: 'Por que os caibros de madeira devem ser alinhados verticalmente entre as camadas de chapas?',
        o: [
          'Para transferir o peso diretamente ao solo sem empenar ou deformar as chapas de aço.',
          'Apenas por motivo estético de pintura das peças.',
          'Para fazer as chapas deslizarem mais rápido no piso.',
          'Não há necessidade de colocar caibros de madeira entre as chapas.'
        ],
        a: 0,
        e: 'O alinhamento vertical dos caibros <b>evita tensões flexionais que causam deformação permanente</b> nas chapas pesadas.'
      },
      {
        q: 'Qual é o equipamento de grande porte utilizado para descarga pesada no Pátio B?',
        o: [
          'Pórtico Mag de 75 Toneladas.',
          'Guindaste manual de oficina de 500 kg.',
          'Empilhadeira retrátil de corredor estreito.',
          'Caminhão betoneira da obra civil.'
        ],
        a: 0,
        e: 'O item 2 define: <b>Pátio B descarregamento realizado com o equipamento Pórtico Mag 75 Ton</b>.'
      },
      {
        q: 'O que é terminantemente proibido durante a movimentação de chapas com ponte ou pórtico?',
        o: [
          'Permanecer ou transitar sob a carga suspensa no raio de manobra.',
          'Utilizar protetor auricular e capacete de segurança.',
          'Checar a capacidade nominal do equipamento de elevação.',
          'Manter os operadores em comunicação constante.'
        ],
        a: 0,
        e: 'Permanecer sob carga suspensa é um <b>risco gravíssimo de acidente fatal</b> na movimentação de materiais pesados.'
      },
      {
        q: 'Qual é a vantagem de armazenar as chapas segregadas por projeto e virola no pátio?',
        o: [
          'Agilidade na alimentação da produção sem necessidade de remanejar pilhas inteiras.',
          'Apenas ocupar mais espaço no chão da fábrica.',
          'Dificultar a contagem de inventário físico.',
          'Aumentar o tempo de movimentação dos operadores.'
        ],
        a: 0,
        e: 'A segregação correta <b>evita remanejamentos desnecessários e agiliza o abastecimento contínuo do corte</b>.'
      }
    ]
  },

  // -------------------------------------------------------------------------
  // M06 · Mapeamento de Tramos, Virolas & Pátio
  // -------------------------------------------------------------------------
  {
    n: 6,
    short: 'Tramos & Virolas',
    title: 'Mapeamento de Tramos, <span>Virolas & Pátio</span>',
    ic: 'sap',
    badge: 'Mestre das Virolas',
    gameName: 'Da Chapa Bruta à Montagem dos Tramos',
    chips: [['4 cenas', ''], ['T1 a T4', 'o'], ['Simulador Interativo', 't']],
    intro: 'Uma torre eólica é montada em seções chamadas tramos, subdivididos em virolas calandradas. Experimente o simulador de cenários de chapas!',
    scenes: [
      {
        ic: 'sap',
        t: 'A Lógica dos Tramos e Virolas',
        x: 'As torres TEN são divididas em <b>Tramos estruturais (T1, T2, T3, T4)</b>. Cada tramo é formado pela união circular de várias <b>Virolas (T1V1 a T1V7, T2V1 a T2V8...)</b> calandradas.',
        chips: [['Pág. 5 do PO', 'o'], ['Engenharia Estrutural', 't']],
        vig: () => vLanes([['Tramo 1 (Base)', 'Virolas T1V1 a T1V7', 100, 'var(--s-teal)', '#fff', '0.8s'], ['Tramo 2', 'Virolas T2V1 a T2V8', 100, 'var(--s-blue)', '#fff', '1s'], ['Tramo 3', 'Virolas T3V1 a T3V10', 100, 'var(--s-orange)', '#fff', '1.2s'], ['Tramo 4 (Topo)', 'Virolas T4V1 a T4V8', 100, 'var(--s-bad)', '#fff', '1.4s']])
      },
      {
        ic: 'wh',
        t: 'Simulador de Cenários de Chapas',
        x: 'Interaja com o simulador abaixo para entender a destinação precisa de cada lote de chapas segundo o projeto e conformidade.',
        chips: [['Simulador', 'o'], ['Pátio A x B', 't']],
        widget: 'chapas',
        hold: true
      },
      {
        ic: 'road',
        t: 'Escala Impressionante',
        x: 'No projeto Seridó I GE 125M (36 torres), o controle mapeou <b>1.731 chapas e mais de 11.000 toneladas</b> de aço. Cada virola tem espessura específica calculada.',
        chips: [['1.731 Chapas', 'o'], ['11.500 Toneladas', 't']],
        k: 11500,
        kl: 'toneladas de projeto',
        vig: () => vProps([['Seridó I GE 125M', '36 Torres', '1.731 Chapas', '11.500 Ton'], ['Assuruá I GE 101M', '33 Torres', 'Alto Volume', 'Em Linha']])
      },
      {
        ic: 'form',
        t: 'Preparação do Processo Físico',
        x: 'Após a descarga, o Almoxarifado <b>prepara todo o processo físico</b> (DANFE original + Certificado) e entrega formalmente ao <b>Analista do Apoio Operacional</b>.',
        chips: [['Passagem de Bastão', 'o'], ['Apoio Operacional', 't']],
        vig: () => vAppr('PROCESSO FÍSICO', 'ALMOX-APOIO', 'ENTREGUE', 'Almoxarifado', 'folder', false)
      }
    ],
    game: {
      type: 'order',
      title: 'Ordene a evolução física da chapa de aço bruta até o tramo final'
    },
    quiz: [
      {
        q: 'Como é denominada cada seção circular de aço que compõe os tramos da torre?',
        o: [
          'Virola (ex: T1V1, T1V2, T2V3...).',
          'Roldana plástica de vedação.',
          'Cantoneira de fixação leve de alumínio.',
          'Barra roscada zincada.'
        ],
        a: 0,
        e: 'As <b>virolas</b> são as seções cilíndricas ou cônicas calandradas e soldadas para formar cada tramo da torre.'
      },
      {
        q: 'Segundo a planilha de Seridó I (pág. 5), quantas chapas foram mapeadas para as 36 torres?',
        o: [
          '1.731 chapas (mais de 11.000 toneladas de aço).',
          '50 chapas apenas no total.',
          '10 chapas de teste.',
          'Mais de 100.000 chapas finas.'
        ],
        a: 0,
        e: 'A planilha de controle de faturamento e recebimento de chapas de Seridó I totaliza <b>1.731 chapas de projeto</b>.'
      },
      {
        q: 'Para quem o Almoxarifado entrega o processo físico após o descarregamento das chapas?',
        o: [
          'Para o Analista do Apoio Operacional realizar lançamentos nas planilhas de controles.',
          'Para o motorista levar embora na cabine da carreta.',
          'Para o porteiro arquivar na guarita externa.',
          'Para a equipe de limpeza geral.'
        ],
        a: 0,
        e: 'O fluxograma prescreve: <b>"Prepara processo e entrega para analista do apoio operacional realizar lançamentos"</b>.'
      },
      {
        q: 'O que o simulador de chapas demonstra quando um projeto ainda não entrou em linha de fabricação?',
        o: [
          'A carreta deve ser descarregada no Pátio B utilizando o Pórtico Mag 75 Ton.',
          'A carga deve ser rejeitada e enviada de volta à usina.',
          'A chapa deve ser cortada imediatamente no meio do pátio.',
          'A chapa deve ser guardada dentro do refeitório da fábrica.'
        ],
        a: 0,
        e: 'Projetos que ainda não entraram em linha são direcionados ao <b>Pátio B secundário com o Pórtico Mag 75T</b>.'
      }
    ]
  },

  // -------------------------------------------------------------------------
  // M07 · Controle de Faturamento & Planilhas
  // -------------------------------------------------------------------------
  {
    n: 7,
    short: 'Controle & Planilhas',
    title: 'Controle de Faturamento & <span>Planilhas de Projetos</span>',
    ic: 'form',
    badge: 'Analista de Controles',
    gameName: 'Gestão e Acuracidade das Planilhas de Chapas',
    chips: [['4 cenas', ''], ['Apoio Operacional', 'o'], ['Planilhas Excel', 't']],
    intro: 'Cada chapa recebida deve bater centavo a centavo e quilo a quilo. Conheça as planilhas de controle por projeto e a cadência de medição mensal.',
    scenes: [
      {
        ic: 'form',
        t: 'Planilhas Oficiais por Projeto (Item 4)',
        x: 'O Almoxarifado controla o faturamento e recebimento em planilhas dedicadas: <b>Assuruá I (33 torres), Gamesa Itaguaçu, Gamesa Sto Agostinho, Seridó I (8 e 36 torres)</b>.',
        chips: [['Item 4', 'o'], ['Planilhas Dedicadas', 't']],
        vig: () => vIcons([['form', 'Assuruá I'], ['form', 'Seridó I GE125M'], ['form', 'Gamesa Itaguaçu'], ['form', 'Seridó I GE101M']])
      },
      {
        ic: 'check',
        t: 'Conferência Minuciosa',
        x: 'O <b>Analista do Apoio Operacional</b> verifica toda a documentação apresentada: quantidades, pesos líquidos, dimensões e número de peças faturadas versus recebidas.',
        chips: [['Verificação Total', 'o'], ['Apoio Operacional', 'ok']],
        vig: () => vChecklist('Conferência do Analista', ['DANFE original do fornecedor', 'Certificado da usina aprovado', 'Dados de peso e espessura', 'Associação à Virola/Tramo'], -1, 'Processo Auditado', 'Itens')
      },
      {
        ic: 'sap',
        t: 'Lançamento nas Planilhas',
        x: 'O Analista lança a chapa na planilha correspondente: marca o status da virola, atualiza o total recebido, pendente e toneladas acumuladas do projeto.',
        chips: [['Atualização em Tempo Real', 'o'], ['Rastreabilidade', 't']],
        vig: () => vLanes([['Recebido', 'Chapas Entregues', 75, 'var(--s-teal)', '#fff', '0.8s'], ['Pendente', 'Saldo a Faturar', 25, 'var(--s-orange)', '#fff', '1s']])
      },
      {
        ic: 'road',
        t: 'Cadência Operacional TEN',
        x: 'Em 2022, a medição registrou <b>média diária de 24,09 chapas</b> e <b>média mensal de 506 chapas</b>, totalizando mais de 3.540 chapas recebidas e registradas no ano.',
        chips: [['Pág. 5 do PO', 'o'], ['Alto Rendimento', 't']],
        k: 506,
        kl: 'chapas / mês (média)',
        vig: () => vLanes([['Junho/22', '796 chapas', 100, 'var(--s-teal)', '#fff', '0.8s'], ['Julho/22', '659 chapas', 83, 'var(--s-blue)', '#fff', '1s'], ['Agosto/22', '780 chapas', 98, 'var(--s-teal)', '#fff', '1.2s'], ['Setembro/22', '642 chapas', 80, 'var(--s-blue)', '#fff', '1.4s']])
      }
    ],
    game: {
      type: 'deck',
      title: 'Classifique as rotinas de gestão e acuracidade das planilhas de chapas',
      buckets: ['Boas Práticas de Controle', 'Falha Grave de Gestão'],
      cards: [
        { t: 'Lançar a chapa na planilha correspondente ao projeto logo após a conferência', a: 0, s: 'Boa Prática' },
        { t: 'Deixar acúmulo de notas fiscais sem registrar nas planilhas por semanas', a: 1, s: 'Falha Grave' },
        { t: 'Verificar se o peso líquido e número da chapa conferem com o certificado', a: 0, s: 'Boa Prática' },
        { t: 'Atualizar os saldos de toneladas recebidas e pendentes por virola/tramo', a: 0, s: 'Boa Prática' },
        { t: 'Misturar lançamentos de projetos diferentes na mesma planilha de controle', a: 1, s: 'Falha Grave' },
        { t: 'Conferir se a DANFE original está acompanhada do certificado da usina', a: 0, s: 'Boa Prática' }
      ]
    },
    quiz: [
      {
        q: 'Quem é responsável por lançar as informações nas planilhas de controle de chapas?',
        o: [
          'Analista do Apoio Operacional (Almoxarifado).',
          'Motorista autônomo da transportadora.',
          'Operador da ponte rolante.',
          'Vigilante da guarita de pedestres.'
        ],
        a: 0,
        e: 'O fluxograma determina: <b>analista do apoio operacional realiza lançamentos nas planilhas de controles</b>.'
      },
      {
        q: 'Quais projetos de torres constam listados expressamente no item 4 do PO.ALM-0006?',
        o: [
          'Assuruá I, Gamesa Itaguaçu, Gamesa Sto Agostinho e Seridó I (GE101m e GE125m).',
          'Apenas projetos de edifícios residenciais em Jacobina.',
          'Projetos de pontes rodoviárias de concreto armado.',
          'Projetos de plataformas marítimas de exploração de petróleo.'
        ],
        a: 0,
        e: 'O item 4 lista as planilhas dos projetos <b>Assuruá I, Gamesa (Itaguaçu e Sto Agostinho) e Seridó I</b>.'
      },
      {
        q: 'Qual era a média diária aproximada de lançamentos de chapas registrada no ano de 2022?',
        o: [
          'Aproximadamente 24 chapas por dia (média mensal de mais de 500 chapas).',
          '1 chapa a cada 10 dias úteis.',
          'Mais de 5.000 chapas por dia.',
          'Zero chapas faturadas no período.'
        ],
        a: 0,
        e: 'A tabela de medição da pág. 5 aponta <b>média diária de 24,09 chapas e média mensal de 506 chapas</b>.'
      },
      {
        q: 'O que o Analista de Apoio confere antes de lançar a chapa na planilha de controle?',
        o: [
          'Toda a documentação apresentada (quantidades, pesos, certificado e DANFE).',
          'Apenas a foto do crachá do motorista.',
          'Se o caminhão já foi abastecido para a viagem de volta.',
          'Nenhum dado é conferido antes de lançar.'
        ],
        a: 0,
        e: 'Conforme fluxograma: <b>"Verifica toda documentação apresentada, lança nas planilhas de controles"</b>.'
      }
    ]
  },

  // -------------------------------------------------------------------------
  // M08 · Trâmites Fiscais, Digitalização & Arquivo
  // -------------------------------------------------------------------------
  {
    n: 8,
    short: 'Fiscal & Arquivo',
    title: 'Trâmites Fiscais, <span>Digitalização & Arquivo Dossiê</span>',
    ic: 'folder',
    badge: 'Guardião do Dossiê',
    gameName: 'As 4 Etapas Finais do Apoio Operacional',
    chips: [['4 cenas', ''], ['Controladoria', 'o'], ['Arquivo Ascendente', 't']],
    intro: 'A etapa final consolida a segurança contábil, fiscal e jurídica da TEN. Conheça as 4 ações obrigatórias que fecham o ciclo com chave de ouro.',
    scenes: [
      {
        ic: 'form',
        t: '1. Envio Protocolado à Controladoria',
        x: 'O Analista <b>encaminha (protocolado) todas as notas fiscais originais para a Controladoria</b> realizar o competente lançamento contábil e fiscal nos sistemas.',
        chips: [['Protocolo Obrigatório', 'o'], ['Controladoria TEN', 'ok']],
        vig: () => vSend('NFs Originais Protocoladas > Controladoria TEN')
      },
      {
        ic: 'folder',
        t: '2. Digitalização & Renomeação na Rede',
        x: 'Todos os processos são <b>digitalizados e renomeados de forma padronizada</b>, ficando evidenciados na rede corporativa para livre acesso das áreas interessadas.',
        chips: [['Digitalização', 'o'], ['Pasta na Rede', 't']],
        vig: () => vFolder('REDE-TEN/ALMOX/CHAPAS/2026', ['NF_84920_SERIDO_T1V3.pdf', 'CERT_USINA_CORRIDA_492.pdf', 'COMPROVANTE_ENTREGA.pdf'])
      },
      {
        ic: 'check',
        t: '3. Arquivo Físico por Data Ascendente',
        x: 'Os processos lançados são arquivados fisicamente em <b>ordem de data ascendente</b>, permitindo consultas futuras imediatas, auditorias da qualidade e retenção documentada.',
        chips: [['Data Ascendente', 'o'], ['Auditoria Pronta', 'ok']],
        vig: () => vLanes([['Processos Jan', 'Arquivados', 100, 'var(--s-teal)', '#fff', '0.8s'], ['Processos Fev', 'Arquivados', 100, 'var(--s-teal)', '#fff', '1s'], ['Processos Mar', 'Arquivados', 100, 'var(--s-teal)', '#fff', '1.2s']])
      },
      {
        ic: 'sap',
        t: '4. Fechamento e Rastreabilidade Total',
        x: 'O processo é finalizado! A rastreabilidade está 100% blindada: desde o portão da fábrica até o corte térmico e a certidão final da torre eólica instalada no parque.',
        chips: [['Ciclo Concluído', 'ok'], ['Rastreabilidade 100%', 'o']],
        vig: () => vf('C', 'Ciclo Finalizado', [['Físico', 'Descarregado nos Pátios'], ['Fiscal', 'Lançado na Controladoria'], ['Digital', 'Evidenciado na Rede'], ['Arquivo', 'Data Ascendente']], 'ok', [['Status', '100% Conforme']])
      }
    ],
    game: {
      type: 'order',
      title: 'Ordene as 4 etapas finais obrigatórias do Analista de Apoio Operacional'
    },
    quiz: [
      {
        q: 'Para onde o Analista encaminha as Notas Fiscais ORIGINAIS de forma protocolada?',
        o: [
          'Para a Controladoria realizar lançamento contábil/fiscal.',
          'Para a lixeira de descarte de papéis da fábrica.',
          'Para o motorista levar de volta à usina fornecedora.',
          'Para o mural de recados do refeitório.'
        ],
        a: 0,
        e: 'O fluxograma determina: <b>"Encaminha (protocolado) todas as notas fiscais originais para a Controladoria realizar lançamento"</b>.'
      },
      {
        q: 'Como os processos digitalizados devem ser tratados pelo Analista de Apoio?',
        o: [
          'Digitalizados, renomeados e evidenciados na rede corporativa para livre acesso das áreas.',
          'Salvos na área de trabalho pessoal do computador sem backup.',
          'Deletados logo após a digitalização para liberar espaço.',
          'Enviados em grupos de rede social informal.'
        ],
        a: 0,
        e: 'Conforme fluxograma: <b>"Digitaliza e renomeia todos os processos, evidenciando na rede para acesso a todos os que necessitarem"</b>.'
      },
      {
        q: 'Em qual ordem os processos físicos devem ser arquivados no Almoxarifado?',
        o: [
          'Por data ascendente (ordem cronológica).',
          'Por ordem aleatória sem nenhum critério definido.',
          'Pelo tamanho do papel da nota fiscal.',
          'Pelo peso do motorista do caminhão.'
        ],
        a: 0,
        e: 'O fluxograma prescreve expressamente: <b>"Armazena por data ascendente todos os processos lançados para reter informações documentadas"</b>.'
      },
      {
        q: 'Qual é o benefício do protocolo formal de envio de NFs para a Controladoria?',
        o: [
          'Garantir comprovante de custódia e entrega documental, evitando extravio de notas fiscais.',
          'Apenas gerar mais papéis sem nenhuma utilidade.',
          'Atrasar o pagamento dos fornecedores da usina.',
          'Nenhum benefício para a rastreabilidade.'
        ],
        a: 0,
        e: 'O envio protocolado <b>comprova a entrega dos originais à Controladoria</b>, resguardando o Almoxarifado contra perdas.'
      }
    ]
  },

  // -------------------------------------------------------------------------
  // M09 · Desafio Final do Recebimento de Chapas
  // -------------------------------------------------------------------------
  {
    n: 9,
    short: 'Desafio Final',
    title: 'Desafio Final: <span>Mestre do Recebimento de Chapas</span>',
    ic: 'check',
    badge: 'Especialista em Chapas TEN',
    gameName: 'Rodada Mista do Aço',
    chips: [['Revisão & Quiz', ''], ['8 perguntas', 'o'], ['15s / questão', 'bad']],
    qtime: 15,
    intro: 'Chegou o momento decisivo! Prove seu domínio operacional e sistêmico sobre todo o PO.ALM-0006 com rapidez e precisão para conquistar seu certificado.',
    scenes: [
      {
        ic: 'check',
        t: 'Visão Panorâmica do Fluxo',
        x: 'Você percorreu todas as etapas do <b>PO.ALM-0006</b>: Portaria, Pátio A (Ponte), Pátio B (Pórtico), Qualidade e RNC, Tramos/Virolas, Controladoria e Arquivo.',
        chips: [['Revisão Geral', 'o'], ['Fluxo Consolidado', 'ok']],
        vig: () => vIcons([['road', 'Portaria & Rádio'], ['wh', 'Pátio A / B'], ['check', 'Qualidade & RNC'], ['folder', 'Arquivo & Fiscal']])
      },
      {
        ic: 'sap',
        t: 'Regras Críticas Revisitadas',
        x: 'Lembre-se: <b>Pátio A</b> é para projetos em linha (Ponte/Pontoneiro); <b>Pátio B</b> é para projetos futuros (Pórtico 75T); reprovação gera <b>RNC</b> e arquivo é por <b>data ascendente</b>.',
        chips: [['Pontos Decisivos', 'o'], ['Acuracidade 100%', 't']],
        vig: () => vf('TEN', 'Regras de Ouro', [['Pátio A', 'Em Linha (Ponte)'], ['Pátio B', 'Fora de Linha (Pórtico)'], ['Qualidade', 'Certificado + DANFE'], ['Arquivo', 'Data Ascendente']], 'ok', [['Auditoria', 'Aprovada']])
      }
    ],
    game: {
      type: 'deck',
      title: 'Rodada mista decisiva: avalie as situações de recebimento de chapas na TEN',
      buckets: ['Conduta Aprovada / Conforme PO', 'Conduta Reprovada / Inconforme'],
      cards: [
        { t: 'Carreta de chapa chega: Portaria faz check-in e avisa Almoxarifado via rádio', a: 0, s: 'Conforme' },
        { t: 'Descarregar chapa sem acionar o Controle de Qualidade para economizar tempo', a: 1, s: 'Inconforme' },
        { t: 'Chapa de projeto que já está em linha de fabricação segue para o Pátio A', a: 0, s: 'Conforme' },
        { t: 'Chapa de projeto futuro que não entrou em linha vai para o Pátio B (Pórtico 75T)', a: 0, s: 'Conforme' },
        { t: 'Em caso de inconformidade técnica, abrir RNC e evidenciar formalmente', a: 0, s: 'Conforme' },
        { t: 'Entregar notas fiscais originais soltas na mesa da Controladoria sem protocolo', a: 1, s: 'Inconforme' },
        { t: 'Digitalizar, renomear na rede e arquivar processos físicos por data ascendente', a: 0, s: 'Conforme' },
        { t: 'Apagar planilhas de controle de faturamento após descarregar as carretas', a: 1, s: 'Inconforme' }
      ]
    },
    quiz: [
      {
        q: 'O que define a ida de uma carreta de chapas para o Pátio A ou Pátio B?',
        o: [
          'Se o projeto ao qual a chapa pertence já está ou não na linha de fabricação.',
          'A preferência pessoal do motorista da transportadora.',
          'O valor unitário do imposto ICMS destacado na nota.',
          'O dia da semana em que a entrega foi realizada.'
        ],
        a: 0,
        e: 'O fator determinante é o status do projeto: <b>em linha vai para o Pátio A; fora de linha vai para o Pátio B</b>.'
      },
      {
        q: 'Qual equipamento de elevação atua no Pátio A e qual atua no Pátio B?',
        o: [
          'Pátio A: Ponte Rolante (Pontoneiro) · Pátio B: Pórtico Mag 75 Ton (Operador de Pórtico).',
          'Pátio A: Empilhadeira · Pátio B: Carrinho de mão.',
          'Pátio A: Guincho manual · Pátio B: Nenhuma máquina de elevação.',
          'Ambos os pátios utilizam apenas pás e alavancas manuais.'
        ],
        a: 0,
        e: 'O item 2 define expressamente: <b>Pátio A - Ponte Rolante via Pontoneiro; Pátio B - Pórtico Mag 75 Ton via Operador de Pórtico</b>.'
      },
      {
        q: 'Qual é o procedimento obrigatório da Qualidade caso uma chapa seja REPROVADA?',
        o: [
          'Evidencia para as áreas, abre RNC e aguarda fornecedor coletar ou regularizar documentação.',
          'Corta a chapa imediatamente na fábrica para tentar aproveitar pedaços.',
          'Aprova verbalmente para não parar a carreta.',
          'Ignora o laudo e joga fora a documentação técnica.'
        ],
        a: 0,
        e: '<b>Abertura formal de RNC, isolamento do material e notificação documentada por e-mail</b>.'
      },
      {
        q: 'O que a Qualidade entrega ao Almoxarifado após APROVAR a chapa recebida?',
        o: [
          'Certificado de matéria-prima validado e a DANFE original, retendo cópias documentadas.',
          'Apenas uma mensagem informal no rádio comunicador.',
          'Somente o comprovante de pesagem da balança.',
          'Nenhum documento físico.'
        ],
        a: 0,
        e: '<b>Retém cópias para evidência da qualidade e entrega o certificado e a DANFE original para o Almoxarifado</b>.'
      },
      {
        q: 'Como são organizadas as pilhas de chapas pesadas para evitar deformação permanente?',
        o: [
          'Com caibros de madeira alinhados verticalmente entre as camadas.',
          'Jogadas diretamente no chão umas sobre as outras de forma inclinada.',
          'Apoiadas em pneus velhos com inclinação lateral.',
          'Empilhadas sem nenhum espaçador de madeira.'
        ],
        a: 0,
        e: 'O calçamento com <b>caibros alinhados na vertical distribui as cargas uniformemente evitando empenamento</b> do aço.'
      },
      {
        q: 'Para que servem as virolas (ex: T1V1, T2V4) no mapeamento das torres eólicas?',
        o: [
          'Identificar a posição de cada chapa conformada que compõe os tramos estruturais da torre.',
          'Nomear os funcionários da portaria da fábrica.',
          'Registrar as placas das carretas no pátio.',
          'Definir a cor do crachá dos visitantes.'
        ],
        a: 0,
        e: 'As virolas mapeiam exatamente a <b>seção cilíndrica/cônica da torre onde cada chapa de aço será calandrada e soldada</b>.'
      },
      {
        q: 'Como as notas fiscais originais de chapas são enviadas para a Controladoria?',
        o: [
          'Encaminhadas de forma protocolada para garantir rastreabilidade contábil.',
          'Jogadas por debaixo da porta da sala.',
          'Enviadas como anexo de mensagem instantânea não oficial.',
          'Deixadas na guarita externa.'
        ],
        a: 0,
        e: 'O envio é <b>sempre protocolado para assegurar comprovante de entrega</b> da documentação fiscal à Controladoria.'
      },
      {
        q: 'Qual é o critério de arquivamento físico dos processos de recebimento de chapas?',
        o: [
          'Armazenados por data ascendente para retenção e consultas futuras rápidas.',
          'Armazenados por cor da pasta de arquivo.',
          'Descartados a cada 15 dias corridos.',
          'Misturados sem qualquer critério de datação.'
        ],
        a: 0,
        e: 'O PO.ALM-0006 encerra estabelecendo o <b>arquivamento por data ascendente para controle e auditorias</b>.'
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
  code: 'PO.ALM-0006',
  rev: '00',
  name: 'Procedimento Operacional e Sistêmico Chapas',
  hero: 'Recebimento de <span>Chapas</span>',
  hud: 'Operacional & Sistêmico Chapas',
  key: 'trilha-alm0006-v1',
  origem: 'trilha-alm0006',
  title: 'Trilha PO.ALM-0006',
  levels: [
    [0, 'Recepção de Pátio'],
    [400, 'Inspetor de Chapas'],
    [1100, 'Controlador de Pátio A/B'],
    [2000, 'Gestor de Tramos & Virolas'],
    [3200, 'Analista de Faturamento'],
    [4400, 'Mestre do Aço TEN']
  ],
  guide: (t) => `
    <div class="gcard">
      <h3>${ic('ishield')}Objetivos & Definições (Itens 1 e 2)</h3>
      ${t(
        ['Item', 'Diretriz do PO.ALM-0006'],
        [
          ['Objetivo', 'Assegurar recebimento efetivo de todas as chapas adquiridas ou de clientes conforme negociado.'],
          ['Pátio A (Ponte)', 'Local onde se descarregam chapas para alimentar a produção (Ponte Rolante / Pontoneiro).'],
          ['Pátio B (Pórtico)', 'Local secundário para projetos que não entraram em linha ainda (Pórtico Mag 75 Ton / Operador de Pórtico).']
        ]
      )}
    </div>

    <div class="gcard">
      <h3>${ic('iusers')}Fluxo de Recebimento e Decisão de Pátio (Item 3 e Anexo 1)</h3>
      ${t(
        ['Etapa', 'Responsável', 'Ação Regulamentar'],
        [
          ['1. Portaria', 'Portaria', 'Check-in do motorista, solicitação de docs pessoais e NFs, aviso via Rádio ao Almoxarifado.'],
          ['2. Triagem', 'Almoxarifado', 'Verifica o projeto da chapa: se em linha vai para Pátio A; se fora de linha vai para Pátio B. Aciona Qualidade.'],
          ['3. Inspeção', 'Qualidade', 'Inspeciona chapas e valida certificado da usina. Se reprovado: RNC e e-mail. Se aprovado: entrega DANFE e certificado ao Almox.'],
          ['4. Descarga', 'Almoxarifado', 'Descarrega no pátio com Ponte ou Pórtico 75T e entrega processo físico ao Analista do Apoio Operacional.'],
          ['5. Fechamento', 'Analista Apoio', 'Lança nas planilhas de controles, encaminha NFs originais protocoladas à Controladoria, digitaliza na rede e arquiva por data ascendente.']
        ]
      )}
    </div>

    <div class="gcard">
      <h3>${ic('idb')}Projetos e Mapeamento de Tramos e Virolas (Item 4 e Pág. 5)</h3>
      ${t(
        ['Projeto / Parâmetro', 'Detalhamento'],
        [
          ['Tramos e Virolas', 'Divisão da torre em Tramos (T1 a T4) e Virolas (T1V1 a T1V7...). Cada chapa tem espessura e conformação calculadas.'],
          ['Seridó I GE 125M', '36 torres, 1.731 chapas e mais de 11.000 toneladas de aço estrutural gerenciadas.'],
          ['Cadência 2022', 'Média diária de 24,09 chapas e média mensal de 506 chapas recebidas e registradas.']
        ]
      )}
    </div>

    <div class="gcard">
      <h3>${ic('ifold')}As 4 Etapas Finais do Apoio Operacional (Anexo 1)</h3>
      ${t(
        ['Passo Final', 'Ação'],
        [
          ['1. Conferência e Lançamento', 'Verifica minunciosamente documentação apresentada e lança nas planilhas de controle.'],
          ['2. Envio Protocolado', 'Encaminha (protocolado) todas as notas fiscais originais para a Controladoria realizar lançamento.'],
          ['3. Digitalização na Rede', 'Digitaliza e renomeia todos os processos, evidenciando na rede corporativa para consultas.'],
          ['4. Arquivo Ascendente', 'Armazena por data ascendente todos os processos lançados para reter informações documentadas.']
        ]
      )}
    </div>
  `
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CFG, GINST, M };
}
