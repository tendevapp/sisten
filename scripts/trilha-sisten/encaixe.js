/* ---------- Encaixe na janela (preenchimento total da tela) ---------- */
const FIT=true,LARG=1220;let FS=1,fitRaf=0;
function encaixar(){
  const box=$('fitbox'),f=$('fit'),W=innerWidth,H=innerHeight,on=FIT&&W>=760;
  document.documentElement.classList.toggle('fit',on);
  if(!on){FS=1;f.style.cssText='';box.style.cssText='';document.documentElement.classList.remove('fit-rola');return}
  f.style.transform='none';f.style.minHeight='0';f.style.width=LARG+'px';
  let s=Math.min(W/LARG,H/f.scrollHeight,1.5);
  f.style.width=(W/s)+'px';
  s=Math.max(.6,Math.min(s,H/f.scrollHeight));f.style.width=(W/s)+'px';
  const natural=f.scrollHeight;
  f.style.minHeight=(H/s)+'px';f.style.transform=`scale(${s})`;FS=s;
  const alto=Math.max(H,natural*s);
  box.style.width=W+'px';box.style.height=alto+'px';
  document.documentElement.classList.toggle('fit-rola',alto>H+1);
  if(cur==='watch')placeToken();
}
const reencaixar=()=>{cancelAnimationFrame(fitRaf);fitRaf=requestAnimationFrame(encaixar)};
addEventListener('resize',reencaixar);
if(FIT&&window.ResizeObserver)new ResizeObserver(reencaixar).observe($('fit'));
