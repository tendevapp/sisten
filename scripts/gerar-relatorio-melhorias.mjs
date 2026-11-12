/**
 * Relatório de divulgação das melhorias do SISTEN por setor.
 *
 *   node scripts/gerar-relatorio-melhorias.mjs
 *
 * Lê os prints de docs/relatorio-melhorias/img/*.jpg (capturados do app local)
 * e gera docs/relatorio-melhorias/relatorio-melhorias-sisten.html e .pdf
 * (o PDF sai pelo Edge headless). Print que não existe é omitido da página.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const dir = resolve(root, 'docs/relatorio-melhorias');
const tem = (nome) => existsSync(resolve(dir, 'img', `${nome}.jpg`));

/** Print em moldura de janela. `corte` limita a altura (mostra o topo da tela). */
function fig(nome, legenda = '', { corte, classe = '' } = {}) {
  if (!tem(nome)) return '';
  const estilo = corte ? ` style="height:${corte}mm"` : '';
  return `<figure class="fig ${classe}">
    <div class="janela"><i></i><i></i><i></i></div>
    <div class="tela"${estilo}><img src="img/${nome}.jpg" alt="${legenda}"></div>
    ${legenda ? `<figcaption>${legenda}</figcaption>` : ''}
  </figure>`;
}

const antesAgora = (pares) => `<div class="aa">
  <div class="aa-col antes"><h4>Antes</h4><ul>${pares.map(([a]) => `<li>${a}</li>`).join('')}</ul></div>
  <div class="aa-col agora"><h4>Agora, no SISTEN</h4><ul>${pares.map(([, b]) => `<li>${b}</li>`).join('')}</ul></div>
</div>`;

let pagina = 1;
const pag = (setor, cor, corpo, extra = '') => {
  pagina += 1;
  return `<section class="page ${extra}" style="--cor:${cor}">
  <header class="topo"><span class="marca">SISTEN</span><span>${setor}</span></header>
  ${corpo}
  <footer class="rodape"><span>Torres Eólicas do Nordeste · Jacobina/BA</span><span>${pagina}</span></footer>
</section>`;
};

const abertura = (nome, titulo, lead) => `
  <div class="abre">
    <div class="setor-nome">${nome}</div>
    <h2>${titulo}</h2>
    <p class="lead">${lead}</p>
  </div>`;

const destaques = (itens) => `<div class="destaques">${itens.map(([t, d]) => `<div><h5>${t}</h5><p>${d}</p></div>`).join('')}</div>`;

const C = {
  ssma: '#0F7A4E', almox: '#C27C0E', sup: '#1F5FAD', port: '#4B5B6B',
  prod: '#C4511A', qual: '#6B3FA0', rh: '#0E7C86', fac: '#55606B', geral: '#1E2830',
};

// ───────────────────────────── conteúdo ─────────────────────────────

const capa = `<section class="page capa">
  <div class="capa-topo"><span class="marca">SISTEN</span><span>Novembro de 2026</span></div>
  <div class="capa-miolo">
    <p class="capa-pre">Torres Eólicas do Nordeste</p>
    <h1>O que mudou na fábrica com o SISTEN</h1>
    <p class="capa-sub">Setor por setor: o que saiu do papel e da planilha, como ficou a tela e o que cada equipe ganhou no dia a dia.</p>
  </div>
  ${tem('capa_torres') ? `<div class="capa-print"><img src="img/capa_torres.jpg" alt="Controle de Entrega com as torres coloridas pelo progresso"></div>` : ''}
  <ul class="capa-setores">
    <li style="--cor:${C.ssma}">SSMA</li><li style="--cor:${C.almox}">Almoxarifado</li>
    <li style="--cor:${C.sup}">Suprimentos</li><li style="--cor:${C.port}">Portaria</li>
    <li style="--cor:${C.prod}">Produção e Planejamento</li><li style="--cor:${C.qual}">Qualidade</li>
    <li style="--cor:${C.rh}">RH e Treinamentos</li><li style="--cor:${C.fac}">Facilities e TI</li>
  </ul>
</section>`;

