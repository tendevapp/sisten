/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Janela suspensa com os campos preenchidos na Nova Solicitação — mesma
 * informação do formulário de origem, sem precisar abrir a edição.
 */

import React, { useEffect, useState } from 'react';
import { X, FileText } from 'lucide-react';
import { Request, RequestItem, Sector, SupPendenciaProcessamentoNF } from '../types';
import { formatBRL, formatDateBR, formatDateTimeBR, EMPTY } from '../lib/format';
import { rotuloTipo, rotuloCriticidade } from '../lib/solicitacoes';
import { isChamadoSuprimentosPendencia, camposExibicao, rotuloNumero } from '../lib/supPendenciasProcessamento';
import { listarPendenciasPorRequest } from '../lib/supPendenciasApi';
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

  // Chamados "Pendência de Processamento" e "Ajuste de Pedido": os dados vivem
  // em tabela própria — aqui o solicitante acompanha, sem editar, a baixa pelo
  // Suprimentos (e, no ajuste, a imagem anexada).
  const [pendencias, setPendencias] = useState<SupPendenciaProcessamentoNF[]>([]);
  useEffect(() => {
    if (!isChamadoSuprimentosPendencia(r)) return;
    let vivo = true;
    listarPendenciasPorRequest(r.id).then(linhas => { if (vivo) setPendencias(linhas); });
    return () => { vivo = false; };
  }, [r.id, r.type, r.category_id]);

  const [imagensAjusteUrls, setImagensAjusteUrls] = useState<{ url: string; path: string }[]>([]);
  useEffect(() => {
    const linha = pendencias.find(p => p.modelo === 'ajuste_pedido');
    const paths = linha?.imagem_paths?.length ? linha.imagem_paths : (linha?.imagem_path ? [linha.imagem_path] : []);
    if (paths.length === 0) { setImagensAjusteUrls([]); return; }
    let vivo = true;
    Promise.all(paths.map(p => localDb.getAttachmentUrl(p))).then(urls => {
      if (!vivo) return;
      // O caminho acompanha a URL assinada: é a extensão dele que diz se o
      // anexo é PDF (a URL assinada não carrega o tipo).
      setImagensAjusteUrls(
        urls.map((url, i) => ({ url: url || '', path: paths[i] })).filter(a => a.url),
      );
    });
    return () => { vivo = false; };
  }, [pendencias]);

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

          {pendencias[0] && (pendencias[0].classif_causa || pendencias[0].classif_responsavel || pendencias[0].classif_impacto || pendencias[0].classif_recorrencia || pendencias[0].observacao_chamado) && (
            <Section title="Classificação da demanda">
              {pendencias[0].classif_causa && <Field label="Causa provável" value={pendencias[0].classif_causa} />}
              {pendencias[0].classif_responsavel && <Field label="Área responsável" value={pendencias[0].classif_responsavel} />}
              {pendencias[0].classif_impacto && <Field label="Impacto" value={pendencias[0].classif_impacto} />}
              {pendencias[0].classif_recorrencia && <Field label="Recorrência" value={pendencias[0].classif_recorrencia} />}
              {pendencias[0].observacao_chamado && <Field label="Observação" value={pendencias[0].observacao_chamado} />}
            </Section>
          )}

          {isChamadoSuprimentosPendencia(r) && pendencias.length > 0 && (
            <div className="space-y-2 pt-3 border-t" style={{ borderColor: 'var(--hairline)' }}>
              <h4 className="text-[10px] font-bold uppercase tracking-wider flex items-center justify-between" style={{ color: 'var(--ink-muted)' }}>
                <span>
                  {pendencias[0].modelo === 'documento' ? 'Lançamentos' : pendencias[0].modelo === 'ajuste_pedido' ? 'Ajuste de Pedido' : 'Notas fiscais'}
                  {pendencias[0].modelo !== 'ajuste_pedido' && ` (${pendencias.length})`}
                </span>
                <span>{pendencias.filter(p => p.status === 'concluido').length}/{pendencias.length} concluído(s)</span>
              </h4>
              <div className="space-y-2">
                {pendencias.map(p => (
                  <div
                    key={p.id}
                    className="rounded-lg border p-3 space-y-1.5"
                    style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold font-mono" style={{ color: 'var(--ink-primary)' }}>
                        {rotuloNumero(p.modelo)} {p.numero_nfse}
                      </span>
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase"
                        style={
                          p.status === 'concluido'
                            ? { background: 'color-mix(in srgb, var(--status-good) 15%, transparent)', color: 'var(--status-good)' }
                            : { background: 'var(--surface-sunken)', color: 'var(--ink-muted)' }
                        }
                      >
                        {p.status === 'concluido' ? 'Concluído' : 'Pendente'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {camposExibicao(p)
                        .filter(f => f.label !== 'Documento' && f.label !== 'Número da NFS-e' && f.label !== 'Número da NF' && f.value)
                        .map(f => <Field key={f.label} label={f.label} value={f.value} />)}
                      {p.status === 'concluido' && p.resolucao && <Field label="Resolução" value={p.resolucao} />}
                      {p.status === 'concluido' && p.resolvido_em && (
                        <Field label="Baixado em" value={formatDateTimeBR(p.resolvido_em)} />
                      )}
                      {p.status === 'concluido' && (p.resolvido_por || (p.historico_acoes && p.historico_acoes.length > 0)) && (
                        <Field
                          label="Baixado por"
                          value={
                            p.historico_acoes?.slice(-1)[0]?.usuario_nome ||
                            localDb.getProfiles().find(u => u.id === p.resolvido_por)?.name ||
                            'Suprimentos'
                          }
                        />
                      )}
                    </div>
                    {p.modelo === 'ajuste_pedido' && imagensAjusteUrls.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {imagensAjusteUrls.map(({ url, path }, i) => (
                          path.toLowerCase().endsWith('.pdf') ? (
                            <a
                              key={url}
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold"
                              style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
                            >
                              <FileText className="h-4 w-4" style={{ color: 'var(--status-critical)' }} />
                              {path.split('/').pop()}
                            </a>
                          ) : (
                            <a key={url} href={url} target="_blank" rel="noreferrer">
                              <img
                                src={url}
                                alt={`Anexo ${i + 1} do ajuste de pedido`}
                                className="max-h-40 rounded-lg border object-contain"
                                style={{ borderColor: 'var(--hairline)' }}
                              />
                            </a>
                          )
                        ))}
                      </div>
                    )}
                    {p.modelo === 'ajuste_pedido' && imagensAjusteUrls.length === 0 && (p.imagem_paths?.length || p.imagem_path) && (
                      <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>Carregando anexos…</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
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
