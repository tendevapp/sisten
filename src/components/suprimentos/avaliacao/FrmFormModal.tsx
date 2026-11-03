/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * FRM.SUP-0005 — Questionário para avaliação de desempenho de fornecedores
 * (materiais). Código AVF-DDMMYY-NN.
 *
 * Ao escolher o fornecedor, a tela carrega o período (pedidos da ZL0132 e
 * ocorrências registradas) e já marca a resposta sugerida de cada pergunta,
 * com o porquê ao lado. O avaliador confirma ou troca; a nota segue a planilha
 * oficial (pesos em `FRM_SUP_0005`).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, Loader2, Sparkles, Wand2 } from 'lucide-react';
import type { Profile } from '../../../types';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../../ui/Modal';
import { useToast } from '../../ui/Toast';
import {
  CATEGORIA_POR_ID, DECISOES_FRM, FRM_SUP_0005, calcularNotaFrm, faixaDaNota, otd, subtrairMeses, sugerirRespostasFrm,
  type CategoriaOcorrencia, type DecisaoFrm, type LinhaPainel, type RespostasFrm, type SugestaoFrm,
} from '../../../lib/avaliacaoFornecedores';
import {
  atualizarAvaliacaoFrm, carregarPainel, criarAvaliacaoFrm, listarRegistros,
  type AvaliacaoFrm, type FornecedorOpcao, type RegistroOcorrencia,
} from '../../../lib/avaliacaoFornecedoresApi';
import { formatBRLCompacto, formatInt } from '../../../lib/format';
import { hojeISO } from '../../../lib/fichaEpi';
import { BarraPct, BuscaFornecedor, Etiqueta, formatarCnpj, inputCls, rotuloCls } from './ui';

interface Props {
  user: Profile;
  onClose: () => void;
  onSalvo: () => void;
  avaliacao?: AvaliacaoFrm | null;
  fornecedorInicial?: FornecedorOpcao | null;
}