const visaoGeral = pag('Visão geral', C.geral, `
  ${abertura('Um sistema só', 'Formulário, pedido e controle no mesmo lugar', 'O SISTEN reúne o que antes estava espalhado em fichas de papel, planilhas locais, e-mails e mensagens. Cada setor preenche no celular ou no computador, o registro ganha código próprio e fica disponível para quem precisa consultar — no mesmo dia, sem redigitação.')}
  <div class="numeros">
    <div><b>14</b><span>áreas da fábrica atendidas</span></div>
    <div><b>20+</b><span>formulários digitais em uso</span></div>
    <div><b>788</b><span>fichas de EPI em papel digitalizadas</span></div>
  </div>
  ${fig('01_formularios_hub', 'Central de Formulários: cada setor encontra os seus, com o código do documento oficial.', { corte: 92 })}
  <h3>Vale para todos os setores</h3>
  ${destaques([
    ['Funciona sem sinal', 'No pátio a rede cai. O formulário salva no aparelho e envia sozinho quando a conexão volta, com aviso de "sincronizado" no canto da tela.'],
    ['Foto leve', 'A foto do celular é reduzida antes de subir: anexar três fotos leva segundos, não minutos.'],
    ['Código de registro', 'Cada lançamento recebe um código padrão (ex.: RID-030926-01) que identifica setor, data e sequência.'],
    ['Busca em tudo — Ctrl+K', 'Um campo só encontra material, pedido, peça de projeto ou formulário, de qualquer tela.'],
  ])}
`);

const ssma1 = pag('SSMA', C.ssma, `
  ${abertura('SSMA', 'Entrega de EPI sem ficha de papel', 'A Ficha de EPI (FRM.SEG-0008) era preenchida à mão, guardada em pasta e conferida item por item quando alguém precisava saber o que o colaborador já tinha recebido. Agora a entrega é lançada na tela, já vem montada pela função do colaborador e termina com a assinatura dele no próprio celular ou tablet.')}
  ${antesAgora([
    ['Ficha em papel, uma folha por colaborador', 'Ficha digital com código EPI-DDMMYY-NN e histórico completo'],
    ['Técnico lembrava quais EPIs cada função usa', 'A matriz "EPI por função" preenche a ficha sozinha'],
    ['CA conferido no catálogo impresso', 'Book de EPIs com CA, código SAP e foto do item'],
    ['Assinatura na folha, sujeita a perda', 'Assinatura na tela, gravada junto da ficha e impossível de alterar'],
    ['Consumo só se descobria no fim do mês', 'Análise de consumo por colaborador, função e EPI a qualquer momento'],
  ])}
  <h3>Como ficou o lançamento</h3>
  <ol class="passos">
    <li><b>Cadastro de base.</b> O SSMA mantém o Book de EPIs (CA, validade, código SAP) e a matriz que diz o que cada função recebe.</li>
    <li><b>Escolher o colaborador.</b> A busca puxa do cadastro do RH; a função é sugerida pelo cargo e o histórico de entregas aparece na hora.</li>
  </ol>
  <div class="par">
    ${fig('11_ssma_book_epis', 'Book de EPIs: o catálogo oficial com CA e código SAP.', { corte: 55 })}
    ${fig('12_ssma_epi_por_funcao', 'EPI por função: a matriz que monta a ficha automaticamente.', { corte: 55 })}
  </div>
`);

const ssma2 = pag('SSMA · Ficha de EPI', C.ssma, `
  <ol class="passos" start="3">
    <li><b>A ficha se monta sozinha.</b> Ao escolher o colaborador, os EPIs da função entram marcados, com tamanho, CA e motivo (entrega inicial, reposição, desgaste). Se ele já tem ficha ativa, os itens vêm desmarcados para o técnico escolher só o que está trocando.</li>
  </ol>
  ${fig('14_epi_nova_matriz', 'Nova ficha: colaborador do RH, função confirmada e aviso de que ele já tem fichas ativas.', { corte: 64 })}
  ${fig('14c_epi_nova_matriz_itens', 'Itens da matriz com CA, código SAP, tamanho e a última entrega de cada EPI.', { corte: 46 })}
  <ol class="passos" start="4">
    <li><b>Assinatura e baixa no estoque.</b> O colaborador assina na tela. A ficha gera a saída do almoxarifado; o item sem saldo abre automaticamente uma retirada extraordinária para o Suprimentos.</li>
    <li><b>Consulta e documento.</b> Toda ficha emitida abre como o termo oficial, com a assinatura, e vira PDF. Assinaturas pendentes ficam sinalizadas e podem ser colhidas em lote.</li>
  </ol>
  <div class="par">
    ${fig('15_epi_fichas', 'Fichas emitidas, com filtro de assinatura pendente.', { corte: 55 })}
    ${fig('15b_epi_ficha_detalhe', 'O termo de responsabilidade gerado pela ficha.', { corte: 55 })}
  </div>
`);

