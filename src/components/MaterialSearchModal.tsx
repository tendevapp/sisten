/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Busca ampliada no catálogo SAP.
 *
 * O autocomplete embutido no formulário resolve o caso fácil — quem já sabe o
 * que quer digita e escolhe. Este modal existe para o caso difícil: termo
 * genérico ("valvula"), dezenas de quase-duplicatas, e a necessidade de ler a
 * descrição inteira antes de decidir. Por isso ele NÃO busca enquanto se
 * digita: a consulta só sai quando a pessoa envia a palavra-chave. Uma busca
 * deliberada por vez, em vez de uma por pausa de digitação.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, Loader2, X, AlertTriangle } from 'lucide-react';
import Modal, { ModalBody, ModalFooter, ModalHeader } from './ui/Modal';
import ConfirmDialog from './ui/ConfirmDialog';
import { SinalChips } from './ui/SinalChips';
import {
  buscarMateriais,
  normalizarTermo,
  resumoSinais,
  ehCodigoSapInativo,
  type MaterialResultado,
  type SinalChip,
} from '../lib/materiais';
import { ehItemImobilizado } from '../lib/solicitacoes';

/**
 * Tamanho da página. Enxuto de propósito: a maioria decide nas primeiras
 * linhas, e quem não decidiu pede mais explicitamente — o payload grande fica
 * para quem precisa dele, não para todo mundo.
 */
const PAGINA = 25;

interface Props {
  /** O que já estava digitado na linha do item — a busca começa daí. */
  termoInicial?: string;
  areaUsuario?: string | null;
  onSelect: (material: MaterialResultado, chips: SinalChip[]) => void;
  onClose: () => void;
}

type Estado = 'inicial' | 'buscando' | 'pronto' | 'erro';

/**
 * Função de realce das palavras-chave pesquisadas no texto,
 * suportando insensibilidade a maiúsculas/minúsculas e variações com/sem acento.
 */
