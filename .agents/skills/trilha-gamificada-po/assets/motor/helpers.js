/* ================= Helpers de vinheta ================= */
const ic=(id,cls='i',st='')=>`<svg class="${cls}"${st?` style="${st}"`:''}><use href="#${id}"/></svg>`;
const ch=a=>a.map((f,i)=>`<span class="chip ${f[1]||''}" style="--d:${i}">${f[0]}</span>`).join('');
const pad=n=>String(n).padStart(2,'0');
function vf(icon,big,facts=[],tone='',req){
  const head=icon.length===1?icon:ic(icon);
  return `<div class="vf"><div class="vf-ico ${tone}">${head}</div><div class="vf-big">${big}</div>${facts.length?`<div class="vf-facts">${ch(facts)}</div>`:''}${req?`<div class="vf-facts req">${ch(req)}</div>`:''}</div>`;
}
const vForm=(title,code,line)=>`<div class="paper form"><h5>${title} <span>${code}</span></h5>
<div class="fl">Material<i class="f" style="--d:0;width:100%"></i></div><div class="fl">Qtd<i class="f" style="--d:1;width:40%"></i></div>
<div class="fl">Centro<i class="f" style="--d:2;width:55%"></i></div><div class="fl">Data nec.<i class="f" style="--d:3;width:70%"></i></div>
<div class="fl">Justificativa<i class="f" style="--d:4;width:85%"></i></div><div style="margin-top:8px;font-weight:700">${line} <span class="caret"></span></div></div>`;
const vAppr=(doc,code,stamp,who,whoIc='i2',bad)=>`<div class="appr"><div class="who"><i>${ic(whoIc)}</i>${who}</div>
<div class="paper"><h5>${doc} <span>${code}</span></h5><div class="fl">Material<i style="width:100%"></i></div><div class="fl">Qtd<i style="width:40%"></i></div><div class="fl">Centro<i style="width:55%"></i></div></div>
<div class="stamp ${bad?'bad':''}">${stamp}</div></div>`;
const vProps=(list)=>`<div class="props">${list.map((p,i)=>`<div class="paper prop ${p[3]?'late':''}" style="--r:${(i-(list.length-1)/2)*6}deg;--d:${i}"><small>${p[0]}</small><b>${p[1]}</b><small>${p[2]}</small>${p[3]?`<br><span class="ltag">${p[3]}</span>`:''}</div>`).join('')}</div>`;
const vQQP=()=>`<div class="paper qqp"><h5>QQP · mesma base <span>custo total</span></h5>
<div class="bar" style="--d:0"><b>A</b><i style="width:82%"></i><span>R$ 8.760</span></div>
<div class="bar win" style="--d:1"><b>B</b><i style="width:52%"></i><span>R$ 8.300</span></div>
<div class="bar" style="--d:2"><b>C</b><i style="width:100%"></i><span>R$ 9.040</span></div><span class="wtag">✓ Vencedor: B</span></div>`;
const vPC=()=>`<div class="pcwrap"><div class="paper pc"><h5>PC 4500012345 <span>ME21N</span></h5><div style="font-family:var(--f-display);font-size:24px;font-weight:700">R$ 8.300</div><svg class="sig" viewBox="0 0 190 34"><path d="M6 24c10-16 18-18 20-8s-6 14 2 8 14-20 18-12-4 14 6 10 10-14 18-10 2 10 12 6 16-8 30-6 30 2 46 0"/></svg></div>
<div><div class="ladder">${[1,2,3,4,5,6,7].map(n=>`<div class="rung ${n<=2?'go':''}" style="--d:${n-1}">N${n}</div>`).join('')}</div><div class="lnote">≤ R$ 10 mil</div></div></div>`;
const vSend=(ok)=>`<div class="send"><div class="paper pcm"><h5 style="font-size:13px">PC</h5><div class="fl" style="grid-template-columns:1fr"><i style="width:100%"></i></div><div class="fl" style="grid-template-columns:1fr"><i style="width:60%"></i></div></div>
<div class="path"></div><div class="plane">${ic('i6','i','width:32px;height:32px')}</div><div class="bld">${ic('ifac')}<span class="okb">✓ ${ok}</span></div></div>`;
const vRoad=(m)=>`<div class="road">${m.map((t,i)=>`<div class="mile" style="left:${18+i*32}%;--d:${i}"><i></i>${t}</div>`).join('')}<div class="ln"></div><div class="truck">${ic('i7')}</div></div>`;
const vWH=(t)=>`<div class="wh"><div class="box"></div><div class="house"><svg class="i" viewBox="0 0 24 18"><path d="M1 7 12 1l11 6v10H1z"/><path d="M7 17v-6h10v6"/></svg></div><span class="okb">✓ ${t}</span></div>`;
const vStop=()=>`<div class="belt"><div class="secs"><i></i><i></i><i class="gap"></i><i></i><i></i><i></i></div><div class="rail"></div><span class="okb bad">⚠ Linha parada: falta material</span></div>`;
const vPillars=()=>`<div class="pillars">${[['Conformidade',150],['Rastreabilidade',170],['Eficiência',130]].map((p,i)=>`<div class="pil" style="--d:${i}"><i style="height:${p[1]}px"></i>${p[0]}</div>`).join('')}</div>`;
const vScope=()=>`<div class="scope"><div class="ends"><span class="chip t">RM · ME51N</span><span class="chip o">PC encerrado</span></div><div class="line"></div>
<div class="ppl">${[['iusers','Requisitante'],['i2','Gestor'],['icoin','Comprador'],['iladder','Aprovadores'],['i8','Almoxarifado']].map((p,i)=>`<span style="--d:${i}"><i>${ic(p[0])}</i>${p[1]}</span>`).join('')}</div></div>`;
const vNoPC=()=>`<div class="nopc"><div class="trk">${ic('i7')}</div><div class="ghost">PC?</div><div class="stamp bad">PROIBIDO</div><span class="okb">Exceção: Carta de Intenção prévia</span></div>`;
const vSap=()=>`<div class="sap"><div class="docs"><div class="paper" style="--d:0">PC</div><div class="paper" style="--d:1">Contrato</div></div>${ic('ir','i','transform:rotate(90deg);color:var(--stage-mut)')}<div class="sbox">SAP</div></div>`;
const vRace=()=>`<div class="race"><div class="lane p"><span>Padrão</span><div class="tr"><i>15 dias úteis</i></div></div><div class="lane u"><span>Urgente</span><div class="tr"><i>2,5 dias</i></div></div></div>`;
const vOne=()=>`<div class="one"><div class="paper prop" style="--r:0deg;--d:0"><small>Fornecedor X</small><b>R$ 3.480</b><small>entrega amanhã</small></div><span class="okb">✓ 1 proposta válida</span></div>`;
const vLate=()=>`<div class="lateset">${vProps([['Fornecedor A','R$ 8.760','no prazo'],['Fornecedor B','R$ 8.300','no prazo'],['Fornecedor C','R$ 9.040','2 dias depois','atrasada']])}</div>`;
const vLaudo=()=>`<div class="laudo"><div class="paper"><h5>Vencedor <span>QQP</span></h5><b style="font-family:var(--f-display);font-size:22px">Fornecedor C</b><br><small style="color:var(--paper-mut);font-weight:600">não é o menor custo</small></div>${ic('ir','i','color:var(--stage-mut)')}<div class="paper att"><h5>Laudo técnico <span>PC</span></h5><div class="fl" style="grid-template-columns:1fr"><i class="f" style="--d:0;width:100%"></i></div><div class="fl" style="grid-template-columns:1fr"><i class="f" style="--d:1;width:70%"></i></div><div style="margin-top:8px;font-weight:700;color:var(--paper-teal)">✓ Justificado</div></div></div>`;
const LADDER=[['N1','Coordenador de Suprimentos'],['N2','Ger. Suprimentos e Planejamento'],['N3','Gerente Financeiro'],['N4','Diretor Geral'],['N5','Conselho AG · D2 ou D3'],['N6','Conselho AG · D4/D5/D6'],['N7','Presidente da Unidade']];
const vLadder=(n)=>`<div class="ladder wide">${LADDER.map((r,i)=>`<div class="rung ${i<n?'go':''} ${i===n-1?'top':''}" style="--d:${i}">${r[0]}<em>${r[1]}</em></div>`).join('')}</div>`;
const vIcons=(l)=>`<div class="icons">${l.map((x,i)=>`<div class="icn" style="--d:${i}">${ic(x[0])}${x[1]}</div>`).join('')}</div>`;
const WEIGHTS=[['Custo',10],['Entrega',20],['Atendimento',20],['Qualidade',10],['Meio ambiente',10],['Saúde e Segurança',10],['Resp. social',10],['Conduta ética',10]];
const WCOL=['var(--s-blue)','var(--s-orange)','var(--s-orange)','var(--s-teal)','var(--s-blue)','var(--s-teal)','var(--s-blue)','var(--s-teal)'];
function vWeights(){
  const R=70,C=2*Math.PI*R;let a=-90,s='';
  WEIGHTS.forEach((w,i)=>{const len=C*w[1]/100-3;s+=`<circle class="arc" cx="100" cy="100" r="${R}" stroke="${WCOL[i]}" stroke-dasharray="${len} ${C}" style="--len:${len};--d:${i}" transform="rotate(${a} 100 100)"/>`;a+=3.6*w[1]});
  return `<div class="wts"><svg viewBox="0 0 200 200" aria-label="Pesos dos 8 critérios">${s}<text x="100" y="108" text-anchor="middle" style="font-family:var(--f-display);font-weight:700;font-size:34px;fill:var(--stage-ink)">100%</text></svg>
  <div class="wlist">${WEIGHTS.map((w,i)=>`<span style="--d:${i}"><em style="font-style:normal"><i style="background:${WCOL[i]}"></i>${w[0]}</em><b>${w[1]}%</b></span>`).join('')}</div></div>`;
}
function heroDonut(){
  const R=78,C=2*Math.PI*R,parts=[[2,'var(--s-teal)','Aprovação'],[8,'var(--s-blue)','Cotação + QQP'],[3,'var(--s-orange)','PC'],[2,'var(--s-teal)','Envio']];
  let a=-90,s=`<svg viewBox="-40 -10 280 220" aria-label="15 dias úteis: 2 aprovação, 8 cotação e QQP, 3 PC, 2 envio">`;
  parts.forEach((p,i)=>{const len=C*p[0]/15-4;
    s+=`<circle class="arc" cx="100" cy="100" r="${R}" stroke="${p[1]}" stroke-dasharray="${len} ${C}" style="--len:${len};--d:${i}" transform="rotate(${a} 100 100)"/>`;
    const mid=(a+360*p[0]/15/2)*Math.PI/180,lx=100+(R+38)*Math.cos(mid),ly=100+(R+38)*Math.sin(mid);
    s+=`<text class="dl" x="${lx}" y="${ly+5}" text-anchor="${Math.cos(mid)>0.2?'start':Math.cos(mid)<-0.2?'end':'middle'}"><tspan class="n">${p[0]}</tspan> ${p[2]}</text>`;a+=360*p[0]/15});
  return `<div class="donut">${s}</svg><div class="center"><b>15</b><small>dias úteis</small></div></div>`;
}

