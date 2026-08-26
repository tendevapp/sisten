/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Um tramo dentro do carregamento: os dados do veículo e do motorista, mais a
 * trilha das três marcações de tempo.
 *
 * É recolhível porque um carregamento pode ter cinco tramos: expandidos de uma
 * vez, o formulário passaria de dois metros de rolagem no celular, e quem está
 * no pátio para preencher *um* horário teria de caçá-lo. Recolhido, o
 * cabeçalho ainda mostra motorista e as três bolinhas de progresso — o
 * suficiente para achar o tramo certo sem abrir nenhum.
 */

import { ChevronDown, Trash2 } from 'lucide-react';
import type { EtapaExpedicao, ExpedicaoFoto, ExpedicaoTramo, Tramo } from '../../types';
import { TRAMOS } from '../../types';
import EtapaHorario from './EtapaHorario';

const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

const ETAPAS: { etapa: EtapaExpedicao; rotulo: string; campo: keyof ExpedicaoTramo; campoObs: keyof ExpedicaoTramo }[] = [
  { etapa: 'chegada_portaria', rotulo: 'Chegada na portaria', campo: 'hora_chegada_portaria', campoObs: 'obs_chegada_portaria' },
  { etapa: 'entrada_patio', rotulo: 'Entrada no pátio', campo: 'hora_entrada_patio', campoObs: 'obs_entrada_patio' },
  { etapa: 'expedicao', rotulo: 'Expedição', campo: 'hora_expedicao', campoObs: 'obs_expedicao' },
];

/**
 * Base sem largura de propósito. Quando a largura vinha aqui como `w-full`, o
 * `w-24` do seletor de UF colidia com ela — duas utilidades de largura têm a
 * mesma especificidade, então quem vencia era a ordem no CSS gerado, não a
 * ordem na string de classes. O resultado era o campo de placa espremido e a
 * UF ocupando a linha toda. Agora cada uso declara a sua largura.
 */
const campoBase =
  'h-11 rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50';

const campoClasse = `${campoBase} w-full`;
/** Placa: fica com toda a sobra da linha. `min-w-0` impede o flex de espremê-la. */
const campoPlaca = `${campoBase} min-w-0 flex-1 font-semibold uppercase tracking-wide`;
/** UF: dois caracteres + seta do select. Estreito e fixo — sem `px` próprio, que colidiria com o da base. */
const campoUf = `${campoBase} w-20 shrink-0`;

const rotuloClasse = 'block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400';

const PLACAS: { campoPlaca: 'cavalo_placa' | 'carreta_placa' | 'dolly_placa'; campoUf: 'cavalo_uf' | 'carreta_uf' | 'dolly_uf'; rotulo: string }[] = [
  { campoPlaca: 'cavalo_placa', campoUf: 'cavalo_uf', rotulo: 'Cavalo' },
  { campoPlaca: 'carreta_placa', campoUf: 'carreta_uf', rotulo: 'Carreta' },
  { campoPlaca: 'dolly_placa', campoUf: 'dolly_uf', rotulo: 'Dolly' },
];

interface TramoCardProps {
  tramo: ExpedicaoTramo;
  fotos: ExpedicaoFoto[];
  aberto: boolean;
  somenteLeitura?: boolean;
  onAlternar: () => void;
  onChange: (patch: Partial<ExpedicaoTramo>) => void;
  onExcluir: () => void;
  onAnexarFoto: (etapa: EtapaExpedicao, arquivos: FileList) => Promise<void>;
  onExcluirFoto: (foto: ExpedicaoFoto) => Promise<void>;
  /** Aviso parcial de chegada — só a etapa da portaria o oferece. */
  onEnviarChegada: () => Promise<void>;
}

