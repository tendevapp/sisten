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

import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import Modal, { ModalBody, ModalFooter, ModalHeader } from './ui/Modal';
import { SinalChips } from './ui/SinalChips';
import {
  buscarMateriais,
  normalizarTermo,
  resumoSinais,
  type MaterialResultado,
  type SinalChip,
} from '../lib/materiais';

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

export default function MaterialSearchModal({ termoInicial = '', areaUsuario = null, onSelect, onClose }: Props) {
  const [termo, setTermo] = useState(termoInicial);
  const [incluirTecnico, setIncluirTecnico] = useState(false);
  const [resultados, setResultados] = useState<MaterialResultado[]>([]);
  const [estado, setEstado] = useState<Estado>('inicial');
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [temMais, setTemMais] = useState(false);
  /** O termo que gerou a lista na tela — não o que está sendo digitado. */
  const [termoBuscado, setTermoBuscado] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);

  const curto = normalizarTermo(termo).tipo === 'curto';

  const buscar = useCallback(async (alvo: string, comTecnico: boolean) => {
    if (normalizarTermo(alvo).tipo === 'curto') return;
    setEstado('buscando');
    setTemMais(false);
    try {
      const achados = await buscarMateriais(alvo, {
        areaUsuario,
        limite: PAGINA,
        incluirTecnico: comTecnico,
      });
      setResultados(achados);
      setTermoBuscado(alvo);
      // Página cheia é o único indício de que pode haver mais. Se veio
      // incompleta, acabou — e evitamos um request só para descobrir isso.
      setTemMais(achados.length === PAGINA);
      setEstado('pronto');
    } catch (err) {
      console.error('Erro ao buscar materiais no catálogo SAP:', err);
      setResultados([]);
      setEstado('erro');
    }
  }, [areaUsuario]);

  const carregarMais = useCallback(async () => {
    setCarregandoMais(true);
    try {
      const achados = await buscarMateriais(termoBuscado, {
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
  }, [termoBuscado, areaUsuario, resultados.length, incluirTecnico]);

  /**
   * Trocar o escopo é um pedido de nova busca, não um filtro de tela: o
   * casamento acontece no banco, então a lista atual não contém as linhas que
   * o texto técnico traria. Refaz a busca, mas só se já havia uma.
   */
  const alternarTecnico = (marcado: boolean) => {
    setIncluirTecnico(marcado);
    if (termoBuscado) void buscar(termoBuscado, marcado);
  };

  const escolher = (mat: MaterialResultado) => {
    onSelect(mat, resumoSinais(mat));
    onClose();
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-3xl" ariaLabel="Buscar no catálogo SAP">
      <ModalHeader onClose={onClose}>
        <h2 className="text-base font-bold" style={{ color: 'var(--ink-primary)' }}>Catálogo SAP</h2>
        <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-muted)' }}>
          Digite uma palavra-chave e pressione Buscar.
        </p>
      </ModalHeader>

      <form
        onSubmit={e => { e.preventDefault(); void buscar(termo.trim(), incluirTecnico); }}
        className="flex flex-col flex-1 min-h-0"
      >
        <div className="px-4 sm:px-6 pt-4 shrink-0">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: 'var(--ink-muted)' }} />
              <input
                ref={inputRef}
                type="text"
                value={termo}
                onChange={e => setTermo(e.target.value)}
                placeholder="Ex.: valvula esfera inox"
                className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm transition-colors focus:outline-2 focus:outline-offset-1"
                style={{ background: 'var(--surface-raised)', borderColor: 'var(--hairline)', color: 'var(--ink-primary)' }}
              />
            </div>
            <button
              type="submit"
              disabled={curto || estado === 'buscando'}
              className="rounded-lg px-5 text-sm font-bold shrink-0 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'var(--brand)', color: 'var(--on-brand)' }}
            >
              {estado === 'buscando' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Buscar'}
            </button>
          </div>

          <label className="flex items-center gap-2 mt-2.5 text-[11px] cursor-pointer w-fit" style={{ color: 'var(--ink-muted)' }}>
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
        </div>

        <ModalBody className="pt-3">
          {estado === 'inicial' ? (
            <p className="text-sm text-center py-10" style={{ color: 'var(--ink-muted)' }}>
              {curto
                ? 'Digite ao menos 3 letras (ou 4 dígitos do código) para buscar.'
                : 'Pressione Buscar para consultar o catálogo.'}
            </p>
          ) : estado === 'erro' ? (
            <div className="text-sm text-center py-10" style={{ color: 'var(--status-serious)' }}>
              Não foi possível buscar no catálogo.
              <button
                type="button"
                onClick={() => void buscar(termoBuscado || termo.trim(), incluirTecnico)}
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
              Nenhum item corresponde a “{termoBuscado}”.
              <div className="text-[11px] mt-1">
                {incluirTecnico
                  ? 'Tente outra palavra-chave — o catálogo abrevia bastante.'
                  : 'Tente marcar “incluir texto técnico” acima, ou outra palavra-chave.'}
              </div>
            </div>
          ) : (
            <>
              <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--ink-muted)' }}>
                {resultados.length}{temMais ? '+' : ''} resultado{resultados.length === 1 ? '' : 's'} para “{termoBuscado}”
              </div>
              <div className="divide-y rounded-lg border overflow-hidden" style={{ borderColor: 'var(--hairline)' }}>
                {resultados.map(mat => {
                  const chips = resumoSinais(mat);
                  return (
                    <button
                      key={mat.materialCode}
                      type="button"
                      onClick={() => escolher(mat)}
                      className="w-full text-left px-3 py-2.5 transition-colors hover:bg-[var(--surface-raised)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-sm font-medium" style={{ color: 'var(--ink-primary)' }}>
                          {mat.description}
                        </span>
                        <span
                          className="text-[11px] font-mono px-1 rounded uppercase shrink-0"
                          style={{ background: 'var(--surface-sunken)', color: 'var(--ink-muted)' }}
                        >
                          {mat.unit}
                        </span>
                      </div>
                      <div className="text-[11px] mt-0.5 font-mono" style={{ color: 'var(--ink-muted)' }}>
                        {mat.materialCode}
                        {mat.technicalText ? ` · ${mat.technicalText}` : ''}
                      </div>
                      <SinalChips chips={chips} className="mt-1.5" />
                    </button>
                  );
                })}
              </div>

              {temMais && (
                <button
                  type="button"
                  onClick={() => void carregarMais()}
                  disabled={carregandoMais}
                  className="w-full mt-3 py-2 rounded-lg border text-sm font-bold transition-colors disabled:opacity-50"
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
            className="px-4 py-2 rounded-lg border text-sm font-bold"
            style={{ borderColor: 'var(--hairline)', color: 'var(--ink-secondary)' }}
          >
            Cancelar
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