/* ================= Widgets interativos ================= */
const fmtR=v=>v>=1e6?'R$ '+(v/1e6).toFixed(v<1e7?1:0).replace('.',',').replace(',0','')+' mi':'R$ '+(v>=1e4?Math.round(v/1000):(v/1000).toFixed(1).replace('.',',').replace(',0',''))+' mil';
const W={
  cot(el){
    el.innerHTML=`<div class="wg"><div class="wg-top"><label for="cotV">Valor do pedido</label><b id="cotOut"></b></div>
    <input type="range" id="cotV" min="500" max="20000" step="100" value="4000" aria-label="Valor do pedido">
    <label class="tg"><input type="checkbox" id="cotU"> Urgente / line-down</label>
    <div class="slots3">${[0,1,2].map(()=>`<span>${ic('i1')}</span>`).join('')}</div><div class="wg-res" id="cotRes"></div></div>`;
    const v=el.querySelector('#cotV'),u=el.querySelector('#cotU');
    const up=()=>{const x=+v.value,n=u.checked?1:x<=2500?1:x<=5000?2:3;
      el.querySelector('#cotOut').textContent='R$ '+x.toLocaleString('pt-BR');
      el.querySelectorAll('.slots3 span').forEach((s,i)=>s.classList.toggle('on',i<n));
      el.querySelector('#cotRes').innerHTML=`Mínimo: <em>${n} cotaç${n>1?'ões':'ão'}</em>`};
    v.oninput=up;u.onchange=up;up();
  },
  alc(el){
    el.innerHTML=`<div class="wg"><div class="wg-top"><label for="alcV">Valor do PC</label><b id="alcOut"></b></div>
    <input type="range" id="alcV" min="0" max="1000" step="1" value="450" aria-label="Valor do PC">
    <div class="alc"><div class="wg-res" id="alcRes" style="text-align:left"></div><div class="ladder wide" id="alcL">${LADDER.map(r=>`<div class="rung">${r[0]}<em>${r[1]}</em></div>`).join('')}</div></div></div>`;
    const v=el.querySelector('#alcV');
    const up=()=>{let x=Math.pow(10,3+4*v.value/1000);const p=Math.pow(10,Math.floor(Math.log10(x))-1);x=Math.round(x/p)*p;
      const n=x<=1e4?2:x<=6e4?3:x<=3e6?4:x<=5e6?5:x<=6e6?6:7;
      el.querySelector('#alcOut').textContent=fmtR(x);
      el.querySelectorAll('#alcL .rung').forEach((r,i)=>{r.classList.toggle('go',i<n);r.classList.toggle('top',i===n-1)});
      el.querySelector('#alcRes').innerHTML=`Sobe até <em>N${n}</em><br><span style="font-size:17px;color:var(--stage-mut)">${LADDER[n-1][1]}</span>`};
    v.oninput=up;up();
  },
  aval(el){
    const def=[90,70,80,100,100,100,100,100];
    el.innerHTML=`<div class="aval"><div class="crit">${WEIGHTS.map((w,i)=>`<label for="cr${i}">${w[0]}<small id="crv${i}">${def[i]}%</small><input type="range" id="cr${i}" min="0" max="100" step="5" value="${def[i]}"></label>`).join('')}</div>
    <div class="score"><b id="avS">0</b><span class="verdict" id="avV"></span><small id="avC"></small></div></div>`;
    const up=()=>{let s=0;WEIGHTS.forEach((w,i)=>{const v=+el.querySelector('#cr'+i).value;el.querySelector('#crv'+i).textContent=v+'%';s+=w[1]*v/100});
      s=Math.round(s);el.querySelector('#avS').textContent=s+'%';
      const V=s>=80?['p','Positivo','Continua fornecendo']:s>=60?['r','Regular','Continua, com justificativa']:['n','Negativo','Plano de ação + NC em 3 meses'];
      const e=el.querySelector('#avV');e.className='verdict '+V[0];e.textContent=V[1];el.querySelector('#avC').textContent=V[2]};
    el.querySelectorAll('input').forEach(i=>i.oninput=up);up();
  }
};


