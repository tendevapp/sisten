/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Apontar um ou vários tramos (bottom sheet no celular): avançar para a
 * próxima etapa, atualizar a situação ou somar reparos de solda. Com um
 * tramo só, mostra a linha do tempo com correção auditável.
 */

import React, { useMemo, useState } from 'react';
import { ArrowRight, Loader2, Minus, Plus, Save, WifiOff } from 'lucide-react';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../../../ui/Modal';
import { useToast } from '../../../ui/Toast';
import {
  CONFIG_ETAPA,
  ETAPA_APOS_MARCO,
  ROTULO_MARCO,
  dataCurta,
  diaUtilAnterior,
  diasNaEtapa,
  exigeObservacao,
  situacoesDaEtapa,
  validarMarco,
  type EtapaTramo,
  type SituacaoTramo,
  type TramoAtual,
} from '../../../../lib/producaoTramos';
import { adicionarDias } from '../../../../lib/producaoApontamentos';
import { registrarTramos } from '../../../../lib/producaoTramosApi';
import { btnPrimario, btnSecundario, inputCls, labelCls } from '../estilos';
import LinhaDoTempoTramo from './LinhaDoTempoTramo';
import { COR_ETAPA } from './visual';
import type { Profile } from '../../../../types';

type Acao = 'avancar' | 'situacao' | 'reparos';

interface Props {
  tramos: TramoAtual[];
  situacoes: SituacaoTramo[];
  hoje: string;
  user: Profile;
  onClose: () => void;
  /** tramoIds que ficaram na fila offline. */
  onSalvo: (pendentesOffline: string[]) => void;
}

function ChipsSituacao({ opcoes, valor, onChange }: { opcoes: SituacaoTramo[]; valor: string | null; onChange: (id: string | null) => void }) {
  if (!opcoes.length) return <p className="text-xs text-slate-500">Nenhuma situação cadastrada para esta etapa.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {opcoes.map(s => (
        <button
          key={s.id}
          type="button"
          onClick={() => onChange(valor === s.id ? null : s.id)}
          className={`min-h-[40px] rounded-xl border px-3 py-1.5 text-left text-xs font-semibold transition ${
            valor === s.id
              ? 'border-blue-600 bg-blue-600 text-white'
              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
          }`}
        >
          <span className="block text-[10px] font-bold uppercase tracking-wide opacity-70">{s.setor}</span>
          {s.atividade}
        </button>
      ))}
    </div>
  );
}

