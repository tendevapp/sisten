/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Ficha do fornecedor: o que o próximo comprador precisa ver antes de emitir
 * um PO — números do período (ZL0132), recados dos colegas, ocorrências e a
 * última avaliação FRM.SUP-0005. Daqui sai o relatório em PDF para o fornecedor.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2, ClipboardCheck, ClipboardList, FileDown, Loader2, MessageSquareQuote,
} from 'lucide-react';
import type { Profile } from '../../../types';
import Modal, { ModalBody, ModalHeader } from '../../ui/Modal';
import PdfPreviewModal from '../../ui/PdfPreviewModal';
import {
  CATEGORIA_POR_ID, DECISOES_FRM, faixaDaNota, otd, subtrairMeses, taxaPedidosComOcorrencia,
  type CategoriaOcorrencia, type LinhaPainel,
} from '../../../lib/avaliacaoFornecedores';
import {
  carregarPainel, listarRegistros,
  type AvaliacaoFrm, type FornecedorOpcao, type RegistroOcorrencia,
} from '../../../lib/avaliacaoFornecedoresApi';
import { gerarPdfRelatorioFornecedor } from '../../../lib/pdfExport/exportAvaliacaoFornecedorPdf';
import { formatBRLCompacto, formatInt } from '../../../lib/format';
import { formatarDataBR, hojeISO } from '../../../lib/fichaEpi';
import { podeEditarFormulario } from '../../../lib/permissoesFormularios';
import { Estrelas, Etiqueta, formatarCnpj } from './ui';
import RegistroCartao from './RegistroCartao';