/* ================= Vinhetas extras (contratos e serviços) ================= */
const vLanes=(l)=>`<div class="race">${l.map((x,i)=>`<div class="lane"><span>${x[0]}</span><div class="tr"><i style="width:${x[2]}%;min-width:86px;background:${x[3]};color:${x[4]||'#0A1A33'};animation:grow ${x[5]||1.2}s .3s linear both">${x[1]}</i></div></div>`).join('')}</div>`;
const vChecklist=(title,items,miss,okT,badT)=>`<div class="chkl paper"><h5>${title} <span>${miss<0?'completo':'pendente'}</span></h5><ul>${items.map((t,i)=>`<li class="${i===miss?'no':''}" style="--d:${i}"><i>${i===miss?'✕':'✓'}</i>${t}</li>`).join('')}</ul><span class="okb ${miss<0?'':'bad'}">${miss<0?okT:badT}</span></div>`;
const vFolder=(path,items)=>`<div class="fold"><div class="fold-ic">${ic('ifold')}</div><code class="mono">${path}</code><div class="vf-facts">${ch(items.map(t=>[t,'']))}</div></div>`;
const vSign=(doc,who)=>`<div class="sign"><div class="paper"><h5>${doc} <span>DocuSign</span></h5><div class="fl" style="grid-template-columns:1fr"><i class="f" style="--d:0;width:100%"></i></div><div class="fl" style="grid-template-columns:1fr"><i class="f" style="--d:1;width:80%"></i></div><div class="fl" style="grid-template-columns:1fr"><i class="f" style="--d:2;width:90%"></i></div><svg class="sig" viewBox="0 0 190 34"><path d="M6 24c10-16 18-18 20-8s-6 14 2 8 14-20 18-12-4 14 6 10 10-14 18-10 2 10 12 6 16-8 30-6 30 2 46 0"/></svg></div><div class="sgn">${who.map((w,i)=>`<span class="chip t" style="--d:${i}">✓ ${w}</span>`).join('')}</div></div>`;
W.contrato=function(el){
  el.innerHTML=`<div class="wg"><div class="wg-top"><label for="ctV">Valor do serviço</label><b id="ctVo"></b></div><input type="range" id="ctV" min="5000" max="200000" step="1000" value="45000" aria-label="Valor do serviço">
  <div class="wg-top"><label for="ctD">Duração</label><b id="ctDo"></b></div><input type="range" id="ctD" min="5" max="365" step="5" value="90" aria-label="Duração em dias">
  <label class="tg"><input type="checkbox" id="ctT"> Envolve terceirização de mão de obra</label><div class="ctres" id="ctR"></div></div>`;
  const v=el.querySelector('#ctV'),d=el.querySelector('#ctD'),t=el.querySelector('#ctT');
  const up=()=>{const x=+v.value,y=+d.value,need=x>30000&&y>30,pct=x>50000?10:5;
    el.querySelector('#ctVo').textContent='R$ '+x.toLocaleString('pt-BR');el.querySelector('#ctDo').textContent=y+' dias';
    el.querySelector('#ctR').innerHTML=need?`<span class="verdict p">Precisa de contrato</span><span class="chip o">Multa de ${pct}% · R$ ${(x*pct/100).toLocaleString('pt-BR')}</span>${t.checked?'<span class="chip t">Cláusula de garantia</span>':''}`
      :`<span class="verdict r">Basta o PC</span><span class="chip">Contrato só acima de R$ 30 mil e 30 dias</span>`};
  v.oninput=up;d.oninput=up;t.onchange=up;up();
};
W.aval5=function(el){
  const C=['Custo','QMSS','Prazo de entrega','Atendimento','Conduta ética'],st=[1,1,1,0,1];
  el.innerHTML=`<div class="aval"><div class="tgls">${C.map((c,i)=>`<button type="button" class="tgl" id="av5${i}" aria-pressed="${!!st[i]}"><i></i>${c}</button>`).join('')}</div><div class="score"><b id="a5S"></b><span class="verdict" id="a5V"></span><small id="a5C"></small></div></div>`;
  const up=()=>{const n=st.reduce((a,b)=>a+b,0),p=n*20;el.querySelector('#a5S').textContent=p+'%';
    const V=p>=80?['p','Positivo','Continua sem justificativa']:p>=60?['r','Regular','Continua com justificativa']:['n','Negativo','Plano de ação ou desqualificação'];
    const e=el.querySelector('#a5V');e.className='verdict '+V[0];e.textContent=V[1];el.querySelector('#a5C').textContent=V[2]};
  C.forEach((_,i)=>{const b=el.querySelector('#av5'+i);b.onclick=()=>{st[i]=st[i]?0:1;b.setAttribute('aria-pressed',!!st[i]);up()}});up();
};
W.ressup=function(el){
  el.innerHTML=`<div class="wg">
    <div class="wg-top"><label for="rsEst">Estoque Físico Atual</label><b id="rsEstO">120 un</b></div>
    <input type="range" id="rsEst" min="0" max="600" step="10" value="120" aria-label="Estoque Atual">
    <div class="wg-top"><label for="rsPto">Ponto de Ressuprimento (Gatilho)</label><b id="rsPtoO">200 un</b></div>
    <input type="range" id="rsPto" min="50" max="400" step="10" value="200" aria-label="Ponto de Ressuprimento">
    <div class="wg-top"><label for="rsMin">Estoque Mínimo (Segurança)</label><b id="rsMinO">80 un</b></div>
    <input type="range" id="rsMin" min="20" max="150" step="10" value="80" aria-label="Estoque Mínimo">
    <div class="ctres" id="rsRes" style="margin-top:12px"></div>
  </div>`;
  const e=el.querySelector('#rsEst'),p=el.querySelector('#rsPto'),m=el.querySelector('#rsMin');
  const up=()=>{
    const est=+e.value,pto=+p.value,min=+m.value;
    el.querySelector('#rsEstO').textContent=est+' un';
    el.querySelector('#rsPtoO').textContent=pto+' un';
    el.querySelector('#rsMinO').textContent=min+' un';
    let status='',tag='';
    if(est<=min){
      status='<span class="verdict n">Ruptura Iminente!</span>';
      tag='<span class="chip o">Abaixo do Mínimo · Disparar RM Urgente no SAP!</span>';
    }else if(est<=pto){
      status='<span class="verdict r">Ponto de Ressuprimento</span>';
      tag='<span class="chip t">Gerar Solicitação de Compra (SAP)</span>';
    }else{
      status='<span class="verdict p">Estoque Seguro</span>';
      tag='<span class="chip">Acima do gatilho · Monitorar consumo diário</span>';
    }
    el.querySelector('#rsRes').innerHTML=status+tag;
  };
  e.oninput=up;p.oninput=up;m.oninput=up;up();
};
W.ender=function(el){
  el.innerHTML=`<div class="wg">
    <div class="wg-top"><label for="edDep">Depósito X(XX)</label><b id="edDepO">DEP01</b></div>
    <input type="range" id="edDep" min="1" max="4" step="1" value="1" aria-label="Depósito">
    <div class="wg-top"><label for="edBlk">Bloco (Coluna XX)</label><b id="edBlkO">B04</b></div>
    <input type="range" id="edBlk" min="1" max="12" step="1" value="4" aria-label="Bloco">
    <div class="wg-top"><label for="edAnd">Andar (Prateleira XX)</label><b id="edAndO">A02</b></div>
    <input type="range" id="edAnd" min="1" max="5" step="1" value="2" aria-label="Andar">
    <div class="wg-top"><label for="edApt">Apartamento (Vão XX)</label><b id="edAptO">AP03</b></div>
    <input type="range" id="edApt" min="1" max="8" step="1" value="3" aria-label="Apartamento">
    <div class="ctres" id="edRes" style="margin-top:12px"></div>
  </div>`;
  const d=el.querySelector('#edDep'),b=el.querySelector('#edBlk'),a=el.querySelector('#edAnd'),ap=el.querySelector('#edApt');
  const pad2=n=>String(n).padStart(2,'0');
  const up=()=>{
    const dep=+d.value,blk=+b.value,and=+a.value,apt=+ap.value;
    const depN=['DEP01 · Central','DEP02 · Pátio Externo','DEP03 · Químicos/Tintas','DEP04 · Peças'][dep-1];
    el.querySelector('#edDepO').textContent=depN;
    el.querySelector('#edBlkO').textContent='Coluna '+pad2(blk);
    el.querySelector('#edAndO').textContent='Andar '+pad2(and);
    el.querySelector('#edAptO').textContent='Apto '+pad2(apt);
    const cod=`DEP${pad2(dep)}.${pad2(blk)}.${pad2(and)}.${pad2(apt)}`;
    let tag='';
    if(dep===3)tag='<span class="chip o">Item Químico · Validade FRM.ALM-0023</span>';
    else if(and===1)tag='<span class="chip t">Piso · Itens pesados ou alto giro</span>';
    else tag='<span class="chip">Prateleira · Respeitar limite de carga</span>';
    el.querySelector('#edRes').innerHTML=`<span class="verdict p" style="font-family:var(--f-mono);font-size:16px">${cod}</span>${tag}`;
  };
  d.oninput=up;b.oninput=up;a.oninput=up;ap.oninput=up;up();
};

