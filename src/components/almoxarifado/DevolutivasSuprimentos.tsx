/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Almoxarifado > Devolutivas de Suprimentos.
 *
 * O outro lado das Pendências de Recebimento: o comprador do PO decidiu o que
 * fazer com a avaria/falta/parcial e o almoxarifado confirma que executou
 * (deu entrada, devolveu, separou). A confirmação funciona sem rede — entra
 * na fila (`configFormularios.ts`) e o comprador é avisado quando sobe.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { CheckCheck, Loader2 } from 'lucide-react';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import PendenciaRecebimentoCartao, { ChipMotivo } from '../suprimentos/PendenciaRecebimentoCartao';
import { ehRespostaOffline } from '../../lib/offline/configFormularios';
import { instrucaoAlmox, rotuloDecisao, type PendenciaRecebimento } from '../../lib/pendenciasRecebimento';
import { executarPendencias } from '../../lib/pendenciasRecebimentoApi';

function Secao({ titulo, subtitulo, children }: { titulo: string; subtitulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-sm font-extrabold" style={{ color: 'var(--ink-primary)' }}>{titulo}</h3>
        <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>{subtitulo}</p>
      </div>
      <div className="rounded-xl border overflow-hidden divide-y" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
        {children}
      </div>
    </section>
  );
}

