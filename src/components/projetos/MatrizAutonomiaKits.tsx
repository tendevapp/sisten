/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Almoxarifado > Projetos — Matriz de Autonomia de Kits por Tramo.
 *
 * Visualização idêntica à planilha de controle operacional:
 *   - Linhas agrupadas por Tramo (T5 a T1) e Sub-Kits (Fixadores, Plataforma, Escada | Avanti, Escada Acesso).
 *   - Colunas por Torre (TORRE 1 a 12 ou todas as do projeto).
 *   - Cores de status:
 *       0: Não atende (Vermelho)
 *       1: Estoque (Verde)
 *       3: Montagem final (Azul) - marcado manualmente
 *       4: Expedido (Preto) - marcado manualmente
 *   - Rodapé com semanas de planejamento (W36, W37...).
 *   - Vínculo direto com saldo do almoxarifado e explosão da BOM.
 *
 * Os status 3 e 4 são só manuais (sem vínculo com Faturamento ou Portaria) —
 * toda gravação passa pela RPC `proj_matriz_salvar_celula`, que grava o diff
 * em `proj_matriz_autonomia_log` (botão "Log de alterações" abaixo).
 */

import React, { useMemo, useState } from 'react';
import {
  Calendar, Check, ChevronLeft, ChevronRight, Clock, Edit2, ExternalLink,
  Eye, History, Layers,
} from 'lucide-react';
import { useToast } from '../ui/Toast';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../ui/Modal';
import ModalComposicaoBomKit from './ModalComposicaoBomKit';
import {
  COR_STATUS_AUTONOMIA,
  ROTULO_STATUS_AUTONOMIA,
  SUBKITS,
  SUBKITS_POR_TRAMO,
  type CelulaMatriz,
  type ComposicaoSubkit,
  type StatusKitAutonomia,
  type SubkitId,
} from '../../lib/projetosKitsAutonomia';
import { listarLogMatrizAutonomia, type ProjMatrizAutonomiaLogRow } from '../../lib/projetosApi';
import { formatDateTimeBR } from '../../lib/format';
import { Tramo, TRAMOS } from '../../lib/projetos';
import type { Profile } from '../../types';
import type { DadosProjetos } from '../../views/projetos/useDadosProjetos';

interface Props {
  dados: DadosProjetos;
  user?: Profile;
}

