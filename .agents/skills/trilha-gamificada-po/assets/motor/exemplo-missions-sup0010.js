/* ================= Trilha PO.SUP-0010 · Gestão de Contratos e Serviços ================= */
const M=[
{ n:1, short:'Por que gerir contratos', title:'Por que gerir <span>contratos</span>', ic:'iscale', badge:'Guardião do Negócio', gameName:'Quem faz o quê?',
  chips:[['4 cenas',''],['Objetivo e papéis','o'],['≈ 4 min','t']],
  intro:'Contratar um serviço é trazer outra empresa para dentro da TEN. Pessoas, equipamentos e riscos entram junto. Esta missão mostra por que o PO.SUP-0010 existe e quem participa de cada etapa.',
  scenes:[
    {ic:'ishield',t:'Proteger o negócio',chips:[['Objetivo','t']],vig:()=>vf('ishield','Segurança do negócio',[['Serviço com ou sem material',''],['Cessão de mão de obra',''],['Uso de equipamentos','']],'ok'),
     x:'O procedimento padroniza a contratação de serviços, com ou sem material, mão de obra ou equipamento. O foco é a <b>segurança do negócio</b>: proteger a TEN, inclusive da responsabilidade solidária quando um prestador está irregular.'},
    {ic:'iusers',t:'Quem pede e quem contrata',chips:[['Papéis','']],vig:()=>vIcons([['iusers','Área requisitante'],['icoin','Suprimentos'],['idb','Gestão de Contratos']]),
     x:'A <b>área requisitante</b> precisa do serviço e descreve o escopo. <b>Suprimentos</b> negocia e contrata. A <b>Gestão de Contratos</b> cuida dos contratos, da documentação do prestador e da liberação de acesso à fábrica.'},
    {ic:'iclip',t:'Quem acompanha e aprova',chips:[['Papéis','']],vig:()=>vIcons([['iclip','Gestor do Contrato'],['i2','Gestor da área'],['iladder','Diretoria']]),
     x:'O <b>Gestor do Contrato</b> acompanha a execução no dia a dia e aprova as medições. O gestor da área aprova a requisição, e a Diretoria aprova requisições, contratos e pedidos conforme a alçada.'},
    {ic:'ibook',t:'Quem dá suporte',chips:[['Papéis','']],vig:()=>vIcons([['ibook','Jurídico'],['icoin','Fiscal'],['iusers','RH'],['iheart','SMS'],['iscale','Compliance']]),
     x:'O <b>Jurídico</b> elabora o contrato, o <b>Fiscal</b> analisa o enquadramento tributário do prestador, o <b>RH</b> recebe a documentação e libera o acesso, e o <b>SMS</b> aprova os documentos de saúde, segurança e meio ambiente. Compliance garante que tudo siga a lei e o código de ética.'}
  ],
  game:{type:'deck',title:'Quem faz o quê?',buckets:['Área requisitante','Gestão de Contratos','Gestor do Contrato','Jurídico'],cards:[
    {t:'Elaborar o contrato',a:3},{t:'Aprovar o boletim de medição',a:2},{t:'Abrir a RS com o escopo detalhado',a:0},
    {t:'Liberar o acesso do prestador à TEN',a:1},{t:'Avisar 30 dias antes do fim do contrato',a:1},{t:'Acompanhar a execução no local',a:2},
    {t:'Elaborar o termo de encerramento',a:3},{t:'Definir objetivo e duração do serviço',a:0}]},
  quiz:[
    {q:'Qual é o objetivo do PO.SUP-0010?',o:['Reduzir o número de prestadores','Padronizar a contratação de serviços e proteger a TEN','Acelerar pagamentos'],a:1,e:'Padronizar a contratação com <b>segurança do negócio</b>.'},
    {q:'Quem aprova as medições do prestador?',o:['O comprador','O Gestor do Contrato','O Jurídico'],a:1,e:'O <b>Gestor do Contrato</b>.'},
    {q:'Quem aprova os documentos de saúde e segurança do prestador?',o:['SMS','Fiscal','Suprimentos'],a:0,e:'O <b>SMS</b>.'},
    {q:'Quem faz a análise fiscal do prestador?',o:['Jurídico','Fiscal (contabilidade)','RH'],a:1,e:'O setor <b>Fiscal</b>.'}]
},
{ n:2, short:'Cadastro e homologação', title:'Cadastro e <span>homologação</span>', ic:'iclip', badge:'Porta de Entrada', gameName:'Precisa homologar?',
  chips:[['6 cenas',''],['R$ 800 mil · 7 categorias','o'],['≈ 5 min','t']],
  intro:'Antes de contratar, a TEN precisa conhecer o prestador. O cadastro vale para todos. A homologação é uma análise mais profunda para quem fatura alto ou atua em áreas de risco.',
  scenes:[
    {ic:'imail',t:'Pedido de cadastro',chips:[['Passo 1','o']],k:'1',kl:'de 2 passos',vig:()=>vf('imail','E-mail para Suprimentos',[['FRM.SUP-0020 · Ficha cadastral','t'],['FRM.SUP-0021 · Dados bancários','t']],'',[['Carimbado e assinado','o']]),
     x:'Qualquer colaborador pode pedir o cadastro de um fornecedor, a qualquer momento, mesmo sem RM aberta. Basta um e-mail formal para Suprimentos com a <b>Ficha Cadastral (FRM.SUP-0020)</b> e a <b>Declaração de Dados Bancários (FRM.SUP-0021)</b>, carimbadas e assinadas pelo representante legal.'},
    {ic:'idb',t:'Cadastro na Central',chips:[['Passo 2','o']],k:'2',kl:'de 2 passos',vig:()=>vf('idb','Central de Serviços AG',[['Chamado aberto por Suprimentos','t'],['Alteração com justificativa','o']],'ok'),
     x:'Quem cadastra de fato é <b>só Suprimentos</b>, por chamado na Central da AG, com os documentos exigidos para a classificação do fornecedor. Alterações de cadastro também passam por Suprimentos, sempre com documento e justificativa.'},
    {ic:'ishield',t:'O que é homologar',chips:[['Gestão de Contratos abre','t']],vig:()=>vIcons([['ibook','Legal'],['icoin','Comercial'],['ishield','Qualidade'],['iheart','Saúde e Segurança'],['ileaf','Meio ambiente']]),
     x:'Homologar é avaliar o risco de contratar um fornecedor de alto valor ou criticidade, olhando aspectos legais, comerciais, de qualidade, saúde, segurança e meio ambiente. A solicitação é aberta <b>exclusivamente pela Gestão de Contratos</b>.'},
    {ic:'icoin',t:'Pelo valor',chips:[['12 meses','']],k:'800 mil',kl:'R$ em 12 meses',vig:()=>vf('icoin','A partir de R$ 800 mil',[['ou USD 190 mil','t'],['Faturamento em 12 meses',''],['ou contrato ativo','']],'o'),
     x:'A homologação é obrigatória quando o fornecedor faturou ou vai faturar com a TEN a partir de <b>R$ 800 mil ou USD 190 mil</b> em 12 meses, ou quando tem contratos ativos a partir desses valores.'},
    {ic:'ialert',t:'Pela atividade',chips:[['Qualquer valor','o']],k:'7',kl:'categorias',vig:()=>vIcons([['ishield','Vigilância'],['iboxes','Resíduos de construção'],['iheart','Resíduos de saúde'],['iheart','Serviços de saúde'],['ihaz','Resíduos perigosos'],['iusers','Transporte de pessoas'],['ibook','Assessoria e consultoria']]),
     x:'Algumas atividades pedem homologação qualquer que seja o valor: <b>vigilância</b> armada ou não, resíduos de construção e de saúde, serviços de saúde, <b>resíduos perigosos</b>, transporte de pessoas e assessoria ou consultoria.'},
    {ic:'iclk',t:'Prazo e restrições',chips:[['Diretoria AG + TEN','t']],k:'30',kl:'dias',vig:()=>vf('iclk','Até 30 dias',[['Homologação com restrição','o'],['Aprovação Diretoria AG + TEN','t']]),
     x:'A homologação leva <b>até 30 dias</b> e pode andar mais rápido em caso de urgência. Um fornecedor pode ser homologado com restrição, mas só com aprovação da <b>Diretoria da AG e da TEN</b>.'}
  ],
  game:{type:'deck',title:'Homologação obrigatória?',buckets:['Homologação obrigatória','Não obrigatória'],cards:[
    {t:'Empresa de vigilância patrimonial',a:0},{t:'Consultoria tributária',a:0},{t:'Chaveiro avulso de R$ 1.200',a:1},
    {t:'Prestador com faturamento previsto de R$ 900 mil em 12 meses',a:0},{t:'Manutenção de ar-condicionado de R$ 40 mil por ano',a:1},
    {t:'Transporte de funcionários',a:0},{t:'Coleta de resíduos do ambulatório',a:0},{t:'Jardinagem de R$ 60 mil por ano',a:1}]},
  quiz:[
    {q:'Quem abre a solicitação de homologação?',o:['Qualquer colaborador','A Gestão de Contratos','O fornecedor'],a:1,e:'Exclusivamente a <b>Gestão de Contratos</b>.'},
    {q:'Valor que torna a homologação obrigatória',o:['R$ 300 mil','R$ 800 mil ou USD 190 mil em 12 meses','R$ 6 milhões'],a:1,e:'A partir de <b>R$ 800 mil / USD 190 mil</b>.'},
    {q:'Prazo da homologação',o:['Até 5 dias','Até 30 dias','Até 90 dias'],a:1,e:'Até <b>30 dias</b>.'},
    {q:'Quem pode pedir o cadastro de um fornecedor?',o:['Só compradores','Qualquer colaborador, por e-mail a Suprimentos','Só o gestor da área'],a:1,e:'<b>Qualquer colaborador</b>; o cadastro em si é feito por Suprimentos.'}]
},
{ n:3, short:'Bloqueio e desbloqueio', title:'Bloqueio e <span>desbloqueio</span>', ic:'ilock', badge:'Sentinela', gameName:'O que fazer?',
  chips:[['4 cenas',''],['30 ou 60 dias','o'],['≈ 3 min','t']],
  intro:'Um fornecedor pode ficar bloqueado por pendência de documentos, homologação vencida ou falha grave. Saber o caminho certo evita contratar quem não pode e destrava quem já se regularizou.',
  scenes:[
    {ic:'i4',t:'Monitoramento',chips:[['Power BI da AG','t']],vig:()=>vChecklist('Relatório de homologação AG',['Fornecedor A · homologado','Fornecedor B · vence em 20 dias','Fornecedor C · bloqueado','Fornecedor D · homologado'],2,'','1 bloqueado'),
     x:'De tempos em tempos a Gestão de Contratos baixa o <b>relatório da equipe de homologação da AG</b> no Power BI, com os fornecedores bloqueados ou com homologação a vencer. Assim dá para agir antes de o contrato travar.'},
    {ic:'iun',t:'Desbloqueio',chips:[['Gestão de Contratos','t']],vig:()=>vf('iun','Desbloqueio definitivo',[['Pendência resolvida','t'],['Pedido pela Gestão de Contratos','o']],'ok'),
     x:'Quem pede o desbloqueio, pela Central da AG, é <b>exclusivamente a Gestão de Contratos</b>, depois que o fornecedor resolve a pendência.'},
    {ic:'iclk',t:'Liberação temporária',chips:[['Só em urgência','o']],k:'30/60',kl:'dias',vig:()=>vLanes([['30 dias','liberação curta',50,'var(--s-teal)','#062A28'],['60 dias','liberação longa',100,'var(--s-blue)']]),
     x:'Em casos urgentes dá para pedir uma liberação temporária de <b>30 ou 60 dias</b>, com justificativa e período definido. Ela só vale com aprovação da <b>Diretoria da TEN e da AG</b> e serve para o fornecedor resolver a pendência de vez.'},
    {ic:'iban',t:'Pedido de bloqueio',chips:[['Justificativa + evidências','o']],vig:()=>vAppr('Pedido de bloqueio','Evidências','BLOQUEADO','Área','iusers',true),
     x:'Qualquer área pode pedir o bloqueio de um fornecedor, desde que apresente <b>justificativa e evidências</b>. Suprimentos encaminha o pedido à equipe de homologação da AG, que analisa e toma as providências.'}
  ],
  game:{type:'deck',title:'Qual é o caminho certo?',buckets:['Liberação temporária','Pedir bloqueio','Pedir desbloqueio'],cards:[
    {t:'Fornecedor bloqueado, serviço urgente, pendência em andamento',a:0},{t:'A área tem evidências de falha grave do prestador',a:1},
    {t:'Fornecedor regularizou toda a pendência',a:2},{t:'Prestador bloqueado precisa atender por 2 meses enquanto resolve',a:0},
    {t:'Prestador descumpriu regras de segurança várias vezes, com registros',a:1},{t:'Homologação vencida, documentos reenviados e aprovados',a:2}]},
  quiz:[
    {q:'Prazos possíveis de liberação temporária',o:['7 ou 15 dias','30 ou 60 dias','90 dias'],a:1,e:'<b>30 ou 60 dias</b>.'},
    {q:'Quem aprova a liberação temporária?',o:['O comprador','Diretoria da TEN e da AG','O Gestor do Contrato'],a:1,e:'A <b>Diretoria da TEN e da AG</b>.'},
    {q:'O que é preciso para pedir o bloqueio de um fornecedor?',o:['Só um e-mail','Justificativa e evidências','Autorização do fornecedor'],a:1,e:'<b>Justificativa e evidências</b>.'},
    {q:'Quem pede o desbloqueio na Central?',o:['Qualquer área','A Gestão de Contratos','O fornecedor'],a:1,e:'A <b>Gestão de Contratos</b>.'}]
},
{ n:4, short:'Requisição de serviço', title:'Requisição de <span>serviço</span>', ic:'i1', badge:'Escopo Claro', gameName:'RS certa',
  chips:[['5 cenas',''],['ME51N','o'],['≈ 4 min','t']],
  intro:'Uma boa contratação começa com uma boa requisição. Quanto mais claro o escopo, mais rápida a cotação e menor a discussão na hora de medir. Vamos acompanhar a manutenção das pontes rolantes.',
  scenes:[
    {ic:'i1',t:'RS na ME51N',chips:[['ME51N','t']],doc:'RS',st:'RS criada',vig:()=>vForm('Requisição de serviço','ME51N','Manutenção das pontes rolantes'),
     x:'A requisição de serviço é criada no SAP pela <b>ME51N</b>, com todos os campos preenchidos: centro, comprador, nº do serviço, quantidade, elemento PEP, texto breve e textos. O sistema gera o número para acompanhamento e a RS vai para o gestor aprovar.'},
    {ic:'iclk',t:'Urgente ou normal',chips:[['Prazo conta após aprovação','']],doc:'RS',st:'Tipo definido',k:'3 · 25',kl:'d.u. urgente · dias corridos normal',vig:()=>vLanes([['Normal','25 dias corridos',100,'var(--s-blue)','#0A1A33',2.4],['Urgente','3 dias úteis',18,'var(--s-orange)','#1C0E00',.5]]),
     x:'O tipo da RS define o prazo. Na <b>RS urgente</b>, o pedido sai em até 3 dias úteis com uma proposta formal. Na <b>RS normal</b>, em até 25 dias corridos, com cotações conforme o valor. O prazo conta a partir da aprovação e envio ao comprador.'},
    {ic:'ibook',t:'Escopo na aba Textos',chips:[['Anexos permitidos','']],doc:'RS',st:'Escopo detalhado',vig:()=>vf('ibook','Aba Textos',[['Objetivo e duração',''],['Especificações técnicas',''],['Competências do prestador',''],['Regras de medição e pagamento','o']]),
     x:'Na aba <b>Textos</b> o requisitante descreve objetivo, duração, datas, especificações técnicas, competências exigidas do prestador, particularidades da execução e as <b>regras de medição e pagamento</b>. Documentos de apoio podem ir em anexo.'},
    {ic:'iusers',t:'Fornecedor indicado',chips:[['Justificativa','o']],doc:'RS',st:'Indicação registrada',vig:()=>vf('iusers','Indicação de prestador',[['Com justificativa + proposta assinada: específico','t'],['Sem justificativa: só indicação','o']]),
     x:'A área pode sugerir prestadores. Para pedir um específico, escreve a <b>justificativa</b> na aba Textos e anexa a proposta assinada pelo gestor. Sem justificativa, o nome vale só como indicação e Suprimentos cota normalmente.'},
    {ic:'i2',t:'Aprovação e carteira',chips:[['Diligenciador ajusta','t']],doc:'RS',st:'RS com o comprador',vig:()=>vAppr('RS 10007310','Liberação','APROVADA','Gestor'),
     x:'Com a aprovação do gestor, a RS vai para o comprador. Se o escopo não for da carteira do comprador indicado, o <b>diligenciador</b> ajusta a RS e envia para o comprador certo.'}
  ],
  game:{type:'deck',title:'Monte a RS certa',cards:[
    {s:'Prazo',t:'RS urgente',b:['3 dias úteis','25 dias corridos','15 dias úteis'],a:0},
    {s:'Prazo',t:'RS normal',b:['15 dias úteis','25 dias corridos','30 dias úteis'],a:1},
    {s:'Propostas',t:'RS urgente exige',b:['1 proposta formal','2 propostas','3 propostas'],a:0},
    {s:'Onde escrever',t:'Regras de medição e pagamento',b:['Texto breve','Aba Textos','Nº de serviço'],a:1},
    {s:'Indicação',t:'Fornecedor indicado sem justificativa',b:['É contratado direto','Vira só indicação e há cotação','A RS é recusada'],a:1},
    {s:'Contagem',t:'Quando o prazo começa',b:['Na criação da RS','Na aprovação e envio ao comprador','Na cotação'],a:1},
    {s:'Transação',t:'Criar a RS',b:['ME21N','ME51N','MIGO'],a:1},
    {s:'Carteira',t:'RS caiu no comprador errado',b:['Volta ao requisitante','O diligenciador redireciona','É cancelada'],a:1}]},
  quiz:[
    {q:'Prazo da RS urgente',o:['3 dias úteis','25 dias corridos','15 dias úteis'],a:0,e:'<b>3 dias úteis</b>, com 1 proposta formal.'},
    {q:'Prazo da RS normal',o:['15 dias úteis','25 dias corridos','30 dias úteis'],a:1,e:'<b>25 dias corridos</b>.'},
    {q:'Onde ficam as regras de medição e pagamento?',o:['Texto breve','Aba Textos','Elemento PEP'],a:1,e:'Na aba <b>Textos</b>.'},
    {q:'Fornecedor indicado sem justificativa…',o:['É contratado direto','É só indicação e há cotação','Bloqueia a RS'],a:1,e:'Vira <b>indicação</b>; Suprimentos cota normalmente.'}]
},
{ n:5, short:'Cotação e escolha', title:'Cotação e <span>escolha</span>', ic:'i3', badge:'Proposta Completa', gameName:'Cotação certa',
  chips:[['5 cenas',''],['Validade 15 dias','o'],['≈ 4 min','t']],
  intro:'Na cotação de serviços a área requisitante participa de perto: valida a parte técnica e tira dúvidas com Suprimentos. O objetivo é a melhor opção técnica e econômica.',
  scenes:[
    {ic:'imail',t:'Convite por e-mail',chips:[['Data limite','o']],vig:()=>vSend('Convite enviado'),
     x:'A solicitação de cotação vai aos fornecedores por e-mail, com o escopo anexo e uma <b>data limite</b> de resposta. A área requisitante acompanha, valida as propostas técnicas e ajuda a esclarecer dúvidas, sempre dentro da política de Compliance.'},
    {ic:'iclip',t:'O que a proposta precisa ter',chips:[['Pode eliminar no QQP','o']],vig:()=>vChecklist('Proposta comercial',['Escopo detalhado','Prazo de execução','Condição de pagamento','Validade de 15 dias','Informações tributárias','Incoterms','CNPJ, telefone e e-mail'],-1,'✓ Proposta completa',''),
     x:'Sem estes itens a proposta pode ser eliminada do QQP: escopo detalhado, prazo de execução, condição de pagamento, <b>validade de 15 dias</b>, informações tributárias, Incoterms e dados do fornecedor. Acima de R$ 5 mil, o pagamento vai de <b>duas a cinco parcelas</b>.'},
    {ic:'i3',t:'Quantas cotações',chips:[['Mesma regra de compras','']],k:'1·2·3',kl:'cotações',vig:()=>vf('i3','Cotações mínimas',[['≤ R$ 2.500 ou emergência: 1',''],['até R$ 5.000: 2',''],['acima: 3','o']]),
     x:'A regra de valores é a mesma das compras: até <b>R$ 2.500</b> ou emergência, uma proposta; de R$ 2.500,01 a <b>R$ 5.000</b>, duas; acima disso, <b>três</b>.'},
    {ic:'icoin',t:'Análise fiscal',chips:[['CNAE','t']],vig:()=>vf('icoin','Análise fiscal prévia',[['CNAE do serviço','t'],['Nº do serviço',''],['Código de imposto','']]),
     x:'Antes do pedido, o <b>Fiscal</b> confere se o prestador tem o CNAE do serviço e define o número do serviço e o código de imposto. Suprimentos envia o cartão CNPJ e a proposta aprovada. Se o código mudar, o comprador ajusta a RS.'},
    {ic:'itarget',t:'Quem vence',chips:[['Justificativa se outro critério','o']],vig:vQQP,
     x:'Em geral vence a <b>melhor condição comercial</b>: menor preço e melhor condição de pagamento. Se outro critério pesar mais, o comprador registra a justificativa no sistema e arquiva os documentos de suporte. Toda decisão passa pelo gestor de Suprimentos.'}
  ],
  game:{type:'deck',title:'Cotação certa',cards:[
    {s:'Cotações mínimas',t:'Serviço de R$ 1.900',b:['1','2','3'],a:0},{s:'Cotações mínimas',t:'Serviço de R$ 4.300',b:['1','2','3'],a:1},
    {s:'Cotações mínimas',t:'Serviço de R$ 18 mil',b:['1','2','3'],a:2},{s:'Cotações mínimas',t:'Máquina parada',b:['1','2','3'],a:0},
    {s:'Proposta',t:'Validade pedida',b:['7 dias','15 dias','30 dias'],a:1},{s:'Proposta de R$ 12 mil',t:'Condição de pagamento',b:['À vista','De 2 a 5 parcelas','Até 12 parcelas'],a:1},
    {s:'Análise',t:'Quem confere o CNAE',b:['Jurídico','Fiscal','RH'],a:1},{s:'Escolha',t:'Critério geral do vencedor',b:['Menor prazo','Melhor condição comercial','Indicação da área'],a:1}]},
  quiz:[
    {q:'Validade mínima pedida na proposta',o:['7 dias','15 dias','30 dias'],a:1,e:'<b>15 dias</b>.'},
    {q:'Proposta de R$ 12 mil: parcelamento previsto',o:['À vista','De 2 a 5 parcelas','Até 12 parcelas'],a:1,e:'Acima de R$ 5 mil: <b>de 2 a 5 parcelas</b>.'},
    {q:'Quem confere o CNAE do prestador?',o:['Jurídico','Fiscal','RH'],a:1,e:'O <b>Fiscal</b> (contabilidade).'},
    {q:'Serviço de R$ 4.300 exige…',o:['1 cotação','2 cotações','3 cotações'],a:1,e:'<b>2 cotações</b>.'}]
},
{ n:6, short:'Pedido de compra', title:'Pedido de compra e <span>alçadas</span>', ic:'i5', badge:'Alçada Certa', gameName:'Pedido em ordem',
  chips:[['6 cenas',''],['N1–N7','o'],['≈ 5 min','t']],
  intro:'Todo serviço é contratado por Suprimentos com Pedido de Compra no SAP. O valor define quem assina, e a documentação do prestador precisa estar aprovada antes do envio.',
  scenes:[
    {ic:'iladder',t:'Simule a alçada',chips:[['Simulador','o']],widget:'alc',hold:true,
     x:'Arraste o valor do pedido e veja até onde a aprovação sobe. As alçadas são <b>cumulativas</b> e valem do mesmo jeito para contratos e pedidos de compra.'},
    {ic:'i5',t:'PC completo',chips:[['Propostas anexadas','t']],doc:'PC',st:'PC em aprovação',vig:()=>vf('i5','Texto do pedido',[['Área solicitante',''],['Motivo da contratação',''],['Justificativa da escolha','o']]),
     x:'O comprador anexa ao PC as propostas de todos os fornecedores que participaram, identificadas. No texto resume <b>a área solicitante, o motivo da contratação e a justificativa da escolha</b>. Depois o PC segue para aprovação na alçada.'},
    {ic:'iclip',t:'Documentos antes do envio',chips:[['AutoDoc','t']],doc:'PC',st:'Aguardando AutoDoc',vig:()=>vChecklist('AutoDoc · prestador',['Segurança do trabalho','Saúde ocupacional','Meio ambiente','RH'],-1,'✓ Documentação aprovada',''),
     x:'A Gestão de Contratos pede ao prestador a documentação do serviço e do acesso à fábrica e cadastra no <b>AutoDoc</b>, onde Segurança, Saúde, Meio Ambiente e RH aprovam. Só depois o comprador envia o PC autorizando a execução.'},
    {ic:'i6',t:'Envio e cópia',chips:[['FRM.SGP-0005','t']],doc:'PC',st:'PC enviado',vig:()=>vSend('Execução autorizada'),
     x:'O PC enviado descreve condições, requisitos de aprovação, prazo de pagamento e frete. Uma <b>cópia vai para o setor solicitante</b>, que acompanha o serviço. Precisa de transporte ou hospedagem? O comprador aciona Serviços Gerais pelo FRM.SGP-0005.'},
    {ic:'i7',t:'Equipamento que sai',chips:[['FRM.SUP-0022','t']],doc:'NF',st:'Nota de remessa',vig:()=>vRoad(['Nota de remessa','Coleta','Oficina']),
     x:'Quando a manutenção é feita fora da fábrica, o setor requisitante envia o <b>FRM.SUP-0022 (SEMINFE)</b> ao Almoxarifado e à Contabilidade para emitir a nota de remessa, e abre uma requisição de transporte para Suprimentos organizar a coleta.'},
    {ic:'i5',t:'Alteração do pedido',chips:[['Valor maior: nova aprovação','o']],doc:'PC',st:'Pedido alterado',vig:()=>vAppr('PC 4500018821','Observação','ALTERADO','Comprador','i5'),
     x:'Mudou algo depois do envio? O comprador registra a justificativa no campo de observação e o SAP marca <b>pedido alterado</b> no cabeçalho. Se o valor aumentar, o pedido volta para aprovação.'}
  ],
  game:{type:'deck',title:'Pedido em ordem',cards:[
    {s:'Alçada',t:'PC de R$ 45 mil',b:['N2','N3','N4'],a:1},{s:'Alçada',t:'PC de R$ 2 milhões',b:['N3','N4','N5'],a:1},
    {s:'Envio',t:'Quando enviar o PC ao prestador',b:['Logo após aprovar','Depois da documentação aprovada no AutoDoc','Depois da medição'],a:1},
    {s:'Alteração',t:'Valor aumentou após o envio',b:['Só registrar','Volta para aprovação','Cancela o PC'],a:1},
    {s:'Formulário',t:'Equipamento sai da fábrica para manutenção',b:['FRM.SUP-0022','FRM.SGP-0005','FRM.SUP-0003'],a:0},
    {s:'Logística',t:'Hotel e transporte para o prestador',b:['FRM.SGP-0005 a Serviços Gerais','Nova RS','E-mail ao Jurídico'],a:0},
    {s:'Texto do PC',t:'O que precisa constar',b:['Só o valor','Área, motivo e justificativa da escolha','O contrato inteiro'],a:1}]},
  quiz:[
    {q:'PC de R$ 45 mil sobe até…',o:['N2','N3','N4'],a:1,e:'Até R$ 60 mil: <b>N3 · Gerente Financeiro</b>.'},
    {q:'Quando o PC é enviado ao prestador?',o:['Logo após a aprovação','Depois da documentação aprovada no AutoDoc','Depois da primeira medição'],a:1,e:'Depois da <b>documentação aprovada</b> no AutoDoc.'},
    {q:'Pedido alterado com valor maior…',o:['Só registra a observação','Volta para aprovação','É cancelado'],a:1,e:'<b>Volta para aprovação</b>.'},
    {q:'Formulário da nota de remessa de equipamento',o:['FRM.SUP-0022','FRM.SGP-0005','FRM.SUP-0003'],a:0,e:'<b>FRM.SUP-0022</b> (SEMINFE).'}]
},
{ n:7, short:'Quando fazer contrato', title:'Quando fazer <span>contrato</span>', ic:'ibook', badge:'Cláusula Firme', gameName:'Contrato ou PC?',
  chips:[['5 cenas',''],['R$ 30 mil e 30 dias','o'],['≈ 5 min','t']],
  intro:'Nem todo serviço precisa de contrato, mas os maiores e mais longos precisam. E o contrato traz cláusulas que protegem a TEN se algo der errado.',
  scenes:[
    {ic:'ibook',t:'Simule',chips:[['Simulador','o']],widget:'contrato',hold:true,
     x:'Ajuste o valor e a duração do serviço. O contrato é obrigatório quando o valor passa de <b>R$ 30 mil e a execução passa de 30 dias</b>. Veja também como a multa muda com o valor.'},
    {ic:'iscale',t:'Multa contratual',chips:[['5 dias após notificação','']],k:'10%',kl:'multa acima de R$ 50 mil',vig:()=>vLanes([['> R$ 50 mil','multa de 10%',100,'var(--s-orange)','#1C0E00'],['< R$ 50 mil','multa de 5%',50,'var(--s-teal)','#062A28']]),
     x:'Todo contrato tem multa para irregularidade não corrigida em <b>5 dias</b> após a notificação: <b>10%</b> do valor global acima de R$ 50 mil e <b>5%</b> abaixo disso. Tirar a cláusula de multa, em qualquer valor, só com autorização expressa da Diretoria.'},
    {ic:'ishield',t:'Terceirização',chips:[['Diretoria libera','t']],vig:()=>vf('ishield','Cláusula de garantia',[['Terceirização de mão de obra','o'],['Liberação só com a Diretoria','t']]),
     x:'Se o serviço envolve terceirização, o contrato precisa de <b>cláusula de garantia</b>. Liberar essa garantia exige autorização expressa da Diretoria.'},
    {ic:'ibook',t:'Jurídico elabora',chips:[['Modelos TEN','t']],doc:'CT',st:'Contrato em elaboração',k:5,kl:'dias úteis',vig:()=>vForm('Minuta de contrato','Jurídico','Manutenção das pontes rolantes'),
     x:'O comprador envia ao Jurídico a cotação vencedora e a proposta com as condições negociadas. O <b>Jurídico elabora e aprova o contrato em até 5 dias úteis</b>, nos modelos da TEN. Se o fornecedor pedir a própria minuta, Suprimentos analisa a parte comercial e técnica e o Jurídico valida.'},
    {ic:'iclip',t:'Documentos do prestador',chips:[['AutoDoc','t']],doc:'CT',st:'Documentos em análise',k:5,kl:'dias úteis para entregar',vig:()=>vChecklist('Documentos · prestador',['Ficha de registro','Contrato de trabalho','ASO','Certificados de treinamento','Ficha de EPI'],3,'','Pendente: treinamento'),
     x:'Ao mesmo tempo, a Gestão de Contratos pede ao RH, Saúde e Segurança a lista de documentos exigidos, e o prestador tem <b>5 dias úteis</b> para entregar. Tudo vai para o AutoDoc. Com não conformidade, a contratação não segue até a regularização.'}
  ],
  game:{type:'deck',title:'Contrato ou só PC?',cards:[
    {s:'Formalização',t:'Serviço de R$ 45 mil por 3 meses',b:['Precisa de contrato','Basta o PC'],a:0},
    {s:'Formalização',t:'Serviço de R$ 20 mil por 6 meses',b:['Precisa de contrato','Basta o PC'],a:1},
    {s:'Formalização',t:'Serviço de R$ 80 mil em 10 dias',b:['Precisa de contrato','Basta o PC'],a:1},
    {s:'Multa',t:'Contrato de R$ 120 mil',b:['5%','10%','Sem multa'],a:1},{s:'Multa',t:'Contrato de R$ 35 mil',b:['5%','10%','Sem multa'],a:0},
    {s:'Cláusula',t:'Retirar a multa do contrato',b:['O comprador decide','Só com autorização da Diretoria','O Jurídico decide'],a:1},
    {s:'Prazo',t:'Jurídico elaborar o contrato',b:['2 dias úteis','5 dias úteis','15 dias'],a:1},
    {s:'Minuta',t:'Fornecedor quer usar a própria minuta',b:['Proibido','Suprimentos analisa e Jurídico valida','Aceita direto'],a:1}]},
  quiz:[
    {q:'Quando o contrato é obrigatório?',o:['Acima de R$ 10 mil','Acima de R$ 30 mil e mais de 30 dias','Sempre'],a:1,e:'Acima de <b>R$ 30 mil e 30 dias</b> de execução.'},
    {q:'Multa de um contrato de R$ 120 mil',o:['5%','10%','15%'],a:1,e:'Acima de R$ 50 mil: <b>10%</b>.'},
    {q:'Prazo do Jurídico para elaborar o contrato',o:['2 dias úteis','5 dias úteis','15 dias úteis'],a:1,e:'<b>5 dias úteis</b>.'},
    {q:'Prazo para corrigir a irregularidade antes da multa',o:['24 horas','5 dias após a notificação','30 dias'],a:1,e:'<b>5 dias</b> após a notificação.'}]
},
{ n:8, short:'Assinatura e início', title:'Assinatura e <span>início</span>', ic:'iflag', badge:'Partida Segura', gameName:'Monte a sequência',
  chips:[['7 etapas',''],['DocuSign','o'],['≈ 5 min','t']],
  intro:'Contrato pronto não significa prestador na fábrica. Ainda há assinatura, registro, reunião de partida, pedido, liberação, integração e crachá. Pular uma etapa expõe a TEN.',
  scenes:[
    {ic:'i5',t:'Assinatura',chips:[['DocuSign','t']],doc:'CT',st:'Contrato assinado',vig:()=>vSign('Contrato de serviço',['TEN','Contratada','Testemunhas']),
     x:'O contrato é assinado eletronicamente, pelo <b>DocuSign</b>, pelos representantes legais da TEN e da contratada. O Gestor do Contrato assina como testemunha e o prestador indica a sua. Contratar sem contrato formal responsabiliza quem contratou.'},
    {ic:'idb',t:'Registro no SAP',chips:[['Alçada','o']],doc:'CT',st:'Contrato aprovado no SAP',vig:()=>vf('idb','Contrato no SAP',[['Aprovação na alçada','o'],['Libera PC, medição e pagamento','t']],'ok'),
     x:'O contrato assinado é registrado no SAP e aprovado conforme a alçada. Essa aprovação é <b>condição</b> para emitir o pedido, medir e pagar.'},
    {ic:'iusers',t:'Reunião de partida',chips:[['RH agenda integração','']],doc:'CT',st:'Partida alinhada',vig:()=>vIcons([['iusers','Contratada'],['iclip','Gestor do Contrato'],['idb','Gestão de Contratos']]),
     x:'Antes de começar, a Gestão de Contratos pede ao RH o agendamento da integração e organiza a <b>Reunião de Partida</b> com a contratada e o Gestor do Contrato. Todos revisam escopo, medição e pagamento. Se houver divergência, o Jurídico faz termo aditivo.'},
    {ic:'i4',t:'Pedido conforme contrato',chips:[['Mesma unidade de medida','t']],doc:'PC',st:'PC emitido',vig:()=>vf('i5','PC espelha o contrato',[['Mesma unidade de medida','t'],['Mesmas condições de faturamento','t']]),
     x:'Com o contrato no SAP, o comprador emite o Pedido de Compra com a <b>mesma unidade de medida</b> e as mesmas condições de faturamento previstas no contrato.'},
    {ic:'imail',t:'Liberação ao prestador',chips:[['Acesso só via Gestão de Contratos','o']],doc:'PC',st:'Prestador liberado',vig:()=>vSend('Liberado para iniciar'),
     x:'A Gestão de Contratos avisa o prestador por e-mail que o contrato está liberado, com resumo das condições e instruções de medição e faturamento. O <b>acesso à TEN só é autorizado pela Gestão de Contratos</b>, com toda a documentação aprovada.'},
    {ic:'ishield',t:'Integração',chips:[['SMS · Qualidade · Serviços Gerais','']],k:2,kl:'dias úteis de antecedência',vig:()=>vf('ishield','Integração',[['SMS',''],['Qualidade',''],['Serviços Gerais',''],['Mínimo de 2 dias úteis','o']]),
     x:'Antes de trabalhar, os colaboradores do prestador passam pela <b>integração</b> de segurança e meio ambiente. O RH agenda com SMS, Qualidade e Serviços Gerais com no mínimo <b>2 dias úteis</b> de antecedência.'},
    {ic:'iid',t:'Crachá',chips:[['Sem crachá, sem acesso','o']],vig:()=>vf('iid','Crachá liberado',[['Nome completo',''],['Empresa contratada',''],['Sem crachá, sem acesso','o']],'ok'),
     x:'Concluída a integração, o RH emite o <b>crachá</b> com nome completo e empresa do colaborador. Sem crachá, ninguém da contratada entra na fábrica.'}
  ],
  game:{type:'order',title:'Coloque as etapas na ordem certa'},
  quiz:[
    {q:'Como os contratos são assinados?',o:['Em papel, no Jurídico','Eletronicamente, via DocuSign','Por e-mail simples'],a:1,e:'Pelo <b>DocuSign</b>.'},
    {q:'Quem assina como testemunha pela TEN?',o:['O comprador','O Gestor do Contrato','O RH'],a:1,e:'O <b>Gestor do Contrato</b>.'},
    {q:'O que libera PC, medição e pagamento?',o:['A reunião de partida','A aprovação do contrato no SAP','O crachá'],a:1,e:'A <b>aprovação do contrato no SAP</b>.'},
    {q:'Antecedência mínima para agendar a integração',o:['1 dia útil','2 dias úteis','5 dias úteis'],a:1,e:'<b>2 dias úteis</b>.'}]
},
{ n:9, short:'Medição e pagamento', title:'Medição e <span>pagamento</span>', ic:'icoin', badge:'Pagamento Limpo', gameName:'Libera ou segura?',
  chips:[['8 cenas',''],['3 dias úteis','o'],['≈ 6 min','t']],
  intro:'Durante a execução, o Gestor do Contrato é os olhos da TEN no campo. A medição só vira pagamento quando o serviço e os documentos do prestador estão em ordem.',
  scenes:[
    {ic:'iclip',t:'Supervisão',chips:[['Gestor do Contrato','t']],vig:()=>vIcons([['iclip','Gestor no campo'],['idb','Gestão de Contratos'],['ishield','Regularidade']]),
     x:'O <b>Gestor do Contrato</b> acompanha a contratada no local e confirma que as atividades seguem o contrato. A Gestão de Contratos pede, durante a vigência, os documentos que provam a regularidade do prestador.'},
    {ic:'i4',t:'Boletim de medição',chips:[['Prazos do contrato','']],doc:'BM',st:'Boletim recebido',vig:()=>vForm('Boletim de medição','Mensal','Manutenção · outubro'),
     x:'A contratada apresenta o <b>Boletim de Medição</b> nos prazos do contrato e, todo mês, a documentação legal para liberar o faturamento.'},
    {ic:'i2',t:'Aprovação em 3 dias',chips:[['Gestor do Contrato','t']],doc:'BM',st:'Medição aprovada',k:3,kl:'dias úteis',vig:()=>vAppr('Boletim de medição','Gestor','APROVADO','Gestor'),
     x:'O Gestor do Contrato tem <b>3 dias úteis</b> para conferir se o serviço foi executado conforme o contrato. Se algo estiver errado, pede ajuste antes de aprovar. Aprovado, assina e envia à Gestão de Contratos.'},
    {ic:'ilock',t:'Documentos do mês',chips:[['Anexo 1','o']],doc:'BM',st:'Faturamento bloqueado',vig:()=>vChecklist('Anexo 1 · documentos do mês',['Guia e comprovante do FGTS','GPS e comprovante','Folha de pagamento dos alocados','Cartões de ponto','Comprovante de benefícios'],1,'','Faturamento bloqueado'),
     x:'A Gestão de Contratos confere os documentos do <b>Anexo 1</b>: FGTS, GPS, folha, ponto, benefícios. Faltou algum ou a medição diverge? O <b>faturamento fica bloqueado</b> até a regularização.'},
    {ic:'iban',t:'Proibido descontar insumos',chips:[['Responsabilidade do gestor','o']],vig:()=>vf('iban','Desconto proibido',[['Combustível','b'],['Lubrificantes','b'],['Refeições','b'],['EPI','b']],'bad'),
     x:'É <b>proibido</b> descontar da medição materiais e insumos como combustível, lubrificante, refeição ou EPI. Liberar pagamento de forma irregular compromete diretamente quem aprovou, principalmente o gestor da área.'},
    {ic:'ilock',t:'Bloqueio de pagamento',chips:[['Com justificativa','t']],vig:()=>vAppr('Pagamento','Gestão de Contratos','BLOQUEADO','Gestor','iclip',true),
     x:'O Gestor do Contrato pode pedir o bloqueio do pagamento, com justificativa, se o escopo não for cumprido. A Gestão de Contratos bloqueia sempre que faltar documento do Anexo 1.'},
    {ic:'idb',t:'Folha de serviço e saldo',chips:[['Controladoria','t']],vig:()=>vf('idb','Folha de serviço no SAP',[['Controladoria registra','t'],['Medições anexadas',''],['Saldo e prazo acompanhados','o']]),
     x:'Com a medição aprovada, a <b>Controladoria</b> registra a folha de serviço no SAP e anexa as medições. A Gestão de Contratos acompanha todo mês o saldo de quantidade e de prazo, para antecipar aditivos antes que o contrato trave.'},
    {ic:'ifold',t:'Arquivar',chips:[['Pasta G','']],vig:()=>vFolder('G:\\Contratos\\1. Todos os CONTRATO\\CONTRATOS ATIVOS',['Proposta','Qualificação do fornecedor','Documentos do serviço','Documentos dos funcionários']),
     x:'Tudo do contrato vai para a pasta do fornecedor em <b>CONTRATOS ATIVOS</b>, na rede da TEN: proposta, qualificação, documentos do serviço e dos funcionários.'}
  ],
  game:{type:'deck',title:'Libera ou segura o pagamento?',buckets:['Liberar pagamento','Bloquear ou corrigir'],cards:[
    {t:'Boletim aprovado e todos os documentos do Anexo 1 em dia',a:0},{t:'Falta o comprovante de FGTS do mês',a:1},
    {t:'Medição com desconto de combustível e refeições',a:1},{t:'Gestor aprovou em 2 dias úteis e os documentos estão completos',a:0},
    {t:'Escopo descumprido e gestor pediu bloqueio justificado',a:1},{t:'Medição diverge do contrato',a:1},{t:'Folha, GPS e ponto entregues, medição aprovada',a:0}]},
  quiz:[
    {q:'Prazo do Gestor para aprovar a medição',o:['1 dia útil','3 dias úteis','10 dias úteis'],a:1,e:'<b>3 dias úteis</b>.'},
    {q:'Falta o comprovante de FGTS do mês. E agora?',o:['Paga e cobra depois','Faturamento bloqueado até regularizar','Desconta da medição'],a:1,e:'<b>Faturamento bloqueado</b> até regularizar.'},
    {q:'Pode descontar combustível da medição?',o:['Sim, se combinado','Não, é proibido','Só com aprovação do gestor'],a:1,e:'<b>Não</b>: desconto de insumos é proibido.'},
    {q:'Quem registra a folha de serviço no SAP?',o:['Gestor do Contrato','Controladoria','Jurídico'],a:1,e:'A <b>Controladoria</b>.'}]
},
{ n:10, short:'Aditivo e encerramento', title:'Aditivo e <span>encerramento</span>', ic:'irep', badge:'Ciclo Fechado', gameName:'Fim de contrato',
  chips:[['4 cenas',''],['30 dias antes','o'],['≈ 3 min','t']],
  intro:'Todo contrato tem data para acabar. Com 30 dias de antecedência a TEN decide se continua ou encerra, e as duas saídas têm caminho formal.',
  scenes:[
    {ic:'ical',t:'Aviso de 30 dias',chips:[['Gestão de Contratos','t']],k:30,kl:'dias de antecedência',vig:()=>vf('ical','30 dias antes do fim',[['E-mail ao gestor','t'],['Continuar ou encerrar?','o']]),
     x:'A Gestão de Contratos manda e-mail ao gestor da área <b>30 dias antes</b> do fim do contrato, perguntando se há interesse em continuar.'},
    {ic:'irep',t:'Aditivo',chips:[['Abrir RS','o']],vig:()=>vLanes([['Contrato','R$ 96 mil',64,'var(--s-blue)'],['+ Aditivo','R$ 150 mil no total',100,'var(--s-orange)','#1C0E00']]),
     x:'Quer continuar? O gestor avisa a Gestão de Contratos e <b>abre uma RS</b> para iniciar o aditivo. Na aprovação de aditivo de valor, a alçada considera o <b>contrato somado aos aditivos</b>.'},
    {ic:'ibook',t:'Termo de encerramento',chips:[['Jurídico elabora','t']],vig:()=>vSign('Termo de encerramento',['TEN','Contratada']),
     x:'Para encerrar, a Gestão de Contratos formaliza com o prestador o <b>termo de encerramento</b> elaborado pelo Jurídico, em que as partes dão plena, geral e recíproca quitação.'},
    {ic:'idb',t:'Encerrar no SAP',chips:[['CONTRATOS ENCERRADOS','']],vig:()=>vFolder('G:\\Contratos\\1. Todos os CONTRATO\\CONTRATOS ENCERRADOS',['Termo de encerramento','Pasta do fornecedor']),
     x:'Com o termo assinado, a Gestão de Contratos <b>encerra o contrato no SAP</b>, arquiva o termo na pasta do fornecedor e move a pasta para CONTRATOS ENCERRADOS.'}
  ],
  game:{type:'deck',title:'Fim de contrato',cards:[
    {s:'Aviso',t:'Quando o gestor é consultado',b:['15 dias antes','30 dias antes','No último dia'],a:1},
    {s:'Continuar',t:'Gestor quer seguir com o serviço',b:['Abre RS para o aditivo','Prorroga por e-mail','Renova sozinho'],a:0},
    {s:'Alçada',t:'Aditivo de valor',b:['Só o valor do aditivo','Contrato + aditivos somados','Metade do total'],a:1},
    {s:'Encerrar',t:'Quem elabora o termo de encerramento',b:['Gestão de Contratos','Jurídico','Fornecedor'],a:1},
    {s:'Depois do termo',t:'Próximo passo',b:['Encerrar no SAP e mover a pasta','Apagar a pasta','Nada'],a:0},
    {s:'Reunião de partida',t:'Divergência em cláusula',b:['Jurídico faz termo aditivo','Ignora','Cancela o contrato'],a:0}]},
  quiz:[
    {q:'Com quanta antecedência o gestor é consultado?',o:['15 dias','30 dias','60 dias'],a:1,e:'<b>30 dias</b>.'},
    {q:'Como começa um aditivo?',o:['E-mail ao fornecedor','Abrindo uma RS','Direto no Jurídico'],a:1,e:'O gestor <b>abre uma RS</b>.'},
    {q:'A alçada de um aditivo de valor considera…',o:['Só o aditivo','Contrato + aditivos','O menor valor'],a:1,e:'<b>Contrato somado aos aditivos</b>.'},
    {q:'Quem elabora o termo de encerramento?',o:['Gestão de Contratos','Jurídico','Fornecedor'],a:1,e:'O <b>Jurídico</b>.'}]
},
{ n:11, short:'Avaliação de prestadores', title:'Avaliação de <span>prestadores</span>', ic:'itarget', badge:'Avaliador Justo', gameName:'Qual o resultado?',
  chips:[['6 cenas',''],['80% · 60%','o'],['≈ 5 min','t']],
  intro:'Contratar bem inclui acompanhar quem presta o serviço. A avaliação mostra quem segue, quem precisa melhorar e quem deve sair.',
  scenes:[
    {ic:'ical',t:'Quem é avaliado',chips:[['Anual ou no fim','o']],vig:()=>vIcons([['itarget','Calibração'],['iusers','Transporte'],['ishield','Segurança'],['iclip','Laudos técnicos'],['ihaz','Resíduos'],['ileaf','Ar-condicionado']]),
     x:'A avaliação é <b>anual ou no fim do serviço</b> para fornecedores elegíveis à homologação, com contrato ativo ou com impacto direto em produção, qualidade e meio ambiente, como calibração, transporte, segurança, laudos, resíduos e ar-condicionado.'},
    {ic:'iclip',t:'Requisitos',chips:[['FRM.SUP-0003','t']],vig:()=>vf('iclip','Requisitos do prestador',[['ISO 9001 · 14001 · 45001',''],['ou FRM.SUP-0026','o'],['Aprovado no FRM.SUP-0003','t']]),
     x:'O prestador deve ter, de preferência, <b>ISO 9001, 14001 e 45001</b>. Na falta de alguma, assina o Termo de Compromisso <b>FRM.SUP-0026</b>. E precisa ser aprovado no questionário <b>FRM.SUP-0003</b>.'},
    {ic:'itarget',t:'Os 5 critérios',chips:[['Simulador','o']],widget:'aval5',hold:true,
     x:'Toque nos critérios para marcar o que o prestador atendeu: custo, QMSS, prazo de entrega, atendimento e conduta ética. O resultado depende da <b>porcentagem de critérios atendidos</b>.'},
    {ic:'ichk',t:'As três faixas',chips:[['Objetivo e com nota','']],vig:()=>vLanes([['Positivo','80% ou mais',100,'var(--s-teal)','#062A28'],['Regular','60 a 79%',75,'var(--s-orange)','#1C0E00'],['Negativo','menos de 60%',45,'var(--s-bad)','#fff']]),
     x:'<b>80% ou mais</b>: continua sem justificativa. <b>Entre 60% e 79%</b>: continua com justificativa. <b>Abaixo de 60%</b>: plano de ação e não conformidade, ou pedido de desqualificação.'},
    {ic:'iban',t:'Avaliação negativa',chips:[['Diretor Fabril','o']],k:3,kl:'meses para o plano',vig:()=>vf('iban','Plano de ação',[['Ratificado pela Coordenação','t'],['Conduzido pelo comprador',''],['3 meses sem resultado: Diretor Fabril','o']],'bad'),
     x:'Com avaliação negativa, o fornecedor só continua com <b>plano de ação ratificado pela Coordenação de Suprimentos</b>, conduzido pelo comprador da carteira. Sem resultado em 3 meses, a continuidade depende do <b>Diretor Fabril</b>.'},
    {ic:'ifold',t:'Registro',chips:[['SeSuite','t']],vig:()=>vFolder('G:\\Suprimentos\\SUPRIMENTOS\\02 - AVALIAÇÃO DE DESEMPENHO DE FORNECEDORES',['FRM.SUP-0003 · questionário','FRM.SUP-0013 · controle']),
     x:'Cada área avalia pelo FRM.SUP-0003 no SeSuite. A Gestão de Contratos controla tudo pelo <b>FRM.SUP-0013</b> e atualiza a lista uma vez por ano na rede de Suprimentos.'}
  ],
  game:{type:'deck',title:'Qual o resultado?',buckets:['Positivo','Regular','Negativo'],cards:[
    {t:'Atendeu 5 de 5 critérios',a:0},{t:'Atendeu 4 de 5 critérios',s:'80%',a:0},{t:'Atendeu 3 de 5 critérios',s:'60%',a:1},
    {t:'Atendeu 2 de 5 critérios',a:2},{t:'Atendeu 70% dos critérios',a:1},{t:'Atendeu 55% dos critérios',a:2}]},
  quiz:[
    {q:'Periodicidade da avaliação',o:['Mensal','Anual ou no fim do serviço','A cada 3 anos'],a:1,e:'<b>Anual</b> ou ao final do serviço.'},
    {q:'Sem a ISO 14001, o prestador…',o:['Fica desqualificado','Assina o FRM.SUP-0026','Não precisa de nada'],a:1,e:'Assina o <b>FRM.SUP-0026</b>.'},
    {q:'Quem ratifica o plano de ação?',o:['Diretor Fabril','Coordenação de Suprimentos','Jurídico'],a:1,e:'A <b>Coordenação de Suprimentos</b>.'},
    {q:'Plano sem resultado em 3 meses: quem decide?',o:['O comprador','O Diretor Fabril','O RH'],a:1,e:'O <b>Diretor Fabril</b>.'}]
},
{ n:12, short:'Desafio final', title:'Desafio <span>final</span>', ic:'istar', badge:'Mestre dos Contratos', gameName:'Rodada mista',
  chips:[['Revisão + 10 casos',''],['8 perguntas, 15 s','o'],['≈ 6 min','t']],
  intro:'Hora de juntar tudo: uma revisão rápida, dez casos misturados e oito perguntas contra o relógio. Quem passar por aqui fecha a torre.',
  scenes:[
    {ic:'i1',t:'Requisição',chips:[['ME51N','t']],vig:()=>vf('i1','Requisição de serviço',[['Urgente: 3 dias úteis','o'],['Normal: 25 dias corridos','']]),
     x:'RS na ME51N, com o escopo na aba Textos. A urgente sai em <b>3 dias úteis</b> com uma proposta; a normal, em <b>25 dias corridos</b>.'},
    {ic:'i3',t:'Cotação',chips:[['1 · 2 · 3','o']],vig:()=>vf('i3','Cotação',[['Validade de 15 dias',''],['1 · 2 · 3 cotações','o'],['Fiscal confere o CNAE','t']]),
     x:'Propostas completas e com validade de 15 dias, número de cotações conforme o valor e <b>análise fiscal</b> antes do pedido.'},
    {ic:'ibook',t:'Contrato',chips:[['R$ 30 mil e 30 dias','o']],vig:()=>vf('ibook','Contrato',[['> R$ 30 mil e > 30 dias','o'],['Multa de 10% ou 5%',''],['Jurídico: 5 dias úteis','t']]),
     x:'Acima de <b>R$ 30 mil e 30 dias</b>, contrato. Multa de 10% acima de R$ 50 mil e de 5% abaixo. O Jurídico elabora em 5 dias úteis e a assinatura é pelo DocuSign.'},
    {ic:'icoin',t:'Medição',chips:[['Anexo 1','t']],vig:()=>vf('icoin','Medição e pagamento',[['Gestor: 3 dias úteis','o'],['Anexo 1 completo','t'],['Sem desconto de insumos','b']]),
     x:'O gestor aprova a medição em <b>3 dias úteis</b>. Sem os documentos do Anexo 1, o faturamento fica bloqueado.'},
    {ic:'itarget',t:'Fim e avaliação',chips:[['80% · 60%','o']],vig:()=>vf('itarget','Encerramento e avaliação',[['Aviso 30 dias antes',''],['Termo pelo Jurídico','t'],['≥ 80% positivo','o']]),
     x:'Aviso <b>30 dias</b> antes do fim, termo de encerramento pelo Jurídico e avaliação com cortes em 80% e 60%.'}
  ],
  game:{type:'deck',title:'Rodada mista',cards:[
    {s:'Precisa de contrato?',t:'Serviço de R$ 60 mil por 4 meses',b:['Contrato','Só PC'],a:0},
    {s:'Multa',t:'Contrato de R$ 40 mil',b:['5%','10%'],a:0},
    {s:'Prazo',t:'RS urgente',b:['3 dias úteis','25 dias corridos','15 dias úteis'],a:0},
    {s:'Homologação',t:'Empresa de vigilância armada',b:['Obrigatória','Não obrigatória'],a:0},
    {s:'Medição',t:'Falta a GPS do mês',b:['Libera','Bloqueia o faturamento'],a:1},
    {s:'Alçada',t:'PC de R$ 9 mil',b:['N2','N3','N4'],a:0},
    {s:'Quem faz?',t:'Liberar o acesso do prestador',b:['RH','Gestão de Contratos','Comprador'],a:1},
    {s:'Avaliação',t:'Atendeu 3 de 5 critérios',b:['Positivo','Regular','Negativo'],a:1},
    {s:'Bloqueio',t:'Liberação temporária urgente',b:['15 dias','30 ou 60 dias','90 dias'],a:1},
    {s:'Aditivo',t:'Alçada do aditivo de valor',b:['Só o aditivo','Contrato + aditivos'],a:1}]},
  qtime:15,
  quiz:[
    {q:'Quem elabora o contrato?',o:['Suprimentos','Jurídico','Gestão de Contratos'],a:1,e:'O <b>Jurídico</b>.'},
    {q:'Antecedência mínima para a integração',o:['2 dias úteis','5 dias úteis','1 dia útil'],a:0,e:'<b>2 dias úteis</b>.'},
    {q:'Valor que obriga a homologação',o:['R$ 800 mil / USD 190 mil','R$ 1,5 milhão','R$ 300 mil'],a:0,e:'<b>R$ 800 mil / USD 190 mil</b> em 12 meses.'},
    {q:'Quem assina como testemunha pela TEN?',o:['Gestor do Contrato','Comprador','Diretor'],a:0,e:'O <b>Gestor do Contrato</b>.'},
    {q:'Proposta de R$ 8 mil: parcelamento',o:['À vista','De 2 a 5 parcelas','Livre'],a:1,e:'<b>De 2 a 5 parcelas</b>.'},
    {q:'Sem crachá, o colaborador da contratada…',o:['Entra acompanhado','Não entra na fábrica','Só entra na área administrativa'],a:1,e:'<b>Não entra</b> na fábrica.'},
    {q:'Prazo do prestador para entregar os documentos',o:['5 dias úteis','15 dias','30 dias'],a:0,e:'<b>5 dias úteis</b>.'},
    {q:'Avaliação negativa: a continuidade depende de…',o:['Plano de ação ratificado pela Coordenação','Nada','Novo contrato'],a:0,e:'<b>Plano de ação</b> ratificado pela Coordenação de Suprimentos.'}]
}
];
const GINST={
deck:'Leia o caso na carta e toque na resposta certa. Acertos seguidos aumentam o combo; se errar duas vezes, a resposta certa acende.',
order:'Toque nas etapas na ordem em que acontecem. Acertos seguidos aumentam o combo.'
};
M.forEach(m=>m.scenes.forEach(s=>{if(s.p===undefined)s.p=''}));

