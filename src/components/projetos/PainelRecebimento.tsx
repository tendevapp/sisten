/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Projetos > Recebimento (F1) — entrada de NF com explosão da BOM.
 *
 * A NF do fornecedor vem pelo item PAI (um "Conjunto de escada de entrada"),
 * mas o almoxarifado estoca as folhas. O sistema calcula quanto cada folha
 * deve receber e mostra a lista ANTES de gravar; o conferente digita o que
 * realmente contou. Divergência não trava o lançamento — fica marcada na
 * nota, que é o que permite cobrar o fornecedor depois.
 */

import React, { useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownToLine, Check, Loader2, Plus, Search, Trash2, X } from 'lucide-react';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';
import { TableEmpty } from '../ui/DataTable';
import { useToast } from '../ui/Toast';
import { Campo, inputCls } from './campos';
import { formatDateBR, formatQtd } from '../../lib/format';
import { PREFIXO, hojeISO } from '../../lib/projetos';
import { explodirRecebimento, ExplosaoIndisponivelError, type NoBom } from '../../lib/projetosBom';
import { proximoCodigo, registrarEntradaNf, estornarDocumento } from '../../lib/projetosApi';
import type { Profile } from '../../types';
import type { DadosProjetos } from '../../views/projetos/useDadosProjetos';

interface Props { dados: DadosProjetos; user: Profile; podeLancar: boolean }

interface LinhaCredito {
  bomLinhaId: number;
  itemId: string;
  partNumber: string;
  descricao: string;
  secao: string | null;
  tramo: string | null;
  sugerida: number;
  /** O que o conferente contou. Começa igual à sugestão. */
  contada: number;
}