const pct = (n: number) => `${(n * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

export default function FrmFormModal({ user, onClose, onSalvo, avaliacao, fornecedorInicial }: Props) {
  const toast = useToast();
  const editando = !!avaliacao;

  const [fornecedor, setFornecedor] = useState<FornecedorOpcao | null>(() =>
    avaliacao
      ? { fornecedor_codigo: avaliacao.fornecedor_codigo, fornecedor_nome: avaliacao.fornecedor_nome, cnpj: avaliacao.fornecedor_cnpj }
      : fornecedorInicial ?? null);
  const [data, setData] = useState(avaliacao?.data_avaliacao || hojeISO());
  const [meses, setMeses] = useState(avaliacao?.periodo_meses || 12);
  const [resp, setResp] = useState(avaliacao?.resp_avaliacao || user.name || '');
  const [respostas, setRespostas] = useState<RespostasFrm>(avaliacao?.respostas || {});
  const [justificativas, setJustificativas] = useState<Record<string, string>>(avaliacao?.justificativas || {});
  const [decisao, setDecisao] = useState<DecisaoFrm | null>(avaliacao?.decisao || null);
  const [justificativaFinal, setJustificativaFinal] = useState(avaliacao?.justificativa_final || '');
  const [salvando, setSalvando] = useState(false);

  // Período
  const inicio = useMemo(() => subtrairMeses(data, meses), [data, meses]);
  const [linha, setLinha] = useState<LinhaPainel | null>(null);
  const [registros, setRegistros] = useState<RegistroOcorrencia[]>([]);
  const [carregandoPeriodo, setCarregandoPeriodo] = useState(false);
  // Sugestões só valem depois que o período do fornecedor atual chegou
  const chavePeriodo = fornecedor ? `${fornecedor.fornecedor_codigo || fornecedor.fornecedor_nome}|${inicio}|${data}` : '';
  const [chaveCarregada, setChaveCarregada] = useState('');

  useEffect(() => {
    if (!fornecedor) { setLinha(null); setRegistros([]); return; }
    let vivo = true;
    const chave = chavePeriodo;
    setCarregandoPeriodo(true);
    Promise.all([
      fornecedor.fornecedor_codigo ? carregarPainel(inicio, data, fornecedor.fornecedor_codigo) : Promise.resolve([] as LinhaPainel[]),
      listarRegistros({
        desde: inicio,
        fornecedorCodigo: fornecedor.fornecedor_codigo,
        fornecedorNome: fornecedor.fornecedor_codigo ? null : fornecedor.fornecedor_nome,
      }),
    ])
      .then(([painel, regs]) => {
        if (!vivo) return;
        setLinha(painel[0] || null);
        setRegistros(regs.filter(r => r.data_registro <= data));
        setChaveCarregada(chave);
      })
      .catch(e => vivo && toast.error(e?.message || 'Falha ao carregar o período.'))
      .finally(() => vivo && setCarregandoPeriodo(false));
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fornecedor, inicio, data, chavePeriodo]);

  const sugestoes = useMemo<Record<string, SugestaoFrm>>(() => {
    if (!fornecedor) return {};
    return sugerirRespostasFrm({
      pedidos: linha?.pedidos || 0,
      ocorrencias: registros.flatMap(r => (r.ocorrencias || []).map(o => ({
        tipo: o.tipo, codigo: r.codigo, nro_pedido: r.nro_pedido, impactos: r.impactos,
      }))),
    });
  }, [fornecedor, linha, registros]);

  // Avaliação nova: marca as sugestões nas perguntas ainda sem resposta
  useEffect(() => {
    if (editando || !fornecedor || !chavePeriodo || chaveCarregada !== chavePeriodo) return;
    setRespostas(atual => {
      const novo = { ...atual };
      for (const [q, s] of Object.entries(sugestoes)) if (novo[q] == null) novo[q] = s.valor;
      return novo;
    });
  }, [sugestoes, editando, fornecedor, chavePeriodo, chaveCarregada]);

  const nota = useMemo(() => calcularNotaFrm(respostas), [respostas]);
  const faixa = faixaDaNota(nota.notaFinal);
  const decisaoFinal = decisao ?? faixa.decisao;

  const aplicarSugestoes = () => setRespostas(Object.fromEntries(Object.entries(sugestoes).map(([q, s]) => [q, s.valor])));

  const porCategoria = useMemo(() => {
    const out: Record<string, number> = {};
    for (const r of registros) for (const o of r.ocorrencias || []) out[o.categoria] = (out[o.categoria] || 0) + 1;
    return out;
  }, [registros]);
  const totalOcorrencias = Object.values(porCategoria).reduce((a, b) => a + b, 0);
  const otdPeriodo = linha ? otd(linha) : null;

  const salvar = async () => {
    if (!fornecedor) { toast.error('Escolha o fornecedor.'); return; }
    if (!nota.completo) { toast.error(`Responda todas as perguntas (${nota.respondidas} de ${nota.total}).`); return; }
    if (decisaoFinal !== 'MANTER' && !justificativaFinal.trim()) {
      toast.error('Justifique a avaliação final (desenvolvimento ou desqualificação).');
      return;
    }
    setSalvando(true);
    try {
      const dados = {
        data_avaliacao: data,
        periodo_meses: meses,
        tipo: 'MATERIAIS' as const,
        fornecedor_codigo: fornecedor.fornecedor_codigo,
        fornecedor_nome: fornecedor.fornecedor_nome,
        fornecedor_cnpj: fornecedor.cnpj,
        respostas,
        justificativas: Object.fromEntries(Object.entries(justificativas).filter(([, v]) => v.trim())),
        notas_criterio: nota.porCriterio,
        nota_final: nota.notaFinal,
        classificacao: faixa.classificacao,
        decisao: decisaoFinal,
        justificativa_final: justificativaFinal.trim() || null,
        resp_avaliacao: resp.trim() || null,
        resumo_periodo: {
          inicio, fim: data,
          pedidos: linha?.pedidos || 0, itens: linha?.itens || 0, valor: linha?.valor || 0,
          otd: otdPeriodo,
          registros: registros.length, ocorrencias: totalOcorrencias, por_categoria: porCategoria,
        },
      };
      if (avaliacao) {
        await atualizarAvaliacaoFrm(avaliacao.id, dados);
        toast.success(`${avaliacao.codigo || 'Avaliação'} atualizada.`);
      } else {
        const a = await criarAvaliacaoFrm(dados);
        toast.success(a.codigo ? `Avaliação ${a.codigo} registrada.` : 'Avaliação registrada.');
      }
      onSalvo();
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao salvar a avaliação.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-5xl" ariaLabel="Avaliação FRM.SUP-0005" disableOutsideClose>
      <ModalHeader onClose={onClose}>
        <h3 className="text-lg font-extrabold flex items-center gap-2" style={{ color: 'var(--ink-primary)' }}>
          <ClipboardCheck className="h-5 w-5" style={{ color: 'var(--brand)' }} />
          {editando ? `Editar ${avaliacao?.codigo || 'avaliação'}` : 'Avaliação de desempenho — Materiais'}
        </h3>
        <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>FRM.SUP-0005 · Questionário para avaliação de desempenho de fornecedores</p>
      </ModalHeader>

      <ModalBody>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5">
          {/* Coluna das perguntas */}
          <div className="space-y-5 min-w-0">
            <section className="space-y-3">
              <div>
                <span className={rotuloCls}>Empresa *</span>
                <BuscaFornecedor valor={fornecedor} onChange={f => { setFornecedor(f); if (!editando) setRespostas({}); }} autoFocus={!fornecedor} />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <label>
                  <span className={rotuloCls}>Data</span>
                  <input type="date" value={data} onChange={e => setData(e.target.value)} className={inputCls} />
                </label>
                <label>
                  <span className={rotuloCls}>Período</span>
                  <select value={meses} onChange={e => setMeses(Number(e.target.value))} className={inputCls}>
                    {[3, 6, 12, 24].map(m => <option key={m} value={m}>{m} meses</option>)}
                  </select>
                </label>
                <label className="col-span-2">
                  <span className={rotuloCls}>Resp. avaliação</span>
                  <input value={resp} onChange={e => setResp(e.target.value)} className={inputCls} />
                </label>
              </div>
            </section>

            {fornecedor && Object.keys(sugestoes).length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-xs" style={{ borderColor: 'color-mix(in srgb, #7c3aed 35%, transparent)', background: 'color-mix(in srgb, #7c3aed 6%, transparent)' }}>
                <span className="flex items-center gap-1.5 font-semibold" style={{ color: '#6d28d9' }}>
                  <Sparkles className="h-4 w-4" />
                  {carregandoPeriodo ? 'Lendo o período…' : `Respostas sugeridas pelas ${totalOcorrencias} ocorrência(s) e ${linha?.pedidos || 0} pedido(s) do período — confira cada uma.`}
                </span>
                {!carregandoPeriodo && (
                  <button type="button" onClick={aplicarSugestoes} className="inline-flex items-center gap-1 font-bold" style={{ color: '#6d28d9' }}>
                    <Wand2 className="h-3.5 w-3.5" /> Aplicar todas as sugestões
                  </button>
                )}
              </div>
            )}

            {FRM_SUP_0005.map(c => (
              <section key={c.id} className="space-y-2.5">
                <div className="flex items-center justify-between gap-2 border-b pb-1.5" style={{ borderColor: 'var(--hairline)' }}>
                  <h4 className="text-sm font-extrabold uppercase tracking-wide" style={{ color: 'var(--ink-primary)' }}>{c.titulo}</h4>
                  <span className="text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>
                    {pct(nota.porCriterio[c.id] ?? 0)} de {pct(c.peso)}
                  </span>
                </div>
                {c.questoes.map(q => {
                  const s = sugestoes[q.id];
                  const atual = respostas[q.id];
                  const notaQ = nota.porQuestao[q.id];
                  const negativa = notaQ === 0;
                  return (
                    <div key={q.id} className="rounded-xl border p-3 space-y-2" style={{ borderColor: negativa ? 'color-mix(in srgb, #dc2626 40%, transparent)' : 'var(--hairline)', background: 'var(--surface-card)' }}>
                      <p className="text-sm" style={{ color: 'var(--ink-primary)' }}>
                        <b className="font-mono text-xs mr-1" style={{ color: 'var(--ink-muted)' }}>{q.id}</b>{q.texto}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {q.opcoes.map(o => {
                          const ativo = atual === o.valor;
                          const cor = o.nota >= 1 ? '#16a34a' : o.nota > 0 ? '#d97706' : '#dc2626';
                          return (
                            <button
                              key={o.valor}
                              type="button"
                              onClick={() => setRespostas(r => ({ ...r, [q.id]: o.valor }))}
                              className="relative rounded-lg border px-3.5 py-1.5 text-xs font-bold transition-all"
                              style={ativo
                                ? { borderColor: cor, color: '#fff', background: cor }
                                : { borderColor: 'var(--hairline)', color: 'var(--ink-secondary)', background: 'var(--surface-raised)' }}
                            >
                              {o.rotulo}
                              {s?.valor === o.valor && (
                                <Sparkles className="absolute -top-1.5 -right-1.5 h-3.5 w-3.5 rounded-full p-[1px]" style={{ color: '#7c3aed', background: 'var(--surface-card)' }} />
                              )}
                            </button>
                          );
                        })}
                      </div>
                      {s && (
                        <p className="text-[11px] flex items-start gap-1" style={{ color: s.valor === atual ? '#6d28d9' : 'var(--ink-muted)' }}>
                          <Sparkles className="h-3 w-3 mt-0.5 shrink-0" />
                          <span>Sugestão: <b>{q.opcoes.find(o => o.valor === s.valor)?.rotulo}</b> — {s.motivo}</span>
                        </p>
                      )}
                      {(negativa || justificativas[q.id]) && (
                        <input
                          value={justificativas[q.id] || ''}
                          onChange={e => setJustificativas(j => ({ ...j, [q.id]: e.target.value }))}
                          placeholder="Justificativa"
                          className={`${inputCls} text-xs`}
                        />
                      )}
                    </div>
                  );
                })}
              </section>
            ))}

            {/* Avaliação final */}
            <section className="space-y-2.5">
              <div className="border-b pb-1.5" style={{ borderColor: 'var(--hairline)' }}>
                <h4 className="text-sm font-extrabold uppercase tracking-wide" style={{ color: 'var(--ink-primary)' }}>Avaliação final</h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {DECISOES_FRM.map(d => {
                  const ativo = decisaoFinal === d.valor;
                  return (
                    <button
                      key={d.valor}
                      type="button"
                      onClick={() => setDecisao(d.valor)}
                      className="rounded-xl border-2 px-3 py-2.5 text-left text-xs font-bold transition-all"
                      style={ativo
                        ? { borderColor: d.cor, color: d.cor, background: `color-mix(in srgb, ${d.cor} 9%, transparent)` }
                        : { borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
                    >
                      {d.rotulo}
                      {faixa.decisao === d.valor && <span className="block text-[10px] font-semibold opacity-80">sugerido pela nota</span>}
                    </button>
                  );
                })}
              </div>
              <label className="block">
                <span className={rotuloCls}>Justificativa para avaliação final{decisaoFinal !== 'MANTER' ? ' *' : ''}</span>
                <textarea value={justificativaFinal} onChange={e => setJustificativaFinal(e.target.value)} rows={3} className={inputCls} />
              </label>
            </section>
          </div>

          {/* Coluna do placar */}
          <aside className="lg:sticky lg:top-0 self-start space-y-3">
            <div className="rounded-2xl border p-4 text-center" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
              <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--ink-muted)' }}>Nota final</div>
              <div className="text-5xl font-black tabular-nums leading-tight" style={{ color: faixa.cor }}>{pct(nota.notaFinal)}</div>
              <Etiqueta cor={faixa.cor}>{faixa.rotulo}</Etiqueta>
              <div className="mt-1 text-[11px]" style={{ color: 'var(--ink-muted)' }}>{nota.respondidas} de {nota.total} respondidas</div>
              <div className="mt-3 space-y-1.5 text-left">
                {FRM_SUP_0005.map(c => (
                  <div key={c.id}>
                    <div className="flex justify-between text-[11px]" style={{ color: 'var(--ink-secondary)' }}>
                      <span>{c.rotuloCurto}</span>
                      <span className="tabular-nums">{pct(nota.porCriterio[c.id] ?? 0)} / {pct(c.peso)}</span>
                    </div>
                    <BarraPct valor={(nota.porCriterio[c.id] ?? 0) / c.peso} cor={(nota.porCriterio[c.id] ?? 0) >= c.peso - 1e-9 ? '#16a34a' : '#d97706'} />
                  </div>
                ))}
              </div>
            </div>

            {fornecedor && (
              <div className="rounded-2xl border p-4 space-y-2 text-xs" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-card)' }}>
                <div className="font-bold" style={{ color: 'var(--ink-primary)' }}>Período avaliado</div>
                <div style={{ color: 'var(--ink-muted)' }}>
                  {inicio.split('-').reverse().join('/')} a {data.split('-').reverse().join('/')}
                  {fornecedor.cnpj ? <><br />CNPJ {formatarCnpj(fornecedor.cnpj)}</> : null}
                </div>
                {carregandoPeriodo ? (
                  <div className="flex items-center gap-1.5" style={{ color: 'var(--ink-muted)' }}><Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…</div>
                ) : (
                  <dl className="grid grid-cols-2 gap-x-2 gap-y-1">
                    <dt style={{ color: 'var(--ink-muted)' }}>Pedidos</dt><dd className="text-right font-bold">{formatInt(linha?.pedidos || 0)}</dd>
                    <dt style={{ color: 'var(--ink-muted)' }}>Itens</dt><dd className="text-right font-bold">{formatInt(linha?.itens || 0)}</dd>
                    <dt style={{ color: 'var(--ink-muted)' }}>Valor</dt><dd className="text-right font-bold">{formatBRLCompacto(linha?.valor || 0)}</dd>
                    <dt style={{ color: 'var(--ink-muted)' }}>OTD (SAP)</dt><dd className="text-right font-bold">{otdPeriodo == null ? '—' : pct(otdPeriodo)}</dd>
                    <dt style={{ color: 'var(--ink-muted)' }}>Ocorrências</dt><dd className="text-right font-bold">{totalOcorrencias}</dd>
                  </dl>
                )}
                {totalOcorrencias > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {Object.entries(porCategoria).map(([cat, n]) => {
                      const def = CATEGORIA_POR_ID[cat as CategoriaOcorrencia] ?? CATEGORIA_POR_ID.OUTROS;
                      return <Etiqueta key={cat} cor={def.cor}>{def.rotulo} · {n}</Etiqueta>;
                    })}
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>
      </ModalBody>

      <ModalFooter>
        <div className="flex w-full items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-bold" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void salvar()}
            disabled={salvando}
            className="inline-flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-bold text-white disabled:opacity-60"
            style={{ background: 'var(--brand)' }}
          >
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            {editando ? 'Salvar alterações' : 'Registrar avaliação'}
          </button>
        </div>
      </ModalFooter>
    </Modal>
  );
}