const ssma3 = pag('SSMA · Controle de EPI', C.ssma, `
  <ol class="passos" start="6">
    <li><b>Análise de consumo.</b> Cruzando as fichas, o sistema calcula quanto dura cada EPI por função, aponta troca antes da hora (menos da metade da duração típica) e prevê a próxima reposição. Os filtros se combinam: EPI, colaborador, função, setor e motivo.</li>
  </ol>
  ${fig('17_epi_analise', 'Análise de consumo de EPI: duração, trocas precoces e reposições previstas.', { corte: 100, classe: 'grande' })}
  <ol class="passos" start="7">
    <li><b>Saídas do estoque.</b> A saída real do depósito, lida do SAP, fica ao lado do saldo atual — para comparar o que foi entregue com o que saiu da prateleira.</li>
  </ol>
  ${fig('18_epi_estoque', 'Saídas do estoque de EPI com saldo do depósito.', { corte: 70 })}
  <div class="nota">O histórico em papel não foi perdido: <b>788 fichas e 2.126 itens</b> das pastas físicas foram digitalizados e entram na mesma análise. As fichas importadas ficam marcadas para assinatura posterior.</div>
`);

const ssma4 = pag('SSMA', C.ssma, `
  <h3 class="primeiro">Desvios (RID) e alcoolemia</h3>
  ${destaques([
    ['RID no celular', 'Quem vê o desvio registra na hora, com foto, local e gravidade. O plano de ação tem responsável e prazo, e o painel mostra abertos e fechados por setor.'],
    ['Relatório pronto para reunião', 'O quadro de desvios por setor e período sai no formato de slide, sem montar gráfico à mão.'],
    ['Alcoolemia com termo', 'Teste registrado com foto, local de aferição e assinatura; o livro do dia, semana ou mês sai em PDF.'],
  ])}
  ${fig('10_ssma_hub', 'Hub do SSMA com os indicadores de desvios.', { corte: 70 })}
  <div class="par">
    ${fig('19_ssma_rid', 'RID: registro do desvio.', { corte: 55 })}
    ${fig('20_ssma_alcoolemia', 'Teste de alcoolemia.', { corte: 55 })}
  </div>
`);

const almox1 = pag('Almoxarifado', C.almox, `
  ${abertura('Almoxarifado', 'Do caminhão na portaria até a baixa no SAP', 'O material passou a ser acompanhado em todas as etapas: chega com ficha cega, é conferido contra o pedido, guardado com etiqueta QR e retirado no balcão com requisição digital. O saldo do SAP aparece na tela de quem atende.')}
  ${antesAgora([
    ['Conferência de nota no papel', 'Ficha cega: quem confere não vê a quantidade do pedido'],
    ['Requisição de balcão em bloco', 'Requisição no Balcão lida pelo QR da prateleira, só com saldo'],
    ['Inventário anual, com planilha', 'Inventário cíclico com contagem cega e até 3 recontagens'],
    ['"Onde está esse item?"', 'Gemba 3D com a posição de cada estante e etiqueta com QR'],
  ])}
  ${fig('30_almox_recebimento_hub', 'Recebimento de material: ficha cega, contagem por pedido e relatório de não conformidade.', { corte: 74 })}
  <div class="par">
    ${fig('31_almox_balcao', 'Requisição no Balcão (FRM.ALM-0014).', { corte: 55 })}
    ${fig('32_almox_inventario', 'Inventário cíclico (FRM.ALM-0015).', { corte: 55 })}
  </div>
`);

const almox2 = pag('Almoxarifado', C.almox, `
  <h3 class="primeiro">Estoque sob controle</h3>
  ${destaques([
    ['Controle de Estoque', 'Saldo da ZL0024, estoque mínimo e cobertura no mesmo painel, inclusive para itens zerados.'],
    ['Alertas de consumo', 'Ruptura, mínimo defasado e aumento de consumo aparecem antes de faltar material.'],
    ['Cadastro de itens com foto', 'Cada item tem foto, posição e etiqueta de prateleira com QR, que abre a situação do material.'],
  ])}
  ${fig('34_almox_controle_estoque', 'Controle de Estoque e Dossiê do material.', { corte: 72 })}
  <div class="par">
    ${fig('35_almox_consumo_semanal', 'Consumo semanal e alertas.', { corte: 55 })}
    ${fig('36_almox_gemba', 'Gemba 3D do almoxarifado.', { corte: 55 })}
  </div>
  ${fig('33_almox_cadastro_itens', 'Cadastro de Itens com fotos, etiquetas e atalho de contagem.', { corte: 44 })}
`);

