import React, { useEffect, useMemo, useState } from 'react';
import { History, Save, Trash2 } from 'lucide-react';
import type { ControleEstoqueAnalise } from '../../../lib/controleEstoque';
import { calcularFaixaPlanilha } from '../../../lib/controleEstoque';
import {
  inativarOverrideControleEstoque,
  listarAuditoriaControleEstoque,
  salvarConfigControleEstoque,
  salvarOverrideControleEstoque,
} from '../../../lib/controleEstoqueApi';
import type { ControleEstoqueAuditoria, ControleEstoqueConfig, Profile } from '../../../types';
import { formatBRL, formatQtd } from '../../../lib/almoxarifado';
import { formatDateTimeBR } from '../../../lib/format';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../../ui/Modal';

interface Props {
  user: Profile;
  config: ControleEstoqueConfig | null;
  linha?: ControleEstoqueAnalise | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

const inputClass = 'mt-1 h-10 w-full rounded-lg border px-3 text-sm bg-[var(--surface-card)] border-[var(--hairline)] text-[var(--ink-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/30';

const numeroOuNull = (valor: string) => valor.trim() === '' ? null : Number(valor);

export default function ControleEstoqueParametrosModal({ user, config, linha, onClose, onSaved }: Props) {
  const [modo, setModo] = useState<'GLOBAL' | 'MATERIAL'>(linha ? 'MATERIAL' : 'GLOBAL');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [historico, setHistorico] = useState<ControleEstoqueAuditoria[]>([]);
  const [global, setGlobal] = useState({
    janelaInicio: config?.janela_inicio ?? '2026-03-03',
    janelaFim: config?.janela_fim ?? '',
    lead: String(config?.lead_time_padrao_dias ?? 15),
    intervalo: String(config?.intervalo_compra_dias ?? 30),
  });
  const [material, setMaterial] = useState({
    tipoGestao: linha?.item.tipo_gestao === 'NAO_DEFINIDO' ? '' : linha?.item.tipo_gestao ?? '',
    lead: linha?.item.tem_override && linha.item.lead_time_dias !== null ? String(linha.item.lead_time_dias) : '',
    intervalo: linha?.item.tem_override && linha.item.intervalo_compra_dias !== null ? String(linha.item.intervalo_compra_dias) : '',
    minimo: linha?.item.estoque_minimo_override === null || linha?.item.estoque_minimo_override === undefined ? '' : String(linha.item.estoque_minimo_override),
    maximo: linha?.item.estoque_maximo_override === null || linha?.item.estoque_maximo_override === undefined ? '' : String(linha.item.estoque_maximo_override),
    quantidadeTorre: linha?.item.tem_override && linha.item.quantidade_por_torre !== null ? String(linha.item.quantidade_por_torre) : '',
    justificativa: linha?.item.override_justificativa ?? '',
  });

  const registroHistorico = modo === 'GLOBAL' ? config?.id : linha?.item.override_id;
  useEffect(() => {
    let ativo = true;
    if (!registroHistorico) { setHistorico([]); return; }
    listarAuditoriaControleEstoque(registroHistorico)
      .then(dados => { if (ativo) setHistorico(dados); })
      .catch(() => { if (ativo) setHistorico([]); });
    return () => { ativo = false; };
  }, [registroHistorico]);

  const preview = useMemo(() => {
    if (!linha) return null;
    return calcularFaixaPlanilha({
      consumoTotal: linha.item.consumo_total,
      diasUteis: linha.item.dias_uteis,
      leadTimeDias: numeroOuNull(material.lead) ?? linha.item.lead_time_dias,
      intervaloCompraDias: numeroOuNull(material.intervalo) ?? linha.item.intervalo_compra_dias,
      saldoAtual: linha.item.saldo_reposicao,
      precoUnitario: linha.item.preco_medio_sap,
      quantidadePorTorre: numeroOuNull(material.quantidadeTorre) ?? linha.item.quantidade_por_torre,
      estoqueMinimoManual: numeroOuNull(material.minimo),
      estoqueMaximoManual: numeroOuNull(material.maximo),
    });
  }, [linha, material]);

  const salvar = async () => {
    setSalvando(true);
    setErro(null);
    try {
      if (modo === 'GLOBAL') {
        await salvarConfigControleEstoque({
          id: config?.id,
          centro: config?.centro ?? linha?.item.centro ?? 'TEN2',
          janela_inicio: global.janelaInicio,
          janela_fim: global.janelaFim || null,
          lead_time_padrao_dias: Number(global.lead),
          intervalo_compra_dias: Number(global.intervalo),
        }, user);
      } else if (linha) {
        await salvarOverrideControleEstoque({
          id: linha.item.override_id ?? undefined,
          material: linha.item.material,
          centro: linha.item.centro,
          tipo_gestao: material.tipoGestao || null,
          lead_time_dias: numeroOuNull(material.lead),
          intervalo_compra_dias: numeroOuNull(material.intervalo),
          estoque_minimo: numeroOuNull(material.minimo),
          estoque_maximo: numeroOuNull(material.maximo),
          quantidade_por_torre: numeroOuNull(material.quantidadeTorre),
          justificativa: material.justificativa,
        }, user);
      }
      await onSaved();
      onClose();
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Falha ao salvar os parâmetros.');
    } finally {
      setSalvando(false);
    }
  };

  const inativar = async () => {
    if (!linha?.item.override_id) return;
    setSalvando(true);
    setErro(null);
    try {
      await inativarOverrideControleEstoque(linha.item.override_id, user);
      await onSaved();
      onClose();
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Falha ao inativar o override.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal onClose={onClose} ariaLabel="Parâmetros do Controle de Estoque" maxWidth="max-w-4xl" disableOutsideClose={salvando}>
      <ModalHeader onClose={salvando ? undefined : onClose}>
        <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: 'var(--brand)' }}>Parâmetros auditados</p>
        <h2 className="text-lg font-black" style={{ color: 'var(--ink-primary)' }}>{linha ? `${linha.item.material} · ${linha.item.descricao || ''}` : 'Configuração global'}</h2>
      </ModalHeader>
      <ModalBody className="space-y-5">
        {linha && (
          <div className="inline-flex rounded-lg border p-1" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-sunken)' }}>
            <button type="button" onClick={() => setModo('MATERIAL')} className="rounded-md px-3 py-1.5 text-xs font-bold" style={{ background: modo === 'MATERIAL' ? 'var(--surface-card)' : undefined, color: modo === 'MATERIAL' ? 'var(--brand)' : 'var(--ink-muted)' }}>Override do material</button>
            <button type="button" onClick={() => setModo('GLOBAL')} className="rounded-md px-3 py-1.5 text-xs font-bold" style={{ background: modo === 'GLOBAL' ? 'var(--surface-card)' : undefined, color: modo === 'GLOBAL' ? 'var(--brand)' : 'var(--ink-muted)' }}>Configuração global</button>
          </div>
        )}

