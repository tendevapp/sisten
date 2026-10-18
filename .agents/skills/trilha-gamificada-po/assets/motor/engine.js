(function(){
const $=id=>document.getElementById(id);
const RM=matchMedia('(prefers-reduced-motion: reduce)').matches;
const QS=new URLSearchParams(location.search);
const NM=M.length;
const KEY=CFG.key+(QS.get('usuario')?'-'+QS.get('usuario'):'');
/* Integração: envia eventos para a página que incorpora a trilha (ex.: SISTEN via iframe) */
const notify=(evento,dados)=>{try{if(window.parent&&window.parent!==window)window.parent.postMessage(Object.assign({origem:CFG.origem,evento,usuario:QS.get('usuario')||null},dados),'*')}catch(e){}};
let P={best:{},stars:{},done:{},review:false,name:''};
try{const s=JSON.parse(localStorage.getItem(KEY)||'null');if(s)P=Object.assign(P,s)}catch(e){}
if(QS.get('nome'))P.name=QS.get('nome');if(QS.get('revisao')==='1')P.review=true;
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(P))}catch(e){}};
const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const starsHTML=(n,cls='stars')=>`<div class="${cls}">${[0,1,2].map(k=>`<svg class="${k<n?'on':''}" style="--d:${k}" viewBox="0 0 24 24"><path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/></svg>`).join('')}</div>`;
const gain=k=>15+5*Math.min(k-1,4);
const gMax=m=>{const N=m.game.type==='order'?m.scenes.length:m.game.cards.length;let s=0;for(let k=1;k<=N;k++)s+=gain(k);return s};

/* ---------- XP e nível ---------- */
const LV=CFG.levels;
let R=null;
function total(){let t=0;for(const k in P.best){if(R&&+k===R.m.n)continue;t+=P.best[k]}if(R)t+=Math.max(P.best[R.m.n]||0,R.xp);return t}
const lvlOf=x=>{let i=0;LV.forEach((l,k)=>{if(x>=l[0])i=k});return i};
const doneCount=()=>M.filter(m=>P.done[m.n]).length;
const nextMission=()=>{for(const m of M)if(!P.done[m.n])return m.n;return 0};
const unlocked=n=>P.review||n===1||!!P.done[n-1]||!!P.done[n];
let shownXP=null,lastLvl=null;
function hud(){
  const x=total(),i=lvlOf(x),lo=LV[i][0],hi=LV[i+1]?LV[i+1][0]:lo+1000,k=Math.min(1,(x-lo)/(hi-lo));
  $('xpFill').style.width=(k*100)+'%';$('lvlRing').style.strokeDashoffset=119.4*(1-k);
  $('lvlN').textContent=i+1;$('lvlName').textContent='Nível '+(i+1)+' · '+LV[i][1];
  const from=shownXP==null?x:shownXP;shownXP=x;
  if(RM||from===x)$('xpN').textContent=x;
  else{const t0=performance.now();(function f(t){const q=Math.min(1,(t-t0)/700);$('xpN').textContent=Math.round(from+(x-from)*q);if(q<1)requestAnimationFrame(f)})(t0)}
  if(lastLvl!=null&&i>lastLvl)levelUp(i);lastLvl=i;
  const now=R?R.m.n:nextMission();
  let s='<svg viewBox="0 0 322 40" role="img" aria-label="Torre do curso">';
  const sw=286/NM,dh=12/NM;
  for(let j=0;j<NM;j++){const x0=j*sw,h0=26-j*dh,h1=26-(j+1)*dh,c=P.done[j+1]?'done':(j+1===now?'now':'');
    s+=`<path class="tb-seg ${c}" d="M${x0} ${20-h0/2}L${x0+sw-2} ${20-h1/2}V${20+h1/2}L${x0} ${20+h0/2}Z"><title>Missão ${j+1}</title></path>`}
  s+='<rect x="288" y="14" width="18" height="12" rx="3" fill="var(--navy)"/><g class="rotor" style="transform-origin:306px 20px"><line x1="306" y1="20" x2="306" y2="3"/><line x1="306" y1="20" x2="320.7" y2="28.5"/><line x1="306" y1="20" x2="291.3" y2="28.5"/></g></svg>';
  $('towerbar').innerHTML=s;
  $('badges').innerHTML=M.map(m=>`<svg class="hex ${P.done[m.n]?'on':''}" viewBox="0 0 22 24"><title>${m.badge}</title><path d="M11 1 21 6.5v11L11 23 1 17.5v-11z"/></svg>`).join('');
}
function levelUp(i){
  const b=document.createElement('div');b.className='lvup';
  b.innerHTML=`${ic('iaward')}<div><span>Subiu de nível</span><br><b>Nível ${i+1} · ${LV[i][1]}</b></div>`;
  document.body.appendChild(b);setTimeout(()=>b.remove(),3300);burst(innerWidth/2,120);
}
function addXP(n,el){
  R.xp+=n;
  if(el){const r=el.getBoundingClientRect(),d=document.createElement('div');d.className='xpf';d.textContent='+'+n+' XP';d.style.left=(r.left+r.width/2)+'px';d.style.top=(r.top+r.height/2)+'px';document.body.appendChild(d);setTimeout(()=>d.remove(),1200)}
  hud();
}