W.fefo=function(el){
  el.innerHTML=`<div class="wg">
    <div class="wg-top"><label for="ffDias">Simulação de Consumo</label><b id="ffDiasO">30 dias</b></div>
    <input type="range" id="ffDias" min="5" max="90" step="5" value="30" aria-label="Dias">
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-top:12px">
      <div class="paper" style="padding:8px;text-align:left;font-size:12px;border:1px solid var(--paper-line)">
        <b>Lote A · Primer</b><br><small>Entrada: há 40d</small><br><span class="chip" style="font-size:11px">Vence em: 80d</span>
      </div>
      <div class="paper" style="padding:8px;text-align:left;font-size:12px;border:2px solid var(--s-orange)">
        <b>Lote B · Primer</b><br><small>Entrada: há 15d</small><br><span class="chip o" style="font-size:11px">Vence em: 25d</span>
      </div>
      <div class="paper" style="padding:8px;text-align:left;font-size:12px;border:1px solid var(--paper-line)">
        <b>Lote C · Primer</b><br><small>Entrada: há 5d</small><br><span class="chip" style="font-size:11px">Vence em: 120d</span>
      </div>
    </div>
    <div class="ctres" id="ffRes" style="margin-top:12px"></div>
  </div>`;
  const d=el.querySelector('#ffDias');
  const up=()=>{
    const dias=+d.value;
    el.querySelector('#ffDiasO').textContent=dias+' dias';
    el.querySelector('#ffRes').innerHTML=`<span class="verdict o">Aplicação FEFO</span><span class="chip o">Dispensar Lote B Primeiro!</span><br><small style="color:var(--stage-mut);margin-top:4px;display:block">No FEFO (First Expired, First Out), o Lote B sai primeiro porque vence antes, evitando perda de material químico (FRM.ALM-0023).</small>`;
  };
  d.oninput=up;up();
};