        {modo === 'GLOBAL' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-bold" style={{ color: 'var(--ink-secondary)' }}>Início da janela<input type="date" value={global.janelaInicio} onChange={event => setGlobal(atual => ({ ...atual, janelaInicio: event.target.value }))} className={inputClass} /></label>
            <label className="text-xs font-bold" style={{ color: 'var(--ink-secondary)' }}>Fim da janela <span className="font-normal" style={{ color: 'var(--ink-muted)' }}>(vazio = última MB51)</span><input type="date" value={global.janelaFim} min={global.janelaInicio} onChange={event => setGlobal(atual => ({ ...atual, janelaFim: event.target.value }))} className={inputClass} /></label>
            <label className="text-xs font-bold" style={{ color: 'var(--ink-secondary)' }}>Lead time padrão (dias)<input type="number" min="0" step="1" value={global.lead} onChange={event => setGlobal(atual => ({ ...atual, lead: event.target.value }))} className={inputClass} /></label>
            <label className="text-xs font-bold" style={{ color: 'var(--ink-secondary)' }}>Intervalo de compra (dias)<input type="number" min="0" step="1" value={global.intervalo} onChange={event => setGlobal(atual => ({ ...atual, intervalo: event.target.value }))} className={inputClass} /></label>
          </div>
        ) : linha && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-xs font-bold" style={{ color: 'var(--ink-secondary)' }}>Tipo de gestão<input value={material.tipoGestao} onChange={event => setMaterial(atual => ({ ...atual, tipoGestao: event.target.value }))} placeholder="Ex.: ESTOQUE, SOB DEMANDA" className={inputClass} /></label>
              <label className="text-xs font-bold" style={{ color: 'var(--ink-secondary)' }}>Lead time (dias)<input type="number" min="0" value={material.lead} onChange={event => setMaterial(atual => ({ ...atual, lead: event.target.value }))} placeholder={String(config?.lead_time_padrao_dias ?? linha.item.lead_time_dias ?? 15)} className={inputClass} /></label>
              <label className="text-xs font-bold" style={{ color: 'var(--ink-secondary)' }}>Intervalo de compra (dias)<input type="number" min="0" value={material.intervalo} onChange={event => setMaterial(atual => ({ ...atual, intervalo: event.target.value }))} placeholder={String(config?.intervalo_compra_dias ?? linha.item.intervalo_compra_dias ?? 30)} className={inputClass} /></label>
              <label className="text-xs font-bold" style={{ color: 'var(--ink-secondary)' }}>Estoque mínimo manual<input type="number" min="0" value={material.minimo} onChange={event => setMaterial(atual => ({ ...atual, minimo: event.target.value }))} placeholder="Calculado" className={inputClass} /></label>
              <label className="text-xs font-bold" style={{ color: 'var(--ink-secondary)' }}>Estoque máximo manual<input type="number" min="0" value={material.maximo} onChange={event => setMaterial(atual => ({ ...atual, maximo: event.target.value }))} placeholder="Calculado" className={inputClass} /></label>
              <label className="text-xs font-bold" style={{ color: 'var(--ink-secondary)' }}>Quantidade por torre<input type="number" min="0.000001" step="any" value={material.quantidadeTorre} onChange={event => setMaterial(atual => ({ ...atual, quantidadeTorre: event.target.value }))} placeholder="Automática / não cadastrada" className={inputClass} /></label>
            </div>
            <label className="block text-xs font-bold" style={{ color: 'var(--ink-secondary)' }}>Justificativa obrigatória<textarea value={material.justificativa} onChange={event => setMaterial(atual => ({ ...atual, justificativa: event.target.value }))} rows={3} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm bg-[var(--surface-card)] border-[var(--hairline)]" placeholder="Explique a razão operacional do override." /></label>
            {preview && (
              <div className="rounded-xl border p-3" style={{ borderColor: 'var(--brand)', background: 'var(--brand-soft)' }}>
                <p className="text-[10px] font-black uppercase tracking-wider mb-2" style={{ color: 'var(--brand)' }}>Impacto antes de salvar</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 text-xs">
                  <div><span style={{ color: 'var(--ink-muted)' }}>Mínimo</span><p className="font-black">{linha.faixa.estoqueMinimo ?? '—'} → {preview.estoqueMinimo ?? '—'}</p></div>
                  <div><span style={{ color: 'var(--ink-muted)' }}>Máximo</span><p className="font-black">{linha.faixa.estoqueMaximo ?? '—'} → {preview.estoqueMaximo ?? '—'}</p></div>
                  <div><span style={{ color: 'var(--ink-muted)' }}>Comprar</span><p className="font-black">{linha.faixa.quantidadeComprar === null ? '—' : formatQtd(linha.faixa.quantidadeComprar)} → {preview.quantidadeComprar === null ? '—' : formatQtd(preview.quantidadeComprar)}</p></div>
                  <div><span style={{ color: 'var(--ink-muted)' }}>Valor</span><p className="font-black">{linha.faixa.valorComprar === null ? '—' : formatBRL(linha.faixa.valorComprar)} → {preview.valorComprar === null ? '—' : formatBRL(preview.valorComprar)}</p></div>
                  <div><span style={{ color: 'var(--ink-muted)' }}>Status</span><p className="font-black">{linha.faixa.status} → {preview.status}</p></div>
                </div>
              </div>
            )}
          </div>
        )}

        {erro && <div role="alert" className="rounded-lg border px-3 py-2 text-xs font-semibold" style={{ borderColor: 'var(--status-critical)', color: 'var(--status-critical)' }}>{erro}</div>}

        <section>
          <h3 className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-wider" style={{ color: 'var(--ink-primary)' }}><History className="h-4 w-4" /> Histórico</h3>
          {historico.length === 0 ? <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>Ainda não há alterações registradas para este parâmetro.</p> : (
            <div className="space-y-2 max-h-44 overflow-y-auto">
              {historico.map(evento => <div key={evento.id} className="rounded-lg border p-2.5 text-xs" style={{ borderColor: 'var(--hairline)' }}><p className="font-bold">{evento.acao === 'INSERT' ? 'Criação' : 'Alteração'} · {formatDateTimeBR(evento.alterado_em)}</p><p style={{ color: 'var(--ink-muted)' }}>{evento.alterado_por || 'Sistema'}</p></div>)}
            </div>
          )}
        </section>
      </ModalBody>
      <ModalFooter>
        {modo === 'MATERIAL' && linha?.item.override_id && <button type="button" disabled={salvando} onClick={inativar} className="mr-auto inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-50" style={{ borderColor: 'var(--status-critical)', color: 'var(--status-critical)' }}><Trash2 className="h-4 w-4" /> Inativar override</button>}
        <button type="button" disabled={salvando} onClick={onClose} className="rounded-lg border px-4 py-2 text-xs font-bold disabled:opacity-50" style={{ borderColor: 'var(--hairline)' }}>Cancelar</button>
        <button type="button" disabled={salvando} onClick={salvar} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-black text-white disabled:opacity-50" style={{ background: 'var(--brand)' }}><Save className="h-4 w-4" /> {salvando ? 'Salvando...' : 'Salvar e recalcular'}</button>
      </ModalFooter>
    </Modal>
  );
}