const sup1 = pag('Suprimentos', C.sup, `
  ${abertura('Suprimentos', 'A compra visível do pedido à entrega', 'Quem pede acompanha. Quem compra trabalha numa fila organizada, com cotação comparada e histórico de preço. A ligação com o SAP (requisições, pedidos e entradas) atualiza o andamento sem ninguém precisar perguntar por e-mail.')}
  ${antesAgora([
    ['Solicitação por e-mail, sem código', 'Solicitação com código SAP obrigatório e busca no catálogo'],
    ['"Meu pedido já saiu?"', 'Rastreio com a linha do tempo de cada item, aberto ao solicitante'],
    ['Mapa de cotação em planilha', 'Cotação com mapa comparativo, impostos e frete calculados'],
    ['Avaliação de fornecedor anual, em papel', 'Ocorrências registradas no dia e avaliação a partir delas'],
  ])}
  ${fig('41_sup_central_compras', 'Central de Compras: fila por comprador, em dias úteis, com situação no SAP.', { corte: 74 })}
  <div class="par">
    ${fig('40_sol_nova', 'Nova solicitação com catálogo SAP.', { corte: 55 })}
    ${fig('42_rastreio', 'Rastreio de compras para o solicitante.', { corte: 55 })}
  </div>
`);

const sup2 = pag('Suprimentos', C.sup, `
  <h3 class="primeiro">Decisão com número na mão</h3>
  ${destaques([
    ['Cotações', 'Propostas lidas e vinculadas aos itens, peso e frete estimados, preço líquido e diferencial de alíquota visíveis no mapa.'],
    ['Fornecedores', 'Ocorrências de atraso ou qualidade registradas no dia; a avaliação usa os pedidos e as ocorrências reais.'],
    ['Pendências de recebimento', 'Divergência apontada pelo almoxarifado vai direto ao comprador do pedido, que decide e devolve.'],
  ])}
  ${fig('44_sup_cotacoes', 'Cotações e mapa comparativo.', { corte: 66 })}
  <div class="par">
    ${fig('43_sup_dashboards', 'Dashboards de Suprimentos.', { corte: 55 })}
    ${fig('45_sup_avaliacao', 'Avaliação de fornecedores.', { corte: 55 })}
  </div>
  ${fig('46_sup_pendencias_receb', 'Pendências de recebimento entre almoxarifado e comprador.', { corte: 50 })}
`);

const port = pag('Portaria', C.port, `
  ${abertura('Portaria', 'O livro da portaria virou tela', 'Chegada de transportes, ocorrências, briefing de turma e passagem de plantão são lançados no posto, com foto. Quando a portaria recebe material, o almoxarifado já é avisado com a ficha aberta.')}
  ${destaques([
    ['Transportes', 'Rota, placa e motorista com sugestão dos lançamentos anteriores — digita-se menos e com menos erro.'],
    ['Ocorrências com foto', 'Relatório pesquisável pelo conteúdo, com detalhe no clique e PDF com as fotos.'],
    ['Entrega de material', 'A entrega registrada na portaria abre a ficha cega no almoxarifado automaticamente.'],
  ])}
  <div class="par">
    ${fig('50_port_transportes', 'Chegada de transportes.', { corte: 55 })}
    ${fig('51_port_relatorio', 'Relatório de ocorrências.', { corte: 55 })}
  </div>
  <div class="par">
    ${fig('53_port_briefing', 'Briefing de turma.', { corte: 55 })}
    ${fig('54_port_plantao', 'Passagem de plantão.', { corte: 55 })}
  </div>
`);