W.segreg=function(el){
  el.innerHTML=`<div class="wg">
    <div class="wg-top"><label for="sgTipo">Tipo de Incidente</label><b id="sgTipoO">Dano Interno de Manuseio</b></div>
    <input type="range" id="sgTipo" min="1" max="3" step="1" value="1" aria-label="Tipo">
    <div class="ctres" id="sgRes" style="margin-top:12px"></div>
  </div>`;
  const t=el.querySelector('#sgTipo');
  const up=()=>{
    const tipo=+t.value;
    const tipos=['1. Dano Interno (Manuseio)','2. Vencimento / Contaminação','3. Propriedade de Cliente / Externo'];
    el.querySelector('#sgTipoO').textContent=tipos[tipo-1];
    if(tipo===1){
      el.querySelector('#sgRes').innerHTML=`<span class="verdict n">Item 6.3 · Dano Interno</span><span class="chip o">1. Identificar NC</span><span class="chip t">2. Documentar</span><span class="chip bad">3. Segregar no Almox</span><span class="chip">4. Devolver ou Descartar</span><span class="chip o">5. Repor Quantidade</span>`;
    }else if(tipo===2){
      el.querySelector('#sgRes').innerHTML=`<span class="verdict r">Item 6.2 · Controle de Validade</span><span class="chip o">FRM.ALM-0023</span><span class="chip bad">Segregar imediatamente</span><span class="chip t">PO.ENG-0001 Consumíveis</span>`;
    }else{
      el.querySelector('#sgRes').innerHTML=`<span class="verdict p">Item 6.4 · Propriedade de Terceiro</span><span class="chip o">FRM.SUP-0001</span><span class="chip bad">Segregar em área específica</span><span class="chip t">Remeter ao cliente externo</span><span class="chip">Reter documentação</span>`;
    }
  };
  t.oninput=up;up();
};

