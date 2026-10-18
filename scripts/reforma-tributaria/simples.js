/* ===================== SISTEN: crédito de CBS/IBS do fornecedor do Simples, calculado =====================
   O crédito não é mais digitado na proposta: sai da conta do DAS do fornecedor.
     receita bruta dos últimos 12 meses (RBT12) → faixa do anexo → alíquota efetiva → parte de ICMS, CBS e IBS na partilha do ano.
   Limite legal do crédito do comprador: LC 123, art. 23 (ICMS; a redação nova, a partir de 2027, inclui IBS e CBS) e LC 214/2025,
   art. 47, § 9º, II ("montante equivalente ao devido por meio desse regime"). A transição é a progressão do próprio DAS:
   a parte de ICMS cai de 33,5% (até 2028) para 30,15% (2029) ... e some em 2033, enquanto a de IBS sobe de 0,17% para 33,5%.
   Tabelas: LC 123/2006, anexos com a partilha de CBS e IBS de 2027 a 2033 (texto compilado do Senado, que não substitui o DOU):
   Anexo I (comércio) e Anexo III (serviços). Receita e anexo de cada fornecedor são hipóteses dos exemplos, editáveis. */
const SN={
 I:{nome:'Anexo I · comércio',lim:[180000,360000,720000,1800000,3600000,4800000],
  nom:[4,7.3,9.5,10.7,14.3,[18.9,19]],ded:[0,5940,13860,22500,87300,378000],
  cbs:[[15.33,15.33,15.33,15.33,15.33,34.02],[15.5,15.5,15.5,15.5,15.5,34.4]],
  ibs:{2027:[.17,.17,.17,.17,.17,0],2028:[.17,.17,.17,.17,.17,0],2029:[3.4,3.4,3.35,3.35,3.35,0],2030:[6.8,6.8,6.7,6.7,6.7,0],2031:[10.2,10.2,10.05,10.05,10.05,0],2032:[13.6,13.6,13.4,13.4,13.4,0],2033:[34,34,33.5,33.5,33.5,0]},
  /* Parte de ICMS no DAS (2026 usa a mesma tabela de 2027–2028, igual à lei atual). Em 2033 o IBS ocupa o lugar. */
  icms:{2027:[34,34,33.5,33.5,33.5,0],2028:[34,34,33.5,33.5,33.5,0],2029:[30.6,30.6,30.15,30.15,30.15,0],2030:[27.2,27.2,26.8,26.8,26.8,0],2031:[23.8,23.8,23.45,23.45,23.45,0],2032:[20.4,20.4,20.1,20.1,20.1,0],2033:[0,0,0,0,0,0]}},
 III:{nome:'Anexo III · serviços',lim:[180000,360000,720000,1800000,3600000,4800000],
  nom:[6,11.2,13.5,16,21,[32.9,33]],ded:[0,9360,17640,35640,125640,648000],
  cbs:[[15.43,16.91,16.42,16.42,15.43,19.29],[15.6,17.1,16.6,16.6,15.6,19.5]],
  ibs:{2027:[.17,.19,.19,.19,.17,0],2028:[.17,.19,.19,.19,.17,0],2029:[3.35,3.2,3.25,3.25,3.35,0],2030:[6.7,6.4,6.5,6.5,6.7,0],2031:[10.05,9.6,9.75,9.75,10.05,0],2032:[13.4,12.8,13,13,13.4,0],2033:[33.5,32,32.5,32.5,33.5,0]}}
};
/* Se o fornecedor real não for do exemplo, vale este padrão por tipo de compra. */
const SN_PADRAO={goods:{anexo:'I',rbt12:1500000},service:{anexo:'III',rbt12:600000}};
function qDasParam(v,c){
 const p=SN_PADRAO[c.kind]||SN_PADRAO.goods,r=Number(v.rbt12);
 return{anexo:SN[v.anexo]?v.anexo:p.anexo,rbt:r>0?r:p.rbt12};
}
/* Alíquota efetiva e parte de CBS/IBS do DAS do fornecedor no ano y, e o crédito sobre o valor da compra. */
function qDasCredito(v,c,y,valor){
 const{anexo,rbt}=qDasParam(v,c),A=SN[anexo];
 let f=A.lim.findIndex(l=>rbt<=l);const fora=f<0;if(fora)f=5;
 const ano=Math.min(Math.max(y,2027),2033),n=A.nom[f],nom=Array.isArray(n)?(ano<=2028?n[0]:n[1]):n;
 const ef=(rbt*nom/100-A.ded[f])/rbt*100,pc=A.cbs[ano<=2028?0:1][f],pi=A.ibs[ano][f],efCbs=ef*pc/100,efIbs=ef*pi/100,ativo=y>2026,
  ii=A.icms?A.icms[ano][f]:0,efIcms=ef*ii/100,comIcms=c.kind==='goods'&&!!A.icms;
 return{anexo,nome:A.nome,rbt,faixa:f+1,teto:A.lim[f],nom,ded:A.ded[f],ef,pc,pi,efCbs,efIbs,fora,ano,icmsPc:ii,efIcms,comIcms,
  periodo:y<2027?'2026 (lei atual, igual à tabela de 2027–2028)':ano<=2028?'2027–2028':ano===2033?'2033 em diante':String(ano),
  aviso5:anexo==='III'&&f===4&&ef>14.92537,
  cbs:ativo?round(valor*efCbs/100):0,ibs:ativo?round(valor*efIbs/100):0,icms:comIcms?round(valor*efIcms/100):0};
}
const qDasIcms=(v,c,y,valor)=>qDasCredito(v,c,y,valor).icms;
const qDasTotal=(v,c,y,valor)=>{const d=qDasCredito(v,c,y,valor);return d.cbs+d.ibs};
/* Memória em texto para a dica da célula do mapa. */
function qDasMemo(v,c,y,qual){
 const raw=round(c.qty*v.unit+v.freight-v.discount),d=qDasCredito(v,c,y,raw),nome={cbs:'CBS',ibs:'IBS',icms:'ICMS'}[qual],p={cbs:d.pc,ibs:d.pi,icms:d.icmsPc}[qual],e={cbs:d.efCbs,ibs:d.efIbs,icms:d.efIcms}[qual],val={cbs:d.cbs,ibs:d.ibs,icms:d.icms}[qual];
 return `Receita de 12 meses ${money(d.rbt)} → faixa ${d.faixa} do ${d.nome}: alíquota efetiva (${money(d.rbt)} × ${num(d.nom,2)}% − ${money(d.ded)}) ÷ ${money(d.rbt)} = ${num(d.ef,2)}%.\nParte de ${nome} na partilha de ${d.periodo}: ${num(p,2)}% da alíquota efetiva = ${num(e,4)}% da receita.\nCrédito = ${money(raw)} × ${num(e,4)}% = ${money(val)} (limite do DAS: ${qual==='icms'?'LC 123, art. 23':'LC 214, art. 47, § 9º, II'})${d.fora?'\nAtenção: receita acima de R$ 4,8 milhões, fora do Simples.':''}`;
}
/* Campos do fornecedor do Simples no editor da proposta. */
function qEditorDas(v){
 const p=qDasParam(v,qCase());
 return `<label class="field">Anexo do Simples (DAS)<select data-q-key="anexo">${Object.entries(SN).map(([k,a])=>`<option value="${k}" ${k===p.anexo?'selected':''}>${a.nome}</option>`).join('')}</select></label>${qField('rbt12','Receita bruta dos últimos 12 meses do fornecedor (R$)',p.rbt,'number','1000')}`;
}
/* Questão "crédito integral prometido": os números vêm do cálculo, não de texto fixo. */
function qErroDas(){
 const c=QUOTE_CASES.find(x=>x.id==='insumos'),v=c.vendors.find(x=>x.id==='c'),y=Math.max(2027,quoteState.year),raw=round(c.qty*v.unit+v.freight-v.discount),d=qDasCredito(v,c,y,raw),lim=round(d.cbs+d.ibs),cheio=round(raw*.265);
 return{c,v,y,raw,d,lim,cheio,sup:round(cheio-lim)};
}
const qErroDasOferta=()=>{const e=qErroDas();return `Proposta fictícia: lote por ${money(e.raw)}, fornecedor mantém IBS/CBS no DAS e promete crédito de ${money(e.cheio)} (26,5%). Pelo DAS dele (${e.d.nome}, receita de 12 meses de ${money(e.d.rbt)}, faixa ${e.d.faixa}), a CBS devida em ${e.y} é de ${money(e.d.cbs)} e o IBS de ${money(e.d.ibs)}.`};
const qErroDasExplica=()=>{const e=qErroDas();return `O comprador regular não recebe crédito integral automaticamente pelo seu próprio regime. Em ${e.y}, o limite calculado pelo DAS é ${money(e.lim)} (alíquota efetiva de ${num(e.d.ef,2)}%, com ${num(e.d.pc,2)}% de CBS e ${num(e.d.pi,2)}% de IBS dela); ${money(e.cheio)} superestima o crédito em ${money(e.sup)}. Receita e anexo são hipóteses do exemplo; a partilha vem da LC 123.`};