/* ---------- Medalha ---------- */
function medal(m,locked){
  const rays=Array.from({length:12},(_,i)=>{const a=i*Math.PI/6;return `<path d="M100 100 L${100+100*Math.cos(a-.12)} ${100+100*Math.sin(a-.12)} L${100+100*Math.cos(a+.12)} ${100+100*Math.sin(a+.12)}Z"/>`}).join('');
  return `<div class="medal ${locked?'locked':''}"><svg viewBox="0 0 200 200" role="img" aria-label="Insígnia ${m.badge}">${locked?'':`<g class="rays">${rays}</g>`}<g class="core"><path class="hexo" d="M100 22 168 61v78l-68 39-68-39V61z"/><path class="hexi" d="M100 38 154 69v62l-54 31-54-31V69z"/><svg class="gl" x="70" y="58" width="60" height="60" viewBox="0 0 24 24"><use href="#${m.ic}"/></svg><text class="mlbl" x="100" y="146">MISSÃO ${pad(m.n)}</text></g></svg></div>`;
}

/* ---------- Navegação ---------- */
const MS=['brief','watch','game','quiz','result'],ALL=['map','guide','cert'].concat(MS);
let cur='map';
function go(s){
  if(MS.includes(s)&&!R)s='map';
  wStop();qPause();if(R&&R.g)clearInterval(R.g.tick);
  cur=s;ALL.forEach(x=>{$('s-'+x).hidden=x!==s});
  const inM=MS.includes(s);$('phases').hidden=!inM;
  $('hudTitle').textContent=inM?`Missão ${pad(R.m.n)} · ${R.m.short}`:CFG.hud;
  if(inM){$('phGame').textContent=R.m.gameName;
    document.querySelectorAll('.ph[data-go]').forEach(b=>{const g=b.dataset.go;if(g==='map')return;b.setAttribute('aria-current',g===s?'step':'false');b.classList.toggle('ok',!!R.done[g])})}
  ({map:renderMap,guide:renderGuide,cert:renderCert,brief:renderBrief,watch:enterWatch,game:enterGame,quiz:enterQuiz,result:renderResult})[s]();
  hud();
  const st=$('stage').getBoundingClientRect();if(st.top<0)$('stage').scrollIntoView({behavior:RM?'auto':'smooth',block:'start'});
}
function startMission(n){R={m:M[n-1],xp:0,done:{},wi:0,g:null,q:null,saved:false};go('brief')}
function markPhases(){if(!R)return;document.querySelectorAll('.ph[data-go]').forEach(b=>{if(b.dataset.go!=='map')b.classList.toggle('ok',!!R.done[b.dataset.go])})}
document.addEventListener('click',e=>{
  const m=e.target.closest('[data-m]');if(m&&!m.disabled){startMission(+m.dataset.m);return}
  const b=e.target.closest('[data-go]');if(b&&!b.disabled){if(b.dataset.go==='map')R=null;go(b.dataset.go)}
});
$('hudHome').onclick=()=>{R=null;go('map')};