export default function DevolutivasSuprimentos({
  lista, loading, destaqueId, onExecutado,
}: {
  lista: PendenciaRecebimento[];
  loading: boolean;
  destaqueId?: string | null;
  onExecutado: () => void | Promise<void>;
}) {
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [confirmar, setConfirmar] = useState<PendenciaRecebimento[] | null>(null);

  const executar = useMemo(() => lista.filter((p) => p.status === 'aguardando_almox'), [lista]);
  const aguardando = useMemo(() => lista.filter((p) => p.status === 'aguardando_comprador'), [lista]);
  const concluidas = useMemo(() => lista.filter((p) => p.status === 'concluida'), [lista]);
  const marcados = executar.filter((p) => selecionados.has(p.id));

  useEffect(() => {
    if (!destaqueId) return;
    const t = setTimeout(() => document.getElementById(`pend-${destaqueId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
    return () => clearTimeout(t);
  }, [destaqueId, lista]);

  const alternar = (id: string) => setSelecionados((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  if (loading && lista.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm" style={{ color: 'var(--ink-muted)' }}>
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando devolutivas…
      </div>
    );
  }

  if (lista.length === 0) {
    return (
      <div className="rounded-xl border py-14 text-center text-sm" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}>
        Nenhuma pendência com Suprimentos. Avaria, falta e entrega parcial da conferência abrem uma automaticamente.
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      {executar.length > 0 && (
        <Secao titulo={`Para executar (${executar.length})`} subtitulo="O comprador já decidiu. Faça o que a decisão pede e confirme.">
          {executar.map((p) => (
            <PendenciaRecebimentoCartao
              key={p.id}
              p={p}
              destacar={p.id === destaqueId}
              selecionavel
              selecionado={selecionados.has(p.id)}
              onAlternar={() => alternar(p.id)}
              acoes={(
                <button
                  type="button"
                  onClick={() => setConfirmar([p])}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white"
                  style={{ background: 'var(--status-good)' }}
                >
                  <CheckCheck className="h-3.5 w-3.5" /> Confirmar execução
                </button>
              )}
            />
          ))}
        </Secao>
      )}

      {aguardando.length > 0 && (
        <Secao titulo={`Aguardando Suprimentos (${aguardando.length})`} subtitulo="Ainda sem decisão do comprador — segure o material até a resposta.">
          {aguardando.map((p) => (
            <PendenciaRecebimentoCartao
              key={p.id}
              p={p}
              destacar={p.id === destaqueId}
              acoes={<span className="text-[11px] font-semibold" style={{ color: 'var(--ink-muted)' }}>Comprador: {p.comprador_nome || 'não identificado'}</span>}
            />
          ))}
        </Secao>
      )}

      {concluidas.length > 0 && (
        <Secao titulo={`Concluídas nos últimos 7 dias (${concluidas.length})`} subtitulo="Histórico recente.">
          {concluidas.map((p) => <PendenciaRecebimentoCartao key={p.id} p={p} destacar={p.id === destaqueId} />)}
        </Secao>
      )}

      {marcados.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t px-4 py-3 shadow-lg" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>{marcados.length} selecionada(s)</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setSelecionados(new Set())} className="rounded-lg border px-3 py-1.5 text-xs font-bold" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
                Limpar
              </button>
              <button type="button" onClick={() => setConfirmar(marcados)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white" style={{ background: 'var(--status-good)' }}>
                <CheckCheck className="h-3.5 w-3.5" /> Confirmar execução
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmar && (
        <ModalExecucao
          itens={confirmar}
          onClose={() => setConfirmar(null)}
          onFeito={async () => { setConfirmar(null); setSelecionados(new Set()); await onExecutado(); }}
        />
      )}
    </div>
  );
}

function ModalExecucao({
  itens, onClose, onFeito,
}: { itens: PendenciaRecebimento[]; onClose: () => void; onFeito: () => void }) {
  const toast = useToast();
  const [obs, setObs] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const enviar = async () => {
    setEnviando(true);
    try {
      const r = await executarPendencias(itens.map((p) => p.id), obs);
      if (ehRespostaOffline(r)) toast.info('Sem rede: a confirmação ficou na fila e sobe quando a conexão voltar.');
      else toast.success(`${r?.concluidas ?? itens.length} pendência(s) concluída(s). O comprador foi avisado.`);
      onFeito();
    } catch (err: any) {
      setErro(err?.message || 'Falha ao confirmar a execução.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-lg" ariaLabel="Confirmar execução">
      <ModalHeader onClose={onClose}>
        <h3 className="text-base font-bold" style={{ color: 'var(--ink-primary)' }}>Confirmar execução</h3>
        <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>{itens.length} pendência(s) · o comprador é avisado</p>
      </ModalHeader>
      <ModalBody className="space-y-3">
        <ul className="space-y-2">
          {itens.map((p) => (
            <li key={p.id} className="rounded-lg border px-3 py-2 text-xs space-y-0.5" style={{ borderColor: 'var(--hairline)' }}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono font-bold" style={{ color: 'var(--ink-muted)' }}>{p.codigo}</span>
                <ChipMotivo motivo={p.motivo} />
                <span style={{ color: 'var(--ink-secondary)' }}>{p.material_code ? `${p.material_code} · ` : ''}{p.descricao}</span>
              </div>
              {p.decisao && (
                <div style={{ color: 'var(--ink-primary)' }}>
                  <span className="font-bold">{rotuloDecisao(p.decisao, p.motivo)}</span> — {instrucaoAlmox(p.decisao)}
                </div>
              )}
            </li>
          ))}
        </ul>
        <label className="block">
          <span className="mb-1 block text-xs font-bold" style={{ color: 'var(--ink-muted)' }}>Observação (opcional)</span>
          <textarea
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            rows={3}
            className="w-full rounded-lg border py-2 px-3 text-sm border-[var(--hairline)] bg-[var(--surface-raised)] text-[var(--ink-primary)]"
            placeholder="Ex.: MIGO 5000123456; devolução com NF 7788 coletada pela transportadora."
          />
        </label>
        {erro && <p className="text-xs font-semibold" style={{ color: 'var(--status-critical)' }}>{erro}</p>}
      </ModalBody>
      <ModalFooter>
        <button type="button" onClick={onClose} className="rounded-lg border px-3 py-1.5 text-xs font-bold" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
          Voltar
        </button>
        <button
          type="button"
          onClick={() => void enviar()}
          disabled={enviando}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
          style={{ background: 'var(--status-good)' }}
        >
          {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />} Confirmar
        </button>
      </ModalFooter>
    </Modal>
  );
}
