import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { contextoAuditoriaInventario, liberarPreparacaoInventario, solicitarAtualizacaoInventario } from '../../lib/inventarioCiclicoApi';
import type { ContextoAuditoriaInventario } from '../../lib/inventarioAuditoria';
import { formatDateTimeBR } from '../../lib/format';
import { useToast } from '../ui/Toast';

export default function PreparacaoInventario({ inventarioId, gestor, itemId, onContexto }: {
  inventarioId: string; gestor: boolean; itemId?: string;
  onContexto?: (ctx: ContextoAuditoriaInventario | null) => void;
}) {
  const [ctx, setCtx] = useState<ContextoAuditoriaInventario | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [janela, setJanela] = useState(30);
  const [extracao, setExtracao] = useState('');
  const [corte, setCorte] = useState(false);
  const [obs, setObs] = useState('');
  const toast = useToast();
  const carregar = useCallback(async () => {
    try { const r = await contextoAuditoriaInventario(inventarioId); setCtx(r); onContexto?.(r); setErro(''); }
    catch (e) { setCtx(null); onContexto?.(null); setErro(e instanceof Error ? e.message : 'Falha ao verificar preparação.'); }
  }, [inventarioId, onContexto]);
  useEffect(() => { void carregar(); const t = setInterval(() => void carregar(), 30000); return () => clearInterval(t); }, [carregar]);
  async function executar(fn: () => Promise<void>, mensagem: string) {
    setOcupado(true);
    try { await fn(); toast.success(mensagem); await carregar(); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Falha na preparação.'); }
    finally { setOcupado(false); }
  }
  const pendencias = ctx?.pendencias.filter(p => !itemId || p.item_id === itemId) ?? [];
  const p = ctx?.preparacao;
  const input = 'w-full rounded-lg border p-2 text-xs bg-[var(--surface-raised)] border-[var(--hairline)]';
  return <section className="space-y-2 rounded-xl border p-3 text-xs" style={{ borderColor: ctx?.pronta && !pendencias.length ? 'var(--status-good)' : 'var(--status-serious)', color: 'var(--ink-primary)' }} aria-label="Preparação da contagem">
    <div className="flex items-center justify-between gap-2"><strong>Antes de contar: atualização e corte</strong><button type="button" onClick={() => void carregar()} aria-label="Verificar preparação"><RefreshCw className="h-4 w-4" /></button></div>
    {erro && <p role="alert" className="text-rose-600">{erro}</p>}
    {!ctx && !erro && <p>Verificando preparação…</p>}
    {ctx && <>
      <p>{ctx.pronta ? `Rodada liberada até ${formatDateTimeBR(p!.valida_ate!)}. Confirme que não houve movimentação durante a contagem.` : ctx.motivo}</p>
      <p>Última carga: {ctx.base ? formatDateTimeBR(ctx.base.updated_at) : 'Não identificada'}{p?.extracao_em && ` · Extração SAP: ${formatDateTimeBR(p.extracao_em)}`}</p>
      <p>A hora da importação não prova a hora da extração. Interrompa a contagem se houver entrada, saída ou transferência; regularize e solicite nova atualização.</p>
      {!!pendencias.length && <div role="alert" className="rounded-lg bg-amber-50 p-2 text-amber-900"><strong>Regularizar antes da contagem:</strong><ul className="mt-1 list-disc pl-4">{pendencias.slice(0, 20).map((d, i) => <li key={`${d.codigo}-${i}`}>{d.codigo} · {d.material}: {d.motivo}</li>)}</ul><a href="/pendencias" className="mt-1 inline-block underline">Abrir Pendências</a>{pendencias.length > 20 && <p>Mais {pendencias.length - 20} pendências. Consulte o painel completo.</p>}</div>}
      {(!p || p.liberado_em) && <div className="flex flex-wrap items-end gap-2"><label>Janela da rodada (min)<input className={input} type="number" min={5} max={120} value={janela} onChange={e => setJanela(Number(e.target.value))} /></label><button disabled={ocupado || janela < 5 || janela > 120} onClick={() => void executar(() => solicitarAtualizacaoInventario(inventarioId, janela), 'Atualização solicitada à gestão.')} className="rounded-lg border px-3 py-2 font-bold disabled:opacity-50">{ocupado && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />}Solicitar atualização à gestão</button></div>}
      {gestor && p && !p.liberado_em && <div className="space-y-2 border-t pt-3" style={{ borderColor: 'var(--hairline)' }}>
        <strong>Gestão: importar nova ZL0024 após {formatDateTimeBR(p.solicitado_em)}</strong>
        <a href="/almoxarifado/estoque" className="ml-2 underline">Abrir Estoque / importar ZL0024</a>
        <label className="block">Hora real da extração no SAP<input type="datetime-local" step="1" value={extracao} onChange={e => setExtracao(e.target.value)} className={input} /></label>
        <label className="flex items-start gap-2"><input type="checkbox" checked={corte} onChange={e => setCorte(e.target.checked)} />Movimentações do escopo conciliadas até o corte e suspensas/controladas durante a rodada.</label>
        <label className="block">Evidência do corte / responsável / documentos verificados<textarea value={obs} onChange={e => setObs(e.target.value)} className={input} minLength={10} /></label>
        <button disabled={ocupado || !corte || !extracao || obs.trim().length < 10} onClick={() => void executar(() => liberarPreparacaoInventario(p.id, new Date(extracao).toISOString(), obs), 'Rodada liberada com referência de saldo preservada.')} className="rounded-lg px-3 py-2 font-bold text-white disabled:opacity-50" style={{ background: 'var(--brand)' }}>Liberar rodada</button>
      </div>}
    </>}
  </section>;
}