export default function SheetApontamento({ tramos, situacoes, hoje, user, onClose, onSalvo }: Props) {
  const toast = useToast();
  const unico = tramos.length === 1 ? tramos[0] : null;
  const etapa: EtapaTramo = tramos[0].etapa;
  const proximo = CONFIG_ETAPA[etapa].proximo;
  const etapaDestino = proximo ? ETAPA_APOS_MARCO[proximo] : etapa;

  const [acao, setAcao] = useState<Acao>(proximo ? 'avancar' : 'situacao');
  const [data, setData] = useState(hoje);
  const opcoesDestino = useMemo(() => situacoesDaEtapa(situacoes, etapaDestino), [situacoes, etapaDestino]);
  const opcoesAtual = useMemo(() => situacoesDaEtapa(situacoes, etapa), [situacoes, etapa]);
  const [situacaoAvanco, setSituacaoAvanco] = useState<string | null>(() => opcoesDestino[0]?.id ?? null);
  const [situacao, setSituacao] = useState<string | null>(null);
  const [reparos, setReparos] = useState(1);
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [versaoLinha, setVersaoLinha] = useState(0);

  // Segunda de manhã, o "ontem" da produção é a sexta.
  const ultimoUtil = diaUtilAnterior(hoje);
  const rotuloUltimoUtil = ultimoUtil === adicionarDias(hoje, -1) ? 'Ontem' : `Sexta (${dataCurta(ultimoUtil).slice(0, 5)})`;

  const erros = useMemo(() => {
    if (acao !== 'avancar' || !proximo) return [];
    return tramos.flatMap(t => {
      const erro = validarMarco(t.marcos, proximo, data, hoje);
      return erro ? [`${t.serie}: ${erro}`] : [];
    });
  }, [acao, proximo, tramos, data, hoje]);

  const precisaObs = !!data && exigeObservacao(data, hoje) && !observacao.trim();
  const semConteudo = acao === 'situacao' && !situacao;

  const salvar = async () => {
    if (erros.length || precisaObs || semConteudo || !data) return;
    setSalvando(true);
    try {
      const r = await registrarTramos({
        tramoIds: tramos.map(t => t.tramoId),
        dataOperacional: data,
        marco: acao === 'avancar' ? proximo : null,
        situacaoId: acao === 'avancar' ? situacaoAvanco : acao === 'situacao' ? situacao : null,
        reparos: acao === 'reparos' ? reparos : 0,
        observacao,
      });
      if (r.offline) {
        toast.success('Sem rede: apontamento salvo no aparelho. Ele sobe sozinho quando a conexão voltar.');
        onSalvo(tramos.map(t => t.tramoId));
      } else {
        toast.success(r.codigos.length === 1 ? `Apontamento ${r.codigos[0]} registrado.` : `${r.codigos.length} apontamentos registrados (${r.codigos[0]}…).`);
        onSalvo([]);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível registrar.');
    } finally {
      setSalvando(false);
    }
  };

  const titulo = unico ? `${unico.serie} · ${unico.tramo} · Torre ${unico.torreNumero}` : `${tramos.length} tramos — ${CONFIG_ETAPA[etapa].rotulo}`;
  const cor = COR_ETAPA[etapa];
  const dias = unico ? diasNaEtapa(unico, hoje) : null;

  const abas: Array<{ id: Acao; rotulo: string }> = [
    ...(proximo ? [{ id: 'avancar' as Acao, rotulo: ROTULO_MARCO[proximo] }] : []),
    { id: 'situacao', rotulo: 'Situação' },
    { id: 'reparos', rotulo: 'Reparos de solda' },
  ];

  return (
    <Modal onClose={onClose} ariaLabel="Apontar tramo" maxWidth="max-w-xl">
      <ModalHeader onClose={onClose}>
        <div className="flex items-center gap-2">
          <span className="rounded-md px-2 py-0.5 text-[11px] font-bold" style={{ background: cor.fundo, color: cor.texto }}>
            {CONFIG_ETAPA[etapa].rotulo}
          </span>
          <h2 className="truncate font-display text-base font-bold text-slate-900 dark:text-slate-50">{titulo}</h2>
        </div>
        <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
          {unico
            ? [unico.setorAtual && `${unico.setorAtual} · ${unico.atividadeAtual}`, dias !== null && `${dias} dia(s) na etapa`, unico.reparosSolda > 0 && `${unico.reparosSolda} reparo(s)`].filter(Boolean).join(' — ') || 'Sem apontamentos'
            : tramos.map(t => t.serie).join(', ')}
        </p>
      </ModalHeader>
      <ModalBody className="space-y-5">
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          {abas.map(a => (
            <button
              key={a.id}
              type="button"
              onClick={() => setAcao(a.id)}
              className={`min-h-[40px] flex-1 rounded-lg px-2 text-xs font-bold transition ${
                acao === a.id ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-50' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {a.rotulo}
            </button>
          ))}
        </div>

        {acao === 'avancar' && proximo && (
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            <span className="rounded-md px-2 py-1 text-xs font-bold" style={{ background: cor.fundo, color: cor.texto }}>{CONFIG_ETAPA[etapa].rotulo}</span>
            <ArrowRight className="h-4 w-4 text-slate-400" />
            <span className="rounded-md px-2 py-1 text-xs font-bold" style={{ background: COR_ETAPA[etapaDestino].fundo, color: COR_ETAPA[etapaDestino].texto }}>
              {CONFIG_ETAPA[etapaDestino].rotulo}
            </span>
          </div>
        )}

        <div>
          <span className={labelCls}>{acao === 'avancar' && proximo ? `Data — ${ROTULO_MARCO[proximo]}` : 'Data'}</span>
          <div className="flex flex-wrap items-center gap-2">
            {[
              { rotulo: 'Hoje', valor: hoje },
              { rotulo: rotuloUltimoUtil, valor: ultimoUtil },
            ].map(o => (
              <button
                key={o.rotulo}
                type="button"
                onClick={() => setData(o.valor)}
                className={`min-h-[40px] rounded-xl border px-3 text-xs font-bold ${
                  data === o.valor ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
                }`}
              >
                {o.rotulo}
              </button>
            ))}
            <input type="date" value={data} max={hoje} onChange={e => setData(e.target.value)} className={`${inputCls} w-auto min-h-[40px]`} aria-label="Data operacional" />
          </div>
        </div>

        {acao === 'avancar' && (
          <div>
            <span className={labelCls}>Situação ao entrar em {CONFIG_ETAPA[etapaDestino].rotulo} (opcional)</span>
            <ChipsSituacao opcoes={opcoesDestino} valor={situacaoAvanco} onChange={setSituacaoAvanco} />
          </div>
        )}

        {acao === 'situacao' && (
          <div>
            <span className={labelCls}>Onde o tramo está agora</span>
            <ChipsSituacao opcoes={opcoesAtual} valor={situacao} onChange={setSituacao} />
          </div>
        )}

        {acao === 'reparos' && (
          <div>
            <span className={labelCls}>Reparos de solda a somar{unico ? ` (total atual: ${unico.reparosSolda})` : ''}</span>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setReparos(r => Math.max(1, r - 1))} className={`${btnSecundario} h-12 w-12 px-0`} aria-label="Menos um">
                <Minus className="h-5 w-5" />
              </button>
              <input
                type="number"
                min={1}
                value={reparos}
                onChange={e => setReparos(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                className={`${inputCls} h-12 w-20 text-center text-lg font-bold`}
                aria-label="Quantidade de reparos"
              />
              <button type="button" onClick={() => setReparos(r => r + 1)} className={`${btnSecundario} h-12 w-12 px-0`} aria-label="Mais um">
                <Plus className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}

        <div>
          <label className={labelCls} htmlFor="obs-apontamento">
            Observação{precisaObs ? ' — obrigatória para data com mais de 7 dias' : ''}
          </label>
          <textarea
            id="obs-apontamento"
            rows={2}
            value={observacao}
            onChange={e => setObservacao(e.target.value)}
            className={`${inputCls} ${precisaObs ? 'border-amber-400' : ''}`}
            placeholder="Ex.: retrabalho no flange, aguardando ponte rolante…"
          />
        </div>

        {erros.length > 0 && (
          <ul className="space-y-1 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
            {erros.map(e => <li key={e}>{e}</li>)}
          </ul>
        )}

        {unico && (
          <LinhaDoTempoTramo
            key={versaoLinha}
            tramo={unico}
            situacoes={situacoes}
            hoje={hoje}
            user={user}
            onCorrigido={offline => {
              setVersaoLinha(v => v + 1);
              onSalvo(offline ? [unico.tramoId] : []);
            }}
          />
        )}
      </ModalBody>
      <ModalFooter>
        <span className="mr-auto flex items-center gap-1 text-[11px] text-slate-500">
          {typeof navigator !== 'undefined' && !navigator.onLine && (
            <>
              <WifiOff className="h-3.5 w-3.5" /> Sem rede — vai para a fila
            </>
          )}
          {data && data !== hoje && <>Data: {dataCurta(data)}</>}
        </span>
        <button type="button" onClick={onClose} className={btnSecundario}>
          Fechar
        </button>
        <button type="button" onClick={salvar} disabled={salvando || erros.length > 0 || precisaObs || semConteudo || !data} className={`${btnPrimario} min-h-[44px]`}>
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {acao === 'avancar' && proximo ? ROTULO_MARCO[proximo] : 'Registrar'}
          {tramos.length > 1 ? ` (${tramos.length})` : ''}
        </button>
      </ModalFooter>
    </Modal>
  );
}
