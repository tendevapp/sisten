/* ================= Trilha PO.ALM-0001 · Rotinas do Almoxarifado ================= */
const M=[
{ n:1, short:'Por que o Almoxarifado existe', title:'Por que o <span>Almoxarifado</span> existe', ic:'ishield', badge:'Guardião da Acuracidade', gameName:'Quem faz o quê?',
  chips:[['4 cenas',''],['Físico x Contábil','o'],['≈ 4 min','t']],
  intro:'O Almoxarifado da TEN não é apenas um depósito de peças: é o coração operacional e logístico da fábrica. Esta missão mostra por que o PO.ALM-0001 existe e como as responsabilidades se dividem entre as áreas.',
  scenes:[
    {ic:'ishield',t:'Garantir o Físico e o Contábil',chips:[['Objetivo','t']],vig:()=>vf('ishield','Controle Físico e Contábil',[['Físico 100% igual ao SAP','ok'],['Evitar rupturas na fábrica','t'],['Apuração eficaz dos estoques','']],'ok'),
     x:'O objetivo do procedimento é estabelecer diretrizes claras para controle e apuração eficaz dos estoques. A meta de ouro é simples: o que existe <b>fisicamente nas estantes e pátios</b> deve bater com 100% de exatidão com o saldo <b>contábil e fiscal</b> da TEN.'},
    {ic:'iboxes',t:'Matéria-Prima e Segregados',chips:[['Conceitos','']],vig:()=>vIcons([['iboxes','Matéria-prima'],['iwrench','Ferramentas'],['iban','Segregados (isolados)'],['ishield','Spare Parts']]),
     x:'Matéria-prima abrange todos os insumos de produção, ferramentas e manutenção. Quando um lote apresenta qualquer dúvida técnica ou divergência, ele é classificado como <b>Material Segregado</b>: fica isolado e identificado, sendo <b>estritamente proibido seu uso</b>.'},
    {ic:'i4',t:'Estoque Mínimo e Ressuprimento',chips:[['Gatilhos','o']],vig:()=>vLanes([['Ponto de Ressuprimento','Gatilho para novo pedido de compra',80,'var(--s-orange)','#1C0E00',1],['Estoque Mínimo','Limite de segurança contra paradas',40,'var(--s-bad)','#ffffff',1.4]]),
     x:'O <b>Estoque Mínimo</b> é a reserva de segurança para nunca parar a linha das torres. Já o <b>Ponto de Ressuprimento</b> é o alarme operacional: ao atingir essa quantidade limite armazenada, dispara-se imediatamente o pedido de compra para reposição.'},
    {ic:'iusers',t:'Divisão de Responsabilidades',chips:[['Papéis','']],vig:()=>vIcons([['i8','Almoxarifado'],['idb','Controladoria'],['icoin','Compras'],['ishield','Qualidade']]),
     x:'O <b>Almoxarifado</b> recebe, confere, preserva, aloca, faz inventários e atende solicitações. A <b>Controladoria</b> lança as NFs no SAP e agenda pagamentos. <b>Compras</b> faz as aquisições e a <b>Qualidade</b> libera certificados e laudos técnicos.'}
  ],
  game:{type:'deck',title:'Quem faz o quê no Almoxarifado?',buckets:['Almoxarifado','Controladoria','Setor de Compras','Setor da Qualidade'],cards:[
    {t:'Lançar as Notas Fiscais no sistema SAP e provisionar pagamento',a:1},
    {t:'Receber, conferir, armazenar e preservar materiais na fábrica',a:0},
    {t:'Liberar certificados de qualidade, aferição e FISPQ',a:3},
    {t:'Negociar devolução ou regularização com o fornecedor',a:2},
    {t:'Controlar a validade dos materiais e itens perecíveis',a:0},
    {t:'Protocolar as NFs do dia e entregar no dia subsequente',a:0},
    {t:'Realizar inventário periódico físico dos materiais',a:0},
    {t:'Ajustar divergências comerciais de falta ou sobra com fornecedor',a:2}
  ]},
  quiz:[
    {q:'Qual é o objetivo principal do PO.ALM-0001?',o:['Apenas guardar materiais no galpão','Controle e apuração eficaz dos estoques no âmbito físico e contábil','Acelerar a compra de matéria-prima sem conferência'],a:1,e:'Garantir a apuração eficaz dos estoques nos âmbitos <b>físico e contábil</b>.'},
    {q:'O que são Materiais Segregados?',o:['Itens de alto consumo liberados para a linha','Materiais separados e isolados, sem autorização para uso','Peças destinadas exclusivamente a descarte'],a:1,e:'São itens <b>separados e isolados, sem autorização para uso</b>.'},
    {q:'O que indica o Ponto de Ressuprimento?',o:['Quantidade limite para gerar um novo pedido de compra','Momento exato em que a fábrica deve parar','Estoque máximo permitido na estante'],a:0,e:'Quantidade limite armazenada para <b>gerar novo pedido de compra</b>.'},
    {q:'Quem é responsável por registrar a entrada das NFs no SAP?',o:['O próprio conferente no balcão','O setor da Controladoria','O motorista da transportadora'],a:1,e:'O registro das entradas no SAP é feito pela <b>Controladoria</b>.'}
  ]
},
{ n:2, short:'Gestão e Ressuprimento', title:'Gestão Sistêmica e <span>Ressuprimento</span>', ic:'i4', badge:'Vigia do Estoque', gameName:'Ressuprimento Certo',
  chips:[['5 cenas',''],['FRM.ALM-0015 · SAP','o'],['≈ 5 min','t']],
  intro:'O estoque não pode faltar nem sobrar. Para manter a fábrica rodando no ritmo certo, o almoxarife acompanha o consumo diário e dispara a reposição no momento exato.',
  scenes:[
    {ic:'i4',t:'Análise Diária de Consumo',chips:[['Rotina Diária','t']],vig:()=>vf('i4','Análise Diária do Estoque',[['Consumo real diário',''],['Estoque mínimo monitorado','t'],['Ponto de ressuprimento como gatilho','o']],'ok'),
     x:'Todos os dias o Almoxarifado monitora três números vitais: <b>consumo diário</b>, <b>estoque mínimo</b> e <b>ponto de ressuprimento</b>. Essa rotina identifica com precisão cirúrgica quais materiais precisam de nova solicitação de compra.'},
    {ic:'i1',t:'Definição de Itens (FRM.ALM-0015)',chips:[['FRM.ALM-0015','o']],vig:()=>vForm('Definição de Itens para Estoque','FRM.ALM-0015','Discos de Desbaste 7" · Consumo Fábrica'),
     x:'Para que um material entre na política de estoque da TEN, ele precisa de formalização. A definição oficial dos itens de Estoque é realizada através do formulário <b>FRM.ALM-0015</b>, padronizando os parâmetros da fábrica.'},
    {ic:'idb',t:'Requisição de Compra no SAP',chips:[['SAP ME51N','t']],vig:()=>vForm('Requisição de Compra','SAP ME51N','Reposição de Estoque · Centro TEN'),
     x:'Ao bater no ponto de ressuprimento, a reposição é solicitada via <b>Requisição de Compra no sistema SAP</b>. As requisições de serviços ligados ao setor também seguem rigorosamente as mesmas etapas desta instrução.'},
    {ic:'i2',t:'Aprovação da Liderança',chips:[['Alçada','']],vig:()=>vAppr('RM Reposição Estoque','SAP','APROVADA','Coord. Logística e Almoxarifado','i2'),
     x:'Toda requisição gerada pelo Almoxarifado não sobe direto para cotação: a análise criteriosa e a decisão final de aprovação cabem ao <b>Coordenador de Logística e Almoxarifado</b>, garantindo conformidade orçamentária.'},
    {ic:'i4',t:'Simulador de Ressuprimento',chips:[['Simulador Interativo','o']],widget:'ressup',hold:true,
     x:'Interaja com o simulador abaixo: ajuste os níveis de estoque e veja quando o sistema acusa <b>Estoque Seguro</b>, atinge o <b>Ponto de Ressuprimento</b> ou entra em alerta de <b>Ruptura Iminente</b>.'}
  ],
  game:{type:'deck',title:'Ressuprimento Certo: o que fazer?',buckets:['Disparar RM no SAP','Aguardar / Monitorar consumo','Ação Crítica (Ruptura)'],cards:[
    {t:'Estoque atingiu o Ponto de Ressuprimento',a:0},
    {t:'Estoque está bem acima do gatilho de reposição',a:1},
    {t:'Estoque caiu abaixo do Estoque Mínimo de segurança',a:2},
    {t:'Novo item aprovado na FRM.ALM-0015 precisa de lote inicial',a:0},
    {t:'Consumo diário normal sem atingir o ponto de corte',a:1},
    {t:'Estoque zerado com linha de solda em risco iminente',a:2}
  ]},
  quiz:[
    {q:'Qual formulário define os itens cadastrados como Estoque na TEN?',o:['FRM.SEG-0011','FRM.ALM-0015','FRM.ALM-0010'],a:1,e:'A definição de itens para Estoque é feita pelo <b>FRM.ALM-0015</b>.'},
    {q:'Com qual periodicidade o Almoxarifado analisa consumo e ponto de ressuprimento?',o:['Semanalmente','Diariamente','Apenas no fim do mês'],a:1,e:'O Almoxarifado analisa os dados <b>diariamente</b>.'},
    {q:'Onde é realizada a Requisição de compra para reposição de estoque?',o:['Por planilha de e-mail','Diretamente no sistema SAP','Em formulário físico impresso'],a:1,e:'A requisição de compra é feita via <b>sistema SAP</b>.'},
    {q:'Quem é o responsável por aprovar as Requisições solicitadas pelo Almoxarifado?',o:['O comprador júnior','O Coordenador de Logística e Almoxarifado','O operador de empilhadeira'],a:1,e:'A aprovação cabe ao <b>Coordenador de Logística e Almoxarifado</b>.'}
  ]
},
{ n:3, short:'Recepção da Carga', title:'Chegada e <span>Recepção</span> da Carga', ic:'i7', badge:'Porteira Blindada', gameName:'Ordem da Recepção',
  chips:[['6 cenas',''],['EPIs · FRM.SEG-0011','o'],['≈ 5 min','t']],
  intro:'O caminhão encostou na portaria e avança para a doca. Do equipamento de proteção ao carimbo provisório na nota, cada movimento segue um rito rigoroso de segurança e checagem.',
  scenes:[
    {ic:'ishield',t:'EPIs Obrigatórios em Campo',chips:[['Segurança em 1º lugar','o']],vig:()=>vChecklist('EPIs Obrigatórios de Campo',['Capacete com jugular','Óculos de segurança','Protetor auricular / concha','Uniforme completo','Botina de segurança'],-1,'✓ EPIs 100% checados',''),
     x:'Antes de qualquer atividade em campo, verifique seus EPIs: <b>capacete com jugular</b>, <b>óculos de segurança</b>, protetor auricular ou concha, uniforme de trabalho e botina com biqueira. Segurança é inegociável na TEN.'},
    {ic:'iwrench',t:'Check-list de Equipamento (FRM.SEG-0011)',chips:[['FRM.SEG-0011','t']],vig:()=>vForm('Check-list de Empilhadeira','FRM.SEG-0011','Inspeção Diária · Freios, Garfos e Fluídos'),
     x:'Se a descarga envolver equipamentos como empilhadeira, o operador deve realizar a inspeção visual e funcional completa e registrar o check-list no formulário <b>FRM.SEG-0011</b> antes de iniciar a operação.'},
    {ic:'i7',t:'Posicionamento e Área Isolada',chips:[['Área Isolada','']],vig:()=>vRoad(['Posicionar veículo','Sinalizar área isolada','Bloquear pedestres']),
     x:'Oriente o motorista a posicionar o veículo em terreno firme e plano. Em seguida, <b>prepare e sinalize a área de descarga</b> com cones e pedestais para impedir a circulação de pedestres, eliminando riscos de atropelamento.'},
    {ic:'i1',t:'Conferência Documental Prévia',chips:[['NF x PC','t']],vig:()=>vf('i1','Conferência da Nota Fiscal',[['Dados TEN: CNPJ e Razão Social','ok'],['Número do Pedido de Compra (PC)','t'],['Quantidade de volumes declarados','o']]),
     x:'Receba a Nota Fiscal e confira de imediato: dados do fornecedor, dados da TEN (<b>CNPJ, Razão Social, endereço</b>), número do Pedido de Compra (PC) e se os volumes físicos batem com a quantidade de volumes da NF.'},
    {ic:'ieye',t:'Inspeção Visual da Carga',chips:[['Registro Fotográfico','o']],vig:()=>vf('ieye','Inspeção Visual Prévia',[['Verificar integridade da carga',''],['Danos na embalagem ou material','o'],['Registro fotográfico obrigatório','t']],'o'),
     x:'Inspecione a carga visualmente antes de descarregar. Identificou avarias na embalagem, rasgos, pallets quebrados ou sinais de umidade? Faça na mesma hora o <b>registro fotográfico detalhado</b> da ocorrência.'},
    {ic:'iclip',t:'Carimbo Provisório (Anexo I)',chips:[['Anexo I','t']],vig:()=>vAppr('Nota Fiscal do Fornecedor','1ª Via','SUJEITO A CONFERÊNCIA POSTERIOR','Almoxarifado TEN','iclip'),
     x:'A descarga física não significa aceite tácito! Carimbe a Nota Fiscal com o carimbo <b>"Sujeito a conferência posterior"</b> (Anexo I). O fornecedor fica ciente de que o aceite final depende da contagem minuciosa.'}
  ],
  game:{type:'order',title:'Ordem certa da recepção da carga'},
  quiz:[
    {q:'Qual formulário deve ser preenchido antes de operar a empilhadeira na descarga?',o:['FRM.ALM-0014','FRM.SEG-0011','FRM.ALM-0023'],a:1,e:'O check-list diário da empilhadeira é o <b>FRM.SEG-0011</b>.'},
    {q:'O que deve ser feito se a embalagem estiver avariada antes da descarga?',o:['Recusar verbalmente e não registrar','Inspecionar visualmente e realizar registro fotográfico','Descarregar e misturar com o estoque bom'],a:1,e:'Inspecionar visualmente e fazer <b>registro fotográfico</b>.'},
    {q:'Qual carimbo é aplicado na NF logo após a descarga física dos volumes?',o:['Material Aprovado','Sujeito a conferência posterior','Conferido e Quitado'],a:1,e:'Carimba-se como <b>Sujeito a conferência posterior</b> (Anexo I).'},
    {q:'O que a descarga física dos volumes representa formalmente?',o:['Aceite tácito definitivo do fornecimento','Recebimento físico provisório, não implicando em aceite tácito','Entrada automática no sistema SAP'],a:1,e:'A descarga <b>não implica em aceite tácito</b> do fornecimento.'}
  ]
},
{ n:4, short:'Conferência e Destino', title:'Conferência e <span>Destino</span> dos Materiais', ic:'ichk', badge:'Olho Clínico', gameName:'Destino do Material',
  chips:[['6 cenas',''],['SEMINF · FISPQ · Qualidade','o'],['≈ 5 min','t']],
  intro:'Com a carga no chão, começa a conferência de verdade: contagem peça por peça, checagem de laudos técnicos e o encaminhamento fiscal correto de cada item.',
  scenes:[
    {ic:'iboxes',t:'Contagem Unitária ou Amostral',chips:[['Físico x PC','t']],vig:()=>vf('iboxes','Contagem Física',[['Contagem unitária ou amostral',''],['Bater com Pedido de Compra','ok'],['Garantir fornecimento exato','t']],'ok'),
     x:'Realize a contagem detalhada de todo o lote (unitária ou por amostragem estatística), confrontando com a quantidade exata informada no <b>Pedido de Compra</b>. Cada porca, chapa ou disco precisa bater com o pedido.'},
    {ic:'ishield',t:'Documentos Técnicos e Qualidade',chips:[['FISPQ · Laudos','o']],vig:()=>vChecklist('Laudos Técnicos Obrigatórios',['Certificado de Qualidade','Certificado de Aferição','FISPQ (Ficha de Informação)','Aprovação Setor da Qualidade'],-1,'✓ Liberado pela Qualidade',''),
     x:'Itens críticos exigem laudos: <b>Certificados de Qualidade</b>, <b>Certificados de Aferição</b> e <b>FISPQ</b> (químicos). Esses materiais só são considerados formalmente conferidos após a liberação do <b>Setor da Qualidade</b>.'},
    {ic:'ialert',t:'Divergências: Falta ou Sobra',chips:[['Segregação','bad']],vig:()=>vf('ialert','Divergência Detectada',[['Material segregado e identificado','bad'],['Acionar comprador responsável','t'],['Fornecedor contatado para regularizar','o']],'bad'),
     x:'Constatou divergência física ou documental? <b>Segregue e identifique o material imediatamente</b>. Informe o Comprador responsável para que ele acione o fornecedor e defina a regularização comercial.'},
    {ic:'i1',t:'Ajustes Fiscais: SEMINF e Complementar',chips:[['Tramites Fiscais','']],vig:()=>vIcons([['i1','SEMINF (devolução)'],['idb','Controladoria'],['icoin','NF Complementar (sobra)']]),
     x:'Se houver necessidade de devolução física de mercadoria, o Almoxarifado emite a <b>SEMINF</b> e alinha os trâmites com a Controladoria. Se for sobra aceita pelo Comprador, solicita-se <b>NF complementar</b> ao fornecedor.'},
    {ic:'idb',t:'Envio das NFs à Controladoria',chips:[['Dia Subsequente','t']],vig:()=>vf('idb','Protocolo e Entrega de NFs',[['Protocolar NFs no dia de trabalho','t'],['Entregar no dia subsequente','o'],['Controladoria lança e provisiona','ok']],'ok'),
     x:'O registro das entradas no sistema SAP é realizado pela <b>Controladoria</b>. O Almoxarifado protocola todas as Notas Fiscais recebidas no dia e as entrega no <b>dia subsequente</b> para lançamento e provisão financeira.'},
    {ic:'iban',t:'Saída sem NF: Passe de Saída',chips:[['FRM.ALM-0010','o']],vig:()=>vForm('Passe de Saída com Autorizações','FRM.ALM-0010','Retirada sem NF · Autorização Formal'),
     x:'Nenhum material de propriedade da TEN sai da fábrica sem documento fiscal sem o devido controle. Saídas sem NF exigem obrigatoriamente o formulário <b>FRM.ALM-0010 (Passe de Saída)</b> com as assinaturas de autorização.'}
  ],
  game:{type:'deck',title:'O que fazer com este material?',buckets:['Liberar para Estoque','Bloquear e chamar Qualidade','Segregar e emitir SEMINF','Exigir Passe de Saída'],cards:[
    {t:'Lote de discos de corte recebido com quantidade e NF 100% corretas',a:0},
    {t:'Tinta industrial recebida sem FISPQ ou Certificado de Qualidade',a:1},
    {t:'Carga de parafusos com 30 caixas a menos e fornecedor vai retirar avarias',a:2},
    {t:'Ferramenta da TEN que precisa sair para calibração externa sem NF',a:3},
    {t:'Parafusos estruturais aguardando análise do Certificado de Qualidade',a:1},
    {t:'Mercadoria avariada recusada que precisa de devolução física à transportadora',a:2},
    {t:'EPIs aprovados pela Qualidade com quantidade batendo com o pedido',a:0},
    {t:'Equipamento para demonstração saindo dos portões da fábrica sem NF',a:3}
  ]},
  quiz:[
    {q:'Quando materiais que exigem FISPQ e certificados são considerados conferidos?',o:['Logo após a descarga do caminhão','Somente após a liberação pelo Setor da Qualidade','Quando o motorista assina o canhoto'],a:1,e:'Materiais com laudos só são conferidos após liberação da <b>Qualidade</b>.'},
    {q:'Qual documento o Almoxarifado emite em caso de devolução de mercadorias?',o:['FRM.SEG-0011','SEMINF (tramitada com Controladoria)','FRM.ALM-0015'],a:1,e:'O Almoxarifado emite a <b>SEMINF</b> junto à Controladoria.'},
    {q:'Qual é o prazo para entregar as NFs recebidas à Controladoria?',o:['Em até 30 dias','Protocolar no dia e entregar no dia útil subsequente','Apenas no fechamento do mês'],a:1,e:'Protocolar no dia e entregar no <b>dia subsequente</b>.'},
    {q:'Qual formulário autoriza a saída de materiais da TEN sem Nota Fiscal?',o:['FRM.ALM-0010 (Passe de Saída)','FRM.ALM-0014','FRM.ALM-0023'],a:0,e:'A saída sem NF exige o <b>FRM.ALM-0010 (Passe de Saída)</b>.'}
  ]
},
{ n:5, short:'Recusa e Devolução', title:'Devolução ou <span>Recusa</span> de Materiais', ic:'iban', badge:'Filtro Rígido', gameName:'Recusa no Ato x Devolução MIGO',
  chips:[['5 cenas',''],['2 modalidades · Suprimentos','o'],['≈ 4 min','t']],
  intro:'Quando o fornecedor entrega algo errado ou danificado, a TEN não aceita o prejuízo. Veja como recusar no ato ou operacionalizar uma devolução pós-MIGO com total segurança jurídica.',
  scenes:[
    {ic:'iban',t:'Quando Desfazer o Negócio',chips:[['Motivos de Recusa','bad']],vig:()=>vf('iban','Desfazer o Fornecimento',[['Desacordo com pedido de compra','bad'],['Fora de especificação ou laudo reprovado','o'],['Avarias severas de transporte','']],'bad'),
     x:'Decide-se desfazer o negócio quando as mercadorias chegam em desacordo com o pedido de compra, fora das especificações técnicas, avariadas ou com problemas de qualidade insanáveis.'},
    {ic:'i2',t:'Autorização Obrigatória da Liderança',chips:[['Alçada Obrigatória','t']],vig:()=>vAppr('Autorização de Recusa/Devolução','Logística','AUTORIZADA','Coord. Logística e Almoxarifado','i2'),
     x:'Nenhum material é recusado ou devolvido por conta própria: toda e qualquer solicitação de recusa e devolução exige <b>obrigatoriamente a autorização do Coordenador de Logística e Almoxarifado</b>.'},
    {ic:'iusers',t:'Tratativa Comercial por Suprimentos',chips:[['Frete Reverso','o']],vig:()=>vf('iusers','Negociação com Fornecedor',[['Setor de Suprimentos conduz a tratativa','t'],['Contratação de frete reverso se necessário','o'],['Almoxarifado não negocia frete direto','']],'ok'),
     x:'Quem faz a negociação e o contato com o fornecedor para devolução é o <b>Setor de Suprimentos</b>. Se for necessário contratar frete reverso, a responsabilidade da tratativa é integralmente de Suprimentos.'},
    {ic:'i1',t:'Modalidade 1: Recusa no Ato',chips:[['Verso da 1ª Via NF','o']],vig:()=>vAppr('1ª Via NF Fornecedor','Verso da Nota','RECUSADA NO ATO','Motivo + Data + Assinatura','i5',true),
     x:'Identificou o erro com o motorista ainda na doca? <b>Registra-se no verso da 1ª via da NF o motivo detalhado</b>, data, assina e devolve a nota junto com a carga na mesma hora ao transportador.'},
    {ic:'idb',t:'Modalidade 2: Devolução Pós-MIGO',chips:[['NF de Devolução','t']],vig:()=>vAppr('NF de Devolução (MIGO)','SAP MIGO','DEVOLUÇÃO DE MERCADORIA','Almoxarifado disponibiliza para coleta','idb'),
     x:'Se o defeito for constatado após a entrada sistêmica (troca ou garantia pós-MIGO), emite-se uma <b>Nota Fiscal de Devolução</b>. O Almoxarifado operacionaliza a NF e disponibiliza o lote para coleta da transportadora.'}
  ],
  game:{type:'deck',title:'Qual é a modalidade de devolução?',buckets:['Recusa no ato do recebimento','Devolução posterior (pós-MIGO)'],cards:[
    {t:'Material com avaria grave visto antes de descarregar: anotado no verso da 1ª via da NF',a:0},
    {t:'Falha oculta constatada após o recebimento sistêmico (MIGO) durante aplicação na fábrica',a:1},
    {t:'Nota Fiscal com CNPJ divergente: devolvida de imediato com o próprio transportador',a:0},
    {t:'Item em garantia de fábrica precisando de substituição após lançamento da NF',a:1},
    {t:'Motorista ainda na doca aguardando a recusa formalizada no verso da nota',a:0},
    {t:'Emissão de Nota Fiscal de Devolução pelo Almoxarifado para coleta futura da transportadora',a:1}
  ]},
  quiz:[
    {q:'De quem é a autorização obrigatória para recusa ou devolução de materiais?',o:['Do motorista do caminhão','Do Coordenador de Logística e Almoxarifado','Do fiscal de pátio'],a:1,e:'Exige obrigatoriamente autorização do <b>Coordenador de Logística e Almoxarifado</b>.'},
    {q:'Qual setor é responsável pela negociação e frete reverso com o fornecedor?',o:['Setor de Suprimentos','Portaria','Controladoria'],a:0,e:'A tratativa e contratação de frete reverso cabem a <b>Suprimentos</b>.'},
    {q:'Como é feita a recusa no ato do recebimento da mercadoria?',o:['Registra-se no verso da 1ª via da NF o motivo, data-se, assina-se e devolve ao transportador','Queima-se a Nota Fiscal na doca','Apenas um telefonema informal ao comprador'],a:0,e:'Anota-se no <b>verso da 1ª via da NF o motivo, data, assinatura</b> e devolve-se ao transportador.'},
    {q:'Como ocorre a devolução após o recebimento sistêmico (MIGO)?',o:['Devolvendo o verso da NF antiga rasurada','Através da emissão de Nota Fiscal de Devolução','Sem documento fiscal'],a:1,e:'Ocorre através da <b>emissão de Nota Fiscal de Devolução</b>.'}
  ]
},
{ n:6, short:'Armazenagem e Endereço', title:'Lógica de Armazenagem e <span>Endereçamento</span>', ic:'itag', badge:'Mestre do Endereço', gameName:'Regras de Armazenagem',
  chips:[['6 cenas',''],['ZL0024 · Padrão TEN','o'],['≈ 5 min','t']],
  intro:'Um almoxarifado organizado não perde tempo procurando peças. Conheça as regras inteligentes de localização, a transação ZL0024 e a fórmula de endereçamento da TEN.',
  scenes:[
    {ic:'ifac',t:'Lógica de Alocação Inteligente',chips:[['Diretrizes de Layout','t']],vig:()=>vIcons([['i8','Idênticos no mesmo local'],['ibolt','Alto consumo perto do atendente'],['ifac','Estruturais perto da pré-montagem']]),
     x:'Materiais idênticos devem ficar no mesmo endereço para agilizar inventários. Itens de <b>alto consumo</b> ficam próximos ao atendente do balcão. Já itens <b>estruturais</b> ficam na mesma rua e perto da pré-montagem das torres.'},
    {ic:'idb',t:'Transação SAP ZL0024',chips:[['SAP ZL0024','o']],vig:()=>vf('idb','Transação SAP ZL0024',[['Consultar localizações ocupadas','t'],['Mapear posições vazias para itens novos','ok'],['Atualizar sempre que mudar endereço','o']],'ok'),
     x:'No SAP, a transação <b>ZL0024</b> é o mapa da mina: nela você consulta as localizações existentes e posições disponíveis. Para materiais novos, nunca comprados, checam-se as posições vazias física e sistemicamente na ZL0024.'},
    {ic:'itag',t:'Padrão de Endereçamento TEN',chips:[['DEP.BLK.AND.APT','t']],vig:()=>vf('itag','Padrão de Endereçamento',[['DEPÓSITO: Local físico','o'],['BLOCO: Coluna da estante','t'],['ANDAR: Altura da prateleira',''],['APARTAMENTO: Vão do andar','']],'ok'),
     x:'O código de localização segue 4 níveis: <b>DEPÓSITO X(XX) . BLOCO (XX) . ANDAR (XX) . APARTAMENTO (XX)</b>. Depósito é o galpão; Bloco é a coluna da estante; Andar é a prateleira; Apartamento é o vão do andar.'},
    {ic:'itag',t:'Simulador de Endereçamento',chips:[['Simulador Interativo','o']],widget:'ender',hold:true,
     x:'Interaja com o simulador de endereçamento abaixo: monte combinações de Depósito, Bloco, Andar e Apartamento e veja como o código de identificação do almoxarifado é estruturado.'},
    {ic:'iclk',t:'Método FIFO e Produtos Químicos',chips:[['FIFO · FRM.ALM-0023','']],vig:()=>vf('iclk','FIFO e Químicos',[['FIFO: Primeiro entra, primeiro sai','ok'],['FRM.ALM-0023: Validade de tintas','o'],['Controle de contaminação conforme lei','t']],'ok'),
     x:'O almoxarifado adota obrigatoriamente o método <b>FIFO (First-In, First-Out)</b>: o primeiro que entra é o primeiro a sair. Itens químicos (tintas) têm validade e contaminação controladas com rigor pelo formulário <b>FRM.ALM-0023</b>.'},
    {ic:'iusers',t:'Propriedade de Clientes e Terceiros',chips:[['Centro TE2T','bad']],vig:()=>vf('iusers','Materiais de Terceiros / Clientes',[['NÃO recebem endereçamento físico padrão','bad'],['Identificação visual obrigatória','o'],['Controle sistêmico ZL0024 centro TE2T','t']]),
     x:'Atenção: <b>materiais de clientes NÃO entram no sistema de endereçamento físico normal</b>! Por esse motivo eles não são endereçados, somente identificados. Seu controle sistêmico fica na transação <b>ZL0024, centro TE2T</b>.'}
  ],
  game:{type:'deck',title:'Onde e como armazenar?',buckets:['Endereçamento normal (ZL0024)','Perto do atendente (balcão)','Perto da pré-montagem','Não endereçar (só identificar TE2T)'],cards:[
    {t:'Discos de desbaste e EPIs com saída diária contínua',a:1},
    {t:'Chapas e parafusos estruturais pesados da torre',a:2},
    {t:'Peças fornecidas por cliente externo armazenadas na fábrica',a:3},
    {t:'Material novo cadastrado com posição livre na ZL0024',a:0},
    {t:'Eletrodos e consumíveis comuns de reposição de estoque',a:0},
    {t:'Componente de cliente que opera no centro TE2T',a:3},
    {t:'Flanges estruturais aguardando montagem dos anéis',a:2},
    {t:'Fitas e itens auxiliares de balcão de alta rotatividade',a:1}
  ]},
  quiz:[
    {q:'Qual é a estrutura oficial do código de endereçamento do Almoxarifado?',o:['Rua . Prateleira . Caixa','DEPÓSITO X(XX) . BLOCO (XX) . ANDAR (XX) . APARTAMENTO (XX)','Setor . Galpão . Letra . Número'],a:1,e:'O padrão é <b>DEPÓSITO . BLOCO . ANDAR . APARTAMENTO</b>.'},
    {q:'Qual transação SAP é usada para consultar localizações e posições vazias?',o:['ME21N','ZL0024','MIGO'],a:1,e:'Utiliza-se a transação <b>ZL0024</b>.'},
    {q:'Qual método de giro de estoque é obrigatório no Almoxarifado?',o:['LIFO (último que entra, primeiro que sai)','FIFO (First-In, First-Out: primeiro entra, primeiro sai)','Giro aleatório'],a:1,e:'O almoxarifado segue obrigatoriamente o método <b>FIFO</b>.'},
    {q:'Como são tratados os materiais de propriedade de clientes externos?',o:['Recebem o mesmo código de estante que itens próprios','Não são endereçados, apenas identificados, controlados na ZL0024 centro TE2T','Ficam misturados sem identificação'],a:1,e:'<b>Não são endereçados</b>, apenas identificados (ZL0024 centro TE2T).'}
  ]
},
{ n:7, short:'Atendimento no Balcão', title:'Atendimento de Solicitação <span>Interna</span>', ic:'i1', badge:'Balcão Ágil', gameName:'Ciclo do Balcão',
  chips:[['7 cenas',''],['FRM.ALM-0014 · 7 etapas','o'],['≈ 5 min','t']],
  intro:'O colaborador da produção chega ao balcão para retirar insumos. O atendimento deve ser rápido, seguro e sem falha de registro. Acompanhe o ciclo completo da FRM.ALM-0014.',
  scenes:[
    {ic:'i1',t:'O Documento: FRM.ALM-0014',chips:[['FRM.ALM-0014','t']],vig:()=>vForm('Requisição de Materiais','FRM.ALM-0014','Formalização de Saída · Balcão Almoxarifado'),
     x:'A retirada de materiais é formalizada exclusivamente pelo formulário <b>FRM.ALM-0014 – Requisição de Materiais</b>. Ele formaliza a solicitação, autoriza a entrega e dá suporte à baixa de consumo.'},
    {ic:'iusers',t:'Etapa 1 e 2: Solicitação no Balcão',chips:[['Passo 1 e 2','o']],vig:()=>vf('iusers','Informações no Balcão',[['Descrição clara do material','t'],['Código SAP do item','ok'],['Quantidade exata necessária','o']],'ok'),
     x:'O solicitante dirige-se ao balcão e informa o material desejado. Para agilizar o atendimento, recomenda-se informar sempre que possível: <b>Descrição completa</b>, <b>Código SAP</b> e <b>Quantidade necessária</b>.'},
    {ic:'iboxes',t:'Etapa 3: Localização e Separação',chips:[['Passo 3','']],vig:()=>vf('iboxes','Localizar e Separar',[['Localizar pelo código de endereço','t'],['Separar quantidade solicitada','ok'],['Verificar integridade física da peça','']],'ok'),
     x:'De posse das informações, o atendente consulta o endereço do material no estoque e realiza a <b>separação física dos itens</b> rigorosamente conforme as especificações e quantidades solicitadas.'},
    {ic:'ichk',t:'Etapa 4 e 5: Entrega e Conferência Conjunta',chips:[['Passo 4 e 5','ok']],vig:()=>vf('ichk','Conferência Conjunta',[['Atendente e solicitante juntos','ok'],['Validar item a item','t'],['Confirmar quantidade física exata','o']],'ok'),
     x:'O material é entregue no balcão e, nesse momento crucial, <b>o solicitante e o atendente realizam a conferência conjunta</b>, checando se itens e quantidades entregues correspondem exatamente ao pedido.'},
    {ic:'i5',t:'Etapa 6: Assinatura de Recebimento',chips:[['Passo 6','t']],vig:()=>vAppr('FRM.ALM-0014','Retirada','RECEBIDO E CONFERIDO','Solicitante da Área','i5'),
     x:'Estando os materiais em total conformidade, o solicitante <b>assina o campo de recebimento da FRM.ALM-0014</b>, atestando a posse do material e responsabilizando-se pelo seu uso na área.'},
    {ic:'idb',t:'Etapa 7: Baixa Sistêmica no SAP',chips:[['Passo 7','o']],vig:()=>vf('idb','Baixa de Estoque no SAP',[['FRM.ALM-0014 assinada enviada','t'],['Registro de consumo / saída','ok'],['Atualização do saldo do estoque','o']],'ok'),
     x:'Concluído o atendimento, a FRM.ALM-0014 assinada é encaminhada ao responsável pelo registro para realizar a <b>baixa no sistema SAP</b> e atualizar os saldos de estoque da TEN.'},
    {ic:'itag',t:'Compra Direta x Material para Estoque',chips:[['Destino','']],vig:()=>vIcons([['itag','Compra Direta (segregado para área)'],['iboxes','Estoque (atendimento operacional)']]),
     x:'Material de <b>Compra Direta</b> é aquele solicitado por uma área para aplicação imediata ou específica: fica identificado e segregado até a retirada. Já o <b>Material para Estoque</b> fica guardado nas estantes atendendo à rotina.'}
  ],
  game:{type:'order',title:'As 7 etapas do atendimento no balcão (FRM.ALM-0014)'},
  quiz:[
    {q:'Qual formulário formaliza a retirada de materiais do almoxarifado?',o:['FRM.ALM-0014 (Requisição de Materiais)','FRM.ALM-0015','FRM.SEG-0011'],a:0,e:'A saída de materiais é formalizada pela <b>FRM.ALM-0014</b>.'},
    {q:'O que o solicitante deve informar no balcão para agilizar o atendimento?',o:['Apenas o apelido da peça','Descrição do material, Código SAP e Quantidade necessária','O nome do fornecedor externo'],a:1,e:'Recomenda-se informar <b>Descrição, Código SAP e Quantidade</b>.'},
    {q:'Como é feita a conferência dos materiais no momento da entrega?',o:['O solicitante pega e confere sozinho em casa','Conferência conjunta entre solicitante e atendente no balcão','Não é necessária conferência se o papel estiver assinado'],a:1,e:'Deve ser realizada <b>conferência conjunta</b> no momento da entrega.'},
    {q:'Qual é a diferença de Compra Direta para Material de Estoque?',o:['Compra direta não tem Nota Fiscal','Compra direta tem aplicação específica do requisitante e fica segregada aguardando retirada','São exatamente a mesma coisa'],a:1,e:'Compra direta tem <b>aplicação específica e fica segregada para retirada</b>.'}
  ]
},
{ n:8, short:'Avarias e Terceiros', title:'Avarias Internas e <span>Gestão de Terceiros</span>', ic:'iwrench', badge:'Sentinela do Patrimônio', gameName:'Tratativa de Ocorrências',
  chips:[['5 cenas',''],['NC · Descarte · Centro TE2T','o'],['≈ 4 min','t']],
  intro:'Acidentes e danos acontecem no manuseio diário. O diferencial do profissional TEN é saber agir rápido: registrar a não conformidade, segregar o lote e tratar materiais de terceiros com máximo zelo.',
  scenes:[
    {ic:'ialert',t:'Material Danificado Internamente',chips:[['Dano Interno','bad']],vig:()=>vf('ialert','Dano Interno Identificado',[['1. Descrever Não Conformidade (NC)','bad'],['2. Documentar ação corretiva','o'],['Comprometimento das condições','']],'bad'),
     x:'Se um material for danificado por manuseio inadequado ou preservação incorreta dentro do almoxarifado, o passo a passo é mandatório: <b>1. Identificar a não conformidade</b> descrevendo o ocorrido; <b>2. Documentar a ação</b> a ser tomada.'},
    {ic:'iban',t:'Segregação e Reposição de Comprados',chips:[['Devolução ao Fornecedor','o']],vig:()=>vf('iban','Segregar e Repor',[['Segregar na área específica','bad'],['Efetivar devolução ao fornecedor','t'],['Repor quantidade consumida','ok']],'ok'),
     x:'O lote avariado deve ser <b>segregado imediatamente</b> na área específica do almoxarifado. Em seguida, efetiva-se a devolução ao fornecedor/fabricante e providencia-se a reposição da quantidade para não desabastecer a fábrica.'},
    {ic:'iwrench',t:'Itens de Fabricação Interna',chips:[['Descarte Apropriado','t']],vig:()=>vf('iwrench','Fabricação Interna Avariada',[['Descarte ambientalmente adequado','o'],['Abrir ordem de reposição interna','t'],['Garantir que não vá para a torre','bad']],'o'),
     x:'Quando o material danificado for de fabricação própria da TEN (estruturas montadas, virolas, suportes internos), a conduta muda: deve-se <b>descartá-lo de maneira adequada</b> (resíduos) e providenciar a reposição da quantidade.'},
    {ic:'ishield',t:'Cuidados com Propriedade de Clientes',chips:[['Preservação Rigorosa','ok']],vig:()=>vf('ishield','Propriedade de Terceiros',[['Preservação física idêntica aos itens TEN','ok'],['Identificação visual permanente','t'],['Controle no SAP ZL0024 centro TE2T','o']],'ok'),
     x:'Materiais de clientes ou fornecedores externos exigem o <b>mesmo rigor de controle físico e preservação</b> dispensado aos materiais próprios da TEN. Eles devem estar sempre identificados e monitorados no SAP pela transação <b>ZL0024 centro TE2T</b>.'},
    {ic:'imail',t:'Ocorrência com Material de Terceiro',chips:[['Notificação Formal','bad']],vig:()=>vf('imail','Ocorrência com Cliente Externo',[['Identificar NC e documentar ação','bad'],['Segregar lote no almoxarifado','o'],['Remeter ocorrência formal ao cliente','t'],['Reter informação documentada','ok']],'bad'),
     x:'Se algum material de terceiro for perdido, avariado ou inadequado: identificar a NC, documentar a ação, <b>segregar o material</b>, <b>remeter imediatamente a ocorrência ao cliente externo</b> e reter toda a informação documentada.'}
  ],
  game:{type:'deck',title:'Tratativa correta da ocorrência',buckets:['Item Comprado Avariado','Item Fabricação Interna','Material de Cliente / Terceiro'],cards:[
    {t:'Lote de discos de corte quebrado por queda da empilhadeira: segregar, devolver ao fabricante e repor',a:0},
    {t:'Suporte metálico fabricado na caldeiraria da TEN amassado: descartar adequadamente e repor',a:1},
    {t:'Componente de cliente danificado na estocagem: abrir NC, segregar e remeter ocorrência ao cliente',a:2},
    {t:'Tinta industrial vencida comprada de fornecedor: segregar, devolver e solicitar reposição',a:0},
    {t:'Chapa furada internamente na TEN com erro dimensional irrecuperável: descarte e reposição',a:1},
    {t:'Flange de cliente constatada enferrujada no TE2T: reter informação documentada e notificar cliente',a:2}
  ]},
  quiz:[
    {q:'Quais são os dois primeiros passos ao constatar material danificado internamente?',o:['Esconder a peça e não avisar ninguém','Identificar a não conformidade (descrever) e documentar a ação a ser tomada','Jogar no lixo comum sem registro'],a:1,e:'<b>Identificar a não conformidade e documentar a ação a ser tomada</b>.'},
    {q:'O que deve ser feito com material de fabricação interna danificado?',o:['Descartá-lo de maneira adequada e repor a quantidade','Vender como sucata clandestina','Tentar usar na torre mesmo com defeito'],a:0,e:'Deve-se <b>descartá-lo de maneira adequada e repor a quantidade</b>.'},
    {q:'Em qual transação e centro é feito o controle de materiais de clientes?',o:['Transação ME21N centro 1000','Transação ZL0024, centro TE2T','Transação MIGO centro FISC'],a:1,e:'O controle sistêmico é na <b>ZL0024, centro TE2T</b>.'},
    {q:'Se material de terceiro for avariado, além de abrir NC e segregar, o que é mandatório?',o:['Cobrar o operador imediatamente','Remeter a ocorrência ao cliente externo e reter informação documentada','Substituir por qualquer peça sem avisar'],a:1,e:'<b>Remeter a ocorrência ao cliente externo e reter informação documentada</b>.'}
  ]
},
{ n:9, short:'Inventário de Estoque', title:'Inventário Periódico de <span>Estoque</span>', ic:'ical', badge:'Acuracidade 100%', gameName:'Ciclo do Inventário',
  chips:[['7 cenas',''],['MI01 a MI20 · 4 assinaturas','o'],['≈ 6 min','t']],
  intro:'O inventário anual tem efeito fiscal e valida toda a gestão da TEN perante auditorias e acionistas. Veja a sequência exata de transações SAP, contagens e aprovações de ajuste.',
  scenes:[
    {ic:'ical',t:'O que é o Inventário Periódico',chips:[['Efeito Fiscal','t']],vig:()=>vf('ical','Inventário Anual Periódico',[['Ocorre anualmente no fim do período','t'],['Contagem física x saldo sistêmico','ok'],['Possui efeito fiscal e contábil','o']],'ok'),
     x:'Ocorre anualmente, ao final de cada período contábil, realizando a <b>contagem física de cada item</b> armazenado e comparando ao saldo sistêmico. Tem <b>efeito fiscal</b> direto e atesta a integridade patrimonial da TEN.'},
    {ic:'idb',t:'Passo 1 e 2: Criar e Imprimir',chips:[['MI01 · MI21','o']],vig:()=>vf('idb','MI01 e MI21 · Criação e Impressão',[['MI01: Criar relatório de inventário','t'],['MI21: Imprimir folhas de contagem física','ok'],['Base para anotação manual em campo','']],'ok'),
     x:'No SAP, inicia-se relacionando os itens a serem inventariados para criar o documento de inventário pela transação <b>MI01</b>. Em seguida, imprime-se a listagem para contagem física de campo através da transação <b>MI21</b>.'},
    {ic:'i5',t:'Passo 3 e 4: Contagem Física e Digitação',chips:[['MI04','t']],vig:()=>vf('i5','Contagem e Digitação MI04',[['Contagem física manual no pátio',''],['Anotação no documento impresso','t'],['MI04: Digitação dos saldos contados no SAP','ok']],'ok'),
     x:'A equipe realiza a contagem física nas estantes e anota manualmente no documento impresso. De posse das informações anotadas, insere-se a primeira contagem no SAP através da transação <b>MI04</b>.'},
    {ic:'i4',t:'Passo 5: Lista de Diferenças (MI20)',chips:[['MI20','o']],vig:()=>vf('i4','MI20 · Lista de Diferenças',[['Imprimir lista de diferenças no SAP','o'],['Confronto: Físico versus Sistêmico','t'],['Detecção de divergências para reconferência','']],'o'),
     x:'Para confrontar o físico digitado com o saldo contábil, imprime-se o relatório da lista de diferenças através da transação <b>MI20</b>, identificando onde há divergência entre a quantidade física e a sistêmica.'},
    {ic:'irep',t:'Passo 6 e 7: 2ª Contagem e Desempate',chips:[['MI05 · Desempate','t']],vig:()=>vf('irep','2ª e 3ª Contagem (MI05)',[['Recontagem por equipe/pessoa diferente','o'],['MI05: Registro da segunda contagem','t'],['3ª contagem desempate: coincide com uma anterior','ok']],'ok'),
     x:'Havendo diferença, o item deve ser recontado por <b>equipe diferente</b> da primeira, registrando na transação <b>MI05</b>. Se persistir divergência, realiza-se uma <b>terceira contagem</b>, que deve coincidir com uma das anteriores para ser a correta.'},
    {ic:'i2',t:'Passo 8: As 4 Assinaturas de Ouro',chips:[['4 Assinaturas','o']],vig:()=>vIcons([['i2','Coord. Logística e Almox.'],['i2','Gerente de Suprimentos'],['icoin','Gerente Financeiro'],['iladder','Diretor da Fábrica TEN']]),
     x:'Finalizada a apuração, para autorizar o ajuste de estoque, o relatório emitido pelo SAP deve ser <b>assinado e carimbado por 4 líderes</b>: Coord. Logística/Almoxarifado, Ger. Suprimentos, Ger. Financeiro e <b>Diretor da Fábrica TEN</b>!'},
    {ic:'ichk',t:'Passo 9: Ajuste Final na MI20',chips:[['Ajuste MI20','ok']],vig:()=>vAppr('Relatório de Divergências SAP','MI20','REGISTRAR DIFERENÇA','4 Líderes Assinaram e Carimbaram','ichk'),
     x:'Com o relatório formalmente assinado e carimbado pelas 4 lideranças, realiza-se o ajuste definitivo de estoque acionando a opção <b>"Registrar Diferença"</b> dentro da própria transação <b>MI20</b>.'}
  ],
  game:{type:'order',title:'A sequência oficial do Inventário Periódico no SAP'},
  quiz:[
    {q:'Qual é a transação SAP para relacionar itens e criar o relatório de inventário?',o:['MI21','MI01','MIGO'],a:1,e:'Cria-se o relatório de inventário na <b>MI01</b>.'},
    {q:'Em qual transação insere-se a primeira contagem física no SAP?',o:['MI04','MI05','MI20'],a:0,e:'A primeira contagem é inserida na transação <b>MI04</b>.'},
    {q:'Se houver divergência, quem deve realizar a segunda contagem (MI05)?',o:['A mesma equipe da primeira contagem','Uma equipe ou pessoa diferente da que fez a primeira','O auditor externo'],a:1,e:'Deve ser realizada por <b>equipe ou pessoa diferente</b>.'},
    {q:'Quantas assinaturas e carimbos são exigidos no relatório de divergências antes do ajuste?',o:['Apenas do conferente','Quatro: Coord. Logística, Ger. Suprimentos, Ger. Financeiro e Diretor da Fábrica','Duas: Almoxarife e Comprador'],a:1,e:'Exige <b>4 assinaturas de liderança</b> (inclusive Diretor da Fábrica).'}
  ]
},
{ n:10, short:'Desafio Final', title:'Desafio <span>Final</span> do Almoxarifado', ic:'istar', badge:'Mestre do Almoxarifado', gameName:'Rodada Mista de Casos Críticos',
  chips:[['Revisão + 10 casos',''],['8 perguntas, 15 s','o'],['≈ 6 min','t']],
  intro:'Chegou a hora decisiva. Uma revisão rápida dos pontos-chave, dez casos operacionais na rodada mista e oito perguntas contra o relógio para conquistar a insígnia máxima da TEN!',
  scenes:[
    {ic:'i4',t:'Ressuprimento e Estoque',chips:[['FRM.ALM-0015','o']],vig:()=>vf('i4','Ressuprimento',[['Análise diária de consumo','o'],['FRM.ALM-0015 · Definição','t'],['Aprovação da Coordenação','ok']]),
     x:'Análise diária de consumo, estoque mínimo e ponto de ressuprimento. Definição pela <b>FRM.ALM-0015</b>, RM criada no SAP e aprovada pelo <b>Coordenador de Logística e Almoxarifado</b>.'},
    {ic:'i7',t:'Recepção Segura e Carimbo',chips:[['Anexo I','t']],vig:()=>vf('i7','Recepção e Doca',[['EPIs + FRM.SEG-0011','ok'],['Inspeção visual + foto se avaria','t'],['Carimbo Provisório Anexo I','o']]),
     x:'EPIs completos, check-list da empilhadeira na <b>FRM.SEG-0011</b>, área isolada, conferência de dados da TEN na NF e carimbo <b>"Sujeito a conferência posterior"</b>.'},
    {ic:'iban',t:'Recusa e Devolução',chips:[['2 Formas','bad']],vig:()=>vf('iban','Recusa e Devolução',[['Verso da 1ª via no ato','o'],['NF de Devolução pós-MIGO','t'],['Suprimentos negocia e freta','ok']]),
     x:'Recusa exige autorização da Coordenação. No ato: <b>anotação no verso da 1ª via da NF</b>. Pós-MIGO: <b>NF de Devolução</b>. Suprimentos cuida da negociação e frete reverso.'},
    {ic:'itag',t:'Endereço e Balcão',chips:[['Padrão TEN','ok']],vig:()=>vf('itag','Endereço e Balcão',[['Padrão DEP.BLK.AND.APT','ok'],['FRM.ALM-0014 no balcão','t'],['Terceiros na ZL0024 TE2T','o']]),
     x:'Padrão <b>DEPÓSITO . BLOCO . ANDAR . APARTAMENTO</b>. FIFO obrigatório. Químicos na <b>FRM.ALM-0023</b>. Balcão pela <b>FRM.ALM-0014</b> com conferência conjunta e baixa SAP.'},
    {ic:'ical',t:'Inventário e 4 Assinaturas',chips:[['MI01 a MI20','t']],vig:()=>vf('ical','Inventário SAP',[['MI01 · MI21 · MI04 · MI20 · MI05','ok'],['4 assinaturas obrigatórias','t'],['Ajuste final na MI20','o']]),
     x:'Ciclo SAP: <b>MI01 → MI21 → MI04 → MI20 → MI05</b>. 3ª contagem desempata. Relatório de divergências assinado por <b>4 líderes</b> antes de registrar diferença na MI20.'}
  ],
  game:{type:'deck',title:'Rodada Mista de Casos Críticos',cards:[
    {s:'Recepção',t:'Caminhão descarregado na doca: qual carimbo aplicar na NF?',b:['Sujeito a conferência posterior','Recebido e Aprovado','Entrada SAP Concluída'],a:0},
    {s:'Transação',t:'Consultar posições vazias e localizações de estoque',b:['ME51N','ZL0024','MI01'],a:1},
    {s:'Saída sem NF',t:'Retirada de material da TEN sem Nota Fiscal',b:['FRM.ALM-0010 (Passe de Saída)','FRM.ALM-0014','Anotar em papel avulso'],a:0},
    {s:'Formulário',t:'Definição de itens para compor o Estoque',b:['FRM.SEG-0011','FRM.ALM-0015','FRM.ALM-0023'],a:1},
    {s:'Recusa no Ato',t:'Mercadoria em desacordo identificada antes da saída do motorista',b:['Anotar motivo no verso da 1ª via da NF, datar e assinar','Emitir NF de Devolução na MI20','Receber e depois ver o que faz'],a:0},
    {s:'Giro',t:'Método obrigatório de movimentação física do estoque',b:['LIFO (último entra, primeiro sai)','FIFO (primeiro entra, primeiro sai)','Curva ABC aleatória'],a:1},
    {s:'Inventário',t:'Quem deve realizar a 2ª contagem na MI05?',b:['Mesma equipe da 1ª contagem','Equipe ou pessoa diferente','Auditor externo'],a:1},
    {s:'Químicos',t:'Formulário que controla validade de tintas e contaminação',b:['FRM.ALM-0023','FRM.ALM-0014','FRM.SEG-0011'],a:0},
    {s:'Ajuste SAP',t:'Onde é feito o ajuste final de estoque do inventário?',b:['Na transação MI01','Na ação Registrar Diferença da transação MI20','Na ZL0024 centro TE2T'],a:1},
    {s:'Alçada',t:'Quem autoriza recusa ou devolução de materiais?',b:['Coordenador de Logística e Almoxarifado','Qualquer colaborador','O motorista do caminhão'],a:0}
  ]},
  qtime:15,
  quiz:[
    {q:'Qual é o objetivo principal do PO.ALM-0001?',o:['Apenas descarregar caminhões','Controle e apuração eficaz dos estoques físico e contábil','Comprar insumos sem aprovação'],a:1,e:'Controle e apuração eficaz dos estoques nos âmbitos <b>físico e contábil</b>.'},
    {q:'Qual setor realiza o lançamento das NFs de entrada no SAP?',o:['Controladoria','Portaria','Almoxarifado no balcão'],a:0,e:'O lançamento das NFs é feito pela <b>Controladoria</b>.'},
    {q:'Qual é o formulário de check-list pré-uso da empilhadeira?',o:['FRM.ALM-0014','FRM.SEG-0011','FRM.ALM-0015'],a:1,e:'Check-list de equipamentos é o <b>FRM.SEG-0011</b>.'},
    {q:'Como são tratados os materiais de propriedade de clientes?',o:['Recebem código comum de estante','Não são endereçados, apenas identificados (ZL0024 centro TE2T)','Descartados como refugo'],a:1,e:'<b>Não são endereçados</b>, apenas identificados (ZL0024 centro TE2T).'},
    {q:'Qual formulário é assinado pelo solicitante na retirada no balcão?',o:['FRM.ALM-0014 (Requisição de Materiais)','FRM.ALM-0010','FRM.ALM-0023'],a:0,e:'A saída é assinada na <b>FRM.ALM-0014</b>.'},
    {q:'Na divergência de inventário, quantas contagens no máximo são realizadas?',o:['Apenas uma','Até três contagens (a 3ª deve coincidir com uma anterior)','Dez contagens consecutivas'],a:1,e:'Realizam-se até <b>três contagens</b> (a 3ª coincide com uma anterior).'},
    {q:'Quantas assinaturas de liderança autorizam o ajuste na MI20?',o:['Uma assinatura','Quatro assinaturas (inclusive Diretor da Fábrica TEN)','Nenhuma'],a:1,e:'Exige <b>4 assinaturas de liderança</b> no relatório do SAP.'},
    {q:'Qual transação SAP é usada para inserir a 1ª contagem do inventário?',o:['MI01','MI04','MI20'],a:1,e:'A 1ª contagem é digitada na <b>MI04</b>.'}
  ]
}
];
const GINST={
deck:'Leia o caso na carta e toque na resposta certa. Acertos seguidos aumentam o combo; se errar duas vezes, a resposta certa acende.',
order:'Toque nas etapas na ordem em que acontecem. Acertos seguidos aumentam o combo.'
};
M.forEach(m=>m.scenes.forEach(s=>{if(s.p===undefined)s.p=''}));