W.terceiros=function(el){
  el.innerHTML=`<div class="wg">
    <div class="wg-top"><label for="tcFase">Fase do Ciclo de Terceiros</label><b id="tcFaseO">1. Mobilização (Entrada)</b></div>
    <input type="range" id="tcFase" min="1" max="3" step="1" value="1" aria-label="Fase">
    <div class="ctres" id="tcRes" style="margin-top:12px"></div>
  </div>`;
  const s=el.querySelector('#tcFase');
  const up=()=>{
    const f=+s.value;
    const fases=['1. Mobilização (Entrada)','2. Operação & Manutenções','3. Desmobilização (Saída)'];
    el.querySelector('#tcFaseO').textContent=fases[f-1];
    if(f===1){
      el.querySelector('#tcRes').innerHTML=`<span class="verdict p">Entrada & Registro</span><span class="chip o">NF de Remessa</span><span class="chip t">Check List FRM</span><span class="chip">Etiqueta Rastreabilidade</span><span class="chip o">SAP MIGO · Depósito 0070</span>`;
    }else if(f===2){
      el.querySelector('#tcRes').innerHTML=`<span class="verdict o">Uso na Fábrica</span><span class="chip t">Setor Solicitante Opera</span><span class="chip o">Suprimentos: Manutenções</span><span class="chip bad">Se houver dano: Fotos + FRM.SUP-0001</span>`;
    }else{
      el.querySelector('#tcRes').innerHTML=`<span class="verdict n">Fim de Contrato</span><span class="chip o">SEMINFE Almox</span><span class="chip t">NF Remessa Retorno (Contab.)</span><span class="chip">Frete Reverso (Suprimentos)</span><span class="chip o">Arquivar Dossiê</span>`;
    }
  };
  s.oninput=up;up();
};