const pct = (n: number | null) => (n == null ? '—' : `${(n * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);

export default function FornecedorHistoricoModal({
  user, fornecedor, avaliacoes, onClose, onRegistrar, onAvaliar, onEditarRegistro, versao,
}: {
  user: Profile;
  fornecedor: FornecedorOpcao;
  avaliacoes: AvaliacaoFrm[];
  onClose: () => void;
  onRegistrar: (f: FornecedorOpcao) => void;
  onAvaliar: (f: FornecedorOpcao) => void;
  onEditarRegistro: (r: RegistroOcorrencia) => void;
  /** Muda quando algo foi salvo na página: recarrega. */
  versao?: number;
}) {
  const [meses, setMeses] = useState(12);
  const fim = hojeISO();
  const inicio = subtrairMeses(fim, meses);
  const [linha, setLinha] = useState<LinhaPainel | null>(null);
  const [registros, setRegistros] = useState<RegistroOcorrencia[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [pdfAberto, setPdfAberto] = useState(false);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    Promise.all([
      fornecedor.fornecedor_codigo ? carregarPainel(inicio, fim, fornecedor.fornecedor_codigo) : Promise.resolve([] as LinhaPainel[]),
      listarRegistros({
        fornecedorCodigo: fornecedor.fornecedor_codigo,
        fornecedorNome: fornecedor.fornecedor_codigo ? null : fornecedor.fornecedor_nome,
      }),
    ])
      .then(([p, regs]) => { if (vivo) { setLinha(p[0] || null); setRegistros(regs); } })
      .finally(() => vivo && setCarregando(false));
    return () => { vivo = false; };
  }, [fornecedor, inicio, fim, versao]);

  const noPeriodo = useMemo(() => registros.filter(r => r.data_registro >= inicio), [registros, inicio]);
  const recados = registros.filter(r => r.recomendacao?.trim());
  const avs = avaliacoes.filter(a =>
    fornecedor.fornecedor_codigo ? a.fornecedor_codigo === fornecedor.fornecedor_codigo : a.fornecedor_nome === fornecedor.fornecedor_nome);
  const ultimaFrm = avs[0];

  // Linha do painel montada também para fornecedor fora da ZL0132
  const linhaPdf: LinhaPainel = linha ?? {
    chave: fornecedor.fornecedor_nome, fornecedor_codigo: fornecedor.fornecedor_codigo, fornecedor_nome: fornecedor.fornecedor_nome,
    cnpj: fornecedor.cnpj, pedidos: 0, itens: 0, valor: 0, itens_entregues: 0, itens_no_prazo: 0,
    registros: noPeriodo.length, ocorrencias: noPeriodo.reduce((s, r) => s + r.ocorrencias.length, 0),
    pedidos_com_ocorrencia: new Set(noPeriodo.map(r => r.nro_pedido).filter(Boolean)).size,
    por_categoria: {}, por_tipo: {}, estrelas_media: null, ultimo_registro: null,
    frm_codigo: null, frm_nota: null, frm_data: null, frm_decisao: null,
  };

  const porCategoria = useMemo(() => {
    const out: Record<string, number> = {};
    for (const r of noPeriodo) for (const o of r.ocorrencias || []) out[o.categoria] = (out[o.categoria] || 0) + 1;
    return Object.entries(out).sort((a, b) => b[1] - a[1]);
  }, [noPeriodo]);
  const totalOc = porCategoria.reduce((s, [, n]) => s + n, 0);
  const estrelas = noPeriodo.filter(r => r.estrelas).map(r => r.estrelas!);
  const mediaEstrelas = estrelas.length ? estrelas.reduce((a, b) => a + b, 0) / estrelas.length : null;

  return (
    <>
      <Modal onClose={onClose} maxWidth="max-w-4xl" ariaLabel={`Histórico de ${fornecedor.fornecedor_nome}`}>
        <ModalHeader onClose={onClose}>
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: 'color-mix(in srgb, var(--brand) 12%, transparent)', color: 'var(--brand)' }}>
              <Building2 className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-lg font-extrabold" style={{ color: 'var(--ink-primary)' }}>{fornecedor.fornecedor_nome}</h3>
              <p className="text-xs font-mono" style={{ color: 'var(--ink-muted)' }}>
                {fornecedor.fornecedor_codigo ? `SAP ${fornecedor.fornecedor_codigo}` : 'Sem código SAP'}
                {(fornecedor.cnpj || linha?.cnpj) ? ` · CNPJ ${formatarCnpj(fornecedor.cnpj || linha?.cnpj)}` : ''}
              </p>
            </div>
          </div>
        </ModalHeader>

        <ModalBody className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 rounded-lg border p-1" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
              {[3, 6, 12, 24].map(m => (
                <button key={m} type="button" onClick={() => setMeses(m)} className="rounded-md px-2.5 py-1 text-xs font-bold"
                  style={meses === m ? { background: 'var(--surface-card)', color: 'var(--brand)' } : { color: 'var(--ink-muted)' }}>
                  {m}m
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <BotaoAcao icon={ClipboardList} onClick={() => onRegistrar({ ...fornecedor, cnpj: fornecedor.cnpj || linha?.cnpj || null })}>Registrar ocorrência</BotaoAcao>
              <BotaoAcao icon={ClipboardCheck} onClick={() => onAvaliar({ ...fornecedor, cnpj: fornecedor.cnpj || linha?.cnpj || null })}>Avaliar (FRM)</BotaoAcao>
              <BotaoAcao icon={FileDown} onClick={() => setPdfAberto(true)} primario>Relatório p/ fornecedor</BotaoAcao>
            </div>
          </div>

          {carregando ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm" style={{ color: 'var(--ink-muted)' }}>
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando histórico…
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                <Numero rotulo="Pedidos" valor={formatInt(linha?.pedidos || 0)} />
                <Numero rotulo="Itens comprados" valor={formatInt(linha?.itens || 0)} />
                <Numero rotulo="Valor" valor={formatBRLCompacto(linha?.valor || 0)} />
                <Numero rotulo="OTD (SAP)" valor={pct(linha ? otd(linha) : null)} />
                <Numero rotulo="Ocorrências" valor={String(totalOc)} destaque={totalOc > 0 ? '#d97706' : undefined}
                  sub={linha && taxaPedidosComOcorrencia(linha) != null ? `${pct(taxaPedidosComOcorrencia(linha))} dos POs` : undefined} />
                <div className="rounded-xl border px-3 py-2.5" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
                  <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--ink-muted)' }}>Nota média</div>
                  <Estrelas valor={mediaEstrelas} tamanho="sm" />
                  <div className="text-[10px]" style={{ color: 'var(--ink-muted)' }}>{mediaEstrelas ? mediaEstrelas.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : 'sem nota'}</div>
                </div>
              </div>

              {/* Última avaliação FRM */}
              <div className="rounded-xl border px-4 py-3 flex flex-wrap items-center justify-between gap-2" style={{ borderColor: 'var(--hairline)' }}>
                {ultimaFrm ? (
                  <>
                    <div className="text-xs" style={{ color: 'var(--ink-secondary)' }}>
                      <b style={{ color: 'var(--ink-primary)' }}>Última avaliação FRM.SUP-0005:</b> {ultimaFrm.codigo} em {formatarDataBR(ultimaFrm.data_avaliacao)}
                      {avs.length > 1 ? ` · ${avs.length} avaliações no total` : ''}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-black" style={{ color: faixaDaNota(ultimaFrm.nota_final).cor }}>{pct(ultimaFrm.nota_final)}</span>
                      <Etiqueta cor={DECISOES_FRM.find(d => d.valor === ultimaFrm.decisao)?.cor || '#64748b'}>
                        {DECISOES_FRM.find(d => d.valor === ultimaFrm.decisao)?.rotulo}
                      </Etiqueta>
                    </div>
                  </>
                ) : (
                  <span className="text-xs" style={{ color: 'var(--ink-muted)' }}>Ainda sem avaliação FRM.SUP-0005.</span>
                )}
              </div>

              {porCategoria.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs font-bold" style={{ color: 'var(--ink-secondary)' }}>Ocorrências por categoria ({meses} meses)</div>
                  <div className="flex h-3 w-full overflow-hidden rounded-full" style={{ background: 'var(--surface-raised)' }}>
                    {porCategoria.map(([cat, n]) => (
                      <span key={cat} title={`${CATEGORIA_POR_ID[cat as CategoriaOcorrencia]?.rotulo}: ${n}`}
                        style={{ width: `${(n / totalOc) * 100}%`, background: CATEGORIA_POR_ID[cat as CategoriaOcorrencia]?.cor || '#64748b' }} />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {porCategoria.map(([cat, n]) => (
                      <Etiqueta key={cat} cor={CATEGORIA_POR_ID[cat as CategoriaOcorrencia]?.cor || '#64748b'}>
                        {CATEGORIA_POR_ID[cat as CategoriaOcorrencia]?.rotulo || cat} · {n}
                      </Etiqueta>
                    ))}
                  </div>
                </div>
              )}

              {recados.length > 0 && (
                <div className="rounded-xl border px-4 py-3 space-y-2" style={{ borderColor: 'color-mix(in srgb, #d97706 45%, transparent)', background: 'color-mix(in srgb, #d97706 6%, transparent)' }}>
                  <div className="flex items-center gap-1.5 text-xs font-extrabold" style={{ color: '#b45309' }}>
                    <MessageSquareQuote className="h-4 w-4" /> Recados de quem já comprou deste fornecedor
                  </div>
                  {recados.slice(0, 6).map(r => (
                    <p key={r.id} className="text-xs" style={{ color: 'var(--ink-secondary)' }}>
                      <b>{r.criado_por_nome?.split(' ')[0] || 'Comprador'}</b>, {formatarDataBR(r.data_registro)}{r.nro_pedido ? ` (PO ${r.nro_pedido})` : ''}: {r.recomendacao}
                    </p>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <div className="text-xs font-bold" style={{ color: 'var(--ink-secondary)' }}>Registros ({registros.length})</div>
                {registros.length === 0 ? (
                  <p className="rounded-xl border py-8 text-center text-sm" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}>
                    Nenhuma ocorrência registrada para este fornecedor.
                  </p>
                ) : registros.map(r => (
                  <RegistroCartao key={r.id} registro={r} mostrarFornecedor={false}
                    podeEditar={podeEditarFormulario(user, r)} onEditar={() => onEditarRegistro(r)} />
                ))}
              </div>
            </>
          )}
        </ModalBody>
      </Modal>

      {pdfAberto && (
        <PdfPreviewModal
          gerar={() => gerarPdfRelatorioFornecedor({ linha: linhaPdf, registros: noPeriodo, inicio, fim })}
          onClose={() => setPdfAberto(false)}
        />
      )}
    </>
  );
}

function Numero({ rotulo, valor, sub, destaque }: { rotulo: string; valor: string; sub?: string; destaque?: string }) {
  return (
    <div className="rounded-xl border px-3 py-2.5" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
      <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--ink-muted)' }}>{rotulo}</div>
      <div className="text-lg font-extrabold tabular-nums" style={{ color: destaque || 'var(--ink-primary)' }}>{valor}</div>
      {sub && <div className="text-[10px]" style={{ color: 'var(--ink-muted)' }}>{sub}</div>}
    </div>
  );
}

function BotaoAcao({ icon: Icon, children, onClick, primario }: { icon: typeof Building2; children: React.ReactNode; onClick: () => void; primario?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold"
      style={primario
        ? { background: 'var(--brand)', borderColor: 'var(--brand)', color: '#fff' }
        : { borderColor: 'var(--hairline)', color: 'var(--ink-secondary)', background: 'var(--surface-card)' }}
    >
      <Icon className="h-3.5 w-3.5" /> {children}
    </button>
  );
}