/* ================= Configuração da trilha ================= */
const CFG={code:'PO.ALM-0001',rev:'05',name:'Rotinas do Almoxarifado',hero:'Rotinas do <span>Almoxarifado</span>',hud:'Trilha de Almoxarifado',
  key:'trilha-alm0001-v1',origem:'trilha-alm0001',title:'Trilha PO.ALM-0001 · Almoxarifado TEN',
  levels:[[0,'Aprendiz de Estoque'],[400,'Operador de Recebimento'],[1100,'Conferente de Campo'],[2000,'Almoxarife Especialista'],[3200,'Gestor de Acuracidade'],[4400,'Mestre do Almoxarifado']],
  guide:t=>`
    <div class="gcard"><h3>${ic('iclk')}Prazos e Rotinas</h3>${t(['Etapa / Ação','Regra / Frequência'],[['Consumo e Ressuprimento','Análise diária do estoque mínimo e ponto de ressuprimento'],['NFs recebidas','Protocolar no dia e entregar à Controladoria no dia subsequente'],['Inventário de Estoque','Periódico anual ao final do período contábil (efeito fiscal)'],['Liberação de Químicos','Validade de tintas e contaminação controladas pela FRM.ALM-0023'],['Liberação com Laudos','Certificados e FISPQ só conferidos após aprovação da Qualidade']])}</div>
    <div class="gcard"><h3>${ic('i1')}Formulários (FRM)</h3>${t(['Código','Finalidade'],[['FRM.ALM-0015','Definição de itens para Estoque'],['FRM.SEG-0011','Check-list diário de equipamentos e empilhadeiras'],['FRM.ALM-0010','Passe de saída com autorizações (saída sem NF)'],['FRM.ALM-0023','Controle de validade de químicos (tintas) e contaminação'],['FRM.ALM-0014','Requisição de Materiais (saída no balcão e registro de consumo)'],['SEMINF','Solicitação para emissão de NF de devolução junto à Controladoria']])}</div>
    <div class="gcard"><h3>${ic('idb')}Transações SAP</h3>${t(['Transação','Finalidade'],[['ME51N','Criar Requisição de Compra para reposição de estoque'],['ZL0024','Consultar localizações ocupadas e posições vazias'],['ZL0024 (TE2T)','Controle de materiais de propriedade de clientes/terceiros'],['MIGO','Recebimento físico/fiscal e devolução pós-recebimento'],['MI01','Relacionar itens e criar documento de inventário'],['MI21','Imprimir relatório para contagem física manual'],['MI04','Digitar a 1ª contagem física de inventário'],['MI20','Imprimir lista de diferenças e executar Registrar Diferença'],['MI05','Digitar a 2ª contagem de inventário (equipe diferente)']])}</div>
    <div class="gcard"><h3>${ic('itag')}Padrão de Endereçamento</h3>${t(['Nível','Significado'],[['DEPÓSITO X(XX)','Identificação do galpão/local'],['BLOCO (XX)','Identificação da coluna da estante'],['ANDAR (XX)','Identificação da prateleira (altura)'],['APARTAMENTO (XX)','Identificação do apartamento/vão do andar']])}<p class="gnote">Regra FIFO obrigatória: primeiro que entra é o primeiro a sair. Itens idênticos no mesmo local. Alto consumo perto do atendente. Estruturais na mesma rua perto da pré-montagem. Terceiros NÃO entram no endereçamento físico normal.</p></div>
    <div class="gcard"><h3>${ic('i2')}Alçadas e Responsabilidades</h3>${t(['Decisão / Processo','Responsável'],[['Aprovação de Requisições','Coordenador de Logística e Almoxarifado'],['Autorização de Recusa/Devolução','Coordenador de Logística e Almoxarifado'],['Negociação / Frete Reverso','Setor de Suprimentos'],['Entrada de NFs no SAP','Setor da Controladoria'],['Liberação de laudos e FISPQ','Setor da Qualidade'],['Ajuste de inventário (MI20)','4 assinaturas: Coord. Logística, Ger. Suprimentos, Ger. Financeiro e Diretor da Fábrica TEN']])}</div>
    <div class="gcard"><h3>${ic('iban')}Recusa e Devolução</h3><p class="gnote" style="font-size:14px"><strong>No ato do recebimento:</strong> registrar no verso da 1ª via da NF o motivo, datar, assinar e devolver ao transportador. <strong>Após o recebimento (MIGO):</strong> devolução por troca ou garantia com emissão de Nota Fiscal de Devolução pelo Almoxarifado para coleta da transportadora.</p></div>`};