/* ---------- Mapa ---------- */
function bigTower(){
  const nd=nextMission(),base=392,g=4,h=Math.floor(352/NM)-g;let s='<svg viewBox="0 -4 130 404" aria-hidden="true">';
  for(let i=0;i<NM;i++){const yb=base-i*(h+g),yt=yb-h,w=t=>28-12*((base-t)/(NM*(h+g))),c=P.done[i+1]?'done':(i+1===nd?'next':'');
    s+=`<path class="bt-seg ${c}" d="M${60-w(yb)} ${yb}L${60-w(yt)} ${yt}H${60+w(yt)}L${60+w(yb)} ${yb}Z"/><text class="bt-num" x="98" y="${yb-h/2+4}">${pad(i+1)}</text>`}
  const top=base-NM*(h+g)+g;
  s+=`<rect x="48" y="${top-14}" width="26" height="12" rx="3" fill="var(--s-blue)"/><g class="rotor" style="transform-origin:58px ${top-8}px"><line x1="58" y1="${top-8}" x2="58" y2="${top-40}"/><line x1="58" y1="${top-8}" x2="85.7" y2="${top+8}"/><line x1="58" y1="${top-8}" x2="30.3" y2="${top+8}"/></g></svg>`;
  return s;
}
function renderMap(){
  const nd=nextMission(),dc=doneCount(),x=total(),li=lvlOf(x);
  const tiles=M.map(m=>{const d=P.done[m.n],u=unlocked(m.n),nx=m.n===nd;
    return `<li><button class="tile ${d?'done':''} ${nx?'next':''}" type="button" data-m="${m.n}" ${u?'':'disabled'}>
      <span class="tic">${ic(u?m.ic:'ilock')}</span><span class="tn">MISSÃO ${pad(m.n)}</span><b>${m.short}</b>
      <span class="tf">${starsHTML(P.stars[m.n]||0,'mstars')}<span class="chip ${d?'t':nx?'o':''}">${d?'Concluída':u?(nx?'Próxima':'Disponível'):'Bloqueada'}</span></span></button></li>`}).join('');
  $('s-map').innerHTML=`<div class="maphero"><div style="display:grid;gap:18px">
      <div class="kick">Trilha ${CFG.code} · Rev. ${CFG.rev}</div><h1>${CFG.hero}</h1>
      <div class="mstats"><span class="chip">${ic('iflag')}${dc}/${NM} missões</span><span class="chip o">${x} XP</span><span class="chip t">Nível ${li+1} · ${LV[li][1]}</span></div>
      <div class="row">${nd?`<button class="btn go pulse" type="button" data-m="${nd}">${ic('ip')}${dc?'Continuar':'Começar'} · Missão ${pad(nd)}</button>`:`<button class="btn go" type="button" data-go="cert">${ic('iaward')}Ver certificado</button>`}
      <button class="btn" type="button" data-go="guide">${ic('ibook')}Guia de bolso</button></div></div>
      <div class="bigtower">${bigTower()}</div></div>
    ${dc===NM?`<div class="done-banner"><b>Trilha concluída. A torre está de pé.</b><button class="btn go" type="button" data-go="cert">${ic('iaward')}Certificado</button></div>`:''}
    <ol class="tiles">${tiles}</ol>
    <div class="mapfoot"><label class="tg"><input type="checkbox" id="revT" ${P.review?'checked':''}> Abrir todas as missões (modo revisão)</label>
      <button class="btn" type="button" id="rstB">${ic('irep')}Zerar progresso</button></div>`;
  $('revT').onchange=e=>{P.review=e.target.checked;save();renderMap()};
  $('rstB').onclick=e=>{const b=e.currentTarget;if(!b.dataset.c){b.dataset.c='1';b.innerHTML=ic('irep')+'Confirmar: apagar tudo';b.classList.add('go');setTimeout(()=>{if(b.isConnected){delete b.dataset.c;b.innerHTML=ic('irep')+'Zerar progresso';b.classList.remove('go')}},4000);return}
    P={best:{},stars:{},done:{},review:false,name:P.name};save();shownXP=null;lastLvl=null;R=null;go('map')};
}

/* ---------- Briefing ---------- */
function renderBrief(){
  const m=R.m;
  $('s-brief').innerHTML=`<div class="brief"><div style="display:grid;gap:20px">
    <div class="kick">Missão ${pad(m.n)} de ${NM}</div><h1>${m.title}</h1><p class="intro">${m.intro}</p><div class="row">${ch(m.chips)}</div>
    <ul class="rewards">
      <li class="rw"><span class="ico">${ic('ieye')}</span><b>Assista</b><span class="xp">+50 XP</span></li>
      <li class="rw"><span class="ico">${ic('iblk')}</span><b>${m.gameName}</b><span class="xp">até +${gMax(m)}</span></li>
      <li class="rw"><span class="ico">${ic('iclk')}</span><b>Vença o SLA</b><span class="xp">até +${m.quiz.length*50}</span></li>
      <li class="rw badge"><span class="ico">${ic('imed')}</span><b>Insígnia ${m.badge}</b><span class="xp">★★★</span></li></ul>
    <div class="row"><button class="btn go pulse" type="button" data-go="watch">${ic('ip')}Iniciar missão</button></div></div>
    ${m.hero?m.hero():medal(m,true)}</div>`;
}