const prod = pag('Produção e Planejamento', C.prod, `
  ${abertura('Produção e Planejamento', 'Cada tramo acompanhado pela etapa em que está', 'O apontamento por tramo mostra onde cada peça está no processo. O Planejamento acompanha a entrega na mesma linguagem visual das torres, e a TV do chão de fábrica exibe o relatório do dia.')}
  ${destaques([
    ['Apontamento por tramo', 'Quadro por etapa, motivo de parada e metas por marco.'],
    ['Controle de Entrega', 'Torres coloridas pelo progresso do checklist até expedido, com histórico de cada mudança.'],
    ['Aqui TEN Melhoria!', 'Sugestões de melhoria (Kaizen) registradas por qualquer colaborador, com PDF e acompanhamento.'],
  ])}
  ${fig('62_plan_controle_entrega', 'Controle de Entrega em visão de torres.', { corte: 70 })}
  <div class="par">
    ${fig('60_prod_apontamentos', 'Apontamentos de produção.', { corte: 55 })}
    ${fig('63_plan_kaizen', 'Aqui TEN Melhoria! (Kaizen).', { corte: 55 })}
  </div>
`);

const qual = pag('Qualidade', C.qual, `
  ${abertura('Qualidade', 'Checklist no pátio, assinatura sem papel', 'Os checklists de Expedição e de Internos Mecânicos são preenchidos no local, mesmo sem rede. A Produção conclui, a Qualidade verifica, e as assinaturas são colhidas na tela — também em lote.')}
  ${antesAgora([
    ['Checklist impresso preenchido à caneta', 'Checklist no tablet, salvo no aparelho e enviado quando houver sinal'],
    ['Quatro assinaturas correndo atrás da folha', 'Fila de assinaturas, com assinatura em lote'],
    ['Conferência sem registro de quem fez', 'Dupla verificação: Produção conclui, Qualidade confirma'],
  ])}
  ${fig('70_qual_expedicao', 'Checklist de Expedição e fila de assinaturas.', { corte: 70 })}
  <div class="par">
    ${fig('71_qual_internos', 'Internos Mecânicos em duas etapas.', { corte: 55 })}
    ${fig('72_qual_rnc', 'Relatórios de não conformidade.', { corte: 55 })}
  </div>
`);

const rh = pag('RH, Facilities e TI', C.rh, `
  ${abertura('RH, Facilities e TI', 'Pedidos internos com dono e prazo', 'Hora extra autorizada no formulário, treinamentos em trilhas interativas por setor e chamados de Facilities e TI com categoria, responsável e acompanhamento.')}
  ${destaques([
    ['Autorização de hora extra', 'ASE com colaboradores do cadastro (ou digitados, quando terceiros), código por setor e aprovação.'],
    ['Treinamentos em trilha', 'Procedimentos viram trilhas interativas por setor, com progresso de cada colaborador.'],
    ['Chamados', 'Facilities e TI recebem o chamado já com os campos certos; a equipe é avisada por e-mail.'],
  ])}
  <div class="par">
    ${fig('80_rh_ase', 'Autorização de hora extra (ASE).', { corte: 55 })}
    ${fig('82_treinamentos', 'Trilhas de treinamento.', { corte: 55 })}
  </div>
  <div class="par">
    ${fig('83_facilities', 'Facilities.', { corte: 55 })}
    ${fig('84_helpdesk', 'Helpdesk de TI.', { corte: 55 })}
  </div>
`);

const fecho = pag('Próximos passos', C.geral, `
  ${abertura('E agora', 'Como pedir acesso e sugerir melhoria', 'Cada colaborador entra com o próprio usuário. Os módulos são liberados pelo administrador conforme a função — quem precisa de uma tela que ainda não vê pede pela Gestão de Acessos. Ideias de melhoria entram pelo Aqui TEN Melhoria! ou pelo botão de feedback do sistema.')}
  ${fig('90_busca_global', 'Ctrl+K: a busca que encontra material, pedido, peça e formulário de qualquer tela.', { corte: 70 })}
  <h3>Resumo por setor</h3>
  <table class="resumo">
    <tr><td style="--cor:${C.ssma}">SSMA</td><td>Ficha de EPI montada pela função, com assinatura na tela, análise de consumo e saídas do estoque; RID com foto e plano de ação; alcoolemia com termo.</td></tr>
    <tr><td style="--cor:${C.almox}">Almoxarifado</td><td>Ficha cega no recebimento, requisição no balcão por QR, inventário cíclico com contagem cega, controle de estoque com alertas e Gemba 3D.</td></tr>
    <tr><td style="--cor:${C.sup}">Suprimentos</td><td>Solicitação com código SAP, Central de Compras, rastreio para o solicitante, cotações com mapa e impostos, avaliação de fornecedor.</td></tr>
    <tr><td style="--cor:${C.port}">Portaria</td><td>Transportes, ocorrências com foto, briefing e passagem de plantão; entrega de material avisa o almoxarifado.</td></tr>
    <tr><td style="--cor:${C.prod}">Produção e Planejamento</td><td>Apontamento por tramo, Controle de Entrega em visão de torres e Aqui TEN Melhoria!.</td></tr>
    <tr><td style="--cor:${C.qual}">Qualidade</td><td>Checklists de Expedição e Internos Mecânicos no tablet, sem rede, com fila de assinaturas.</td></tr>
    <tr><td style="--cor:${C.rh}">RH, Facilities e TI</td><td>Hora extra (ASE), trilhas de treinamento e chamados com responsável.</td></tr>
  </table>
`);