W.chapas=function(el){
  el.innerHTML=`<div class="wg">
    <div class="wg-top"><label for="cpCenario">Cenário de Recebimento de Chapas</label><b id="cpCenarioO">1. Projeto em Linha (Assuruá/Seridó)</b></div>
    <input type="range" id="cpCenario" min="1" max="3" step="1" value="1" aria-label="Cenário">
    <div class="ctres" id="cpRes" style="margin-top:12px"></div>
  </div>`;
  const c=el.querySelector('#cpCenario');
  const up=()=>{
    const v=+c.value;
    const cenarios=[
      '1. Projeto em Linha de Fabricação',
      '2. Projeto Fora de Linha (Futuro)',
      '3. Chapa com Divergência / Sem Certificado'
    ];
    el.querySelector('#cpCenarioO').textContent=cenarios[v-1];
    if(v===1){
      el.querySelector('#cpRes').innerHTML=`<span class="verdict ok">Destino: Pátio A (Galpão Principal)</span><span class="chip o">Ponte Rolante (20t/30t)</span><span class="chip t">Operador Pontoneiro</span><span class="chip">Alimenta Linha de Corte</span><br><small style="color:var(--stage-mut);margin-top:4px;display:block">Chapas de projetos já em produção vão diretamente para o Pátio A, permitindo a alimentação contínua das linhas de corte e calandragem.</small>`;
    }else if(v===2){
      el.querySelector('#cpRes').innerHTML=`<span class="verdict o">Destino: Pátio B (Área Externa)</span><span class="chip o">Pórtico Mag 75 Ton</span><span class="chip t">Operador de Pórtico</span><span class="chip">Estoque Temporário</span><br><small style="color:var(--stage-mut);margin-top:4px;display:block">Pátio secundário criado para suprir o espaço fabril. Armazena projetos que ainda não entraram em linha até o momento do corte.</small>`;
    }else{
      el.querySelector('#cpRes').innerHTML=`<span class="verdict bad">Reprovação pela Qualidade</span><span class="chip bad">Abertura de RNC</span><span class="chip o">Segregação Imediata</span><span class="chip t">Notificação Fornecedor</span><br><small style="color:var(--stage-mut);margin-top:4px;display:block">Sem certificado da usina ou com defeito dimensional/físico, a chapa não é liberada. Fica segregada aguardando regularização ou devolução.</small>`;
    }
  };
  c.oninput=up;up();
};