/* ---------- Fase 1: Assista ---------- */
let wTimer=null,shownK=0;
function enterWatch(){
  const m=R.m;
  $('stations').innerHTML=m.scenes.map((s,i)=>`<button class="st" type="button" data-i="${i}" aria-label="Cena ${i+1}: ${s.t}">${ic(s.ic)}</button>`).join('');
  document.querySelectorAll('.st').forEach(el=>el.onclick=()=>{R.touched=true;wStop();wSet(+el.dataset.i)});
  $('slaBox').hidden=!m.sla;
  $('toGameT').textContent='Fase 2 · '+m.gameName;
  $('toGame').classList.toggle('go',!!R.done.watch);$('toGame').classList.remove('pulse');
  wSet(R.wi);
  if(!R.done.watch&&!RM&&!m.scenes[R.wi].hold)setTimeout(()=>{if(cur==='watch'&&!wTimer&&!R.touched&&!m.scenes[R.wi].hold)wPlay()},600);
}
function placeToken(){
  const st=document.querySelectorAll('.st')[R.wi];if(!st)return;
  const tr=st.parentElement.getBoundingClientRect(),r=st.getBoundingClientRect();
  $('token').style.left=(r.left-tr.left+r.width/2)+'px';
}
function wSet(i){
  const m=R.m,n=m.scenes.length,s=m.scenes[i];R.wi=i;
  document.querySelectorAll('.st').forEach((el,k)=>{el.classList.toggle('done',k<i);el.classList.toggle('now',k===i);el.setAttribute('aria-current',k===i?'step':'false')});
  $('token').textContent=s.doc||pad(i+1);placeToken();
  $('railFill').style.transform=`scaleX(${n>1?i/(n-1):1})`;
  const sc=$('scene');sc.className='scene'+(i%2?' flip':'');sc.innerHTML='';
  const words=(s.x||s.p).replace(/<[^>]+>/g,'').split(/\s+/).length;R.dur=Math.min(17000,2600+words*240);
  const tx=document.createElement('div');tx.className='stx';
  tx.innerHTML=`<div class="stx-h"><span class="n">${pad(i+1)}</span><h3>${s.t}</h3></div><p>${s.x||s.p}</p><div class="row">${ch(s.chips||[])}${s.hold?'<span class="chip hint">Interaja com a cena</span>':''}</div><i class="tbar"><b style="animation-duration:${R.dur}ms"></b></i>`;
  const v=document.createElement('div');v.className='vig';sc.appendChild(tx);sc.appendChild(v);
  if(s.widget)W[s.widget](v);else v.innerHTML=typeof s.vig==='function'?s.vig():s.vig;
  $('roLeft').innerHTML=s.doc?`<svg class="docmini" viewBox="0 0 38 46" aria-hidden="true"><path d="M1 1h26l10 10v34H1z"/><text x="19" y="32">${s.doc}</text></svg><div><div class="k">Documento</div><div class="v">${s.st}</div></div>`
    :`<span class="stico">${ic(s.ic)}</span><div><div class="k">Cena ${i+1} de ${n}</div><div class="v">${R.m.short}</div></div>`;
  const db=$('dayBox');
  if(s.k===undefined)db.hidden=true;
  else{db.hidden=false;$('dayL').textContent=s.kl||'';const b=$('dayN');
    if(typeof s.k==='number'&&!RM){const from=shownK,to=s.k,t0=performance.now();(function f(t){const q=Math.min(1,(t-t0)/600);b.textContent=pad(Math.round(from+(to-from)*q));if(q<1)requestAnimationFrame(f)})(t0);shownK=to}
    else{b.textContent=typeof s.k==='number'?pad(s.k):s.k;b.classList.remove('pop');void b.offsetWidth;b.classList.add('pop');if(typeof s.k==='number')shownK=s.k}}
  if(i===n-1&&!R.done.watch){const run=R;setTimeout(()=>{if(R!==run||R.done.watch||cur!=='watch')return;R.done.watch=true;addXP(50,$('scene').querySelector('.stx h3'));$('toGame').classList.add('go','pulse');markPhases()},1400)}
}
function wIcon(p){$('wPlayI').setAttribute('href',p?'#ipa':'#ip');$('wPlay').setAttribute('aria-label',p?'Pausar':'Reproduzir');document.body.classList.toggle('fast',p)}
function wPlay(){const n=R.m.scenes.length;if(R.wi>=n-1)wSet(0);wIcon(true);wSched()}
function wSched(){clearTimeout(wTimer);wTimer=setTimeout(()=>{const n=R.m.scenes.length;if(R.wi>=n-1){wStop();return}wSet(R.wi+1);if(R.m.scenes[R.wi].hold){wStop();return}wSched()},R.dur||6000)}
function wStop(){clearTimeout(wTimer);wTimer=null;wIcon(false)}
$('wPlay').onclick=()=>wTimer?wStop():wPlay();
$('wPrev').onclick=()=>{R.touched=true;wStop();wSet(Math.max(0,R.wi-1))};
$('wNext').onclick=()=>{R.touched=true;wStop();wSet(Math.min(R.m.scenes.length-1,R.wi+1))};
addEventListener('resize',()=>{if(cur==='watch')placeToken()});