const css = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,300..900&display=swap');
:root{--tinta:#1E2830;--texto:#2E3A44;--suave:#5B6873;--linha:#D9DEE3;--fundo:#F3F5F7;--branco:#fff}
*{box-sizing:border-box;margin:0;padding:0}
@page{size:A4;margin:0}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:'Archivo',sans-serif;font-stretch:100%;color:var(--texto);background:#8A949C;font-size:9.6pt;line-height:1.5}
.page{width:210mm;height:297mm;margin:0 auto 8mm;background:var(--branco);padding:16mm 15mm 14mm;position:relative;overflow:hidden;display:flex;flex-direction:column;gap:4.2mm}
@media print{body{background:none}.page{margin:0;break-after:page}}
.topo{display:flex;justify-content:space-between;align-items:center;font-size:8pt;color:var(--suave);border-bottom:2.4px solid var(--cor);padding-bottom:2.2mm;margin-bottom:1mm}
.topo span:last-child{font-weight:600;color:var(--cor)}
.marca{font-weight:900;font-stretch:125%;letter-spacing:.02em;color:var(--tinta)}
.rodape{position:absolute;left:15mm;right:15mm;bottom:8mm;display:flex;justify-content:space-between;font-size:7.5pt;color:var(--suave)}
.abre .setor-nome{font-weight:800;font-stretch:125%;color:var(--cor);font-size:11pt}
.abre h2{font-size:23pt;line-height:1.08;font-weight:800;font-stretch:112%;color:var(--tinta);margin:1mm 0 2.4mm;max-width:165mm;letter-spacing:-.01em}
.lead{font-size:10.4pt;color:var(--texto);max-width:168mm}
h3{font-size:12.5pt;font-weight:800;font-stretch:110%;color:var(--tinta);margin-top:1mm}
h3.primeiro{font-size:17pt;margin-top:0}
.aa{display:grid;grid-template-columns:1fr 1fr;border:1px solid var(--linha);border-radius:3mm;overflow:hidden}
.aa-col{padding:3mm 4mm}
.aa h4{font-size:9pt;font-weight:800;margin-bottom:1.4mm}
.aa ul{list-style:none;display:grid;gap:1.3mm}
.aa li{font-size:8.8pt;line-height:1.35;padding-left:3.6mm;position:relative}
.antes{background:var(--fundo);color:var(--suave)}
.antes h4{color:var(--suave)}
.antes li::before{content:'';position:absolute;left:0;top:1.9mm;width:1.8mm;height:.4mm;background:#9AA5AE}
.agora h4{color:var(--cor)}
.agora li{color:var(--tinta)}
.agora li::before{content:'';position:absolute;left:0;top:1.3mm;width:1.6mm;height:1.6mm;border-radius:50%;background:var(--cor)}
.destaques{display:grid;grid-template-columns:repeat(auto-fit,minmax(0,1fr));gap:4mm}
.destaques div{border-top:2px solid var(--cor);padding-top:2mm}
.destaques h5{font-size:9.6pt;font-weight:800;color:var(--tinta);margin-bottom:.8mm}
.destaques p{font-size:8.6pt;line-height:1.42;color:var(--texto)}
.numeros{display:grid;grid-template-columns:repeat(3,1fr);gap:3mm}
.numeros div{background:var(--tinta);color:#fff;border-radius:2.5mm;padding:3.5mm 4mm}
.numeros b{display:block;font-size:24pt;font-weight:900;font-stretch:125%;line-height:1}
.numeros span{font-size:8.2pt;color:#C9D2D9;display:block;margin-top:1.4mm;line-height:1.3}
.passos{list-style:none;counter-reset:p calc(var(--ini,1) - 1);display:grid;gap:2.2mm}
.passos li{position:relative;padding-left:10mm;font-size:9.4pt;line-height:1.45;min-height:7mm}
.passos li::before{counter-increment:p;content:counter(p);position:absolute;left:0;top:-.3mm;width:7mm;height:7mm;border-radius:50%;background:var(--cor);color:#fff;font-weight:900;font-stretch:125%;display:flex;align-items:center;justify-content:center;font-size:10pt}
.passos b{color:var(--tinta)}
.fig{margin:0}
.janela{height:4.2mm;background:#E4E8EC;border:1px solid var(--linha);border-bottom:0;border-radius:2.2mm 2.2mm 0 0;display:flex;gap:1.3mm;align-items:center;padding-left:2.4mm}
.janela i{width:1.6mm;height:1.6mm;border-radius:50%;background:#B7C0C8}
.tela{border:1px solid var(--linha);border-radius:0 0 2.2mm 2.2mm;overflow:hidden;background:#fff}
.tela img{width:100%;display:block;object-fit:cover;object-position:top left;height:100%}
figcaption{font-size:7.8pt;color:var(--suave);margin-top:1.2mm;line-height:1.35}
.par{display:grid;grid-template-columns:1fr 1fr;gap:4mm}
.resumo{border-collapse:collapse;width:100%;font-size:8.8pt}
.resumo td{border-top:1px solid var(--linha);padding:2mm 2mm 2mm 0;vertical-align:top;line-height:1.4}
.resumo td:first-child{width:42mm;font-weight:800;color:var(--tinta);border-left:3px solid var(--cor);padding-left:2.5mm}
.nota{background:color-mix(in srgb,var(--cor) 9%,white);border-left:3px solid var(--cor);padding:3mm 4mm;font-size:9pt;color:var(--tinta);border-radius:0 2mm 2mm 0}
/* capa */
.capa{background:var(--tinta);color:#fff;padding:18mm 16mm}
.capa-topo{display:flex;justify-content:space-between;font-size:9pt;color:#AAB6BF}
.capa .marca{color:#fff;font-size:13pt}
.capa-miolo{margin-top:22mm}
.capa-pre{font-weight:600;color:#8FD3B6;font-size:11pt}
.capa h1{font-size:44pt;line-height:.98;font-weight:900;font-stretch:118%;letter-spacing:-.02em;margin:4mm 0 6mm;max-width:170mm}
.capa-sub{font-size:12pt;color:#C9D2D9;max-width:140mm;line-height:1.45}
.capa-print{margin:14mm -16mm 0 18mm;border-radius:3mm 0 0 3mm;overflow:hidden;height:62mm;box-shadow:0 0 0 1px #3A4752;background:#fff}
.capa-print img{width:100%;display:block}
.capa-setores{list-style:none;display:flex;flex-wrap:wrap;gap:2mm 5mm;position:absolute;left:16mm;right:16mm;bottom:16mm}
.capa-setores li{font-size:9pt;color:#DDE3E8;padding-left:3.6mm;position:relative}
.capa-setores li::before{content:'';position:absolute;left:0;top:1.5mm;width:2mm;height:2mm;border-radius:50%;background:var(--cor)}
`;

// O contador de passos começa no "start" do <ol>: passa como variável CSS.
const fixarInicio = (html) => html.replace(/<ol class="passos" start="(\d+)">/g, '<ol class="passos" style="--ini:$1">');

const html = fixarInicio(`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Melhorias SISTEN por setor</title><style>${css}</style></head>
<body>
${capa}
${visaoGeral}
${ssma1}${ssma2}${ssma3}${ssma4}
${almox1}${almox2}
${sup1}${sup2}
${port}
${prod}
${qual}
${rh}
${fecho}
</body></html>`);

const htmlPath = resolve(dir, 'relatorio-melhorias-sisten.html');
writeFileSync(htmlPath, html, 'utf8');
console.log('HTML:', htmlPath);

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const pdfPath = resolve(dir, 'relatorio-melhorias-sisten.pdf');
execFileSync(edge, [
  '--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--run-all-compositor-stages-before-draw',
  '--virtual-time-budget=15000', `--print-to-pdf=${pdfPath}`, 'file:///' + htmlPath.replace(/\\/g, '/'),
], { stdio: 'inherit' });
console.log('PDF:', pdfPath);
