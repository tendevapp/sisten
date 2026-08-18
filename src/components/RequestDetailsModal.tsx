/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Janela suspensa com os campos preenchidos na Nova Solicitação — mesma
 * informação do formulário de origem, sem precisar abrir a edição.
 */

import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { Request, RequestItem, Sector } from '../types';
import { formatBRL, formatDateBR, EMPTY } from '../lib/format';
import { rotuloTipo, rotuloCriticidade } from '../lib/solicitacoes';
import { localDb } from '../db/localDb';

interface RequestDetailsModalProps {
  request: Request;
  items: RequestItem[];
  sectors: Sector[];
  onClose: () => void;
}

const Field = ({ label, value }: { label: string; value?: React.ReactNode }) => (
  <div className="space-y-0.5">
    <span className="text-[10px] font-bold uppercase tracking-wider block" style={{ color: 'var(--ink-muted)' }}>
      {label}
    </span>
    <span className="text-xs font-semibold" style={{ color: 'var(--ink-primary)' }}>
      {value || EMPTY}
    </span>
  </div>
);

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="space-y-2 pt-3 border-t first:border-t-0 first:pt-0" style={{ borderColor: 'var(--hairline)' }}>
    <h4 className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>
      {title}
    </h4>
    <div className="grid grid-cols-2 gap-3">{children}</div>
  </div>
);

/**
 * Cadastro SAP não tem campos próprios pra nome/specs no banco: eles vêm
 * compostos em `justificativa` na criação (ver NewRequest.handleSubmit). O
 * parse reverso é o mesmo usado lá para reabrir o formulário em modo edição.
 */
function parseCadastroSapJustificativa(texto: string, tipo?: 'Item' | 'Fornecedor') {
  const itemMatch = texto.match(/^Nome: (.*?)\. Specs: (.*?)\. Justificativa: ([\s\S]*)$/);
  const fornecedorMatch = itemMatch ? null : texto.match(/^Nome: (.*?)\. Justificativa: ([\s\S]*)$/);
  if (itemMatch) return { nome: itemMatch[1], specs: itemMatch[2], justificativa: itemMatch[3] };
  if (fornecedorMatch) return { nome: fornecedorMatch[1], specs: '', justificativa: fornecedorMatch[2] };
  return { nome: '', specs: '', justificativa: texto };
}

