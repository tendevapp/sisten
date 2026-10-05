/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cartão de uma pendência de recebimento — o mesmo nos dois lados:
 * Suprimentos (decide) e Almoxarifado (executa). Quem usa passa as ações.
 */

import React, { useEffect, useState } from 'react';
import { CheckSquare, ChevronDown, ChevronUp, History, Square } from 'lucide-react';
import { useLightbox } from '../ui/Lightbox';
import { assinarEvidencias } from '../../lib/recebimentoAlmoxApi';
import { formatDateTimeBR } from '../../lib/format';
import {
  ROTULO_MOTIVO,
  ROTULO_STATUS,
  atrasada,
  diferencaQtd,
  instrucaoAlmox,
  rotuloDecisao,
  rotuloIdade,
  saldoAntesDaEntrega,
  type MotivoPendencia,
  type PendenciaRecebimento,
  type StatusPendencia,
} from '../../lib/pendenciasRecebimento';

type Tom = 'ok' | 'atencao' | 'alerta' | 'neutro' | 'info';

const COR: Record<Tom, string> = {
  ok: 'var(--status-good)',
  atencao: 'var(--status-serious)',
  alerta: 'var(--status-critical)',
  neutro: 'var(--ink-muted)',
  info: 'var(--brand)',
};

export function Chip({ texto, tom }: { texto: string; tom: Tom }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide whitespace-nowrap"
      style={{ background: `color-mix(in srgb, ${COR[tom]} 14%, transparent)`, color: COR[tom] }}
    >
      {texto}
    </span>
  );
}

const TOM_STATUS: Record<StatusPendencia, Tom> = {
  aguardando_comprador: 'alerta',
  aguardando_almox: 'atencao',
  concluida: 'ok',
  cancelada: 'neutro',
};

/** Parcial é âmbar no recebimento (distinto de divergência); o resto é NC. */
const TOM_MOTIVO: Record<MotivoPendencia, Tom> = {
  parcial: 'atencao', falta: 'alerta', excedente: 'info', avaria: 'alerta',
  material_errado: 'alerta', sem_pedido: 'info', outros: 'neutro',
};

export const ChipStatus = ({ status }: { status: StatusPendencia }) => <Chip texto={ROTULO_STATUS[status]} tom={TOM_STATUS[status]} />;
export const ChipMotivo = ({ motivo }: { motivo: MotivoPendencia }) => <Chip texto={ROTULO_MOTIVO[motivo]} tom={TOM_MOTIVO[motivo]} />;

const fmtQtd = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 });