export default function PainelRecebimento({ dados, user, podeLancar }: Props) {
  const toast = useToast();
  const { arvore, itemPorPn, notas, subprojetoAtivo, loading, recarregar } = dados;

  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const [dataEntrada, setDataEntrada] = useState(hojeISO());
  const [numeroNf, setNumeroNf] = useState('');
  const [fornecedor, setFornecedor] = useState('');
  const [observacao, setObservacao] = useState('');
  const [buscaPai, setBuscaPai] = useState('');
  const [paiSelecionado, setPaiSelecionado] = useState<NoBom | null>(null);
  const [quantidade, setQuantidade] = useState('');
  const [explodir, setExplodir] = useState(true);
  const [creditos, setCreditos] = useState<LinhaCredito[]>([]);
  const [torresEquivalentes, setTorresEquivalentes] = useState<number | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});

  const fornecedores = useMemo(
    () => Array.from(new Set(arvore.nos.map((n) => n.fornecedor).filter(Boolean))).sort(),
    [arvore],
  );

  const candidatos = useMemo(() => {
    const termo = buscaPai.trim().toLowerCase();
    if (termo.length < 2) return [];
    return arvore.nos
      .filter((n) =>
        n.partNumber.toLowerCase().includes(termo) ||
        (n.codSap ?? '').toLowerCase().includes(termo) ||
        n.descricao.toLowerCase().includes(termo) ||
        n.description.toLowerCase().includes(termo))
      .slice(0, 25);
  }, [arvore, buscaPai]);

  const limpar = () => {
    setNumeroNf(''); setFornecedor(''); setObservacao(''); setBuscaPai('');
    setPaiSelecionado(null); setQuantidade(''); setExplodir(true);
    setCreditos([]); setTorresEquivalentes(null); setErros({});
    setDataEntrada(hojeISO());
  };

  /** Recalcula a prévia. Um pai folha (sem filhos) credita ele mesmo. */
  const calcularPrevia = (pai: NoBom, qtdTexto: string, comExplosao: boolean) => {
    const qtd = Number(qtdTexto.replace(',', '.'));
    if (!Number.isFinite(qtd) || qtd <= 0) { setCreditos([]); setTorresEquivalentes(null); return; }

    const paraCredito = (bomLinhaId: number, no: NoBom, valor: number): LinhaCredito | null => {
      const item = itemPorPn.get(no.partNumberNorm);
      if (!item) return null;
      return {
        bomLinhaId,
        itemId: item.id,
        partNumber: no.partNumber,
        descricao: no.descricao || no.description,
        secao: no.secao,
        tramo: no.tramo,
        sugerida: valor,
        contada: valor,
      };
    };

    if (!comExplosao || pai.folha) {
      const linha = paraCredito(pai.id, pai, qtd);
      setCreditos(linha ? [linha] : []);
      setTorresEquivalentes(pai.qtdPorTorre ? qtd / pai.qtdPorTorre : null);
      if (!linha) setErros((e) => ({ ...e, item: 'Este part number não está no catálogo de itens do projeto.' }));
      return;
    }

    try {
      const r = explodirRecebimento(arvore, pai.id, qtd);
      const linhas = r.linhas
        .map((l) => {
          const no = arvore.porId.get(l.bomLinhaId);
          return no ? paraCredito(l.bomLinhaId, no, l.qtdCreditada) : null;
        })
        .filter((l): l is LinhaCredito => l !== null);
      setCreditos(linhas);
      setTorresEquivalentes(r.torresEquivalentes);
      setErros((e) => { const { explosao, ...resto } = e; return resto; });
    } catch (err) {
      setCreditos([]);
      setTorresEquivalentes(null);
      setErros((e) => ({
        ...e,
        explosao: err instanceof ExplosaoIndisponivelError ? err.message : 'Falha ao explodir a BOM.',
      }));
    }
  };

  const selecionarPai = (no: NoBom) => {
    setPaiSelecionado(no);
    setBuscaPai('');
    if (!fornecedor && no.fornecedor) setFornecedor(no.fornecedor);
    // Um item folha não tem o que explodir; a caixa desmarca sozinha.
    const comExplosao = !no.folha;
    setExplodir(comExplosao);
    if (quantidade) calcularPrevia(no, quantidade, comExplosao);
  };

  const validar = (): boolean => {
    const novos: Record<string, string> = {};
    if (!dataEntrada) novos.data = 'Informe a data de entrada.';
    if (!numeroNf.trim()) novos.nf = 'Informe o número da nota fiscal.';
    if (!fornecedor.trim()) novos.fornecedor = 'Informe o fornecedor.';
    if (!paiSelecionado) novos.item = 'Escolha o item faturado na NF.';
    const qtd = Number(quantidade.replace(',', '.'));
    if (!Number.isFinite(qtd) || qtd <= 0) novos.quantidade = 'Quantidade recebida deve ser maior que zero.';
    if (!creditos.length) novos.creditos = 'Nada a creditar — confira o item e a quantidade.';
    if (creditos.some((c) => !(c.contada > 0))) novos.creditos = 'Toda linha creditada precisa de quantidade maior que zero.';

    setErros(novos);
    const primeiro = Object.values(novos)[0];
    if (primeiro) toast.error(primeiro);
    return !primeiro;
  };

  const salvar = async () => {
    if (!validar() || !paiSelecionado) return;
    setSalvando(true);
    try {
      const codigo = await proximoCodigo(PREFIXO.entrada, dataEntrada);
      const houveDivergencia = creditos.some((c) => c.contada !== c.sugerida);

      await registrarEntradaNf({
        codigo,
        data_entrada: dataEntrada,
        numero_nf: numeroNf.trim(),
        fornecedor: fornecedor.trim(),
        subprojeto_id: subprojetoAtivo?.id ?? null,
        observacao: observacao.trim() || null,
        criado_por_id: user.id,
        criado_por_nome: user.name,
        pais: [{
          bom_linha_id: paiSelecionado.id,
          part_number: paiSelecionado.partNumber,
          cod_sap: paiSelecionado.codSap,
          descricao: paiSelecionado.descricao || paiSelecionado.description,
          quantidade_recebida: Number(quantidade.replace(',', '.')),
          explodir,
          torres_equivalentes: torresEquivalentes,
          divergencia: houveDivergencia,
        }],
        movimentos: creditos.map((c) => ({
          item_id: c.itemId,
          quantidade: c.contada,
          bom_linha_id: c.bomLinhaId,
          origem_pai_pn: paiSelecionado.partNumber,
          secao: c.secao,
          tramo: c.tramo,
          observacao: c.contada !== c.sugerida ? `Conferência: sugerido ${c.sugerida}, contado ${c.contada}` : null,
        })),
      });

      toast.success(`Entrada ${codigo} registrada — ${creditos.length} item(ns) creditado(s).`);
      if (houveDivergencia) toast.warning('Nota gravada com divergência de conferência; confira o histórico.');
      setAberto(false);
      limpar();
      await recarregar(true);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Não foi possível registrar a entrada.');
    } finally {
      setSalvando(false);
    }
  };

  const estornar = async (id: string, codigo: string) => {
    if (!window.confirm(`Estornar a entrada ${codigo}? Os créditos saem do estoque e a nota fica no histórico como excluída.`)) return;
    try {
      await estornarDocumento('proj_notas_entrada', id, user.id);
      toast.success(`Entrada ${codigo} estornada.`);
      await recarregar(true);
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível estornar.');
    }
  };

  const totalCreditado = creditos.reduce((s, c) => s + c.contada, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
          {notas.length} nota(s) lançada(s) neste projeto.
        </p>
        {podeLancar ? (
          <button
            onClick={() => { limpar(); setAberto(true); }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer text-white shadow-sm hover:opacity-90 active:scale-95"
            style={{ background: 'var(--brand)' }}
          >
            <Plus className="h-4 w-4" /> Nova entrada de NF
          </button>
        ) : (
          <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
            Você tem acesso de consulta. Lançar entrada exige a permissão “Projetos: lançar entrada de NF”.
          </p>
        )}
      </div>

      {loading && <div className="h-48 rounded-xl animate-pulse" style={{ background: 'var(--hairline)' }} />}

      {!loading && !notas.length && (
        <TableEmpty
          icon={ArrowDownToLine}
          title="Nenhuma entrada registrada"
          hint="Enquanto não houver NF lançada, todo o estoque do projeto fica zerado e nenhum romaneio pode ser separado."
        />
      )}

      {!loading && notas.length > 0 && (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--hairline)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead style={{ background: 'var(--surface-raised)' }}>
                <tr className="border-b" style={{ borderColor: 'var(--hairline)' }}>
                  {['Código', 'Data', 'NF', 'Fornecedor', 'Item faturado', 'Torres eq.', 'Itens', 'Peças', ''].map((h, i) => (
                    <th key={h || i} className={`px-3 py-2 font-bold whitespace-nowrap ${i >= 5 && i <= 7 ? 'text-right' : 'text-left'}`} style={{ color: 'var(--ink-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {notas.map((n) => {
                  const pai = n.pais?.[0];
                  return (
                    <tr key={n.id} className="border-b" style={{ borderColor: 'var(--hairline)' }}>
                      <td className="px-3 py-2 font-bold whitespace-nowrap" style={{ color: 'var(--ink-primary)' }}>
                        {n.codigo}
                        {pai?.divergencia && (
                          <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400" title="Conferência divergiu da sugestão da BOM">
                            <AlertTriangle className="h-3 w-3" /> divergência
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--ink-secondary)' }}>{formatDateBR(n.data_entrada)}</td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--ink-secondary)' }}>{n.numero_nf}</td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: 'var(--ink-secondary)' }}>{n.fornecedor}</td>
                      <td className="px-3 py-2 min-w-[200px]" style={{ color: 'var(--ink-secondary)' }} title={pai?.descricao ?? ''}>
                        {pai?.part_number ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--ink-secondary)' }}>
                        {pai?.torres_equivalentes ? formatQtd(pai.torres_equivalentes) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--ink-secondary)' }}>{n.total_itens}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-bold" style={{ color: 'var(--ink-primary)' }}>{formatQtd(n.total_quantidade)}</td>
                      <td className="px-3 py-2 text-right">
                        {podeLancar && (
                          <button
                            onClick={() => void estornar(n.id, n.codigo)}
                            className="inline-flex items-center gap-1 text-[11px] font-bold cursor-pointer hover:underline"
                            style={{ color: 'var(--abc-c)' }}
                          >
                            <Trash2 className="h-3 w-3" /> Estornar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {aberto && (
        <Modal onClose={() => !salvando && setAberto(false)} maxWidth="max-w-4xl" ariaLabel="Nova entrada de NF" disableOutsideClose>
          <ModalHeader onClose={() => !salvando && setAberto(false)}>
            <h3 className="text-base font-extrabold" style={{ color: 'var(--ink-primary)' }}>Entrada de materiais</h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--ink-muted)' }}>
              Lance o item como veio na NF; o sistema credita as peças que o compõem.
            </p>
          </ModalHeader>

          <ModalBody>
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Campo rotulo="Data de entrada" erro={erros.data}>
                  <input type="date" value={dataEntrada} onChange={(e) => setDataEntrada(e.target.value)} className={inputCls(erros.data)} />
                </Campo>
                <Campo rotulo="Número da NF" erro={erros.nf}>
                  <input value={numeroNf} onChange={(e) => setNumeroNf(e.target.value)} placeholder="5497" className={inputCls(erros.nf)} />
                </Campo>
                <Campo rotulo="Fornecedor" erro={erros.fornecedor}>
                  <input
                    value={fornecedor}
                    onChange={(e) => setFornecedor(e.target.value)}
                    list="proj-fornecedores"
                    placeholder="Atlanta, Qindao, Forte Fixadores…"
                    className={inputCls(erros.fornecedor)}
                  />
                  <datalist id="proj-fornecedores">
                    {fornecedores.map((f) => <option key={f} value={f} />)}
                  </datalist>
                </Campo>
              </div>

              <Campo rotulo="Item faturado na NF (pai ou peça avulsa)" erro={erros.item}>
                {paiSelecionado ? (
                  <div className="flex items-start justify-between gap-3 rounded-lg border p-3" style={{ borderColor: 'var(--hairline)' }}>
                    <div className="min-w-0">
                      <p className="text-sm font-bold" style={{ color: 'var(--ink-primary)' }}>{paiSelecionado.partNumber}</p>
                      <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
                        {paiSelecionado.descricao || paiSelecionado.description}
                        {paiSelecionado.codSap ? ` · SAP ${paiSelecionado.codSap}` : ''}
                      </p>
                      <p className="text-[11px] mt-1" style={{ color: 'var(--ink-muted)' }}>
                        Nível {paiSelecionado.level} · {paiSelecionado.folha ? 'peça avulsa' : `conjunto com ${paiSelecionado.filhos.length} filho(s)`} ·
                        {paiSelecionado.qtdPorTorre !== null ? ` ${formatQtd(paiSelecionado.qtdPorTorre)} por torre` : ' sem quantidade na BOM'}
                      </p>
                    </div>
                    <button onClick={() => { setPaiSelecionado(null); setCreditos([]); setTorresEquivalentes(null); }} className="shrink-0 cursor-pointer" aria-label="Trocar item">
                      <X className="h-4 w-4" style={{ color: 'var(--ink-muted)' }} />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--ink-muted)' }} />
                    <input
                      value={buscaPai}
                      onChange={(e) => setBuscaPai(e.target.value)}
                      placeholder="Busque por part number, código SAP ou descrição"
                      className={`${inputCls(erros.item)} pl-9`}
                      autoFocus
                    />
                    {candidatos.length > 0 && (
                      <ul className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border shadow-lg" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
                        {candidatos.map((c) => (
                          <li key={c.id}>
                            <button
                              onClick={() => selecionarPai(c)}
                              className="w-full text-left px-3 py-2 text-xs cursor-pointer hover:bg-[rgba(127,127,127,0.08)]"
                            >
                              <span className="font-bold" style={{ color: 'var(--ink-primary)' }}>{c.partNumber}</span>
                              <span className="ml-2" style={{ color: 'var(--ink-muted)' }}>
                                {c.descricao || c.description} · nível {c.level}{c.folha ? '' : ` · ${c.filhos.length} filhos`}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </Campo>

              <div className="grid gap-3 sm:grid-cols-2">
                <Campo rotulo="Quantidade recebida" erro={erros.quantidade}>
                  <input
                    value={quantidade}
                    onChange={(e) => {
                      setQuantidade(e.target.value);
                      if (paiSelecionado) calcularPrevia(paiSelecionado, e.target.value, explodir);
                    }}
                    inputMode="decimal"
                    placeholder="23"
                    className={inputCls(erros.quantidade)}
                  />
                </Campo>
                <div className="flex items-end pb-1">
                  <label className="inline-flex items-center gap-2 text-xs font-bold cursor-pointer" style={{ color: 'var(--ink-secondary)' }}>
                    <input
                      type="checkbox"
                      checked={explodir}
                      disabled={!paiSelecionado || paiSelecionado.folha}
                      onChange={(e) => {
                        setExplodir(e.target.checked);
                        if (paiSelecionado && quantidade) calcularPrevia(paiSelecionado, quantidade, e.target.checked);
                      }}
                      className="cursor-pointer"
                    />
                    Explodir a BOM automaticamente
                  </label>
                </div>
              </div>

              {erros.explosao && (
                <p className="text-xs px-3 py-2 rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-300">
                  {erros.explosao}
                </p>
              )}

              {creditos.length > 0 && (
                <div className="rounded-lg border" style={{ borderColor: 'var(--hairline)' }}>
                  <div className="px-3 py-2 border-b flex flex-wrap items-baseline justify-between gap-2" style={{ borderColor: 'var(--hairline)' }}>
                    <p className="text-xs font-extrabold" style={{ color: 'var(--ink-primary)' }}>
                      Conferência — {creditos.length} item(ns), {formatQtd(totalCreditado)} peças
                    </p>
                    {torresEquivalentes !== null && (
                      <p className="text-xs font-bold" style={{ color: 'var(--brand)' }}>
                        equivale a {formatQtd(torresEquivalentes)} torre(s)
                      </p>
                    )}
                  </div>
                  <p className="px-3 py-2 text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                    Confira contra o físico e ajuste o que contou. A diferença fica registrada na nota.
                  </p>
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-xs">
                      <tbody>
                        {creditos.map((c, i) => {
                          const divergiu = c.contada !== c.sugerida;
                          return (
                            <tr key={c.bomLinhaId} className="border-t" style={{ borderColor: 'var(--hairline)' }}>
                              <td className="px-3 py-1.5">
                                <p className="font-bold" style={{ color: 'var(--ink-primary)' }}>{c.partNumber}</p>
                                <p className="text-[11px] truncate" style={{ color: 'var(--ink-muted)' }}>{c.descricao}{c.tramo ? ` · ${c.tramo}` : ''}</p>
                              </td>
                              <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap" style={{ color: 'var(--ink-muted)' }}>
                                sugerido {formatQtd(c.sugerida)}
                              </td>
                              <td className="px-3 py-1.5 w-28">
                                <input
                                  value={c.contada}
                                  onChange={(e) => {
                                    const v = Number(e.target.value.replace(',', '.'));
                                    setCreditos((atual) => atual.map((x, j) => (j === i ? { ...x, contada: Number.isFinite(v) ? v : 0 } : x)));
                                  }}
                                  inputMode="decimal"
                                  className="w-full rounded border px-2 py-1 text-xs text-right tabular-nums font-bold focus:outline-2 focus:outline-offset-1"
                                  style={{
                                    borderColor: divergiu ? 'var(--abc-b)' : 'var(--hairline)',
                                    background: 'var(--surface-raised)',
                                    color: 'var(--ink-primary)',
                                    outlineColor: 'var(--brand)',
                                  }}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {erros.creditos && <p className="text-[11px] text-rose-500">{erros.creditos}</p>}

              <Campo rotulo="Observação (opcional)">
                <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} className={inputCls()} />
              </Campo>
            </div>
          </ModalBody>

          <ModalFooter>
            <button
              onClick={() => setAberto(false)}
              disabled={salvando}
              className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer border disabled:opacity-50"
              style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
            >
              Cancelar
            </button>
            <button
              onClick={() => void salvar()}
              disabled={salvando}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer text-white disabled:opacity-50"
              style={{ background: 'var(--brand)' }}
            >
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Confirmar entrada
            </button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