/* ---------- Fase 2: Jogo ---------- */
const gHead=(t,inst)=>`<div class="bhead"><div style="display:grid;gap:8px"><div class="kick">Fase 2</div><h2>${t}</h2><p class="ginst">${inst}</p></div>
  <div class="stats"><div class="stat"><small>Acertos</small><b id="gOk">0</b></div><div class="stat"><small>Erros</small><b id="gErr">0</b></div>
  <div class="stat combo" id="gComboBox"><small>Combo</small><b id="gCombo">x0</b></div><div class="stat"><small>Tempo</small><b id="gTime">0:00</b></div></div></div>`;
function gStats(){const g=R.g;$('gOk').textContent=g.ok+'/'+g.N;$('gErr').textContent=g.err;$('gCombo').textContent='x'+g.combo}
function gTick(){const g=R.g;clearInterval(g.tick);if(g.done)return;g.tick=setInterval(()=>{const s=Math.floor((performance.now()-g.t0)/1000);const e=$('gTime');if(e)e.textContent=Math.floor(s/60)+':'+pad(s%60)},500)}
function gHit(el){const g=R.g;g.combo++;g.max=Math.max(g.max,g.combo);g.ok++;addXP(gain(g.combo),el);
  const cb=$('gComboBox');cb.classList.remove('hot');void cb.offsetWidth;if(g.combo>1)cb.classList.add('hot');gStats()}
