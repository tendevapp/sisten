/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Grade do Planejamento: programado por etapa e semana ISO, para as três
 * naves, da semana escolhida até a W52. É a coluna "Program." da tabela e o
 * "Previsto" dos relatórios. Célula vazia = sem programação naquela semana.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { useToast } from '../../ui/Toast';
import { listarProgramacao, salvarProgramacao } from '../../../lib/producaoApontamentosApi';
import {
  NAVES,
  chaveSemana,
  intervaloSemana,
  mesmaSemana,
  rotuloSemana,
  semanasDoIntervalo,
  semanasNoAno,
  type EtapaApontamento,
  type SemanaRef,
} from '../../../lib/producaoApontamentos';
import { btnPrimario, inputCls, msgErro } from './estilos';

interface Props {
  etapas: EtapaApontamento[];
  semanaAtual: SemanaRef;
  podeEditar: boolean;
  usuarioNome: string;
  onSalvo: () => void;
}

const ULTIMA_SEMANA = 52;
const chave = (s: SemanaRef, etapaId: string) => `${chaveSemana(s)}|${etapaId}`;

export default function ProgramacaoSemanal({ etapas, semanaAtual, podeEditar, usuarioNome, onSalvo }: Props) {
  const toast = useToast();
  // Começa na semana atual e vai até a W52: é planejamento do resto do ano.
  const [ano, setAno] = useState(semanaAtual.ano);
  const [de, setDe] = useState(semanaAtual.semana);
  const semanas = useMemo(() => semanasDoIntervalo(ano, de, ULTIMA_SEMANA), [ano, de]);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [originais, setOriginais] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    const anos = Array.from(new Set(semanas.map(s => s.ano)));
    listarProgramacao(anos)
      .then(linhas => {
        if (!ativo) return;
        const mapa: Record<string, string> = {};
        for (const l of linhas) if (semanas.some(s => mesmaSemana(s, l))) mapa[chave(l, l.etapa_id)] = String(l.quantidade);
        setValores(mapa);
        setOriginais(mapa);
      })
      .catch(e => toast.error(msgErro(e, 'Não foi possível carregar a programação.')))
      .finally(() => ativo && setCarregando(false));
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semanas]);

  const alteradas = Object.keys({ ...valores, ...originais }).filter(k => (valores[k] ?? '').trim() !== (originais[k] ?? '').trim());

  const salvar = async () => {
    setSalvando(true);
    try {
      await salvarProgramacao(
        alteradas.map(k => {
          const [chaveSem, etapa_id] = k.split('|');
          const [ano, semana] = chaveSem.split('-').map(Number);
          const v = (valores[k] ?? '').trim();
          return { ano, semana, etapa_id, quantidade: v === '' ? null : Math.max(0, Math.round(Number(v))) };
        }),
        usuarioNome,
      );
      setOriginais(valores);
      toast.success('Programação salva.');
      onSalvo();
    } catch (e) {
      toast.error(msgErro(e, 'Não foi possível salvar a programação.'));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {podeEditar ? 'Digite o programado de cada etapa por semana.' : 'Somente leitura — a programação é feita pelo Planejamento.'}
        </p>
        <div className="flex items-center gap-2">
          <select value={ano} onChange={e => setAno(Number(e.target.value))} className={`${inputCls} w-auto py-1.5`} aria-label="Ano">
            {[semanaAtual.ano - 1, semanaAtual.ano, semanaAtual.ano + 1].map(a => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <select value={de} onChange={e => setDe(Number(e.target.value))} className={`${inputCls} w-auto py-1.5`} aria-label="A partir da semana">
            {Array.from({ length: Math.min(ULTIMA_SEMANA, semanasNoAno(ano)) }, (_, i) => i + 1).map(n => (
              <option key={n} value={n}>
                de W{String(n).padStart(2, '0')} até W{ULTIMA_SEMANA}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {carregando ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : (
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="bg-slate-900 text-white dark:bg-slate-950">
                <th className="sticky left-0 z-10 bg-slate-900 px-3 py-2 text-left text-xs font-bold uppercase dark:bg-slate-950">Etapa</th>
                {semanas.map(s => (
                  <th key={chaveSemana(s)} className="px-1 py-2 text-center text-xs font-bold">
                    {rotuloSemana(s)}
                    {mesmaSemana(s, semanaAtual) && <span className="ml-1 rounded bg-blue-500 px-1 text-[9px]">atual</span>}
                    <span className="block text-[10px] font-normal text-slate-300">{intervaloSemana(s)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {NAVES.map(n => {
                const linhas = etapas.filter(e => e.nave === n.id && e.ativa).sort((a, b) => a.ordem - b.ordem);
                if (!linhas.length) return null;
                return (
                  <React.Fragment key={n.id}>
                    <tr className="bg-slate-100 dark:bg-slate-800/70">
                      <td colSpan={semanas.length + 1} className="sticky left-0 px-3 py-1.5 text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                        {n.titulo}
                      </td>
                    </tr>
                    {linhas.map(e => (
                      <tr key={e.id} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="sticky left-0 z-10 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 dark:bg-slate-900 dark:text-slate-100">{e.nome}</td>
                        {semanas.map(s => {
                          const k = chave(s, e.id);
                          const mudou = (valores[k] ?? '').trim() !== (originais[k] ?? '').trim();
                          return (
                            <td key={k} className="px-1 py-1">
                              <input
                                type="number"
                                inputMode="numeric"
                                min={0}
                                value={valores[k] ?? ''}
                                disabled={!podeEditar}
                                onChange={ev => setValores(v => ({ ...v, [k]: ev.target.value }))}
                                aria-label={`${e.nome} ${rotuloSemana(s)}`}
                                className={`w-full rounded-lg border px-1 py-1.5 text-center text-sm tabular-nums dark:bg-slate-950 dark:text-slate-100 ${
                                  mudou ? 'border-blue-400 bg-blue-50' : 'border-slate-200 dark:border-slate-700'
                                }`}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {podeEditar && (
        <div className="flex items-center justify-end gap-3">
          {alteradas.length > 0 && <span className="text-xs text-slate-500">{alteradas.length} célula(s) alterada(s)</span>}
          <button type="button" onClick={salvar} disabled={salvando || alteradas.length === 0} className={btnPrimario}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar programação
          </button>
        </div>
      )}
    </div>
  );
}
