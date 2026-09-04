/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Seleção de colaboradores para a ASE — no formato "carrinho de compras".
 *
 * O popover anterior adicionava um nome por vez e fechava a cada escolha: para
 * montar uma ASE de trinta pessoas, eram trinta idas ao botão. Aqui o usuário
 * filtra, vai marcando quem quer (o carrinho no rodapé acompanha), e só então
 * confirma — uma gravação em lote só.
 *
 * Os filtros saem das colunas que a planilha do RH alimenta em `rh_pessoas`
 * (macroárea, área, subsetor, cargo) e são encadeados: escolher a macroárea
 * reduz as áreas oferecidas, e assim por diante, para não sobrar opção que não
 * casa com nada.
 */

import React, { useMemo, useState } from 'react';
import { Search, Users, X, Plus, Check, ShoppingCart, Filter, UserPlus } from 'lucide-react';
import type { RhPessoa } from '../../types';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '../ui/Modal';

interface SeletorColaboradoresModalProps {
  pessoas: RhPessoa[];
  /** Ids de `rh_pessoas` já presentes na ASE — aparecem marcados e travados. */
  jaAdicionados: Set<string>;
  onConfirmar: (escolhidos: RhPessoa[]) => void;
  onAdicionarManual: (dados: { nome: string; registro: string; cargo: string }) => void;
  onFechar: () => void;
  salvando?: boolean;
}

type CampoFiltro = 'macroarea' | 'area' | 'subsetor' | 'cargo';

const ROTULO_FILTRO: Record<CampoFiltro, string> = {
  macroarea: 'Macroárea',
  area: 'Área',
  subsetor: 'Subsetor',
  cargo: 'Cargo',
};

// A ordem importa: cada filtro só oferece o que sobrou dos anteriores.
const CAMPOS: CampoFiltro[] = ['macroarea', 'area', 'subsetor', 'cargo'];