function gMiss(el){const g=R.g;g.err++;g.combo=0;gStats();el.classList.remove('bad');void el.offsetWidth;el.classList.add('bad')}
function enterGame(){
  if(R.g){gTick();return}
  const m=R.m;
  if(m.game.type==='order'){
    const N=m.scenes.length;let order=[...Array(N).keys()];do{order=shuffle(order)}while(order.every((v,i)=>v===i));
    R.g={type:'order',N,next:0,ok:0,err:0,combo:0,max:0,t0:performance.now(),done:false};
    $('s-game').innerHTML=gHead(m.game.title,GINST.order)+`<ol class="slots" id="slots">${m.scenes.map((_,i)=>`<li class="slot ${i===0?'next':''}" id="sl${i}">${i+1}</li>`).join('')}</ol>
      <div class="pool">${order.map(i=>`<button class="card" type="button" data-i="${i}">${ic(m.scenes[i].ic)}<span>${m.scenes[i].t}</span></button>`).join('')}</div><div id="gEnd"></div>`;
    document.querySelectorAll('#s-game .card').forEach(c=>c.onclick=()=>{
      const g=R.g,i=+c.dataset.i;if(g.done)return;
      if(i===g.next){gHit(c);c.classList.add('used');const sl=$('sl'+i);sl.className='slot full';sl.innerHTML=ic(m.scenes[i].ic)+`<span>${m.scenes[i].t}</span>`;
        g.next++;if(g.next<N)$('sl'+g.next).classList.add('next');if(g.next===N)gFinish()}
      else gMiss(c)});
  }else{
    const cards=m.game.cards,N=cards.length,glob=!m.game.cards[0].b;
    R.g={type:'deck',N,order:shuffle([...Array(N).keys()]),i:0,ok:0,err:0,combo:0,max:0,tries:0,t0:performance.now(),done:false,lock:false,glob,bins:glob?m.game.buckets.map(()=>[]):null};
    $('s-game').innerHTML=gHead(m.game.title,GINST.deck)+`<div class="deck"><div class="dleft" id="dLeft"></div><div id="dCard"></div><div class="bkts" id="bkts"></div></div><div id="gEnd"></div>`;
    dRender();
  }
  gStats();gTick();
}
function dRender(){
  const g=R.g,m=R.m,c=m.game.cards[g.order[g.i]],bs=c.b||m.game.buckets;
  $('dLeft').textContent=`Carta ${g.i+1} de ${g.N}`;
  $('dCard').innerHTML=`<div class="dcard" id="dc">${c.s?`<small>${c.s}</small>`:''}<b>${c.t}</b></div>`;
  if(!g.glob||!$('bkts').children.length){
    $('bkts').innerHTML=bs.map((b,k)=>`<button class="bkt" type="button" data-k="${k}"><b>${b}</b>${g.glob?`<span class="cnt">${g.bins[k].length}</span><span class="mini">${g.bins[k].map(t=>`<i>${t}</i>`).join('')}</span>`:''}</button>`).join('');
    $('bkts').dataset.n=bs.length;
    document.querySelectorAll('.bkt').forEach(b=>b.onclick=()=>dPick(+b.dataset.k,b));
  }
  document.querySelectorAll('.bkt').forEach(b=>b.classList.remove('hint','bad','hit'));
}
function dPick(k,btn){
  const g=R.g;if(g.done||g.lock)return;const c=R.m.game.cards[g.order[g.i]];
  if(k===c.a){gHit(btn);g.lock=true;
    if(g.glob){g.bins[k].push(c.t);btn.querySelector('.cnt').textContent=g.bins[k].length;btn.querySelector('.mini').insertAdjacentHTML('beforeend',`<i>${c.t}</i>`);btn.classList.remove('hit');void btn.offsetWidth;btn.classList.add('hit')}
    $('dc').classList.add('out');
    setTimeout(()=>{g.lock=false;g.i++;g.tries=0;if(g.i>=g.N){$('dCard').innerHTML='';$('dLeft').textContent='Todas as cartas classificadas';gFinish()}else dRender()},RM?0:340);
  }else{gMiss(btn);const d=$('dc');d.classList.remove('bad');void d.offsetWidth;d.classList.add('bad');
    if(++g.tries>=2)document.querySelectorAll('.bkt')[c.a].classList.add('hint')}
}
function gFinish(){
  const g=R.g;g.done=true;clearInterval(g.tick);R.done.game=true;markPhases();
  const s=g.err===0?3:g.err<=2?2:1;g.stars=s;
  $('gEnd').innerHTML=`<div class="banner"><div style="display:grid;gap:6px"><h3>${s===3?'Perfeito':'Fase concluída'}</h3><div class="row">${starsHTML(s)}<span class="chip">${g.err} erro${g.err===1?'':'s'}</span><span class="chip">combo x${g.max}</span><span class="chip">${$('gTime').textContent}</span></div></div>
    <div class="row"><button class="btn" type="button" id="gAgain">${ic('irep')}Refazer</button><button class="btn go pulse" type="button" data-go="quiz">Fase 3 · Vença o SLA${ic('ir')}</button></div></div>`;
  $('gAgain').onclick=()=>{R.g=null;enterGame()};
  const r=$('gEnd').getBoundingClientRect();burst(r.left+r.width/2,r.top+20);
}