/* ================= Configuração da trilha ================= */
const CFG={code:'PO.SUP-0010',rev:'07',name:'Gestão de Contratos e Serviços',hero:'Gestão de <span>Contratos</span>',hud:'Trilha de Contratos',
  key:'trilha-sup0010-v1',origem:'trilha-sup0010',title:'Trilha PO.SUP-0010',
  levels:[[0,'Aprendiz de Contratos'],[400,'Requisitante de Serviços'],[1100,'Analista de Contratos'],[2000,'Gestor de Contrato'],[3200,'Especialista em Contratos'],[4400,'Guardião dos Contratos']],
  guide:t=>`
    <div class="gcard"><h3>${ic('iclk')}Prazos</h3>${t(['Etapa','Prazo'],[['RS urgente','3 dias úteis · 1 proposta'],['RS normal','25 dias corridos'],['Homologação','até 30 dias'],['Liberação temporária','30 ou 60 dias'],['Docs do prestador','5 dias úteis'],['Jurídico (contrato)','5 dias úteis'],['Integração','agendar com 2 dias úteis'],['Aprovar medição','3 dias úteis'],['Corrigir antes da multa','5 dias após notificação'],['Aviso de fim','30 dias antes']])}</div>
    <div class="gcard"><h3>${ic('i3')}Cotação</h3>${t(['Qtd','Quando'],[['1','Até R$ 2.500 ou emergência/máquina parada'],['2','R$ 2.500,01 a R$ 5.000'],['3','Demais casos']])}<p class="gnote">Proposta: escopo, prazo, pagamento (acima de R$ 5 mil, de 2 a 5 parcelas), validade de 15 dias, tributos, Incoterms e dados do fornecedor. Fiscal confere CNAE e código de imposto antes do PC.</p></div>
    <div class="gcard"><h3>${ic('ibook')}Contrato</h3>${t(['Regra','Detalhe'],[['Obrigatório','Acima de R$ 30 mil e mais de 30 dias'],['Multa','10% acima de R$ 50 mil · 5% abaixo'],['Terceirização','Cláusula de garantia'],['Retirar multa/garantia','Só com a Diretoria'],['Assinatura','DocuSign · Gestor do Contrato é testemunha'],['SAP','Aprovação do contrato libera PC, medição e pagamento']])}</div>
    <div class="gcard"><h3>${ic('iladder')}Alçadas</h3>${t(['Nível','Quem','Até (BRL / USD)'],[['N1','Coordenador de Suprimentos','Início'],['N2','Ger. Suprimentos e Planejamento','R$ 10 mil / USD 1 (*)'],['N3','Gerente Financeiro','R$ 60 mil / USD 15 mil'],['N4','+ Diretor Geral','R$ 3 mi / USD 750 mil'],['N5','+ D2 ou D3','R$ 5 mi / USD 1,25 mi'],['N6','+ D4, D5 ou D6','R$ 6 mi / USD 1,5 mi'],['N7','+ Presidente da Unidade','acima']])}<p class="gnote">Cumulativas. Aditivo de valor: contrato + aditivos. (*) conforme o PDF, a confirmar.</p></div>
    <div class="gcard"><h3>${ic('ishield')}Homologação</h3><p class="gnote" style="font-size:14px">Aberta pela Gestão de Contratos. Obrigatória a partir de R$ 800 mil / USD 190 mil (faturamento em 12 meses ou contrato ativo) e para vigilância, resíduos de construção e de saúde, serviços de saúde, resíduos perigosos, transporte de pessoas e assessoria/consultoria.</p></div>
    <div class="gcard"><h3>${ic('itarget')}Avaliação</h3>${t(['Resultado','Ação'],[['≥ 80% Positivo','Continua sem justificativa'],['60–79% Regular','Continua com justificativa'],['< 60% Negativo','Plano de ação + NC ou desqualificação']])}<p class="gnote">Critérios: custo, QMSS, prazo, atendimento, conduta ética. Plano ratificado pela Coordenação; sem resultado em 3 meses, decide o Diretor Fabril.</p></div>
    <div class="gcard"><h3>${ic('iclip')}Formulários</h3>${t(['Código','Uso'],[['FRM.SUP-0020','Ficha cadastral'],['FRM.SUP-0021','Dados bancários'],['FRM.SUP-0022','SEMINFE · nota de remessa'],['FRM.SGP-0005','Logística (Serviços Gerais)'],['FRM.SUP-0003','Questionário de avaliação'],['FRM.SUP-0013','Controle das avaliações'],['FRM.SUP-0026','Termo de compromisso QSMS']])}</div>
    <div class="gcard"><h3>${ic('idb')}Sistemas</h3>${t(['Sistema','Uso'],[['SAP ME51N','Requisição de serviço'],['Central AG','Cadastro, homologação, desbloqueio'],['AutoDoc','Documentos do prestador'],['DocuSign','Assinatura do contrato'],['SeSuite','Avaliação de fornecedores'],['Rede G:','Arquivo dos contratos']])}</div>
    <div class="gcard"><h3>${ic('ilock')}Anexo 1 · documentos mensais</h3><p class="gnote" style="font-size:14px">GFIP/SEFIP, FGTS (guia e comprovante), GPS (guia e comprovante), relação de trabalhadores, folha de pagamento dos alocados, recibos e comprovantes de salário, cartões de ponto e comprovantes de benefícios. Se houve demissão: rescisões, GRFC e comprovantes. Faltou algum, o faturamento fica bloqueado.</p></div>`};
