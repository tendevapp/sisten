/* ===================== SISTEN: memória de cálculo da comparação de cotações =====================
   Painel visível sob os dois mapas (a memória por célula continua nas dicas, qMemo). Todos os valores
   vêm de quoteModel, o mesmo cálculo do mapa; o painel só mostra o passo a passo e confere se as
   parcelas fecham. Para o fornecedor do Simples, mostra a conta do DAS (simples.js) de onde sai o
   crédito de CBS e IBS e a conferência da base legal. */
const Q_LINKS={
 perguntao:'https://www8.receita.fazenda.gov.br/SimplesNacional/Arquivos/manual/PerguntaoSN.pdf',
 lc214:'https://www2.camara.leg.br/legin/fed/leicom/2025/leicomplementar-214-16-janeiro-2025-796905-normaatualizada-pl.html',
 anexoI:'https://legis.senado.leg.br/norma/40180341/publicacao/40181079',
 anexoIII:'https://legis.senado.leg.br/norma/40180341/publicacao/40181117'
};
const qPct=n=>num(n,2)+'%';
const qMenos=n=>n?'− '+money(n):money(0);
const qRegime=x=>x.regime==='das'?'Simples / DAS':x.regime==='outside'?'Simples / IBS-CBS regular':'Regime regular';

function qMemRows(v,c,y){
 const o=quoteState,m=quoteModel(v,c,y),reg=v.regime==='regular',das=v.regime==='das',srv=c.kind==='service',L=YEARS[y].legacy;
 const dd=das?qDasCredito(v,c,y,m.raw):null,perm=o.credit&&v.docs;
 let nH=0;const R=[],H=t=>R.push({h:`${++nH} · ${t}`}),A=(l,how,val,cls='')=>R.push({l,how,val,cls});
 /* Conta do DAS do fornecedor do Simples: de onde vêm os créditos de ICMS (desde 2026), CBS e IBS (de 2027 em diante). */
 const blocoDas=()=>{
  H(`DAS do fornecedor em ${y} (de onde vêm os créditos)`);
  A('Receita bruta dos últimos 12 meses','hipótese do exemplo, editável; troque pela do fornecedor real',money(dd.rbt));
  A(`Faixa ${dd.faixa} · ${dd.nome}`,`receita até ${money(dd.teto)}; alíquota nominal ${num(dd.nom,2)}% − dedução ${money(dd.ded)}`,qPct(dd.nom));
  A('Alíquota efetiva do DAS',`(${money(dd.rbt)} × ${num(dd.nom,2)}% − ${money(dd.ded)}) ÷ ${money(dd.rbt)}`,qPct(dd.ef),'sum');
  if(y>2026){
   A('Parte de CBS no DAS',`${qPct(dd.pc)} da alíquota efetiva (partilha de ${dd.periodo}); a CBS ocupa o lugar do PIS/Cofins`,num(dd.efCbs,4)+'%');
   A('Parte de IBS no DAS',`${qPct(dd.pi)} da alíquota efetiva (partilha de ${dd.periodo}); cresce à medida que o IBS substitui ICMS/ISS`,num(dd.efIbs,4)+'%');
  }else A('CBS e IBS (teste de 2026)','não se aplicam ao optante do Simples em 2026 (LC 214, art. 348, III, “c”)',money(0));
  if(dd.comIcms)A('Parte de ICMS no DAS',`${qPct(dd.icmsPc)} da alíquota efetiva (partilha de ${dd.periodo}); ${y>=2033?'em 2033 o IBS substitui o ICMS':y>=2029?'cai à medida que o IBS ocupa o lugar do ICMS':'integral até 2028'}`,num(dd.efIcms,4)+'%');
  else if(srv)A('ISS no DAS','o ISS pago pelo prestador do Simples não gera crédito ao comprador (só ICMS, IBS e CBS)','—','info');
  if(dd.fora)A('Atenção','receita acima de R$ 4,8 milhões: o fornecedor sai do Simples e o crédito seria o do regime regular','','info');
  if(dd.faixa===6)A('Faixa 6','IBS, ICMS e ISS são recolhidos fora do DAS; só a CBS entra na partilha desta faixa','','info');
  if(dd.aviso5)A('Aviso · faixa 5 do Anexo III','acima de 14,92537% de alíquota efetiva o ISS tem limite e a partilha muda por fórmula especial, não aplicada aqui','','info');
 };
 H('Valor da proposta, nos preços de hoje');
 A('Lote',`${num(c.qty,0)} ${c.unit} × ${money(v.unit)}`,money(round(c.qty*v.unit)));
 A('Frete cobrado pelo fornecedor','somado uma única vez',money(v.freight));
 A('Desconto incondicional','abatido do lote',qMenos(v.discount));
 A('Valor do documento hoje','lote + frete − desconto',money(m.raw),'sum');
 if(y===2026){
  H('Tributos de hoje dentro do preço');
  if(reg){
   const ic=srv||c.benefit?0:qIcmsV(v,c),is=srv?v.iss:0;
   if(ic){A('Alíquota de ICMS (calculada pelas UFs)',qIcmsUF(v,c).texto,qPct(ic));A('ICMS embutido',`${money(m.raw)} × ${qPct(ic)}`,money(m.icms))}
   else if(is)A('ISS embutido',`${money(m.raw)} × ${qPct(is)} (alíquota municipal: hipótese entre 2% e 5%)`,money(m.iss));
   else A('ICMS e ISS embutidos',c.benefit?'benefício hipotético: sem ICMS neste caso':'não incidem neste caso',money(0));
  }else A('ICMS, ISS, PIS e Cofins próprios','o fornecedor do Simples não os destaca no documento; o preço bruto é mantido',money(0));
  A(reg?'Base de PIS/Cofins':'Base do crédito de PIS/Cofins do adquirente',reg?`${money(m.raw)} − ICMS embutido (o ISS não se exclui da base)`:'valor da aquisição; não há ICMS destacado a excluir',money(m.pcBase));
  A(reg?'PIS 1,65%':'PIS 1,65% (crédito do adquirente)',`${money(m.pcBase)} × 1,65%`,money(m.pis));
  A(reg?'Cofins 7,60%':'Cofins 7,60% (crédito do adquirente)',`${money(m.pcBase)} × 7,60%`,money(m.cof));
  A('Preço líquido estimado',reg?'documento − ICMS − ISS − PIS − Cofins':'igual ao documento: não há tributo do Simples a retirar',money(m.net),'sum');
  if(reg)A('CBS 0,9% e IBS 0,1% (teste de 2026)',`${money(m.net)} × 0,9% = ${money(m.cbs)} · × 0,1% = ${money(m.ibs)}`,'só informativo','info');
  A('Total a pagar',reg?'= valor do documento; CBS e IBS do teste não são somados':'= valor do documento',money(m.total),'sum');
  if(das)blocoDas();
 }else{
  H(`Tributos em ${y}`);
  A('PIS e Cofins','extintos a partir de 2027: não compõem o preço nem geram crédito',money(0));
  A('Preço líquido preservado',reg?'o mesmo preço líquido estimado de 2026 (hipótese de negociação)':'preço bruto de hoje mantido; nada a retirar do Simples',money(m.net),'sum');
  if(das){
   A('ICMS, ISS, CBS e IBS','pagos pelo fornecedor dentro do DAS; não aparecem por fora no documento',money(0));
   A('Total a pagar','= valor do documento de hoje (preço bruto mantido)',money(m.total),'sum');
   blocoDas();
  }else{
   const rateS=srv&&reg?v.iss*L/100:0,rate=(m.rateI||0)+rateS;
   if(rate>0){
    if(!rateS)A('Alíquota de ICMS (calculada pelas UFs)',qIcmsUF(v,c).texto,qPct(qIcmsV(v,c)));
    A('Alíquota legada efetiva',`${qPct(rateS?v.iss:qIcmsV(v,c))} originais × ${L}% da transição`,qPct(rate));
    A('Documento com ICMS/ISS por dentro',`${money(m.net)} ÷ (1 − ${qPct(rate)})`,money(m.base));
    A(rateS?'ISS remanescente':'ICMS remanescente','documento com o tributo − preço líquido',money(m.icms+m.iss));
   }else A('ICMS e ISS',y===2033?'extintos em 2033':c.benefit&&y<=2028?'o benefício hipotético zera o ICMS até 2028':'não incidem neste caso',money(0));
   const prop=100-L;
   A(`CBS ${qPct(YEARS[y].cbs)}`,`${money(m.net)} × ${qPct(YEARS[y].cbs)}, por fora; ${y<=2028?'referência de 8,8% menos 0,1 p.p. que vai para o IBS':'alíquota de referência de 8,8%'} (hipótese da apostila)`,money(m.cbs));
   A(`IBS ${qPct(YEARS[y].ibs)}`,`${money(m.net)} × ${qPct(YEARS[y].ibs)}, por fora; ${y<=2028?'alíquota simbólica de 0,1%':`17,7% de referência × ${prop}% da transição (${100-prop}% do ICMS/ISS segue vigente)`} (hipótese da apostila)`,money(m.ibs));
   A('Total do documento',`${money(m.base)} + CBS + IBS`,money(m.total),'sum');
  }
 }
 H('Créditos do adquirente (hipótese)');
 if(!perm)A('Créditos não considerados',!o.credit?'a opção “Considerar créditos elegíveis” está desmarcada':'a premissa fiscal deste fornecedor não foi confirmada',money(0),'info');
 A('Crédito de ICMS',reg?`igual ao ICMS ${y===2026?'embutido':'remanescente'}, se destacado e elegível`:das?(dd.comIcms?`${money(m.raw)} × ${num(dd.efIcms,4)}% (parte de ICMS no DAS); limitado ao ICMS efetivamente devido pelo optante; a nota precisa informar a alíquota do crédito (LC 123, art. 23)`:'serviço: o ISS pago no DAS não gera crédito'):'Simples fora do DAS: sem crédito de ICMS neste caso',money(m.creditIcms));
 A('Crédito de PIS/Cofins',y===2026?`PIS ${money(m.pis)} + Cofins ${money(m.cof)}${reg?'':'; compra de optante do Simples dá crédito ao adquirente não cumulativo (ADI RFB 15/2007)'}`:'extintos a partir de 2027',money(m.creditPC));
 A('Crédito de CBS',y===2026?'teste de 2026: informativo, sem crédito econômico':das?`${money(m.raw)} × ${num(dd.efCbs,4)}% (parte de CBS no DAS); limitado ao devido no DAS, LC 214, art. 47, § 9º, II`:'CBS do documento, se o débito for extinto (LC 214, art. 47)',money(m.creditCbs));
 A('Crédito de IBS',y===2026?'teste de 2026: informativo, sem crédito econômico':das?`${money(m.raw)} × ${num(dd.efIbs,4)}% (parte de IBS no DAS); limitado ao devido no DAS, LC 214, art. 47, § 9º, II`:'IBS do documento, se o débito for extinto (LC 214, art. 47)',money(m.creditIbs));
 A('Créditos elegíveis','ICMS + PIS/Cofins + CBS + IBS',money(m.credits),'sum');
 H('Custo para decidir');
 A('Total a pagar','valor do documento',money(m.total));
 A('Outros custos não recuperáveis','inspeção, adequação etc.',money(v.extra));
 A('Desembolso total do lote','total + outros custos',money(m.landed),'sum');
 A('(−) Créditos elegíveis','bloco de créditos',qMenos(m.credits));
 A('Custo após créditos','desembolso − créditos',money(m.economic),'res');
 const i=num(o.monthly,1)+'%';
 A('Custo em valor presente',`${money(m.total)} ÷ (1+${i})^(${v.pay}/30) = ${money(m.payablePV)}; créditos ÷ (1+${i})^((${v.pay}+${o.creditDays})/30) = ${money(m.creditsPV)}; + custos extras ${money(v.extra)}`,money(m.present),'sum');
 const t=.011,fecha=[
  Math.abs(m.landed-(m.total+v.extra))<t,
  Math.abs(m.economic-(m.landed-m.credits))<t,
  Math.abs(m.credits-(m.creditPC+m.creditIcms+m.creditCbs+m.creditIbs))<t,
  Math.abs(m.present-(m.payablePV-m.creditsPV+v.extra))<t,
  y===2026?Math.abs(m.total-m.raw)<t&&(!reg||Math.abs(m.net-(m.raw-m.icms-m.iss-m.pis-m.cof))<t):das?Math.abs(m.total-m.raw)<t:Math.abs(m.total-(m.base+m.cbs+m.ibs))<t,
  !dd||(Math.abs(m.creditCbs-(perm?dd.cbs:0))<t&&Math.abs(m.creditIbs-(perm?dd.ibs:0))<t&&Math.abs(m.creditIcms-(perm?dd.icms:0))<t)
 ].every(Boolean);
 A('Conferência aritmética',fecha?'cada total acima fecha com as parcelas mostradas':'há uma parcela que não fecha: revisar as premissas',fecha?'✓ fecha':'✕ difere',fecha?'ok':'bad');
 return R;
}
function qMemPane(v,c,y){
 const rows=qMemRows(v,c,y);
 return `<section class="quote-map q-mem-pane"><div class="pane-heading"><div><span>${y===2026?'Como comprar hoje':'Cenário da reforma'}</span><h2>${esc(v.name)} · ${y}</h2></div><div class="q-pane-total"><small>${esc(qRegime(v))}</small></div></div><div class="tablewrap"><table class="q-mem-table"><tbody>${rows.map(r=>r.h?`<tr class="mh"><th colspan="2">${r.h}</th></tr>`:`<tr class="${r.cls}"><td>${r.l}${r.how?`<small>${r.how}</small>`:''}</td><td class="num">${r.val}</td></tr>`).join('')}</tbody></table></div></section>`;
}
/* Quanto o crédito de PIS/Cofins pesa na indicação de hoje (só quando o fornecedor tem esse crédito). */
function qSemCreditoPC(v){
 const c=qCase(),o=quoteState,all=o.vendors.map(x=>({x,m:quoteModel(x,c,2026)})),me=all.find(z=>z.x.id===v.id).m;
 if(!me.creditPC||!me.eligible)return null;
 const rate=o.monthly/100,tira=o.pv?me.creditPC/Math.pow(1+rate,(v.pay+o.creditDays)/30):me.creditPC,sem=round(me.score+tira);
 const rest=all.filter(z=>z.x.id!==v.id&&z.m.eligible).sort((a,b)=>a.m.score-b.m.score)[0];
 return{me,sem,rest,decide:!!rest&&me.score<=rest.m.score&&sem>rest.m.score};
}
function qFonteSimples(v,c){
 if(v.regime==='regular')return qCase().vendors.some(x=>x.regime!=='regular')?'<div class="q-fonte q-fonte-dica"><p>Selecione o fornecedor do <b>Simples</b> para ver a conferência do crédito dele: base legal, conta do DAS e quanto pesa no mapa.</p></div>':'';
 const o=quoteState,das=v.regime==='das',m26=quoteModel(v,c,2026),bens=c.kind==='goods'?'bens':'serviços',sens=qSemCreditoPC(v);
 const li=(tipo,rot,t,corpo)=>`<li><span class="badge ${tipo}">${rot}</span><div><b>${t}</b><p>${corpo}</p></div></li>`;
 const a=(k,t)=>`<a href="${Q_LINKS[k]}" target="_blank" rel="noopener">${t} ↗</a>`;
 const itens=[li('green','Existe','PIS e Cofins · até 2026',`O adquirente no regime não cumulativo pode descontar crédito sobre a compra de ${bens} de optante pelo Simples Nacional (Ato Declaratório Interpretativo RFB nº 15/2007, citado no ${a('perguntao','Perguntão do Simples, item 7.5, nota 2')}). O crédito usa as alíquotas do adquirente sobre o valor da aquisição, não o que o fornecedor pagou no DAS: ${money(m26.pcBase)} × 9,25% = <b>${money(round(m26.pis+m26.cof))}</b> (PIS ${money(m26.pis)} + Cofins ${money(m26.cof)}). Vale se a compra gerar direito a crédito (insumo ou revenda) e a TEN estiver no regime não cumulativo, premissa deste caso. PIS e Cofins são extintos a partir de 2027.`)];
 if(das&&c.kind==='goods'){
  const ay=Math.max(2027,o.year),d26=qDasCredito(v,c,2026,m26.raw),dy=qDasCredito(v,c,ay,m26.raw);
  itens.push(li('yellow','Existe, calculado','ICMS · pela parte do DAS',`A LC 123, art. 23, dá ao comprador não optante o crédito de ICMS no montante cobrado dentro do Simples, para mercadorias destinadas a comercialização ou industrialização, observado o ICMS efetivamente devido pelo optante; o fornecedor precisa informar na nota a alíquota do crédito, que é a parte de ICMS do anexo e da faixa dele (${a('perguntao','Perguntão, item 7.5')}; a redação nova do art. 23, de 2027 em diante, foi lida só em resumos de terceiros). Em 2026: alíquota efetiva de ${num(d26.ef,2)}% × ${num(d26.icmsPc,2)}% de ICMS na partilha = <b>${money(d26.icms)}</b>. Na transição o ICMS sai do DAS e o IBS entra no lugar: em ${ay} a parte de ICMS é ${num(dy.icmsPc,2)}% (<b>${money(dy.icms)}</b>) e a de IBS é ${num(dy.pi,2)}% (<b>${money(dy.ibs)}</b>); a soma dos dois créditos fica quase estável até 2033, quando só resta o IBS. O crédito só vale se a nota informar a alíquota (premissa “fiscal confirmada” do fornecedor).`));
 }else if(das)itens.push(li('red','Não gera crédito','ISS','O ISS que o prestador do Simples paga no DAS não gera crédito ao comprador: o art. 23 da LC 123 só prevê ICMS, IBS e CBS.'));
 if(das){
  const ay=Math.max(2027,o.year),d=qDasCredito(v,c,ay,m26.raw),tab=a(d.anexo==='III'?'anexoIII':'anexoI',`tabela do ${d.nome}`);
  itens.push(li('yellow','Existe, calculado','CBS e IBS · de 2027 em diante',`Quando o fornecedor recolhe IBS e CBS dentro do DAS, o adquirente no regime regular só credita o valor desses tributos pago na aquisição, em montante equivalente ao devido por meio do Simples (${a('lc214','LC 214/2025, art. 47, § 9º, II')}), e não a alíquota cheia sobre o preço. Por isso o crédito é <b>calculado</b>, não digitado: receita de 12 meses → faixa → alíquota efetiva → parte de CBS e de IBS na partilha do ano (${tab}, texto compilado do Senado). Em ${ay}, com receita de ${money(d.rbt)} (faixa ${d.faixa}), a alíquota efetiva é ${num(d.ef,2)}%, dos quais ${num(d.pc,2)}% são CBS e ${num(d.pi,2)}% são IBS: crédito de <b>${money(d.cbs)}</b> de CBS e <b>${money(d.ibs)}</b> de IBS (${qPct((d.cbs+d.ibs)/m26.raw*100)} do valor). O IBS cresce até 2033, quando substitui ICMS e ISS. Receita e anexo são hipóteses do exemplo: troque pelos do fornecedor real. A Resolução CGSN 190/2026 não foi lida.${d.aviso5?' Atenção: nesta faixa a fórmula especial do ISS não é aplicada.':''}`));
 }else itens.push(li('green','Existe','CBS e IBS · de 2027 em diante',`O fornecedor apura IBS e CBS pelo regime regular (${a('lc214','LC 214/2025, art. 41, § 3º')}): o crédito segue as regras gerais, pelos valores destacados no documento, desde que o débito seja extinto (art. 47, caput e § 3º).`));
 if(das&&sens){const med=o.pv?'valor presente':'custo após créditos';
  itens.push(li(sens.decide?'yellow':'green',sens.decide?'Decide o mapa':'Não muda a indicação','Quanto pesa no mapa de hoje',`Sem o crédito de PIS/Cofins, o ${med} de ${esc(v.name)} passaria de ${money(sens.me.score)} para <b>${money(sens.sem)}</b>${sens.decide?` e ${esc(sens.rest.x.name)} (${money(sens.rest.m.score)}) ficaria com o menor custo: a indicação de hoje depende de a TEN poder aproveitar esse crédito.`:sens.rest?'; a indicação de hoje continua a mesma.':'.'}`));}
 return `<div class="q-fonte"><h3>O crédito do fornecedor do Simples existe? · ${esc(v.name)}</h3><ul>${itens.join('')}</ul><p class="src">Leitura didática do texto legal, sem parecer fiscal. Confirme a redação vigente e a elegibilidade de cada compra com o Fiscal.</p></div>`;
}
function qMemoria(){
 if(!quoteState.vendors)return '';
 const c=qCase(),o=quoteState,y=o.year,v=o.vendors.find(x=>x.id===o.focus)||o.vendors[0];
 return `<section class="q-mem" id="qMem">${section('Memória de cálculo',`Escolha o fornecedor e veja, passo a passo, como cada valor do mapa foi calculado, hoje e em ${y}. Os números vêm do mesmo cálculo do mapa.`)}<div class="q-mem-tabs" role="group" aria-label="Fornecedor da memória de cálculo">${o.vendors.map(x=>`<button type="button" data-q-mem="${x.id}" class="${x.id===v.id?'active':''}" aria-pressed="${x.id===v.id}">${esc(x.name)}<small>${qRegime(x)}</small></button>`).join('')}</div>${qFonteSimples(v,c)}<div class="quote-maps q-mem-grid">${qMemPane(v,c,2026)}${qMemPane(v,c,y)}</div><p class="source">Memória de cálculo didática, com premissas fictícias. Ela mostra a conta; a validação fiscal vem antes de qualquer decisão real.</p></section>`;
}
