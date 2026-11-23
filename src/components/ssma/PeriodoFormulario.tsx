import { campoSsma, rotuloSsma } from './estilosFormulario';

type Periodo = { de: string; ate: string };

export default function PeriodoFormulario({ valor, alterar, sufixo = '' }: { valor: Periodo; alterar: (p: Periodo) => void; sufixo?: string }) {
  return <div className="grid grid-cols-2 gap-3 sm:max-w-md">
    <label className={rotuloSsma}>Data inicial<input className={campoSsma} type="date" aria-label={'Data inicial' + sufixo} value={valor.de} max={valor.ate || undefined}
      onChange={e => alterar({...valor, de: e.target.value})}/></label>
    <label className={rotuloSsma}>Data final<input className={campoSsma} type="date" aria-label={'Data final' + sufixo} value={valor.ate} min={valor.de || undefined}
      onChange={e => alterar({...valor, ate: e.target.value})}/></label>
  </div>;
}