export default function RequestDetailsModal({ request: r, items, sectors, onClose }: RequestDetailsModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const nomeSetor = (id?: string) => (id && sectors.find(s => s.id === id)?.name) || id || EMPTY;

  // `comprador_id` guarda o profile id do grupo primário (ou, na falta dele,
  // o próprio código do grupo) — ver NewRequest.handleSubmit. Resolve para o
  // nome exibido no formulário de origem.
  const nomeComprador = (compradorId?: string) => {
    if (!compradorId) return EMPTY;
    const buyerGroups = localDb.getBuyerGroups();
    const compradores = localDb.getCompradores();
    const grupo = buyerGroups.find(bg => bg.user_id === compradorId)?.group_code || compradorId;
    const comprador = compradores.find(c => c.grupo_compras === grupo);
    return comprador ? `${comprador.nome_comprador} (${grupo})` : compradorId;
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const cadastroSap = r.type === 'cadastro_sap'
    ? parseCadastroSapJustificativa(r.justificativa || '', r.registration_type)
    : null;

  return (
    <div
      onClick={handleOverlayClick}
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="request-details-title"
    >
      <div
        className="w-full max-w-lg max-h-[85vh] rounded-xl border shadow-2xl flex flex-col overflow-hidden animate-scale-up"
        style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}
      >
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--hairline)' }}>
          <div>
            <h3 id="request-details-title" className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>
              Detalhes da Solicitação #{r.number}
            </h3>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-muted)' }}>
              Campos preenchidos na abertura da solicitação
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg cursor-pointer"
            style={{ color: 'var(--ink-muted)' }}
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          <Section title="Identificação">
            <Field label="Tipo" value={rotuloTipo(r.type)} />
            <Field label="Criticidade" value={rotuloCriticidade(r.criticality)} />
            <Field label="Solicitante" value={r.solicitante_name} />
            <Field label="Setor Solicitante" value={nomeSetor(r.solicitante_sector_id)} />
            <Field label="Aberta em" value={formatDateBR(r.created_at)} />
          </Section>

          {r.type === 'compra' && (
            <Section title="Compra">
              <Field label="Comprador" value={nomeComprador(r.comprador_id)} />
              <Field label="Tipo de Compra" value={r.tipo_compra} />
              <Field label="Prazo de Necessidade" value={r.data_necessidade ? formatDateBR(r.data_necessidade) : undefined} />
            </Section>
          )}

          {r.type === 'compra' && items.length > 0 && (
            <div className="space-y-2 pt-3 border-t" style={{ borderColor: 'var(--hairline)' }}>
              <h4 className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>
                Itens ({items.length})
              </h4>
              <div className="space-y-2">
                {items.map((it, idx) => (
                  <div
                    key={it.id}
                    className="rounded-lg border p-3 space-y-2"
                    style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--ink-muted)' }}>
                      Item {idx + 1}
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Código SAP" value={it.sap_code} />
                      <Field label="Descrição" value={it.description} />
                      <Field label="Quantidade" value={`${it.quantity} ${it.unit}`} />
                      <Field label="Marca" value={it.brand} />
                      <Field label="Item Genérico" value={it.is_generic ? 'Sim' : 'Não'} />
                      <Field label="Aceita Similar" value={it.is_similar_allowed ? 'Sim' : 'Não'} />
                      <Field label="Fornecedor Sugerido" value={it.suggested_supplier} />
                      <Field label="Valor Estimado" value={it.estimated_value ? formatBRL(it.estimated_value) : undefined} />
                      {it.observation && <Field label="Observação" value={it.observation} />}
                      {it.reference_link && <Field label="Link de Referência" value={it.reference_link} />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {r.type === 'cadastro_sap' && cadastroSap && (
            <Section title={`Cadastro SAP — ${r.registration_type || 'Item'}`}>
              <Field label={r.registration_type === 'Fornecedor' ? 'Razão Social / Nome Fantasia' : 'Nome / Descrição'} value={cadastroSap.nome} />
              <Field label={r.registration_type === 'Fornecedor' ? 'CNPJ / Site' : 'Fabricante'} value={r.brand} />
              {r.registration_type !== 'Fornecedor' && (
                <>
                  <Field label="Especificações Técnicas" value={cadastroSap.specs} />
                  <Field label="Fornecedor de Referência" value={r.suggested_supplier} />
                </>
              )}
              {r.registration_type === 'Fornecedor' && (
                <>
                  <Field label="Representante / Contato" value={r.suggested_supplier} />
                  <Field label="Nome do Representante" value={r.representante_nome} />
                  <Field label="Cargo" value={r.representante_cargo} />
                  <Field label="Telefone" value={r.representante_telefone} />
                  <Field label="E-mail" value={r.representante_email} />
                </>
              )}
            </Section>
          )}

          {r.type === 'chamado' && (
            <Section title="Chamado">
              <Field label="Setor de Destino" value={nomeSetor(r.target_sector_id)} />
              <Field label="Categoria" value={r.category_id} />
              <Field label="Local" value={r.local} />
              {r.titulo && <Field label="Título" value={r.titulo} />}
              {r.contrato_tipo && <Field label="Tipo de Contrato" value={r.contrato_tipo} />}
              {r.fornecedor_terceiro && <Field label="Fornecedor" value={r.fornecedor_terceiro} />}
            </Section>
          )}

          {(r.type === 'chamado' || (r.type === 'cadastro_sap' && cadastroSap)) && (
            <div className="space-y-1 pt-3 border-t" style={{ borderColor: 'var(--hairline)' }}>
              <h4 className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>
                Justificativa
              </h4>
              <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--ink-secondary)' }}>
                {(r.type === 'cadastro_sap' ? cadastroSap?.justificativa : r.justificativa) || EMPTY}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
