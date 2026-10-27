/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Busca global (Ctrl+K): paleta que acha páginas, formulários, solicitações,
 * RMs e materiais e leva direto ao destino. Quem monta decide quando abrir
 * (`App.tsx`); aqui dentro só há a caixa, a lista e o teclado.
 *
 * Páginas, formulários, solicitações e RMs vêm de dados já no aparelho e
 * respondem a cada tecla; materiais vão à RPC `buscar_materiais`, com
 * debounce, e a resposta atrasada de uma digitação anterior é descartada.
 *
 * Escolher um material não sai da busca: abre a situação dele (saldo, RM,
 * pedido, previsão de entrega, MIGO — `SituacaoMaterialResumo`), com o botão
 * para o Catálogo SAP. Esc ou ← volta à lista; digitar também.
 *
 * Peças de projeto (BOM, RPC `proj_buscar_pecas`) entram para quem lida com
 * elas e abrem `SituacaoPecaProjetoResumo`: saldo do Projetos e autonomia por
 * tramo. Material SAP de projeto (`100000…`) abre esse mesmo resumo quando
 * está no catálogo do projeto, com a situação SAP dentro.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CornerDownLeft, ExternalLink, FileText, Loader2, Search, X } from 'lucide-react';
import type { Profile } from '../types';
import {
  buscarLocal,
  buscarMateriaisGlobal,
  buscarPecasProjetoGlobal,
  combinarResultados,
  paginasRecentes,
  type ResultadoBusca,
} from '../lib/buscaGlobal';
import { isProjetoItem } from '../lib/demandas';
import { canAccessPage } from '../lib/pages';
import { acoesDaPecaQr } from './EscolhaAcaoPecaQr';
import SituacaoPecaProjetoResumo from './almoxarifado/SituacaoPecaProjetoResumo';
import { normalizarTermo } from '../lib/materiais';
import { useDebounce } from '../lib/useDebounce';
import SituacaoMaterialResumo from './almoxarifado/SituacaoMaterialResumo';

interface Props {
  user: Profile;
  onFechar: () => void;
  onNavigate: (path: string) => void;
}

const ID_LISTA = 'busca-global-lista';

/** Material SAP de projeto: o resumo da peça (Projetos) quando ela está no catálogo; senão, o do SAP. */
function ResumoMaterialDeProjeto({ material }: { material: string }) {
  const [achou, setAchou] = useState<boolean | null>(null);
  useEffect(() => setAchou(null), [material]);
  if (achou === false) return <SituacaoMaterialResumo material={material} mostrarCabecalho={false} />;
  return <SituacaoPecaProjetoResumo chave={material} mostrarCabecalho={false} onCarregado={d => setAchou(Boolean(d))} />;
}
const idOpcao = (i: number) => `busca-global-opcao-${i}`;