/* ---------- Fase 3: Vença o SLA ---------- */
function enterQuiz(){if(!R.q){R.q={i:0,ok:0};qRender()}else if(!R.q.answered)qRun()}
function qRender(){
  const Q=R.m.quiz,q=Q[R.q.i],T=R.m.qtime||20;Object.assign(R.q,{answered:false,left:T,T});
  const perm=shuffle([...q.o.keys()]);R.q.ai=perm.indexOf(q.a);
  $('qI').textContent=R.q.i+1;$('qN').textContent=Q.length;$('qT').textContent=q.q;
  $('opts').innerHTML=perm.map((p,k)=>`<button class="opt" type="button" data-k="${k}"><kbd>${'ABC'[k]}</kbd>${q.o[p]}</button>`).join('');
  $('expl').innerHTML='';document.querySelectorAll('.opt').forEach(b=>b.onclick=()=>qAnswer(+b.dataset.k,b));qRun();
}
function qRun(){
  cancelAnimationFrame(R.q.raf);R.q.last=performance.now();const T=R.q.T;
  const f=t=>{const q=R.q;q.left=Math.max(0,q.left-(t-q.last)/1000);q.last=t;$('timerI').style.transform=`scaleX(${q.left/T})`;
    $('timer').className='timer'+(q.left<T*.25?' crit':q.left<T*.5?' warn':'');if(q.left<=0){qAnswer(-1);return}q.raf=requestAnimationFrame(f)};
  R.q.raf=requestAnimationFrame(f);
}
function qPause(){if(R&&R.q)cancelAnimationFrame(R.q.raf)}
function qAnswer(k,btn){
  const Q=R.m.quiz,S=R.q;if(S.answered)return;S.answered=true;qPause();
  const q=Q[S.i],opts=[...document.querySelectorAll('.opt')];opts.forEach(o=>o.disabled=true);opts[S.ai].classList.add('right');
  let head;
  if(k===S.ai){S.ok++;addXP(30+Math.round(20*S.left/S.T),btn);head='<b>Certo.</b> '}
  else{if(k>=0)opts[k].classList.add('wrong');head=k<0?'<b class="x">Tempo esgotado.</b> ':'<b class="x">Não.</b> '}
  const last=S.i===Q.length-1;
  $('expl').innerHTML=`<p>${head}${q.e}</p><button class="btn go" type="button" id="qNext">${last?'Ver insígnia':'Próxima'}${ic('ir')}</button>`;
  $('qNext').onclick=()=>{if(last){R.done.quiz=true;go('result')}else{S.i++;qRender()}};
  $('qNext').focus({preventScroll:true});
}
document.addEventListener('keydown',e=>{if(cur!=='quiz'||!R||!R.q||R.q.answered)return;const k='abc'.indexOf(e.key.toLowerCase());const o=document.querySelectorAll('.opt')[k];if(o)o.click()});

/* ---------- Resultado ---------- */
function renderResult(){
  const m=R.m;
  if(!R.done.quiz){$('s-result').innerHTML=`<div class="res">${medal(m,true)}<div style="display:grid;gap:16px"><div class="kick">Insígnia bloqueada</div><h2>Conclua a <span>fase 3</span></h2><div class="row"><button class="btn go" type="button" data-go="${R.done.game?'quiz':R.done.watch?'game':'watch'}">Continuar a missão${ic('ir')}</button></div></div></div>`;return}
  const Q=m.quiz.length,ratio=R.q.ok/Q,gErr=R.g?R.g.err:99;
  const s=Math.max(1,Math.min(3,(ratio>=.75?1:0)+(ratio===1?1:0)+(R.done.game&&gErr<=2?1:0)));
  const first=!R.saved;
  if(first){R.saved=true;P.best[m.n]=Math.max(P.best[m.n]||0,R.xp);P.stars[m.n]=Math.max(P.stars[m.n]||0,s);P.done[m.n]=true;save();notify('missao-concluida',{missao:m.n,titulo:m.short,insignia:m.badge,xpMissao:R.xp,estrelas:s,acertos:R.q.ok,perguntas:Q,errosJogo:R.g?R.g.err:null,xpTotal:total(),missoesConcluidas:doneCount()});if(doneCount()===NM)notify('trilha-concluida',{xpTotal:total(),nome:P.name||null})}
  const nx=m.n<NM?M[m.n]:null;
  $('s-result').innerHTML=`<div class="res">${medal(m,false)}<div style="display:grid;gap:18px">
    <div class="kick">Missão ${pad(m.n)} concluída</div><h2>Insígnia <span>${m.badge}</span></h2>${starsHTML(s)}
    <div class="rstats"><div class="stat"><small>XP na missão</small><b id="rXp">0</b></div><div class="stat"><small>Acertos</small><b>${R.q.ok}/${Q}</b></div><div class="stat"><small>Erros no jogo</small><b>${R.g?R.g.err:'–'}</b></div></div>
    ${nx?`<div class="unlock"><span class="lk">${ic('iun')}</span><div><small>Desbloqueada</small><b>Missão ${pad(nx.n)} · ${nx.short}</b></div></div>`
        :`<div class="unlock"><span class="lk">${ic('iaward')}</span><div><small>${doneCount()===NM?'Liberado':'Falta concluir missões'}</small><b>Certificado da trilha</b></div></div>`}
    <div class="row">${nx?`<button class="btn go" type="button" data-m="${nx.n}">Próxima missão${ic('ir')}</button>`:`<button class="btn go" type="button" data-go="cert">${ic('iaward')}Certificado</button>`}
      <button class="btn" type="button" data-go="map">${ic('imap')}Mapa</button><button class="btn" type="button" data-m="${m.n}">${ic('irep')}Jogar de novo</button></div></div></div>`;
  const to=R.xp,t0=performance.now();(function f(t){const k=RM?1:Math.min(1,(t-t0)/1200);const e=$('rXp');if(e)e.textContent=Math.round(to*k);if(k<1)requestAnimationFrame(f)})(t0);
  markPhases();
  if(first)setTimeout(()=>{const r=$('s-result').querySelector('.medal').getBoundingClientRect();burst(r.left+r.width/2,r.top+r.height/2)},450);
}

