/* ---------- SISTEN: progresso do usuário vem do banco ----------
   Dentro do SISTEN a trilha roda num iframe sandbox (sem localStorage). Ao
   avisar "pronta", o SISTEN responde com o melhor resultado já gravado para o
   usuário; a trilha soma ao que tiver e segue avisando cada missão concluída.
   Zerar fica de fora: o registro oficial é o do banco. */
let EMB=false;
addEventListener('message',e=>{
  const d=e.data;if(e.source!==window.parent||!d||d.destino!=='trilha'||d.evento!=='carregar-progresso')return;
  EMB=true;const g=d.progresso||{};
  ['best','stars'].forEach(k=>{const o=g[k]||{};for(const n in o)P[k][n]=Math.max(P[k][n]||0,+o[n]||0)});
  for(const n in (g.done||{}))if(g.done[n])P.done[n]=true;
  if(d.nome&&!P.name)P.name=String(d.nome);
  if(d.tema==='dark'||d.tema==='light')document.documentElement.dataset.theme=d.tema;
  const f=$('foot')||$('footTxt');if(f)f.textContent=f.textContent.replace('O progresso fica salvo neste navegador.','O progresso fica salvo no seu usuário do SISTEN.');
  save();shownXP=null;lastLvl=null;
  if(cur==='map'||cur==='cert')go(cur);else hud();
});
