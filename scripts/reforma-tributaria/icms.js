/* ===================== SISTEN: ICMS do fornecedor regular, calculado pelas UFs =====================
   A alíquota de ICMS deixou de ser digitada na proposta ("ICMS original hipotético"): sai da UF de origem do
   fornecedor e da UF de destino da compra (parte final de `destination`, ex.: "Jacobina / BA").
     • mesma UF → alíquota interna geral do estado (ICMS_INTERNA);
     • UFs diferentes → alíquota interestadual da Resolução do Senado 22/1989: 7% de Sul/Sudeste (exceto ES) para
       Norte, Nordeste, Centro-Oeste e ES; 12% nos demais fluxos. (Os 4% de importados não são tratados.)
   Não calcula benefício fiscal, diferimento, substituição tributária nem DIFAL: isso é decisão do caso (`benefit`).
   ISS não tem regra nacional (lei de cada município, entre 2% e 5%): continua sendo hipótese informada, agora
   com limite no editor. */
const ICMS_INTERNA={BA:20.5,SP:18,MG:18,ES:17}; /* alíquota interna geral; cadastrar o estado antes de usá-lo como destino */
const ICMS_SUL_SUDESTE=['SP','RJ','MG','PR','SC','RS'];
const qUfDestino=c=>(String(c.destination||'').match(/\/\s*([A-Z]{2})\s*$/)||[])[1]||'BA';
function qIcmsUF(v,c){
 const o=v.uf,d=qUfDestino(c);
 if(o===d){
  const t=ICMS_INTERNA[d],est=t===undefined;
  return{taxa:est?18:t,origem:o,destino:d,tipo:'interna',est,
   texto:est?`${o} → ${d}: operação interna; a alíquota interna de ${d} não está cadastrada, usados 18% como estimativa`:`${o} → ${d}: operação interna, alíquota geral de ${d} (${num(t,2)}%)`};
 }
 const ss=ICMS_SUL_SUDESTE.includes(o)&&!ICMS_SUL_SUDESTE.includes(d);
 return{taxa:ss?7:12,origem:o,destino:d,tipo:'interestadual',est:false,
  texto:`${o} → ${d}: interestadual de ${ss?7:12}% (Resolução do Senado 22/1989: ${ss?'de Sul/Sudeste, exceto ES, para Norte, Nordeste, Centro-Oeste e ES':'demais fluxos'})`};
}
const qIcmsV=(v,c)=>qIcmsUF(v,c).taxa;
/* Campo do editor que no lugar do número digitado mostra a alíquota calculada (bens) ou pede o ISS municipal (serviços). */
function qEditorImposto(v){
 const c=qCase();
 if(v.regime!=='regular')return '';
 if(c.kind==='goods'){const i=qIcmsUF(v,c);return `<div class="field">ICMS calculado pelas UFs<div class="q-calc"><b>${num(i.taxa,2)}%</b><small>${i.texto}</small></div></div>`}
 return qField('iss','ISS: alíquota municipal (2% a 5%)',v.iss,'number','0.1');
}
