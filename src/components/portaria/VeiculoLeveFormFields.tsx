import React, { useMemo, useState } from 'react';
import { Car, Search } from 'lucide-react';
import type { FacVeiculoLeve, RhPessoa } from '../../types';
import { obterStatusLicenciamento } from '../../lib/veiculosLeves';

interface Condutor {
  nome: string;
  cpf: string;
  funcao: string;
}

interface Props {
  veiculos: FacVeiculoLeve[];
  carregando?: boolean;
  erro?: string | null;
  onRecarregar?: () => void;
  veiculoId: string;
  placa: string;
  modelo: string;
  onVeiculoChange: (veiculo: FacVeiculoLeve | undefined) => void;
  condutor: Condutor;
  colaboradores: RhPessoa[];
  origem: 'rh_pessoas' | 'manual' | null | undefined;
  onCondutorChange: (condutor: Condutor) => void;
  onCondutorSelecionado: (pessoa: RhPessoa) => void;
  onOrigemChange: (origem: 'rh_pessoas' | 'manual' | null) => void;
}

export default function VeiculoLeveFormFields({
  veiculos, carregando = false, erro = null, onRecarregar, veiculoId, placa, modelo, onVeiculoChange, condutor, colaboradores,
  origem, onCondutorChange, onCondutorSelecionado, onOrigemChange,
}: Props) {
  const [busca, setBusca] = useState('');
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false);
  const manual = origem === 'manual';
  const veiculoSelecionado = veiculos.find((veiculo) => veiculo.id === veiculoId);
  const statusLicenciamento = veiculoSelecionado ? obterStatusLicenciamento(veiculoSelecionado.data_licenciamento) : null;
  const sugestoes = useMemo(() => {
    const termo = busca.trim().toUpperCase();
    if (!termo) return [];
    return colaboradores.filter((pessoa) =>
      pessoa.nome.toUpperCase().includes(termo) || pessoa.registro.toUpperCase().includes(termo)
    ).slice(0, 8);
  }, [busca, colaboradores]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-cyan-200 bg-cyan-50/50 p-4 dark:border-cyan-900/50 dark:bg-cyan-950/20">
        <h4 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-cyan-900 dark:text-cyan-300"><Car className="h-4 w-4" /> Carro alugado cadastrado no Facilities</h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">Veículo leve *</label>
            <select required disabled={carregando} value={veiculoId} onChange={(e) => onVeiculoChange(veiculos.find((veiculo) => veiculo.id === e.target.value))} className="w-full rounded-xl border border-cyan-200 bg-white px-3 py-2.5 text-xs font-semibold uppercase text-slate-900 disabled:cursor-wait disabled:opacity-60 dark:border-cyan-800 dark:bg-slate-950 dark:text-slate-100">
              <option value="">Selecione o carro alugado...</option>
              {veiculos.map((veiculo) => {
                const status = obterStatusLicenciamento(veiculo.data_licenciamento);
                const alerta = status.status === 'vencido' ? ' · LICENCIAMENTO VENCIDO' : status.status === 'proximo' ? ` · VENCE EM ${status.diasRestantes} DIAS` : status.status === 'sem_data' ? ' · SEM DATA' : '';
                return <option key={veiculo.id} value={veiculo.id}>{veiculo.modelo} · {veiculo.placa}{alerta}</option>;
              })}
            </select>
            {carregando && <p className="mt-1 text-[10px] font-semibold text-cyan-700">Carregando veículos cadastrados...</p>}
            {!carregando && veiculos.length === 0 && <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-semibold text-amber-700"><span>{erro || 'Nenhum veículo ativo cadastrado em Facilities.'}</span>{onRecarregar && <button type="button" onClick={onRecarregar} className="rounded border border-amber-300 px-1.5 py-0.5 text-amber-800 hover:bg-amber-100">Tentar novamente</button>}</div>}
          </div>
          <div><label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">Placa</label><input readOnly value={placa} placeholder="Preenchida pelo cadastro" className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5 font-mono text-xs font-bold uppercase text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200" /></div>
        </div>
        {modelo && <p className="mt-2 text-[11px] font-semibold text-cyan-800 dark:text-cyan-300">Modelo selecionado: {modelo}</p>}
        {statusLicenciamento?.status === 'vencido' && <p className="mt-2 rounded-lg bg-rose-100 px-2.5 py-2 text-[11px] font-bold text-rose-800">Atenção: o licenciamento deste veículo está vencido.</p>}
        {statusLicenciamento?.status === 'proximo' && <p className="mt-2 rounded-lg bg-amber-100 px-2.5 py-2 text-[11px] font-bold text-amber-800">Atenção: o licenciamento vence em {statusLicenciamento.diasRestantes} dias.</p>}
        {statusLicenciamento?.status === 'sem_data' && <p className="mt-2 rounded-lg bg-slate-100 px-2.5 py-2 text-[11px] font-semibold text-slate-700">Data de licenciamento não informada no cadastro.</p>}
      </div>

      <div className="rounded-2xl border border-purple-200 bg-purple-50/30 p-4 dark:border-purple-900/40 dark:bg-purple-950/20">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div><h4 className="text-xs font-bold uppercase tracking-wider text-purple-900 dark:text-purple-300">Condutor *</h4><p className="mt-0.5 text-[10px] text-slate-500">Busque no RH ou digite outro condutor, como PJ.</p></div>
          <button type="button" onClick={() => { const novoManual = !manual; onOrigemChange(novoManual ? 'manual' : null); setBusca(''); }} className="rounded-lg border border-purple-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-purple-700 hover:bg-purple-50 dark:border-purple-800 dark:bg-slate-900 dark:text-purple-300">{manual ? 'Buscar no RH' : 'Digitar outro'}</button>
        </div>
        {!manual ? <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-purple-500" /><input value={busca} onChange={(e) => { setBusca(e.target.value.toUpperCase()); setMostrarSugestoes(true); }} onFocus={() => setMostrarSugestoes(true)} placeholder="Digite nome ou matrícula do condutor..." className="w-full rounded-xl border border-purple-200 bg-white py-2.5 pl-9 pr-3 text-xs uppercase dark:border-purple-800 dark:bg-slate-950 dark:text-slate-100" />{mostrarSugestoes && sugestoes.length > 0 && <div className="absolute z-30 mt-1 max-h-52 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-800 dark:bg-slate-900">{sugestoes.map((pessoa) => <button type="button" key={pessoa.id} onClick={() => { onCondutorSelecionado(pessoa); setBusca(''); setMostrarSugestoes(false); }} className="flex w-full items-center justify-between rounded-lg p-2 text-left text-xs hover:bg-purple-50 dark:hover:bg-purple-950/40"><span className="font-semibold text-slate-900 dark:text-slate-100">{pessoa.nome}</span><span className="font-mono text-[10px] text-purple-600">{pessoa.registro}</span></button>)}</div>}</div> : <input required value={condutor.nome} onChange={(e) => onCondutorChange({ ...condutor, nome: e.target.value.toUpperCase() })} placeholder="NOME DO CONDUTOR PJ / VISITANTE..." className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs uppercase dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />}
        {(manual || condutor.nome) && <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3"><div><label className="mb-1 block text-[11px] font-semibold text-slate-700 dark:text-slate-300">Nome *</label><input required value={condutor.nome} onChange={(e) => onCondutorChange({ ...condutor, nome: e.target.value.toUpperCase() })} placeholder="NOME COMPLETO" className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs uppercase dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" /></div><div><label className="mb-1 block text-[11px] font-semibold text-slate-700 dark:text-slate-300">Matrícula / documento</label><input value={condutor.cpf} onChange={(e) => onCondutorChange({ ...condutor, cpf: e.target.value })} placeholder="OPCIONAL" className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" /></div><div><label className="mb-1 block text-[11px] font-semibold text-slate-700 dark:text-slate-300">Cargo / vínculo</label><input value={condutor.funcao} onChange={(e) => onCondutorChange({ ...condutor, funcao: e.target.value.toUpperCase() })} placeholder="EX.: PJ" className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs uppercase dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" /></div></div>}
      </div>
    </div>
  );
}