function highlightText(text: string, searchWords: string[]) {
  if (!searchWords.length || !text) return text;

  // Inclui palavras originais e versões sem acento para cobrir qualquer grafia
  const termosExpandidos = Array.from(
    new Set(
      searchWords.flatMap(w => {
        const limpo = w.trim();
        if (!limpo) return [];
        const semAcento = limpo.normalize('NFD').replace(/\p{Diacritic}/gu, '');
        return [limpo, semAcento];
      }),
    ),
  ).filter(Boolean);

  if (termosExpandidos.length === 0) return text;

  const regex = new RegExp(
    `(${termosExpandidos
      .map(w => w.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'))
      .join('|')})`,
    'gi',
  );

  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark
        key={i}
        className="bg-yellow-200/90 dark:bg-yellow-500/30 text-yellow-950 dark:text-yellow-100 px-0.5 rounded font-semibold"
      >
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

export default function MaterialSearchModal({ termoInicial = '', areaUsuario = null, onSelect, onClose }: Props) {
  // Input de digitação atual
  const [queryInput, setQueryInput] = useState('');
  // Lista de chaves ativas (chips cumulativos AND)
  const [chips, setChips] = useState<string[]>(() => {
    if (!termoInicial.trim()) return [];
    return termoInicial.trim().split(/\s+/).filter(Boolean);
  });
  const [incluirTecnico, setIncluirTecnico] = useState(false);
  // "Itens sem ativo": esconde os itens de imobilizado (código 4xxxx de 5 dígitos).
  const [somenteSemAtivo, setSomenteSemAtivo] = useState(false);
  const [resultados, setResultados] = useState<MaterialResultado[]>([]);
  const [estado, setEstado] = useState<Estado>('inicial');
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [temMais, setTemMais] = useState(false);
  /** As chaves que geraram a consulta atual na tela */
  const [chipsBuscados, setChipsBuscados] = useState<string[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);

  // Filtro "Itens sem ativo": remove os itens de imobilizado (código 4xxxx de 5
  // dígitos) e exclui códigos inativos (começam com 9 ou letras).
  const resultadosVisiveis = useMemo(
    () =>
      resultados.filter(m => {
        if (ehCodigoSapInativo(m.materialCode)) return false;
        if (somenteSemAtivo && ehItemImobilizado(m.materialCode)) return false;
        return true;
      }),
    [resultados, somenteSemAtivo],
  );
  const ocultosPorAtivo = resultados.length - resultadosVisiveis.length;

  const executarBusca = useCallback(async (chavesParaBuscar: string[], comTecnico: boolean) => {
    const alvo = chavesParaBuscar.map(c => c.trim()).filter(Boolean).join(' ');
    if (!alvo || normalizarTermo(alvo).tipo === 'curto') {
      setResultados([]);
      setChipsBuscados([]);
      setEstado('inicial');
      return;
    }

    setEstado('buscando');
    setTemMais(false);
    try {
      const achados = await buscarMateriais(alvo, {
        areaUsuario,
        limite: PAGINA,
        incluirTecnico: comTecnico,
      });
      setResultados(achados);
      setChipsBuscados(chavesParaBuscar);
      setTemMais(achados.length === PAGINA);
      setEstado('pronto');
    } catch (err) {
      console.error('Erro ao buscar materiais no catálogo SAP:', err);
      setResultados([]);
      setEstado('erro');
    }
  }, [areaUsuario]);

  // Ao abrir com termo inicial preenchido, dispara a busca imediata
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();

    if (termoInicial.trim()) {
      const iniciais = termoInicial.trim().split(/\s+/).filter(Boolean);
      if (iniciais.length > 0) {
        void executarBusca(iniciais, false);
      }
    }
  }, []);

  const carregarMais = useCallback(async () => {
    const alvo = chipsBuscados.join(' ');
    if (!alvo) return;
    setCarregandoMais(true);
    try {
      const achados = await buscarMateriais(alvo, {
        areaUsuario,
        limite: PAGINA,
        deslocamento: resultados.length,
        incluirTecnico,
      });
      setResultados(atual => [...atual, ...achados]);
      setTemMais(achados.length === PAGINA);
    } catch (err) {
      console.error('Erro ao carregar mais resultados:', err);
      setTemMais(false);
    } finally {
      setCarregandoMais(false);
    }
  }, [chipsBuscados, areaUsuario, resultados.length, incluirTecnico]);

  const adicionarChave = (valor: string) => {
    const pedacos = valor
      .trim()
      .split(/\s+/)
      .map(p => p.trim())
      .filter(Boolean);

    if (pedacos.length === 0) return;

    const novosChips = [...chips];
    for (const p of pedacos) {
      if (!novosChips.some(c => c.toLowerCase() === p.toLowerCase())) {
        novosChips.push(p);
      }
    }

    setChips(novosChips);
    setQueryInput('');
    void executarBusca(novosChips, incluirTecnico);
  };

  const removerChip = (chipParaRemover: string) => {
    const restantes = chips.filter(c => c !== chipParaRemover);
    setChips(restantes);
    if (restantes.length > 0) {
      void executarBusca(restantes, incluirTecnico);
    } else {
      setResultados([]);
      setChipsBuscados([]);
      setEstado('inicial');
    }
    inputRef.current?.focus();
  };

  const limparTodasChaves = () => {
    setChips([]);
    setQueryInput('');
    setResultados([]);
    setChipsBuscados([]);
    setEstado('inicial');
    inputRef.current?.focus();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (queryInput.trim()) {
      adicionarChave(queryInput);
    } else if (chips.length > 0) {
      void executarBusca(chips, incluirTecnico);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (queryInput.trim()) {
        adicionarChave(queryInput);
      } else if (chips.length > 0) {
        void executarBusca(chips, incluirTecnico);
      }
    } else if (e.key === 'Backspace' && !queryInput && chips.length > 0) {
      removerChip(chips[chips.length - 1]);
    }
  };

  const [itemObsoletoPendente, setItemObsoletoPendente] = useState<MaterialResultado | null>(null);

  const alternarTecnico = (marcado: boolean) => {
    setIncluirTecnico(marcado);
    if (chips.length > 0) void executarBusca(chips, marcado);
  };

  const confirmarEscolha = (mat: MaterialResultado) => {
    onSelect(mat, resumoSinais(mat));
    onClose();
  };

  const escolher = (mat: MaterialResultado) => {
    if (mat.statusGeral === 'Z1' || mat.statusSap === 'Obsoleto') {
      setItemObsoletoPendente(mat);
      return;
    }
    confirmarEscolha(mat);
  };

  const termoTexto = chips.join(' ');
  const curto = chips.length === 0 && (!queryInput.trim() || normalizarTermo(queryInput).tipo === 'curto');

  return (
    <>
    <Modal onClose={onClose} maxWidth="max-w-4xl" ariaLabel="Buscar no catálogo SAP">
      <ModalHeader onClose={onClose}>
        <h2 className="text-base font-bold" style={{ color: 'var(--ink-primary)' }}>Catálogo SAP</h2>
        <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-muted)' }}>
          Digite uma palavra-chave e pressione Enter para adicionar. A busca combina todas as chaves (AND).
        </p>
      </ModalHeader>

      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
        <div className="px-4 sm:px-6 pt-4 shrink-0">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: 'var(--ink-muted)' }} />
              <input
                ref={inputRef}
                type="text"
                value={queryInput}
                onChange={e => setQueryInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={chips.length > 0 ? "Digite outro termo e pressione Enter..." : "Ex.: valvula, caneta, 2mm, azul..."}
                className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm transition-colors focus:outline-2 focus:outline-offset-1"
                style={{ background: 'var(--surface-raised)', borderColor: 'var(--hairline)', color: 'var(--ink-primary)' }}
              />
            </div>
            <button
              type="submit"
              disabled={curto || estado === 'buscando'}
              className="rounded-lg px-5 text-sm font-bold shrink-0 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              style={{ background: 'var(--brand)', color: 'var(--on-brand)' }}
            >
              {estado === 'buscando' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : queryInput.trim() ? (
                'Adicionar'
              ) : (
                'Buscar'
              )}
            </button>
          </div>

          {/* Container de Chaves Ativas (Chips) */}
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-1.5 items-center mt-2.5">
              <span className="text-[11px] font-bold uppercase tracking-wider mr-1" style={{ color: 'var(--ink-muted)' }}>
                Chaves ativas:
              </span>
              {chips.map((chip, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/60 py-0.5 pl-2.5 pr-1 text-xs font-semibold text-emerald-800 dark:text-emerald-300 shadow-2xs"
                >
                  <span>{chip}</span>
                  <button
                    type="button"
                    onClick={() => removerChip(chip)}
                    className="p-0.5 hover:bg-emerald-200/60 dark:hover:bg-emerald-800/60 rounded-full cursor-pointer text-emerald-600 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-100 transition-colors"
                    title={`Remover chave "${chip}"`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={limparTodasChaves}
                className="text-[11px] font-bold text-red-500 hover:text-red-600 dark:text-red-400 hover:underline ml-1 cursor-pointer"
              >
                Limpar chaves
              </button>
            </div>
          )}

          <div className="mt-2.5 flex flex-col gap-1.5">
            <label className="flex items-center gap-2 text-[11px] cursor-pointer w-fit" style={{ color: 'var(--ink-muted)' }}>
              <input
                type="checkbox"
                checked={incluirTecnico}
                onChange={e => alternarTecnico(e.target.checked)}
                className="cursor-pointer"
              />
              {/* Existem materiais com descrição idêntica que só o texto técnico
                  separa (GALVANIZADO FOGO vs SEM REVESTIMENTO). Fora esse caso,
                  incluí-lo só traz ruído — por isso é opção, não padrão. */}
              Incluir texto técnico na busca (para separar itens de descrição igual)
            </label>
            <label className="flex items-center gap-2 text-[11px] cursor-pointer w-fit" style={{ color: 'var(--ink-muted)' }}>
              <input
                type="checkbox"
                checked={somenteSemAtivo}
                onChange={e => setSomenteSemAtivo(e.target.checked)}
                className="cursor-pointer"
              />
              Itens sem ativo (esconde imobilizado — código 4xxxx de 5 dígitos)
            </label>
          </div>
        </div>

        <ModalBody className="pt-3">
          {estado === 'inicial' && chips.length === 0 ? (
            <p className="text-sm text-center py-10" style={{ color: 'var(--ink-muted)' }}>
              Digite uma palavra-chave e pressione Enter para buscar materiais no catálogo SAP.
            </p>
          ) : estado === 'erro' ? (
            <div className="text-sm text-center py-10" style={{ color: 'var(--status-serious)' }}>
              Não foi possível buscar no catálogo.
              <button
                type="button"
                onClick={() => void executarBusca(chips, incluirTecnico)}
                className="block mx-auto mt-1 font-bold underline cursor-pointer"
                style={{ color: 'var(--brand)' }}
              >
                Tentar de novo
              </button>
            </div>
          ) : estado === 'buscando' ? (
            <p className="text-sm text-center py-10 flex items-center justify-center gap-2" style={{ color: 'var(--ink-muted)' }}>
              <Loader2 className="h-4 w-4 animate-spin" /> Buscando no catálogo SAP...
            </p>
          ) : resultados.length === 0 ? (
            <div className="text-sm text-center py-10" style={{ color: 'var(--ink-muted)' }}>
              Nenhum item corresponde a {chipsBuscados.map(c => `“${c}”`).join(' + ')}.
              <div className="text-[11px] mt-1">
                {incluirTecnico
                  ? 'Tente remover alguma chave ou usar termos mais amplos.'
                  : 'Tente marcar “incluir texto técnico” acima, ou remover alguma chave.'}
              </div>
            </div>
          ) : resultadosVisiveis.length === 0 ? (
            <div className="text-sm text-center py-10" style={{ color: 'var(--ink-muted)' }}>
              Todos os {resultados.length} resultados carregados são itens de imobilizado.
              <div className="text-[11px] mt-1">Desmarque “Itens sem ativo” para vê-los.</div>
              {temMais && (
                <button
                  type="button"
                  onClick={() => void carregarMais()}
                  disabled={carregandoMais}
                  className="block mx-auto mt-2 text-[11px] font-bold underline cursor-pointer disabled:opacity-50"
                  style={{ color: 'var(--brand)' }}
                >
                  {carregandoMais ? 'Carregando...' : `Carregar mais ${PAGINA}`}
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--ink-muted)' }}>
                {resultadosVisiveis.length}{temMais ? '+' : ''} resultado{resultadosVisiveis.length === 1 ? '' : 's'} para {chipsBuscados.map(c => `“${c}”`).join(' + ')}
                {somenteSemAtivo && ocultosPorAtivo > 0 && (
                  <span className="normal-case font-normal"> · {ocultosPorAtivo} de imobilizado oculto{ocultosPorAtivo === 1 ? '' : 's'}</span>
                )}
              </div>
              {/* Tabela em telas médias/grandes */}
              <div className="hidden sm:block rounded-lg border overflow-hidden" style={{ borderColor: 'var(--hairline)' }}>
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b text-[10px] font-bold uppercase tracking-wider bg-slate-50 dark:bg-slate-800/50" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-muted)' }}>
                      <th className="py-2.5 px-3 w-28">Código SAP</th>
                      <th className="py-2.5 px-3">Descrição & Especificação</th>
                      <th className="py-2.5 px-2 w-14 text-center">Un.</th>
                      <th className="py-2.5 px-3 w-28 text-center">Status</th>
                      <th className="py-2.5 px-3 w-24 text-center">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
                    {resultadosVisiveis.map(mat => {
                      const chipsSinais = resumoSinais(mat);
                      return (
                        <tr
                          key={mat.materialCode}
                          onClick={() => escolher(mat)}
                          className="hover:bg-[var(--surface-raised)] transition-colors cursor-pointer"
                        >
                          <td className="py-2.5 px-3 font-mono font-bold text-emerald-700 dark:text-emerald-400 whitespace-nowrap align-top">
                            {highlightText(mat.materialCode, chipsBuscados)}
                          </td>
                          <td className="py-2.5 px-3 align-top">
                            <p className="text-sm font-medium leading-snug" style={{ color: 'var(--ink-primary)' }}>
                              {highlightText(mat.description, chipsBuscados)}
                            </p>
                            {mat.technicalText && (
                              <p className="text-[11px] mt-0.5 leading-relaxed font-mono" style={{ color: 'var(--ink-muted)' }}>
                                {highlightText(mat.technicalText, chipsBuscados)}
                              </p>
                            )}
                            <SinalChips chips={chipsSinais} className="mt-1.5" />
                          </td>
                          <td className="py-2.5 px-2 text-center font-mono font-bold text-[11px] align-top" style={{ color: 'var(--ink-muted)' }}>
                            {mat.unit}
                          </td>
                          <td className="py-2.5 px-3 text-center align-top">
                            {mat.statusGeral === 'Z1' ? (
                              <div
                                className="flex flex-col items-center gap-0.5"
                                title="Material com status Z1 (Obsoleto no SAP). Solicite a ativação com o setor Fiscal."
                              >
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                  <AlertTriangle className="h-3 w-3 text-amber-700 shrink-0" />
                                  Z1 · Obsoleto
                                </span>
                                <span className="text-[9px] text-amber-700 leading-tight text-center max-w-[130px]">
                                  Ativar com setor Fiscal
                                </span>
                              </div>
                            ) : (
                              <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Ativo
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center align-top whitespace-nowrap">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                escolher(mat);
                              }}
                              className="px-2.5 py-1 rounded text-xs font-bold transition-opacity hover:opacity-90 cursor-pointer"
                              style={{ background: 'var(--brand)', color: 'var(--on-brand)' }}
                            >
                              Selecionar
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Lista em cards para celular/telas pequenas */}
              <div className="sm:hidden divide-y rounded-lg border overflow-hidden" style={{ borderColor: 'var(--hairline)' }}>
                {resultadosVisiveis.map(mat => {
                  const chipsSinais = resumoSinais(mat);
                  return (
                    <div
                      key={mat.materialCode}
                      onClick={() => escolher(mat)}
                      className="p-3 transition-colors hover:bg-[var(--surface-raised)] cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-mono text-xs font-bold text-emerald-700 dark:text-emerald-400">
                          {highlightText(mat.materialCode, chipsBuscados)}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {mat.statusGeral === 'Z1' ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                              <AlertTriangle className="h-2.5 w-2.5 text-amber-700 shrink-0" />
                              Z1 · Obsoleto
                            </span>
                          ) : (
                            <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Ativo
                            </span>
                          )}
                          <span
                            className="text-[11px] font-mono px-1 rounded uppercase shrink-0"
                            style={{ background: 'var(--surface-sunken)', color: 'var(--ink-muted)' }}
                          >
                            {mat.unit}
                          </span>
                        </div>
                      </div>
                      <p className="mt-1 text-sm font-medium" style={{ color: 'var(--ink-primary)' }}>
                        {highlightText(mat.description, chipsBuscados)}
                      </p>
                      {mat.technicalText && (
                        <p className="text-[11px] mt-0.5 leading-relaxed font-mono" style={{ color: 'var(--ink-muted)' }}>
                          {highlightText(mat.technicalText, chipsBuscados)}
                        </p>
                      )}
                      {mat.statusGeral === 'Z1' && (
                        <div className="mt-1.5 flex items-center gap-1 p-1 rounded bg-amber-50 border border-amber-200 text-amber-800 text-[10px]">
                          <AlertTriangle className="h-3 w-3 text-amber-600 shrink-0" />
                          <span>Código obsoleto no SAP (Z1). Solicite ativação com o setor Fiscal.</span>
                        </div>
                      )}
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <SinalChips chips={chipsSinais} />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            escolher(mat);
                          }}
                          className="ml-auto px-2 py-0.5 rounded text-[11px] font-bold"
                          style={{ background: 'var(--brand)', color: 'var(--on-brand)' }}
                        >
                          Selecionar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {temMais && (
                <button
                  type="button"
                  onClick={() => void carregarMais()}
                  disabled={carregandoMais}
                  className="w-full mt-3 py-2 rounded-lg border text-sm font-bold transition-colors disabled:opacity-50 cursor-pointer"
                  style={{ borderColor: 'var(--hairline)', color: 'var(--brand)' }}
                >
                  {carregandoMais ? 'Carregando...' : `Carregar mais ${PAGINA}`}
                </button>
              )}
            </>
          )}
        </ModalBody>

        <ModalFooter>
          <span className="text-[11px] mr-auto" style={{ color: 'var(--ink-muted)' }}>
            Não achou? Feche e digite a descrição livremente para cadastrar um item novo.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border text-sm font-bold cursor-pointer"
            style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
          >
            Cancelar
          </button>
        </ModalFooter>
      </form>
    </Modal>

    {itemObsoletoPendente && (
      <ConfirmDialog
        titulo="Item Obsoleto no SAP"
        variante="padrao"
        confirmarLabel="Entendido, selecionar item"
        cancelarLabel="Voltar e escolher outro"
        mensagem={
          <div className="space-y-2 text-xs">
            <p>
              O material <strong className="font-mono text-emerald-700 dark:text-emerald-400">{itemObsoletoPendente.materialCode}</strong> — <strong>{itemObsoletoPendente.description}</strong> está com status <strong>obsoleto no SAP{itemObsoletoPendente.statusGeral ? ` (${itemObsoletoPendente.statusGeral})` : ''}</strong>.
            </p>
            <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200">
              <p className="font-bold flex items-center gap-1.5 mb-1">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                Atenção: Ativação necessária com o setor Fiscal
              </p>
              <p className="leading-relaxed">
                Para que a compra deste material seja processada, <strong>você precisa solicitar a ativação do código com o setor Fiscal</strong>.
              </p>
            </div>
            <p className="text-slate-500 dark:text-slate-400">
              Deseja vincular este material à solicitação mesmo assim?
            </p>
          </div>
        }
        onConfirmar={() => {
          const m = itemObsoletoPendente;
          setItemObsoletoPendente(null);
          confirmarEscolha(m);
        }}
        onCancelar={() => setItemObsoletoPendente(null)}
      />
    )}
    </>
  );
}