export default function TramoCard({
  tramo, fotos, aberto, somenteLeitura, onAlternar, onChange, onExcluir, onAnexarFoto, onExcluirFoto,
  onEnviarChegada,
}: TramoCardProps) {
  const horas = ETAPAS.map(e => tramo[e.campo] as string | null);
  const concluidas = horas.filter(Boolean).length;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      {/* Cabeçalho: identifica e resume o tramo mesmo recolhido */}
      <div className="flex items-center gap-2 px-3 py-3 sm:px-4">
        <button
          type="button"
          onClick={onAlternar}
          aria-expanded={aberto}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-sm font-extrabold text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
            {tramo.tramo}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-slate-900 dark:text-slate-50">
              {tramo.motorista?.trim() || 'Motorista não informado'}
            </span>
            <span className="mt-0.5 flex items-center gap-1.5">
              {horas.map((h, i) => (
                <span
                  key={i}
                  title={ETAPAS[i].rotulo}
                  className={`h-1.5 w-5 rounded-full ${h ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'}`}
                />
              ))}
              <span className="ml-1 text-[11px] font-medium text-slate-400">{concluidas}/3 horários</span>
            </span>
          </span>
          <ChevronDown
            className={`h-5 w-5 shrink-0 text-slate-400 transition-transform duration-200 ${aberto ? 'rotate-180' : ''}`}
          />
        </button>

        {!somenteLeitura && (
          <button
            type="button"
            onClick={onExcluir}
            aria-label={`Remover tramo ${tramo.tramo}`}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {aberto && (
        <div className="border-t border-slate-100 px-3 pb-5 pt-4 sm:px-4 dark:border-slate-800">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-1">
              <label htmlFor={`tramo-${tramo.id}`} className={rotuloClasse}>Tramo</label>
              <select
                id={`tramo-${tramo.id}`}
                value={tramo.tramo}
                disabled={somenteLeitura}
                onChange={e => onChange({ tramo: e.target.value as Tramo })}
                className={`${campoClasse} mt-1.5 font-semibold`}
              >
                {TRAMOS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div className="sm:col-span-1">
              <label htmlFor={`data-${tramo.id}`} className={rotuloClasse}>Data</label>
              <input
                id={`data-${tramo.id}`}
                type="date"
                value={tramo.data || ''}
                disabled={somenteLeitura}
                onChange={e => onChange({ data: e.target.value || null })}
                className={`${campoClasse} mt-1.5`}
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor={`motorista-${tramo.id}`} className={rotuloClasse}>Motorista</label>
              <input
                id={`motorista-${tramo.id}`}
                type="text"
                value={tramo.motorista}
                disabled={somenteLeitura}
                placeholder="Nome completo"
                autoCapitalize="characters"
                onChange={e => onChange({ motorista: e.target.value })}
                className={`${campoClasse} mt-1.5`}
              />
            </div>

            {PLACAS.map(p => (
              <div key={p.campoPlaca}>
                <label htmlFor={`${p.campoPlaca}-${tramo.id}`} className={rotuloClasse}>
                  {p.rotulo}
                </label>
                <div className="mt-1.5 flex gap-2">
                  <input
                    id={`${p.campoPlaca}-${tramo.id}`}
                    type="text"
                    value={tramo[p.campoPlaca]}
                    disabled={somenteLeitura}
                    placeholder="Placa"
                    autoCapitalize="characters"
                    onChange={e => onChange({ [p.campoPlaca]: e.target.value.toUpperCase() } as Partial<ExpedicaoTramo>)}
                    className={campoPlaca}
                  />
                  <select
                    aria-label={`UF — ${p.rotulo}`}
                    value={tramo[p.campoUf] || ''}
                    disabled={somenteLeitura}
                    onChange={e => onChange({ [p.campoUf]: e.target.value || null } as Partial<ExpedicaoTramo>)}
                    className={campoUf}
                  >
                    <option value="">UF</option>
                    {UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                  </select>
                </div>
              </div>
            ))}
          </div>

          {/* Trilha de horários — o que é preenchido ao longo do dia */}
          <div className="mt-6 rounded-2xl bg-slate-50 p-4 dark:bg-slate-950/40">
            <p className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-400">
              Horários e fotos
            </p>
            {ETAPAS.map((e, i) => (
              <EtapaHorario
                key={e.etapa}
                etapa={e.etapa}
                rotulo={e.rotulo}
                hora={tramo[e.campo] as string | null}
                obs={tramo[e.campoObs] as string | null}
                fotos={fotos.filter(f => f.etapa === e.etapa)}
                ultima={i === ETAPAS.length - 1}
                desabilitado={somenteLeitura}
                onHoraChange={hora => onChange({ [e.campo]: hora } as Partial<ExpedicaoTramo>)}
                onObsChange={obs => onChange({ [e.campoObs]: obs } as Partial<ExpedicaoTramo>)}
                onAnexar={arquivos => onAnexarFoto(e.etapa, arquivos)}
                onExcluirFoto={onExcluirFoto}
                onEnviarEmail={e.etapa === 'chegada_portaria' ? onEnviarChegada : undefined}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