export default function BuscaGlobal({ user, onFechar, onNavigate }: Props) {
  const [termo, setTermo] = useState('');
  const [materiais, setMateriais] = useState<ResultadoBusca[]>([]);
  const [pecas, setPecas] = useState<ResultadoBusca[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [ativo, setAtivo] = useState(0);
  // Material escolhido: a paleta mostra a situação dele no lugar da lista.
  const [materialAberto, setMaterialAberto] = useState<ResultadoBusca | null>(null);
  const campoRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLUListElement>(null);
  const requisicaoRef = useRef(0);

  const busca = termo.trim();
  const buscaAtrasada = useDebounce(busca, 220);
  const podeBuscarMateriais = normalizarTermo(buscaAtrasada).tipo !== 'curto';
  // Peças de projeto só para quem abre alguma tela delas (Cadastro BOM, Gemba, Projetos).
  const vePecas = useMemo(() => acoesDaPecaQr(user).length > 0, [user]);
  const pecasRef = useRef(0);

  // Materiais: consulta ao servidor, só com o termo parado e com tamanho que valha a ida.
  useEffect(() => {
    const id = ++requisicaoRef.current;
    if (!podeBuscarMateriais) {
      setMateriais([]);
      setCarregando(false);
      return;
    }
    setCarregando(true);
    buscarMateriaisGlobal(buscaAtrasada)
      .then(r => {
        if (id === requisicaoRef.current) setMateriais(r);
      })
      .catch(() => {
        if (id === requisicaoRef.current) setMateriais([]);
      })
      .finally(() => {
        if (id === requisicaoRef.current) setCarregando(false);
      });
  }, [buscaAtrasada, podeBuscarMateriais]);

  useEffect(() => {
    const id = ++pecasRef.current;
    if (!vePecas || !podeBuscarMateriais) {
      setPecas([]);
      return;
    }
    buscarPecasProjetoGlobal(buscaAtrasada)
      .then(r => { if (id === pecasRef.current) setPecas(r); })
      .catch(() => { if (id === pecasRef.current) setPecas([]); });
  }, [buscaAtrasada, podeBuscarMateriais, vePecas]);

  const recentes = useMemo(() => paginasRecentes(user), [user]);
  const local = useMemo(() => (busca ? buscarLocal(user, busca) : []), [user, busca]);
  // Enquanto digita, os materiais de uma busca anterior ficam de fora: seriam de outro termo.
  const materiaisValidos = busca === buscaAtrasada ? materiais : [];
  const pecasValidas = busca === buscaAtrasada ? pecas : [];
  const lista = useMemo(
    () => (busca ? combinarResultados(local, materiaisValidos, pecasValidas) : recentes),
    [busca, local, materiaisValidos, pecasValidas, recentes],
  );

  useEffect(() => {
    setAtivo(0);
  }, [busca]);

  useEffect(() => {
    campoRef.current?.focus();
  }, []);

  useEffect(() => {
    listaRef.current?.querySelector(`#${idOpcao(ativo)}`)?.scrollIntoView({ block: 'nearest' });
  }, [ativo, lista]);

  // Esc em captura: fecha só a busca, sem derrubar um modal que esteja por baixo.
  // Com a situação de um material aberta, o Esc volta à lista.
  useEffect(() => {
    const aoTeclar = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      if (materialAberto) {
        setMaterialAberto(null);
        campoRef.current?.focus();
      } else {
        onFechar();
      }
    };
    window.addEventListener('keydown', aoTeclar, true);
    return () => window.removeEventListener('keydown', aoTeclar, true);
  }, [onFechar, materialAberto]);

  const navegar = (r: ResultadoBusca) => {
    onFechar();
    onNavigate(r.path);
  };

  const abrir = (r: ResultadoBusca | undefined) => {
    if (!r) return;
    if (r.grupo === 'Materiais' || r.grupo === 'Peças de projeto') setMaterialAberto(r);
    else navegar(r);
  };

  const aoTeclarNoCampo = (ev: React.KeyboardEvent<HTMLInputElement>) => {
    if (materialAberto) {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        if (podeAbrirDestino) navegar(materialAberto);
      }
      return;
    }
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      if (lista.length) setAtivo(a => (a + 1) % lista.length);
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      if (lista.length) setAtivo(a => (a - 1 + lista.length) % lista.length);
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      abrir(lista[ativo]);
    }
  };

  const ehPeca = materialAberto?.grupo === 'Peças de projeto';
  // Da peça, o atalho é o Gemba (onde ela está); sem acesso a ele, a tela fica sem botão.
  const podeAbrirDestino = !ehPeca || canAccessPage(user, 'almox_gemba');
  const semResultado = busca !== '' && lista.length === 0 && !carregando;
  const dica = busca !== '' && !podeBuscarMateriais && busca.length < 3 ? 'Digite ao menos 3 letras para incluir materiais.' : null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-start justify-center bg-slate-950/60 backdrop-blur-xs animate-fade-in sm:px-4 sm:pt-[12vh]"
      onMouseDown={ev => {
        if (ev.target === ev.currentTarget) onFechar();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Busca global"
        className={`flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl dark:bg-slate-900 sm:h-auto sm:rounded-2xl sm:border sm:border-slate-200 dark:sm:border-slate-700 ${
          materialAberto ? 'sm:max-h-[85vh] sm:max-w-2xl' : 'sm:max-h-[70vh] sm:max-w-xl'
        }`}
      >
        <div className="flex items-center gap-2 border-b border-slate-200 px-3 dark:border-slate-700">
          <Search className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
          <input
            ref={campoRef}
            type="text"
            value={termo}
            onChange={ev => {
              setTermo(ev.target.value);
              setMaterialAberto(null);
            }}
            onKeyDown={aoTeclarNoCampo}
            role="combobox"
            aria-expanded={lista.length > 0}
            aria-controls={ID_LISTA}
            aria-activedescendant={lista.length ? idOpcao(ativo) : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
            placeholder="Buscar página, formulário, solicitação, RM ou material…"
            className="h-14 min-w-0 flex-1 bg-transparent text-base text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-slate-100"
          />
          {carregando && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-400" aria-label="Buscando materiais" />}
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar busca"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {materialAberto ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="mb-3 flex items-start gap-2">
              <button
                type="button"
                onClick={() => { setMaterialAberto(null); campoRef.current?.focus(); }}
                aria-label="Voltar aos resultados"
                className="mt-0.5 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-xs font-bold text-blue-700 dark:text-blue-400">{materialAberto.id}</p>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">{materialAberto.titulo}</p>
              </div>
              {podeAbrirDestino && (
                <button
                  type="button"
                  onClick={() => navegar(materialAberto)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:border-blue-400 hover:text-blue-700 dark:border-slate-700 dark:text-slate-200"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> {ehPeca ? 'Ver no Gemba' : 'Catálogo SAP'}
                </button>
              )}
            </div>
            {ehPeca ? (
              <SituacaoPecaProjetoResumo chave={materialAberto.id} mostrarCabecalho={false} />
            ) : vePecas && isProjetoItem(materialAberto.id) ? (
              <ResumoMaterialDeProjeto material={materialAberto.id} />
            ) : (
              <SituacaoMaterialResumo material={materialAberto.id} mostrarCabecalho={false} />
            )}
          </div>
        ) : (
        <ul ref={listaRef} id={ID_LISTA} role="listbox" aria-label="Resultados" className="min-h-0 flex-1 overflow-y-auto p-2">
          {lista.map((r, i) => {
            const Icone = r.icone ?? FileText;
            const titulo = busca ? r.grupo : 'Recentes';
            const novoGrupo = i === 0 || (busca ? lista[i - 1].grupo !== r.grupo : false);
            return (
              <React.Fragment key={`${r.grupo}:${r.id}`}>
                {novoGrupo && (
                  <li role="presentation" className="px-2 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 first:pt-1">
                    {titulo}
                  </li>
                )}
                <li
                  id={idOpcao(i)}
                  role="option"
                  aria-selected={i === ativo}
                  onMouseMove={() => i !== ativo && setAtivo(i)}
                  onClick={() => abrir(r)}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 ${
                    i === ativo ? 'bg-emerald-50 dark:bg-emerald-950/30' : ''
                  }`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                    <Icone className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{r.titulo}</span>
                    {r.subtitulo && <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{r.subtitulo}</span>}
                  </span>
                  {i === ativo && <CornerDownLeft className="hidden h-4 w-4 shrink-0 text-emerald-600 sm:block dark:text-emerald-400" aria-hidden="true" />}
                </li>
              </React.Fragment>
            );
          })}

          {semResultado && (
            <li role="presentation" className="px-3 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              Nada encontrado para <strong className="text-slate-700 dark:text-slate-200">“{busca}”</strong>.
              <span className="mt-1 block text-xs">Tente outra palavra, ou o número da solicitação ou da RM.</span>
            </li>
          )}
          {!busca && lista.length === 0 && (
            <li role="presentation" className="px-3 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              Digite para buscar páginas, formulários, solicitações, RMs e materiais.
            </li>
          )}
        </ul>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-3 py-2 text-[11px] text-slate-400 dark:border-slate-700">
          <span className="min-w-0 truncate">
            {materialAberto
              ? ehPeca ? 'Situação da peça: saldo no Projetos, autonomia por tramo e o que vai chegar.' : 'Situação do material: saldo, RM, pedido, entrega e MIGO.'
              : dica ?? 'Materiais aparecem com 3 letras ou 4 dígitos — Enter mostra a situação.'}
          </span>
          <span className="hidden shrink-0 sm:inline">
            {materialAberto
              ? `${podeAbrirDestino ? `Enter ${ehPeca ? 'Gemba' : 'Catálogo SAP'} · ` : ''}Esc voltar`
              : '↑↓ navegar · Enter abrir · Esc fechar'}
          </span>
        </div>
      </div>
    </div>
  );
}