export default function MatrizAutonomiaKits({ dados, user }: Props) {
  const toast = useToast();
  const {
    matrizAutonomia, ultimaEdicaoMatriz, salvarCelulaMatriz, salvarPlanejamentoTorre,
    loading, recarregar, subprojetoAtivo,
  } = dados;
  const { celulas, composicoes, semanasPorTorre, torresDisponiveis } = matrizAutonomia;

  const [logAberto, setLogAberto] = useState(false);

  // Filtro de janela de torres (padrão 1 a 12 como na imagem do usuário)
  const [paginaTorres, setPaginaTorres] = useState<number>(0);
  const [torresPorPagina, setTorresPorPagina] = useState<number>(12);

  // Subkit selecionado para abrir a composição da BOM
  const [composicaoAberta, setComposicaoAberta] = useState<ComposicaoSubkit | null>(null);

  // Célula selecionada para edição/inspeção
  const [celulaSelecionada, setCelulaSelecionada] = useState<CelulaMatriz | null>(null);
  const [editStatus, setEditStatus] = useState<StatusKitAutonomia>(0);
  const [editSerie, setEditSerie] = useState<string>('');
  const [salvandoCelula, setSalvandoCelula] = useState(false);

  // Edição de semana de planejamento da torre
  const [torreEditandoSemana, setTorreEditandoSemana] = useState<number | null>(null);
  const [rascunhoSemana, setRascunhoSemana] = useState<string>('');
  const [salvandoSemana, setSalvandoSemana] = useState(false);

  // Torres exibidas na página atual
  const torresExibidas = useMemo(() => {
    if (torresPorPagina === 0) return torresDisponiveis; // Todas
    const inicio = paginaTorres * torresPorPagina;
    return torresDisponiveis.slice(inicio, inicio + torresPorPagina);
  }, [torresDisponiveis, paginaTorres, torresPorPagina]);

  const totalPaginas = Math.ceil(torresDisponiveis.length / (torresPorPagina || 1));

  const abrirEdicaoCelula = (celula: CelulaMatriz) => {
    setCelulaSelecionada(celula);
    setEditStatus(celula.status);
    setEditSerie(celula.serie ?? '');
  };

  const confirmarSalvarCelula = async () => {
    if (!celulaSelecionada) return;
    if (editStatus === 4 && !editSerie.trim()) {
      toast.error('Para marcar como Expedido (4), informe o número de série do tramo.');
      return;
    }
    setSalvandoCelula(true);
    try {
      await salvarCelulaMatriz({
        torreNumero: celulaSelecionada.torreNumero,
        tramo: celulaSelecionada.tramo,
        subkit: celulaSelecionada.subkit,
        status: editStatus,
        serie: editSerie.trim() || null,
        usuario: user?.name ? { id: user.id, nome: user.name } : { id: null, nome: 'Almoxarifado' },
      });
      toast.success(`Célula T${celulaSelecionada.tramo} Torre ${celulaSelecionada.torreNumero} atualizada.`);
      setCelulaSelecionada(null);
    } catch (err: any) {
      toast.error(err?.message || 'Falha ao atualizar célula.');
    } finally {
      setSalvandoCelula(false);
    }
  };

  const abrirEdicaoSemana = (torreNumero: number) => {
    setTorreEditandoSemana(torreNumero);
    setRascunhoSemana(semanasPorTorre.get(torreNumero) ?? '');
  };

  const confirmarSalvarSemana = async (torreNumero: number) => {
    setSalvandoSemana(true);
    try {
      await salvarPlanejamentoTorre({
        torreNumero,
        semana: rascunhoSemana.trim() || null,
      });
      toast.success(`Semana da Torre ${torreNumero} atualizada.`);
      setTorreEditandoSemana(null);
    } catch (err: any) {
      toast.error(err?.message || 'Falha ao salvar semana da torre.');
    } finally {
      setSalvandoSemana(false);
    }
  };

  // Tramos em ordem decrescente T5 -> T1 conforme planilha
  const tramosOrdenados: Tramo[] = ['T5', 'T4', 'T3', 'T2', 'T1'];

  return (
    <div className="space-y-4">
      {/* Barra de Título e Controles de Exibição */}
      <div className="rounded-xl border p-4 sm:p-5" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5" style={{ color: 'var(--brand)' }} />
              <h3 className="text-base font-extrabold" style={{ color: 'var(--ink-primary)' }}>
                Matriz de Autonomia dos Kits para os Tramos
              </h3>
            </div>
            <p className="text-xs mt-1" style={{ color: 'var(--ink-muted)' }}>
              Cruzamento por torre vinculando o estoque físico do almoxarifado à BOM dos kits, destacando montagem final e expedido. Os dois são marcados à mão pelo Almoxarifado.
            </p>
            <div className="flex items-center gap-1.5 mt-1.5 text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>
              <Clock className="h-3 w-3" />
              <span>
                Atualizado em: {ultimaEdicaoMatriz ? formatDateTimeBR(ultimaEdicaoMatriz) : 'sem edições manuais ainda'}
              </span>
            </div>
          </div>

          {/* Controles de Paginação de Torres no Topo */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setLogAberto(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold border transition-colors cursor-pointer"
              style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
              title="Ver histórico de alterações manuais da matriz"
            >
              <History className="h-3.5 w-3.5" />
              Log de alterações
            </button>
            <span className="w-px h-5 shrink-0" style={{ background: 'var(--hairline)' }} />
            <span className="text-xs font-bold" style={{ color: 'var(--ink-muted)' }}>Exibir:</span>
            <button
              onClick={() => { setTorresPorPagina(12); setPaginaTorres(0); }}
              className="px-2.5 py-1 rounded text-xs font-bold border transition-colors cursor-pointer"
              style={{
                borderColor: torresPorPagina === 12 ? 'var(--brand)' : 'var(--hairline)',
                background: torresPorPagina === 12 ? 'var(--brand)' : 'transparent',
                color: torresPorPagina === 12 ? '#fff' : 'var(--ink-muted)',
              }}
            >
              12 Torres
            </button>
            <button
              onClick={() => { setTorresPorPagina(0); setPaginaTorres(0); }}
              className="px-2.5 py-1 rounded text-xs font-bold border transition-colors cursor-pointer"
              style={{
                borderColor: torresPorPagina === 0 ? 'var(--brand)' : 'var(--hairline)',
                background: torresPorPagina === 0 ? 'var(--brand)' : 'transparent',
                color: torresPorPagina === 0 ? '#fff' : 'var(--ink-muted)',
              }}
            >
              Todas ({torresDisponiveis.length})
            </button>

            {torresPorPagina > 0 && totalPaginas > 1 && (
              <div className="flex items-center gap-1 ml-1">
                <button
                  disabled={paginaTorres === 0}
                  onClick={() => setPaginaTorres((p) => Math.max(0, p - 1))}
                  className="p-1 rounded border disabled:opacity-30 cursor-pointer"
                  style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
                  aria-label="Página anterior"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="text-[11px] font-bold px-1 tabular-nums" style={{ color: 'var(--ink-muted)' }}>
                  {paginaTorres + 1}/{totalPaginas}
                </span>
                <button
                  disabled={paginaTorres >= totalPaginas - 1}
                  onClick={() => setPaginaTorres((p) => Math.min(totalPaginas - 1, p + 1))}
                  className="p-1 rounded border disabled:opacity-30 cursor-pointer"
                  style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
                  aria-label="Próxima página"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabela Matricial Idêntica */}
      <div className="rounded-xl border overflow-hidden shadow-xs bg-[var(--surface-raised)]" style={{ borderColor: 'var(--hairline)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b" style={{ borderColor: '#000000', background: 'var(--surface-sunken)' }}>
                <th
                  colSpan={2}
                  className="px-3 py-2.5 text-center font-extrabold uppercase border-r tracking-wider"
                  style={{ borderColor: '#CBD5E1', color: 'var(--ink-primary)', width: '220px' }}
                >
                  Estrutura dos Kits
                </th>
                {torresExibidas.map((num) => (
                  <th
                    key={num}
                    className="px-2 py-2.5 text-center font-extrabold border-r last:border-r-0 whitespace-nowrap min-w-[68px]"
                    style={{ borderColor: '#CBD5E1', color: 'var(--ink-primary)' }}
                  >
                    TORRE {num}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tramosOrdenados.map((tramo) => {
                const subkits = SUBKITS_POR_TRAMO[tramo];
                return subkits.map((subkitId, index) => {
                  const comp = composicoes.get(`${tramo}::${subkitId}`);
                  const isPrimeiroSubkit = index === 0;

                  return (
                    <tr
                      key={`${tramo}::${subkitId}`}
                      className="border-b transition-colors hover:bg-[var(--surface-sunken)]/50"
                      style={{
                        borderColor: index === subkits.length - 1 ? '#475569' : '#CBD5E1',
                        borderBottomWidth: index === subkits.length - 1 ? '2px' : '1px',
                      }}
                    >
                      {/* Coluna de Tramo (mesclada verticalmente com rowspan) */}
                      {isPrimeiroSubkit && (
                        <td
                          rowSpan={subkits.length}
                          className="px-3 py-2 text-center font-extrabold border-r text-sm align-middle select-none"
                          style={{
                            borderColor: '#CBD5E1',
                            color: 'var(--ink-primary)',
                            background: 'var(--surface-raised)',
                            width: '60px',
                          }}
                        >
                          <span className="inline-block px-2 py-1 rounded bg-[var(--surface-sunken)] border border-[var(--hairline)]">
                            {tramo}
                          </span>
                        </td>
                      )}

                      {/* Coluna do Sub-Kit (com link para Composição da BOM) */}
                      <td
                        className="px-3 py-1.5 font-bold border-r whitespace-nowrap text-left"
                        style={{ borderColor: '#CBD5E1', color: 'var(--ink-primary)', width: '160px' }}
                      >
                        <button
                          onClick={() => comp && setComposicaoAberta(comp)}
                          className="group flex items-center justify-between w-full text-left cursor-pointer hover:underline"
                          title="Clique para ver a composição detalhada deste kit na BOM"
                        >
                          <span className="truncate">{SUBKITS[subkitId].rotulo}</span>
                          <Eye className="h-3 w-3 opacity-0 group-hover:opacity-100 ml-1 text-[var(--brand)] shrink-0" />
                        </button>
                      </td>

                      {/* Células de Cada Torre */}
                      {torresExibidas.map((torreNum) => {
                        const chave = `${torreNum}::${tramo}::${subkitId}`;
                        const celula = celulas.get(chave) ?? {
                          torreNumero: torreNum,
                          tramo,
                          subkit: subkitId,
                          status: 0,
                          serie: null,
                          isManual: false,
                          autonomiaEstoque: 0,
                          gargaloPn: null,
                        };

                        const cor = COR_STATUS_AUTONOMIA[celula.status];
                        const temTexto = Boolean(celula.serie);

                        return (
                          <td
                            key={torreNum}
                            className="p-1 border-r last:border-r-0 text-center"
                            style={{ borderColor: '#CBD5E1' }}
                          >
                            <button
                              onClick={() => abrirEdicaoCelula(celula)}
                              className="w-full h-8 min-w-[56px] rounded flex items-center justify-center font-extrabold text-xs transition-transform hover:scale-105 active:scale-95 cursor-pointer shadow-2xs focus-visible:outline-2 focus-visible:outline-offset-1"
                              style={{
                                background: cor.bg,
                                color: cor.text,
                                border: `1px solid ${cor.border}`,
                              }}
                              title={`Torre ${torreNum} · ${tramo} ${SUBKITS[subkitId].rotulo}\nStatus: ${ROTULO_STATUS_AUTONOMIA[celula.status]}${celula.serie ? ` · Série: ${celula.serie}` : ''}\nClique para editar ou ver detalhes.`}
                            >
                              {temTexto ? (
                                <span className="tabular-nums tracking-tight">{celula.serie}</span>
                              ) : (
                                <span className="text-[10px] opacity-0 hover:opacity-80">
                                  {celula.status}
                                </span>
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                });
              })}

              {/* Linha de Rodapé: Semanas de Planejamento (W36, W37...) */}
              <tr className="border-t-2" style={{ borderColor: '#334155', background: 'var(--surface-sunken)' }}>
                <td
                  colSpan={2}
                  className="px-3 py-2 text-right font-extrabold text-xs uppercase border-r"
                  style={{ borderColor: '#CBD5E1', color: 'var(--ink-muted)' }}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>Semana</span>
                  </div>
                </td>
                {torresExibidas.map((torreNum) => {
                  const semana = semanasPorTorre.get(torreNum);
                  const isEditando = torreEditandoSemana === torreNum;

                  return (
                    <td
                      key={torreNum}
                      className="px-1 py-1.5 text-center border-r last:border-r-0 font-bold text-xs"
                      style={{ borderColor: '#CBD5E1', color: 'var(--ink-primary)' }}
                    >
                      {isEditando ? (
                        <div className="flex items-center justify-center gap-1">
                          <input
                            value={rascunhoSemana}
                            onChange={(e) => setRascunhoSemana(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void confirmarSalvarSemana(torreNum);
                              if (e.key === 'Escape') setTorreEditandoSemana(null);
                            }}
                            autoFocus
                            placeholder="W36"
                            className="w-14 rounded border text-center px-1 py-0.5 text-xs font-bold uppercase focus:outline-2"
                            style={{
                              borderColor: 'var(--brand)',
                              background: 'var(--surface-raised)',
                              color: 'var(--ink-primary)',
                            }}
                          />
                          <button
                            onClick={() => void confirmarSalvarSemana(torreNum)}
                            disabled={salvandoSemana}
                            className="cursor-pointer"
                            aria-label="Salvar semana"
                          >
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => abrirEdicaoSemana(torreNum)}
                          className="group inline-flex items-center gap-0.5 hover:underline cursor-pointer px-1 py-0.5 rounded"
                          title={`Clique para alterar semana da Torre ${torreNum}`}
                        >
                          <span className="font-extrabold uppercase">{semana || '—'}</span>
                          <Edit2 className="h-2.5 w-2.5 opacity-0 group-hover:opacity-60 ml-0.5" />
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Legenda de Cores e Detalhamento Operacional na Parte Inferior da Tabela */}
      <div className="rounded-xl border p-4 sm:p-5" style={{ borderColor: 'var(--hairline)', background: 'var(--surface-raised)' }}>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-black uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>
              Legenda de Cores &amp; Status Operacional
            </span>
            <span className="text-[11px] font-bold" style={{ color: 'var(--ink-muted)' }}>
              Clique em qualquer célula para alterar o status ou associar série
            </span>
          </div>

          {/* Legenda com as 4 cores */}
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-white font-extrabold shadow-xs" style={{ background: COR_STATUS_AUTONOMIA[0].bg }}>
              <span className="opacity-90">0</span>
              <span>{ROTULO_STATUS_AUTONOMIA[0]}</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-white font-extrabold shadow-xs" style={{ background: COR_STATUS_AUTONOMIA[1].bg }}>
              <span className="opacity-90">1</span>
              <span>{ROTULO_STATUS_AUTONOMIA[1]}</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-white font-extrabold shadow-xs" style={{ background: COR_STATUS_AUTONOMIA[3].bg }}>
              <span className="opacity-90">3</span>
              <span>{ROTULO_STATUS_AUTONOMIA[3]}</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-white font-extrabold shadow-xs border border-zinc-700" style={{ background: COR_STATUS_AUTONOMIA[4].bg }}>
              <span className="opacity-90">4</span>
              <span>{ROTULO_STATUS_AUTONOMIA[4]}</span>
            </div>
          </div>

          {/* Notas explicativas sobre Montagem final e Expedido — marcados à mão */}
          <div className="mt-2 pt-3 border-t grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[11px]" style={{ borderColor: 'var(--hairline)' }}>
            <div className="flex items-start gap-1.5" style={{ color: 'var(--ink-secondary)' }}>
              <span className="inline-block w-2.5 h-2.5 rounded-xs shrink-0 mt-0.5" style={{ background: COR_STATUS_AUTONOMIA[3].bg }} />
              <span>
                <strong>Montagem final (3):</strong> marcado manualmente pelo Almoxarifado.
              </span>
            </div>
            <div className="flex items-start gap-1.5" style={{ color: 'var(--ink-secondary)' }}>
              <span className="inline-block w-2.5 h-2.5 rounded-xs shrink-0 mt-0.5 border border-zinc-700" style={{ background: COR_STATUS_AUTONOMIA[4].bg }} />
              <span>
                <strong>Expedido (4):</strong> marcado manualmente pelo Almoxarifado.
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de Detalhe e Edição de Célula */}
      {celulaSelecionada && (
        <Modal
          onClose={() => !salvandoCelula && setCelulaSelecionada(null)}
          maxWidth="max-w-md"
          ariaLabel={`Editar Célula Torre ${celulaSelecionada.torreNumero}`}
        >
          <ModalHeader onClose={() => !salvandoCelula && setCelulaSelecionada(null)}>
            <h3 className="text-base font-extrabold" style={{ color: 'var(--ink-primary)' }}>
              Torre {celulaSelecionada.torreNumero} · {celulaSelecionada.tramo} · {SUBKITS[celulaSelecionada.subkit].rotulo}
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--ink-muted)' }}>
              Ajuste o status operacional do kit ou informe a série física.
            </p>
          </ModalHeader>

          <ModalBody>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold mb-1.5" style={{ color: 'var(--ink-muted)' }}>
                  Status Operacional
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {([0, 1, 3, 4] as StatusKitAutonomia[]).map((st) => {
                    const ativo = editStatus === st;
                    const cor = COR_STATUS_AUTONOMIA[st];
                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setEditStatus(st)}
                        className="flex items-center gap-2 p-2 rounded-lg border text-xs font-extrabold cursor-pointer transition-all text-left"
                        style={{
                          borderColor: ativo ? cor.bg : 'var(--hairline)',
                          background: ativo ? cor.bg : 'var(--surface-raised)',
                          color: ativo ? '#fff' : 'var(--ink-primary)',
                        }}
                      >
                        <span className="h-3 w-3 rounded-full shrink-0 border" style={{ background: ativo ? '#fff' : cor.bg, borderColor: cor.border }} />
                        <span className="truncate">{st}: {ROTULO_STATUS_AUTONOMIA[st]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold mb-1" style={{ color: 'var(--ink-muted)' }}>
                  Número de Série Física (opcional)
                </label>
                <input
                  value={editSerie}
                  onChange={(e) => setEditSerie(e.target.value)}
                  placeholder="Ex: 3182, 3147..."
                  className="w-full rounded-lg border py-2 px-3 text-xs font-bold focus:outline-2"
                  style={{
                    borderColor: 'var(--hairline)',
                    background: 'var(--surface-raised)',
                    color: 'var(--ink-primary)',
                    outlineColor: 'var(--brand)',
                  }}
                />
                <p className="text-[11px] mt-1" style={{ color: 'var(--ink-muted)' }}>
                  Geralmente preenchido quando o status é 4 (Expedido) ou 3 (Montagem final).
                </p>
              </div>

              {/* Atalho para abrir a BOM */}
              <div className="pt-2 border-t" style={{ borderColor: 'var(--hairline)' }}>
                <button
                  type="button"
                  onClick={() => {
                    const comp = composicoes.get(`${celulaSelecionada.tramo}::${celulaSelecionada.subkit}`);
                    if (comp) {
                      setComposicaoAberta(comp);
                      setCelulaSelecionada(null);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-bold cursor-pointer hover:underline text-[var(--brand)]"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Ver composição completa deste kit na BOM ({composicoes.get(`${celulaSelecionada.tramo}::${celulaSelecionada.subkit}`)?.totalItens ?? 0} peças)
                </button>
              </div>
            </div>
          </ModalBody>

          <ModalFooter>
            <button
              onClick={() => setCelulaSelecionada(null)}
              disabled={salvandoCelula}
              className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer border"
              style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
            >
              Cancelar
            </button>
            <button
              onClick={() => void confirmarSalvarCelula()}
              disabled={salvandoCelula}
              className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer text-white hover:opacity-90"
              style={{ background: 'var(--brand)' }}
            >
              {salvandoCelula ? 'Salvando...' : 'Salvar Alteração'}
            </button>
          </ModalFooter>
        </Modal>
      )}

      {/* Modal de Composição do Kit na BOM */}
      {composicaoAberta && (
        <ModalComposicaoBomKit
          composicao={composicaoAberta}
          onClose={() => setComposicaoAberta(null)}
        />
      )}

      {/* Modal de Log de Alterações Manuais */}
      {logAberto && (
        <Modal onClose={() => setLogAberto(false)} maxWidth="max-w-lg" ariaLabel="Log de alterações da Matriz de Autonomia">
          <ModalHeader onClose={() => setLogAberto(false)}>
            <h3 className="text-base font-extrabold" style={{ color: 'var(--ink-primary)' }}>
              Log de alterações
            </h3>
            <p className="text-xs mt-0.5" style={{ color: 'var(--ink-muted)' }}>
              Toda mudança manual de status ou série nesta matriz, mais recente primeiro.
            </p>
          </ModalHeader>
          <ModalBody>
            <LogMatrizAlteracoes subprojetoId={subprojetoAtivo?.id ?? 'SP01'} />
          </ModalBody>
        </Modal>
      )}
    </div>
  );
}

const ROTULO_CAMPO_LOG: Record<string, string> = {
  status: 'Status',
  serie: 'Série',
};

function fmtValorLog(campo: string, v: string | null): string {
  if (!v) return '∅';
  if (campo === 'status') {
    const status = Number(v) as StatusKitAutonomia;
    return ROTULO_STATUS_AUTONOMIA[status] ?? v;
  }
  return v;
}

/** Log de alterações manuais da Matriz de Autonomia — mais recente primeiro. */
function LogMatrizAlteracoes({ subprojetoId }: { subprojetoId: string }) {
  const [linhas, setLinhas] = useState<ProjMatrizAutonomiaLogRow[] | null>(null);

  React.useEffect(() => {
    listarLogMatrizAutonomia(subprojetoId).then(setLinhas).catch(() => setLinhas([]));
  }, [subprojetoId]);

  if (linhas === null) {
    return <div className="h-16 animate-pulse rounded-lg" style={{ background: 'var(--surface-sunken)' }} />;
  }

  if (linhas.length === 0) {
    return (
      <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
        Nenhuma alteração manual registrada ainda.
      </p>
    );
  }

  return (
    <ul className="space-y-2 max-h-[60vh] overflow-y-auto">
      {linhas.map((l) => (
        <li key={l.id} className="rounded-lg border p-2.5" style={{ borderColor: 'var(--hairline)' }}>
          <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--ink-muted)' }}>
            <span className="font-bold" style={{ color: 'var(--ink-secondary)' }}>
              Torre {l.torre_numero} · {l.tramo} · {SUBKITS[l.subkit as SubkitId]?.rotulo ?? l.subkit}
            </span>
            <span>{formatDateTimeBR(l.created_at)}</span>
          </div>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-muted)' }}>
            por <span className="font-bold">{l.alterado_por_nome || '—'}</span>
          </p>
          <ul className="mt-1 space-y-0.5">
            {l.alteracoes.map((m, i) => (
              <li key={i} className="text-[11px]" style={{ color: 'var(--ink-secondary)' }}>
                <span className="font-bold">{ROTULO_CAMPO_LOG[m.campo] ?? m.campo}:</span>{' '}
                <span style={{ color: 'var(--ink-muted)' }}>{fmtValorLog(m.campo, m.de)}</span> →{' '}
                <span>{fmtValorLog(m.campo, m.para)}</span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