/* ---------- Guia de bolso ---------- */
function renderGuide(){
  const t=(h,rows)=>`<div class="gwrap"><table class="gt"><thead><tr>${h.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map((c,i)=>`<td${i===r.length-1&&h.length>2?' class="n"':''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  $('s-guide').innerHTML=`<div class="bhead"><div style="display:grid;gap:8px"><div class="kick">Consulta rápida</div><h2>Guia de bolso · ${CFG.code}</h2></div><button class="btn" type="button" data-go="map">${ic('imap')}Voltar ao mapa</button></div>
  <div class="guide">${CFG.guide(t)}</div>`;
}

/* ---------- Certificado ---------- */
function renderCert(){
  const dc=doneCount(),x=total(),li=lvlOf(x),ok=dc===NM;
  const d=new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'});
  $('s-cert').innerHTML=`<div class="bhead"><div style="display:grid;gap:8px"><div class="kick">${ok?'Trilha concluída':`Faltam ${NM-dc} missões`}</div><h2>Certificado</h2></div><button class="btn" type="button" data-go="map">${ic('imap')}Voltar ao mapa</button></div>
    <div class="nmin"><label for="certName">Seu nome no certificado</label><input id="certName" type="text" maxlength="60" placeholder="Nome completo" value="${(P.name||'').replace(/"/g,'&quot;')}"></div>
    <div class="cert" style="${ok?'':'opacity:.55'}"><div class="ck">${ok?'Certificado de conclusão':'Prévia · trilha em andamento'}</div><h2>Trilha ${CFG.code} · ${CFG.name}</h2>
      <div class="nm" id="certNm">${P.name||'Seu nome'}</div>
      <p>${ok?'concluiu':'está cursando'} as ${NM} missões da trilha de ${CFG.name} da TEN · Torres Eólicas do Nordeste, com ${x} XP, nível ${li+1} · ${LV[li][1]}.</p>
      <div class="bdg">${M.map(m=>`<span style="${P.done[m.n]?'':'opacity:.35'}">${ic(m.ic)}${m.badge}</span>`).join('')}</div>
      <p>Jacobina, ${d} · Suprimentos TEN</p></div>`;
  $('certName').oninput=e=>{P.name=e.target.value;save();$('certNm').textContent=P.name||'Seu nome'};
  if(ok)setTimeout(()=>burst(innerWidth/2,innerHeight/3),300);
}

/* ---------- Partículas ---------- */
const cv=$('fx'),cx=cv.getContext('2d');let PT=[],raf=0;
function size(){const r=devicePixelRatio||1;cv.width=innerWidth*r;cv.height=innerHeight*r;cv.style.width=innerWidth+'px';cv.style.height=innerHeight+'px';cx.setTransform(r,0,0,r,0,0)}
size();addEventListener('resize',size);
function burst(x,y){if(RM)return;const cols=['#12305C','#FF8A2A','#2EC4B6','#7FA4DC'];
  for(let i=0;i<70;i++){const a=Math.random()*Math.PI*2,v=4+Math.random()*7;PT.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-4,w:4+Math.random()*6,h:8+Math.random()*8,r:Math.random()*6,vr:(Math.random()-.5)*.4,c:cols[i%4],life:70+Math.random()*30})}
  if(!raf)loop()}
function loop(){cx.clearRect(0,0,innerWidth,innerHeight);PT=PT.filter(p=>p.life-->0);
  PT.forEach(p=>{p.vy+=.22;p.vx*=.98;p.x+=p.vx;p.y+=p.vy;p.r+=p.vr;cx.save();cx.globalAlpha=Math.min(1,p.life/30);cx.translate(p.x,p.y);cx.rotate(p.r);cx.fillStyle=p.c;cx.fillRect(-p.w/2,-p.h/2,p.w,p.h);cx.restore()});
  raf=PT.length?requestAnimationFrame(loop):0}

window.__trilha={startMission,go,get R(){return R},P:()=>P};
document.querySelector('.code').textContent=CFG.code;$('footTxt').textContent=`Base: ${CFG.code} Rev. ${CFG.rev} · Valores, fornecedores e casos são exemplos ilustrativos · O progresso fica salvo neste navegador.`;
go('map');
})();