const semAcento = (v: string) => v.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export default function SeletorColaboradoresModal({
  pessoas,
  jaAdicionados,
  onConfirmar,
  onAdicionarManual,
  onFechar,
  salvando = false,
}: SeletorColaboradoresModalProps) {
  const [termo, setTermo] = useState('');
  const [filtros, setFiltros] = useState<Record<CampoFiltro, string>>({
    macroarea: '', area: '', subsetor: '', cargo: '',
  });
  const [carrinho, setCarrinho] = useState<RhPessoa[]>([]);
  const [modoManual, setModoManual] = useState(false);
  const [manual, setManual] = useState({ nome: '', registro: '', cargo: '' });

  const ativos = useMemo(() => pessoas.filter(p => p.ativo), [pessoas]);

  /** Aplica os filtros até `pararEm` (exclusive) — base das opções encadeadas. */
  const filtrarAte = (lista: RhPessoa[], pararEm: number) =>
    lista.filter(p => CAMPOS.slice(0, pararEm).every(campo => {
      const escolhido = filtros[campo];
      return !escolhido || (p[campo] || '') === escolhido;
    }));

  const opcoesPorCampo = useMemo(() => {
    const mapa = {} as Record<CampoFiltro, string[]>;
    CAMPOS.forEach((campo, i) => {
      const valores = new Set<string>();
      filtrarAte(ativos, i).forEach(p => {
        const valor = (p[campo] || '').trim();
        if (valor) valores.add(valor);
      });
      // O valor já escolhido continua na lista mesmo se ficar órfão, senão o
      // select apareceria vazio e o usuário não teria como desfazer.
      if (filtros[campo]) valores.add(filtros[campo]);
      mapa[campo] = Array.from(valores).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    });
    return mapa;
  }, [ativos, filtros]);

  const resultados = useMemo(() => {
    const q = semAcento(termo.trim());
    return filtrarAte(ativos, CAMPOS.length)
      .filter(p => !q || semAcento(p.nome).includes(q) || p.registro.toLowerCase().includes(q))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [ativos, filtros, termo]);

  const idsCarrinho = useMemo(() => new Set(carrinho.map(p => p.id)), [carrinho]);
  const disponiveis = useMemo(
    () => resultados.filter(p => !jaAdicionados.has(p.id)),
    [resultados, jaAdicionados],
  );
  const todosMarcados = disponiveis.length > 0 && disponiveis.every(p => idsCarrinho.has(p.id));

  const alternar = (pessoa: RhPessoa) => {
    if (jaAdicionados.has(pessoa.id)) return;
    setCarrinho(prev => (
      prev.some(p => p.id === pessoa.id) ? prev.filter(p => p.id !== pessoa.id) : [...prev, pessoa]
    ));
  };

  const alternarTodosDaBusca = () => {
    if (todosMarcados) {
      const idsVisiveis = new Set(disponiveis.map(p => p.id));
      setCarrinho(prev => prev.filter(p => !idsVisiveis.has(p.id)));
      return;
    }
    setCarrinho(prev => {
      const existentes = new Set(prev.map(p => p.id));
      return [...prev, ...disponiveis.filter(p => !existentes.has(p.id))];
    });
  };

  const limparFiltros = () => {
    setFiltros({ macroarea: '', area: '', subsetor: '', cargo: '' });
    setTermo('');
  };

  const filtrosAtivos = CAMPOS.filter(c => filtros[c]).length + (termo.trim() ? 1 : 0);

  const selectClass = 'h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 cursor-pointer';
  const campoManual = 'h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs uppercase text-slate-900 placeholder:normal-case focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50';

  return (
    <Modal onClose={onFechar} maxWidth="max-w-3xl" ariaLabel="Adicionar colaboradores à ASE">
      <ModalHeader onClose={onFechar}>
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
            <Users className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">Adicionar colaboradores</h3>
            <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
              Marque quantos precisar e confirme de uma vez só.
            </p>
          </div>
        </div>
      </ModalHeader>

      <ModalBody className="space-y-3">
        {modoManual ? (
          <div className="rounded-xl border border-slate-200 p-3.5 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">Colaborador não cadastrado</span>
              <button
                type="button"
                onClick={() => setModoManual(false)}
                className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
              >
                ← Voltar à lista
              </button>
            </div>
            <div>
              <label htmlFor="colab-nome" className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Nome *
              </label>
              <input
                id="colab-nome"
                type="text"
                value={manual.nome}
                onChange={e => setManual(m => ({ ...m, nome: e.target.value.toUpperCase() }))}
                placeholder="Nome completo"
                className={campoManual}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="colab-registro" className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Registro
                </label>
                <input
                  id="colab-registro"
                  type="text"
                  value={manual.registro}
                  onChange={e => setManual(m => ({ ...m, registro: e.target.value.toUpperCase() }))}
                  placeholder="Opcional"
                  className={campoManual}
                />
              </div>
              <div>
                <label htmlFor="colab-cargo" className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Função
                </label>
                <input
                  id="colab-cargo"
                  type="text"
                  value={manual.cargo}
                  onChange={e => setManual(m => ({ ...m, cargo: e.target.value.toUpperCase() }))}
                  placeholder="Opcional"
                  className={campoManual}
                />
              </div>
            </div>
            <button
              type="button"
              disabled={!manual.nome.trim()}
              onClick={() => {
                onAdicionarManual({
                  nome: manual.nome.trim(),
                  registro: manual.registro.trim(),
                  cargo: manual.cargo.trim(),
                });
                setManual({ nome: '', registro: '', cargo: '' });
                setModoManual(false);
              }}
              className="w-full rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              Adicionar à ASE
            </button>
          </div>
        ) : (
          <>
            {/* Busca */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              {/* eslint-disable-next-line jsx-a11y/no-autofocus -- modal aberto por clique explícito */}
              <input
                type="text"
                autoFocus
                value={termo}
                onChange={e => setTermo(e.target.value)}
                placeholder="Buscar por nome ou registro..."
                className="h-10 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
              />
            </div>

            {/* Filtros encadeados */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <Filter className="h-3 w-3" /> Filtros
                </span>
                {filtrosAtivos > 0 && (
                  <button
                    type="button"
                    onClick={limparFiltros}
                    className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 cursor-pointer"
                  >
                    Limpar filtros ({filtrosAtivos})
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {CAMPOS.map((campo, i) => (
                  <select
                    key={campo}
                    value={filtros[campo]}
                    aria-label={ROTULO_FILTRO[campo]}
                    onChange={e => {
                      const valor = e.target.value;
                      // Trocar um filtro invalida os de baixo: a área escolhida
                      // pode não existir dentro da nova macroárea.
                      setFiltros(prev => {
                        const proximo = { ...prev, [campo]: valor };
                        CAMPOS.slice(i + 1).forEach(abaixo => { proximo[abaixo] = ''; });
                        return proximo;
                      });
                    }}
                    className={selectClass}
                  >
                    <option value="">{ROTULO_FILTRO[campo]}: todas</option>
                    {opcoesPorCampo[campo].map(valor => (
                      <option key={valor} value={valor}>{valor}</option>
                    ))}
                  </select>
                ))}
              </div>
            </div>

            {/* Lista */}
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                {resultados.length} colaborador(es)
              </span>
              {disponiveis.length > 0 && (
                <button
                  type="button"
                  onClick={alternarTodosDaBusca}
                  className="text-[11px] font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 cursor-pointer"
                >
                  {todosMarcados ? 'Desmarcar os visíveis' : `Marcar os ${disponiveis.length} visíveis`}
                </button>
              )}
            </div>

            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {resultados.length === 0 ? (
                <li className="px-3 py-8 text-center text-xs text-slate-400">
                  Nenhum colaborador encontrado com esses filtros.
                </li>
              ) : (
                resultados.map(p => {
                  const jaNaAse = jaAdicionados.has(p.id);
                  const marcado = idsCarrinho.has(p.id);
                  const detalhes = [p.cargo, p.area || p.subsetor, p.turno].filter(Boolean).join(' · ');
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => alternar(p)}
                        disabled={jaNaAse}
                        className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                          jaNaAse
                            ? 'cursor-not-allowed opacity-50'
                            : marcado
                              ? 'bg-blue-50/70 dark:bg-blue-950/25 cursor-pointer'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer'
                        }`}
                      >
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                          marcado || jaNaAse
                            ? 'border-blue-600 bg-blue-600 text-white'
                            : 'border-slate-300 dark:border-slate-600'
                        }`}>
                          {(marcado || jaNaAse) && <Check className="h-3.5 w-3.5" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-bold text-slate-900 dark:text-slate-50">{p.nome}</span>
                          <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
                            {p.registro}{detalhes ? ` · ${detalhes}` : ''}
                          </span>
                        </span>
                        {jaNaAse && (
                          <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            Já na ASE
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>

            <button
              type="button"
              onClick={() => setModoManual(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-2.5 py-2 text-xs font-semibold text-slate-600 transition-colors hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:text-slate-300 dark:hover:border-blue-600 dark:hover:bg-blue-950/30 cursor-pointer"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Outro — colaborador não cadastrado
            </button>
          </>
        )}
      </ModalBody>

      {!modoManual && (
        <ModalFooter className="!justify-between">
          {/* Carrinho: os escolhidos ficam à vista, e cada chip remove o seu. */}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <ShoppingCart className={`h-4 w-4 shrink-0 ${carrinho.length > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`} />
            {carrinho.length === 0 ? (
              <span className="text-[11px] text-slate-400">Nenhum colaborador selecionado.</span>
            ) : (
              <div className="flex max-h-16 min-w-0 flex-1 flex-wrap gap-1 overflow-y-auto">
                {carrinho.map(p => (
                  <span
                    key={p.id}
                    className="inline-flex max-w-full items-center gap-1 rounded-full bg-blue-50 py-0.5 pl-2 pr-1 text-[10px] font-bold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"
                  >
                    <span className="truncate">{p.nome}</span>
                    <button
                      type="button"
                      onClick={() => alternar(p)}
                      aria-label={`Remover ${p.nome}`}
                      className="shrink-0 rounded-full p-0.5 hover:bg-blue-200/70 dark:hover:bg-blue-900 cursor-pointer"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            disabled={carrinho.length === 0 || salvando}
            onClick={() => onConfirmar(carrinho)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            {salvando
              ? 'Adicionando...'
              : `Adicionar${carrinho.length > 0 ? ` ${carrinho.length}` : ''}`}
          </button>
        </ModalFooter>
      )}
    </Modal>
  );
}