W.provedores=function(el){
  el.innerHTML=`<div class="wg">
    <div class="wg-top"><label for="pvTipo">Tipo de Aquisição (Item 6.6)</label><b id="pvTipoO">1. Compra de Materiais</b></div>
    <input type="range" id="pvTipo" min="1" max="2" step="1" value="1" aria-label="Tipo de Compra">
    <div class="wg-top" style="margin-top:10px"><label for="pvValor">Faixa de Valor (R$)</label><b id="pvValorO">R$ 250.000</b></div>
    <input type="range" id="pvValor" min="5" max="1000" step="5" value="250" aria-label="Valor em Milhares">
    <div class="ctres" id="pvRes" style="margin-top:12px"></div>
  </div>`;
  const t=el.querySelector('#pvTipo'), v=el.querySelector('#pvValor');
  const up=()=>{
    const tipo=+t.value, val=(+v.value)*1000;
    el.querySelector('#pvTipoO').textContent=tipo===1?'1. Compra de Materiais':'2. Compra de Serviços';
    el.querySelector('#pvValorO').textContent=val.toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});
    let aprov='', nivel='', cor='o';
    if(tipo===1){
      if(val<=10000){ nivel='Nível 01'; aprov='Gerente Administrativo/Financeiro ou Planejamento/Custos'; cor='t'; }
      else if(val<=300000){ nivel='Nível 02'; aprov='Diretor da Obra'; cor='o'; }
      else if(val<=600000){ nivel='Nível 03'; aprov='Superintendente Comercial Área de Energia'; cor='o'; }
      else{ nivel='Nível 04'; aprov='Presidente'; cor='bad'; }
    }else{
      if(val<=10000){ nivel='Nível 01'; aprov='Gerente Administrativo e Financeiro'; cor='t'; }
      else if(val<=1000000){ nivel='Nível 02'; aprov='Gerente da Unidade'; cor='o'; }
      else if(val<=3000000){ nivel='Nível 03'; aprov='Superintendente da Unidade'; cor='o'; }
      else if(val<=6000000){ nivel='Nível 04'; aprov='Diretores da Unidade'; cor='bad'; }
      else{ nivel='Nível 05'; aprov='Presidente da Unidade'; cor='bad'; }
    }
    el.querySelector('#pvRes').innerHTML=`<span class="verdict ${cor==='bad'?'r':cor==='o'?'p':'ok'}">${nivel} · ${aprov}</span><span class="chip o">Pré-requisito: Fornecedor Qualificado</span><span class="chip t">MPP Aprovado Eng/Qualidade</span><br><small style="color:var(--stage-mut);margin-top:4px;display:block">Antes da emissão do Pedido de Compras, a aprovação formal deve obedecer à alçada e à análise crítica de risco (Item 6.6).</small>`;
  };
  t.oninput=up;v.oninput=up;up();
};