function Fotos({ paths }: { paths: string[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const lightbox = useLightbox();
  useEffect(() => {
    let vivo = true;
    assinarEvidencias(paths).then((m) => { if (vivo) setUrls(m); }).catch(() => undefined);
    return () => { vivo = false; };
  }, [paths.join('|')]);

  const imagens = paths.filter((p) => !p.toLowerCase().endsWith('.pdf') && urls[p]);
  if (imagens.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {imagens.map((p, i) => (
        <button
          key={p}
          type="button"
          onClick={() => lightbox.abrir(imagens.map((x) => urls[x]), i)}
          className="h-14 w-14 overflow-hidden rounded-lg border"
          style={{ borderColor: 'var(--hairline)' }}
          aria-label={`Foto ${i + 1} do recebimento`}
        >
          <img src={urls[p]} alt="" className="h-full w-full object-cover" loading="lazy" />
        </button>
      ))}
      {lightbox.elemento}
    </div>
  );
}

function Qtd({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--ink-muted)' }}>{rotulo}</div>
      <div className="text-sm font-bold tabular-nums" style={{ color: destaque || 'var(--ink-primary)' }}>{valor}</div>
    </div>
  );
}

export default function PendenciaRecebimentoCartao({
  p, selecionavel = false, selecionado = false, onAlternar, destacar = false, acoes,
}: {
  p: PendenciaRecebimento;
  selecionavel?: boolean;
  selecionado?: boolean;
  onAlternar?: () => void;
  destacar?: boolean;
  acoes?: React.ReactNode;
}) {
  const [verHistorico, setVerHistorico] = useState(false);
  const dif = diferencaQtd(p);
  const saldo = saldoAntesDaEntrega(p);
  const atraso = atrasada(p);
  const fotos = (p.evidencias || []).map((e) => e.path).filter(Boolean);
  const un = p.unidade ? ` ${p.unidade}` : '';

  return (
    <div
      id={`pend-${p.id}`}
      className="p-3.5 sm:p-4 space-y-3 transition-colors"
      style={{
        boxShadow: `inset 3px 0 0 0 ${COR[TOM_STATUS[p.status]]}`,
        background: destacar ? 'color-mix(in srgb, var(--brand) 7%, transparent)' : undefined,
      }}
    >
      <div className="flex items-start gap-3">
        {selecionavel && (
          <button
            type="button"
            onClick={onAlternar}
            aria-label={selecionado ? 'Tirar da seleção' : 'Selecionar'}
            className="mt-0.5 shrink-0"
            style={{ color: selecionado ? 'var(--brand)' : 'var(--ink-muted)' }}
          >
            {selecionado ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
          </button>
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>{p.codigo}</span>
            <ChipMotivo motivo={p.motivo} />
            <ChipStatus status={p.status} />
            {atraso && <Chip texto="Atrasada" tom="alerta" />}
            <span className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>{rotuloIdade(p.created_at)}</span>
          </div>
          <div className="text-sm font-semibold leading-snug" style={{ color: 'var(--ink-primary)' }}>
            {p.material_code && <span className="font-mono mr-1.5" style={{ color: 'var(--ink-secondary)' }}>{p.material_code}</span>}
            {p.descricao || 'Sem descrição'}
          </div>
          <div className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
            {[p.conferencia_codigo, p.nc_codigo, p.aberto_por_nome && `por ${p.aberto_por_nome}`].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>

      {p.origem === 'conferencia' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-lg px-3 py-2" style={{ background: 'var(--surface-raised)' }}>
          <Qtd rotulo="Pedido" valor={fmtQtd(p.qtd_pedido) + un} />
          <Qtd rotulo="Saldo antes" valor={fmtQtd(saldo) + un} />
          <Qtd rotulo="Recebido" valor={fmtQtd(p.qtd_recebida) + un} />
          <Qtd
            rotulo={dif !== null && dif > 0 ? 'Sobrou' : 'Faltou'}
            valor={dif === null ? '—' : fmtQtd(Math.abs(dif)) + un}
            destaque={dif === null ? undefined : dif > 0 ? 'var(--brand)' : 'var(--status-critical)'}
          />
        </div>
      )}

      {p.observacao_almox && (
        <p className="text-xs leading-relaxed rounded-lg px-3 py-2" style={{ color: 'var(--ink-secondary)', background: 'var(--surface-raised)' }}>
          <span className="font-bold">Almoxarifado: </span>{p.observacao_almox}
        </p>
      )}

      {fotos.length > 0 && <Fotos paths={fotos} />}

      {p.decisao && (
        <div className="rounded-lg border px-3 py-2 space-y-1" style={{ borderColor: 'color-mix(in srgb, var(--status-serious) 35%, transparent)' }}>
          <div className="text-xs font-bold" style={{ color: 'var(--ink-primary)' }}>
            {rotuloDecisao(p.decisao, p.motivo)}{p.pedido_vinculado ? ` — PO ${p.pedido_vinculado}` : ''}
          </div>
          {p.decisao_obs && <div className="text-xs" style={{ color: 'var(--ink-secondary)' }}>{p.decisao_obs}</div>}
          {p.status === 'aguardando_almox' && (
            <div className="text-[11px] font-semibold" style={{ color: 'var(--status-serious)' }}>{instrucaoAlmox(p.decisao)}</div>
          )}
          <div className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
            {p.decidido_por_nome}{p.decidido_em ? ` · ${formatDateTimeBR(p.decidido_em)}` : ''}
          </div>
          {p.status === 'concluida' && (
            <div className="text-[11px]" style={{ color: 'var(--status-good)' }}>
              Executado por {p.executado_por_nome || '—'}{p.executado_em ? ` · ${formatDateTimeBR(p.executado_em)}` : ''}
              {p.execucao_obs ? ` — ${p.execucao_obs}` : ''}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setVerHistorico((v) => !v)}
          className="inline-flex items-center gap-1 text-[11px] font-bold"
          style={{ color: 'var(--ink-muted)' }}
        >
          <History className="h-3.5 w-3.5" /> Histórico ({p.historico?.length ?? 0})
          {verHistorico ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
      </div>

      {verHistorico && (
        <ol className="space-y-1.5 border-l pl-3" style={{ borderColor: 'var(--hairline)' }}>
          {(p.historico || []).map((e, i) => (
            <li key={i} className="text-[11px] leading-snug" style={{ color: 'var(--ink-secondary)' }}>
              <span className="font-bold">{formatDateTimeBR(e.em)}</span>
              {e.por_nome ? ` · ${e.por_nome}` : ''} — {e.texto}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
