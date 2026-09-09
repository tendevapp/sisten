/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Projetos > Produção (F4) — baixa do kit consolidado.
 *
 * A produção não requisita porca nem arruela: ela chama o "Kit T1" pronto. A
 * baixa consome um kit do buffer e marca aquele tramo daquela torre como
 * entregue — é o que move a célula da matriz de progresso.
 */

import React, { useMemo, useState } from 'react';
import { HardHat, Loader2, PackageCheck, Truck } from 'lucide-react';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';
import { TableEmpty } from '../ui/DataTable';
import { useToast } from '../ui/Toast';
import { Campo, inputCls } from './campos';
import { formatDateBR, formatInt } from '../../lib/format';
import { PREFIXO, TRAMOS, hojeISO, type Tramo } from '../../lib/projetos';
import { entregarProducao, proximoCodigo } from '../../lib/projetosApi';
import type { Profile } from '../../types';
import type { DadosProjetos } from '../../views/projetos/useDadosProjetos';

interface Props { dados: DadosProjetos; user: Profile; podeLancar: boolean }

const TURNOS = ['A', 'B', 'C', 'Administrativo'];

export default function PainelProducao({ dados, user, podeLancar }: Props) {
  const toast = useToast();
  const { kits, entregas, tramos, subprojetoAtivo, kitsProntosPorTramo, loading, recarregar } = dados;

  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [data, setData] = useState(hojeISO());
  const [turno, setTurno] = useState('A');
  const [kitId, setKitId] = useState('');
  const [recebidoPor, setRecebidoPor] = useState('');
  const [observacao, setObservacao] = useState('');
  const [erros, setErros] = useState<Record<string, string>>({});

  const prontos = useMemo(() => kits.filter((k) => k.status === 'pronto'), [kits]);
  const tramoPorId = useMemo(() => new Map(tramos.map((t) => [t.id, t])), [tramos]);

  const salvar = async () => {
    const novos: Record<string, string> = {};
    if (!data) novos.data = 'Informe a data.';
    if (!kitId) novos.kit = 'Escolha o kit a entregar.';
    if (!recebidoPor.trim()) novos.recebido = 'Informe quem recebeu na produção.';
    setErros(novos);
    const primeiro = Object.values(novos)[0];
    if (primeiro) { toast.error(primeiro); return; }

    setSalvando(true);
    try {
      const codigo = await proximoCodigo(PREFIXO.entrega, data);
      const r = await entregarProducao({
        codigo,
        data,
        turno,
        subprojeto_id: subprojetoAtivo?.id ?? null,
        kit_id: kitId,
        recebido_por_nome: recebidoPor.trim(),
        observacao: observacao.trim() || null,
        criado_por_id: user.id,
        criado_por_nome: user.name,
      });
      toast.success(`${r.rastreio} entregue à produção (${r.codigo}).`);
      setAberto(false);
      setKitId(''); setRecebidoPor(''); setObservacao(''); setErros({});
      await recarregar(true);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Não foi possível registrar a entrega.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Buffer por tramo */}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {TRAMOS.map((t: Tramo) => {
          const lista = kitsProntosPorTramo.get(t) ?? [];
          return (
            <div key={t} className="rounded-xl border p-3" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
              <div className="flex items-baseline justify-between">
                <p className="text-xs font-extrabold" style={{ color: 'var(--ink-primary)' }}>Kit {t}</p>
                <p className="text-2xl font-extrabold tabular-nums" style={{ color: lista.length ? 'var(--series-1)' : 'var(--ink-muted)' }}>
                  {formatInt(lista.length)}
                </p>
              </div>
              <p className="text-[10px]" style={{ color: 'var(--ink-muted)' }}>no buffer, aguardando chamada</p>
              {lista.length > 0 && (
                <p className="mt-1.5 text-[10px] leading-snug" style={{ color: 'var(--ink-secondary)' }}>
                  {lista.slice(0, 4).map((k) => k.rastreio.replace('KIT-', '')).join(', ')}
                  {lista.length > 4 ? ` +${lista.length - 4}` : ''}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
          {formatInt(entregas.length)} entrega(s) registrada(s) · {formatInt(prontos.length)} kit(s) disponível(is).
        </p>
        {podeLancar ? (
          <button
            onClick={() => setAberto(true)}
            disabled={!prontos.length}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer text-white shadow-sm hover:opacity-90 active:scale-95 disabled:opacity-40"
            style={{ background: 'var(--brand)' }}
            title={prontos.length ? undefined : 'Nenhum kit pronto no buffer'}
          >
            <Truck className="h-4 w-4" /> Entregar kit à produção
          </button>
        ) : (
          <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
            Consulta apenas. Entregar exige a permissão “Projetos: entregar kit à produção”.
          </p>
        )}
      </div>

      {loading && <div className="h-40 rounded-xl animate-pulse" style={{ background: 'var(--hairline)' }} />}

      {!loading && !entregas.length && (
        <TableEmpty
          icon={HardHat}
          title="Nenhum kit entregue ainda"
          hint="A entrega só é aceita com kit pronto no buffer — o que garante que a torre só avança com o conjunto completo montado."
        />
      )}

      {!loading && entregas.length > 0 && (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--hairline)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead style={{ background: 'var(--surface-raised)' }}>
                <tr className="border-b" style={{ borderColor: 'var(--hairline)' }}>
                  {['Código', 'Data', 'Turno', 'Kit', 'Torre', 'Recebido por', 'Lançado por'].map((h) => (
                    <th key={h} className="px-3 py-2 font-bold text-left whitespace-nowrap" style={{ color: 'var(--ink-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entregas.map((e) => {
                  const t = tramoPorId.get(e.tramo_unidade_id);
                  return (
                    <tr key={e.id} className="border-b" style={{ borderColor: 'var(--hairline)' }}>
                      <td className="px-3 py-2 font-bold whitespace-nowrap" style={{ color: 'var(--ink-primary)' }}>{e.codigo}</td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--ink-secondary)' }}>{formatDateBR(e.data)}</td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--ink-secondary)' }}>{e.turno || '—'}</td>
                      <td className="px-3 py-2 font-bold whitespace-nowrap" style={{ color: 'var(--ink-secondary)' }}>KIT-{e.tramo_unidade_id}</td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--ink-secondary)' }}>
                        {t ? `Torre ${String(t.torre_numero).padStart(2, '0')} · ${t.tramo}` : e.tramo}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--ink-secondary)' }}>{e.recebido_por_nome}</td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--ink-muted)' }}>{e.criado_por_nome || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {aberto && (
        <Modal onClose={() => !salvando && setAberto(false)} maxWidth="max-w-lg" ariaLabel="Entregar kit à produção" disableOutsideClose>
          <ModalHeader onClose={() => !salvando && setAberto(false)}>
            <h3 className="text-base font-extrabold" style={{ color: 'var(--ink-primary)' }}>Baixa para a produção</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--ink-muted)' }}>
              O kit sai do buffer e o tramo da torre passa a “Entregue”.
            </p>
          </ModalHeader>

          <ModalBody>
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo rotulo="Data" erro={erros.data}>
                  <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={inputCls(erros.data)} />
                </Campo>
                <Campo rotulo="Turno">
                  <select value={turno} onChange={(e) => setTurno(e.target.value)} className={inputCls()}>
                    {TURNOS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Campo>
              </div>

              <Campo rotulo="Kit a entregar" erro={erros.kit}>
                <select value={kitId} onChange={(e) => setKitId(e.target.value)} className={inputCls(erros.kit)}>
                  <option value="">Escolha um kit pronto…</option>
                  {prontos.map((k) => {
                    const t = tramoPorId.get(k.tramo_unidade_id);
                    return (
                      <option key={k.id} value={k.id}>
                        {k.rastreio}{t ? ` — Torre ${String(t.torre_numero).padStart(2, '0')}` : ''}
                        {k.qualidade_ok === false ? ' (com não-conformidade)' : ''}
                      </option>
                    );
                  })}
                </select>
              </Campo>

              <Campo rotulo="Responsável pelo recebimento na produção" erro={erros.recebido}>
                <input value={recebidoPor} onChange={(e) => setRecebidoPor(e.target.value)} className={inputCls(erros.recebido)} placeholder="Nome de quem recebeu na linha" />
              </Campo>

              <Campo rotulo="Observação (opcional)">
                <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} className={inputCls()} />
              </Campo>
            </div>
          </ModalBody>

          <ModalFooter>
            <button onClick={() => setAberto(false)} disabled={salvando} className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer border disabled:opacity-50" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
              Cancelar
            </button>
            <button
              onClick={() => void salvar()}
              disabled={salvando}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer text-white disabled:opacity-50"
              style={{ background: 'var(--brand)' }}
            >
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
              Confirmar entrega
            </button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
