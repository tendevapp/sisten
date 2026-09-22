/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Análise e Mapa de Cotações — MVP: importar (colar markdown → IA extrai os
 * 40 campos), revisar numa grade editável com validação de completude,
 * vincular os itens cotados aos itens de RM do processo, casar o fornecedor
 * por CNPJ e salvar no Supabase. O mapa comparativo e a busca histórica são
 * fase 2 (o schema já os deixa baratos: ri/material_code desnormalizados,
 * índice trigrama em descricao_produto).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowUp, PackageSearch, Loader2, LayoutGrid, ClipboardList } from 'lucide-react';
import { localDb } from '../db/localDb';
import { useToast } from '../components/ui/Toast';
import ProcessosList from '../components/cotacoes/ProcessosList';
import NovoProcessoPanel from '../components/cotacoes/NovoProcessoPanel';
import ImportarPropostasPanel from '../components/cotacoes/ImportarPropostasPanel';
import PropostaCard from '../components/cotacoes/PropostaCard';
import MapaComparativo from '../components/cotacoes/MapaComparativo';
import RevisaoPedidoCompra from '../components/cotacoes/RevisaoPedidoCompra';
import { limparComprasMemoryCache } from './Compras';
import { RASCUNHO_COTACAO_KEY, chaveRascunhoPropostas, normalizarProposta, aplicarSugestoes, normalizarDescricao, propostaSalvaParaDraft } from '../lib/cotacoes';
import { aplicarVinculosIa, revisarDivergencias } from '../lib/vinculoCotacao';
import { simularFreteCotacao, aplicarFreteTeorico, alinharPesoComVinculo } from '../lib/freteCotacao';
import {
  criarProcessoCotacao, listarProcessosCotacao, buscarProcessoCotacao,
  extrairCotacao, sugerirVinculos, salvarProcessoCotacao, excluirPropostaCotacao,
  excluirProcessoCotacao, atualizarItensCotacao, uploadArquivoCotacao, atualizarMarkdownProposta,
  buscarArquivoOriginalPorNome,
} from '../lib/cotacoesApi';
import type {
  Profile, CotacaoProcesso, CotacaoProcessoItem, CotacaoProcessoItemDraft,
  CotacaoProposta, CotacaoPropostaDraft, ExtracaoUso, TabelaFrete,
} from '../types';

interface AnaliseCotacoesProps {
  user: Profile;
  onNavigate: (path: string) => void;
}

type Fase = 'lista' | 'escopo' | 'processo' | 'mapa' | 'pedidos';


/** Lê as propostas ainda não salvas de um processo, gravadas pelo efeito de rascunho abaixo. Nunca derruba a tela — corrompido ou ausente vira lista vazia. */
function lerRascunhoPropostas(processoId: string): CotacaoPropostaDraft[] {
  try {
    const bruto = localStorage.getItem(chaveRascunhoPropostas(processoId));
    if (!bruto) return [];
    const parsed = JSON.parse(bruto);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Falha ao ler rascunho local de propostas:', err);
    return [];
  }
}

export default function AnaliseCotacoes({ user, onNavigate }: AnaliseCotacoesProps) {
  const toast = useToast();
  const [fase, setFase] = useState<Fase>('lista');

  const [processos, setProcessos] = useState<CotacaoProcesso[]>([]);
  const [carregandoLista, setCarregandoLista] = useState(true);

  const [escopoRascunho, setEscopoRascunho] = useState<CotacaoProcessoItemDraft[]>([]);
  const [criandoProcesso, setCriandoProcesso] = useState(false);

  const [processo, setProcesso] = useState<CotacaoProcesso | null>(null);
  const [escopo, setEscopo] = useState<CotacaoProcessoItem[]>([]);
  const [propostas, setPropostas] = useState<CotacaoPropostaDraft[]>([]);
  const [carregandoProcesso, setCarregandoProcesso] = useState(false);
  // Tabela contratual da Bahia Sul, do cache local — é o que transforma o
  // peso estimado pela IA em frete teórico por item (só faz sentido em FOB).
  const [tabelaFrete, setTabelaFrete] = useState<TabelaFrete[]>([]);
  // Arquivos originais (PDF/imagem) por nome, só para "ver arquivo original" no
  // card — dura só a sessão do navegador, o File não sobrevive a um F5.
  const [arquivosOriginais, setArquivosOriginais] = useState<Map<string, File>>(new Map());

  const [extraindo, setExtraindo] = useState(false);
  const [erroExtracao, setErroExtracao] = useState<string | null>(null);
  const [usoExtracao, setUsoExtracao] = useState<ExtracaoUso | null>(null);
  const [modeloExtracao, setModeloExtracao] = useState<string | null>(null);
  const [custoExtracaoBrl, setCustoExtracaoBrl] = useState<number | null>(null);
  const [salvandoKey, setSalvandoKey] = useState<string | null>(null);
  // Exclusão de proposta salva é otimista + com janela de "Desfazer" (toast):
  // esconde na hora, só chama o Supabase de verdade se o usuário não desfizer
  // a tempo. `processoIdAtualRef` existe porque o timeout/callback do toast
  // roda bem depois do clique — precisa saber se o usuário já trocou de
  // processo nesse meio-tempo antes de mexer no `propostas` (senão injeta a
  // proposta de volta na tela errada).
  const pendentesExclusaoRef = useRef<Map<string, { timeoutId: number; draft: CotacaoPropostaDraft; processoId: string }>>(new Map());
  const processoIdAtualRef = useRef<string | null>(null);
  useEffect(() => { processoIdAtualRef.current = processo?.id ?? null; }, [processo]);

  // Peso canônico por RI (processo_item_id) desta sessão de análise — a
  // primeira estimativa vista para um item vira a referência para toda
  // cotação seguinte que citar o mesmo RI (ver `alinharPesoComVinculo`).
  // Precisa ser ref, não state: é bookkeeping interno que não deve disparar
  // re-render sozinho, só junto da proposta que o atualizou.
  const pesoPorRiRef = useRef<Map<string, number>>(new Map());

  /** Semeia o mapa de peso canônico a partir de propostas já existentes (salvas ou em rascunho) — chamado ao abrir um processo. */
  const construirPesoPorRi = (drafts: CotacaoPropostaDraft[]): Map<string, number> => {
    const mapa = new Map<string, number>();
    for (const draft of drafts) {
      for (const item of draft.itens) {
        if (item.processo_item_id && item.peso_unitario_kg != null && !mapa.has(item.processo_item_id)) {
          mapa.set(item.processo_item_id, item.peso_unitario_kg);
        }
      }
    }
    return mapa;
  };

  const topRef = useRef<HTMLDivElement>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const mainEl = topRef.current?.closest('main');
      const scrollY = mainEl ? mainEl.scrollTop : (window.scrollY || document.documentElement.scrollTop);
      setShowScrollTop(scrollY > 250);
    };

    const mainEl = topRef.current?.closest('main');
    if (mainEl) {
      mainEl.addEventListener('scroll', handleScroll, { passive: true });
    }
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      if (mainEl) mainEl.removeEventListener('scroll', handleScroll);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const scrollToTop = () => {
    if (topRef.current) {
      topRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    const mainEl = topRef.current?.closest('main');
    if (mainEl) {
      mainEl.scrollTo({ top: 0, behavior: 'smooth' });
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Grava em localStorage as propostas ainda não salvas a cada mudança, para
  // não perder uma extração de IA (paga) por causa de recarregar a página ou
  // fechar a aba antes de clicar em "Salvar proposta". Debounced porque
  // qualquer edição de campo dispara esse efeito.
  const debounceRascunhoRef = useRef<number | null>(null);
  useEffect(() => {
    if (fase !== 'processo' || !processo) return;
    if (debounceRascunhoRef.current != null) window.clearTimeout(debounceRascunhoRef.current);
    debounceRascunhoRef.current = window.setTimeout(() => {
      const chave = chaveRascunhoPropostas(processo.id);
      const naoSalvas = propostas.filter(p => !p._salvo);
      try {
        if (naoSalvas.length > 0) {
          localStorage.setItem(chave, JSON.stringify(naoSalvas));
        } else {
          localStorage.removeItem(chave);
        }
      } catch (err) {
        console.error('Falha ao gravar rascunho local de propostas:', err);
      }
    }, 400);
    return () => { if (debounceRascunhoRef.current != null) window.clearTimeout(debounceRascunhoRef.current); };
  }, [propostas, processo, fase]);

  const carregarLista = async () => {
    setCarregandoLista(true);
    try {
      setProcessos(await listarProcessosCotacao());
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCarregandoLista(false);
    }
  };

  useEffect(() => {
    try {
      setTabelaFrete(localDb.getTabelaFrete() as TabelaFrete[]);
    } catch (err) {
      console.error('Falha ao carregar a tabela de frete da Bahia Sul:', err);
    }
  }, []);

  // Ao montar: se veio um rascunho de escopo da Central de Compras, prioriza
  // a confirmação dele. Lê e apaga imediatamente — um rascunho ressurgindo
  // dias depois confundiria mais do que ajudaria.
  useEffect(() => {
    try {
      const bruto = sessionStorage.getItem(RASCUNHO_COTACAO_KEY);
      if (bruto) {
        sessionStorage.removeItem(RASCUNHO_COTACAO_KEY);
        const parsed = JSON.parse(bruto) as { itens: CotacaoProcessoItemDraft[] };
        if (Array.isArray(parsed.itens) && parsed.itens.length > 0) {
          setEscopoRascunho(parsed.itens);
          setFase('escopo');
          return;
        }
      }
    } catch (err) {
      console.error('Falha ao ler rascunho de processo de cotação:', err);
    }
    const hashQuery = window.location.hash.includes('?') ? window.location.hash.split('?')[1] : '';
    const params = new URLSearchParams(hashQuery || window.location.search);
    const pid = params.get('processoId') || params.get('id') || params.get('cotacao');
    const faseParam = params.get('fase') as Fase | null;
    if (pid) {
      void abrirProcesso(pid, faseParam === 'mapa' ? 'mapa' : 'processo');
      return;
    }
    carregarLista();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sincroniza navegacao por hash quando a tela ja esta montada
  useEffect(() => {
    const handleHashSync = () => {
      const hash = window.location.hash || '';
      if (!hash.includes('/suprimentos/cotacoes') && !hash.includes('/suprimentos/analise-cotacoes')) return;
      const hashQuery = hash.includes('?') ? hash.split('?')[1] : '';
      const params = new URLSearchParams(hashQuery);
      const pid = params.get('processoId') || params.get('cotacao');
      const faseParam = params.get('fase') as Fase | null;

      if (pid && pid !== processoIdAtualRef.current) {
        void abrirProcesso(pid, faseParam === 'mapa' ? 'mapa' : 'processo');
      } else if (!pid && processoIdAtualRef.current && fase !== 'escopo') {
        voltarParaLista();
      }
    };

    window.addEventListener('hashchange', handleHashSync);
    return () => window.removeEventListener('hashchange', handleHashSync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase]);

  const abrirProcesso = async (id: string, faseAlvo: Fase = 'processo') => {
    setCarregandoProcesso(true);
    try {
      const { processo: p, itens, propostas: props } = await buscarProcessoCotacao(id);
      setProcesso(p);
      setEscopo(itens);
      const rascunho = lerRascunhoPropostas(id);
      const propostasIniciais = [...props.map(propostaSalvaParaDraft), ...rascunho];
      pesoPorRiRef.current = construirPesoPorRi(propostasIniciais);
      setPropostas(propostasIniciais);
      if (rascunho.length > 0) {
        toast.info(`${rascunho.length} proposta(s) extraída(s) por IA recuperada(s) do rascunho local — ainda não salvas.`);
      }
      setFase(faseAlvo);
      // Sincroniza a URL no navegador sem recarregar a pagina
      const novoHash = `#/suprimentos/cotacoes?processoId=${encodeURIComponent(id)}${faseAlvo === 'mapa' ? '&fase=mapa' : ''}`;
      if (window.location.hash !== novoHash) {
        window.history.replaceState(null, '', novoHash);
      }
    } catch (err) {
      toast.error((err as Error).message);
      // Se o processo nao foi encontrado ou foi excluido, volta para a lista e limpa a URL
      window.history.replaceState(null, '', '#/suprimentos/cotacoes');
      setFase('lista');
      carregarLista();
    } finally {
      setCarregandoProcesso(false);
    }
  };

  const handleCriarProcesso = async (titulo: string | null, observacoes: string | null) => {
    setCriandoProcesso(true);
    try {
      const novo = await criarProcessoCotacao({
        titulo, observacoes, itens: escopoRascunho, usuarioId: user.id, usuarioNome: user.name,
      });
      limparComprasMemoryCache();
      toast.success(`Processo ${novo.numero} criado.`);
      setEscopoRascunho([]);
      await abrirProcesso(novo.id);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCriandoProcesso(false);
    }
  };

  /**
   * Recalcula o frete teórico da proposta inteira e devolve o rascunho com a
   * parcela de cada item. Roda na proposta toda (e não item a item) porque a
   * tabela é escalonada: mudar o peso de uma linha muda a faixa de tarifa da
   * carga e, com ela, o frete de todas as outras.
   */
  const comFreteTeorico = (draft: CotacaoPropostaDraft): CotacaoPropostaDraft => {
    const simulacao = simularFreteCotacao({ proposta: draft, tabela: tabelaFrete });
    return { ...draft, itens: aplicarFreteTeorico(draft.itens, simulacao) };
  };

  /**
   * Resolve o vínculo com a RM em duas camadas, da mais informada para a
   * menos: primeiro a sugestão da IA (que leu o PDF inteiro), depois o
   * trigrama/memória para o que sobrou sem vínculo. O cruzamento das duas
   * vira aviso de divergência quando discordam.
   */
  const resolverVinculos = async (draft: CotacaoPropostaDraft): Promise<CotacaoPropostaDraft> => {
    if (!processo || draft.itens.length === 0) return draft;

    let sugestoes: Awaited<ReturnType<typeof sugerirVinculos>> | undefined;
    try {
      sugestoes = await sugerirVinculos({
        processoId: processo.id,
        fornecedorCnpj: draft.fornecedor_cnpj,
        descricoes: draft.itens.map((it, idx) => ({ idx, descricao: it.descricao_produto, codigoProduto: it.codigo_produto })),
      });
    } catch (err) {
      console.error('Falha ao buscar sugestões de vínculo:', err);
    }

    const { itens, resumo } = aplicarVinculosIa({ itens: draft.itens, escopo, sugestoes });
    const comTrigrama = sugestoes ? aplicarSugestoes(itens, sugestoes) : itens;

    if (resumo.riInexistente > 0) {
      console.warn(`Extração: ${resumo.riInexistente} vínculo(s) sugerido(s) pela IA citam RI fora deste processo e foram descartados.`);
    }

    return { ...draft, itens: comTrigrama.map(it => revisarDivergencias(it, escopo)) };
  };

  /**
   * Trava o peso no mesmo valor para o mesmo RI em toda cotação da sessão —
   * roda depois de `resolverVinculos` (precisa do `processo_item_id` já
   * resolvido) e antes de `comFreteTeorico` (o frete depende do peso final).
   * Sem isso, duas propostas do mesmo item pesam diferente só porque a IA
   * leu descrições diferentes, e o frete teórico simulado deixa de ser
   * comparável entre fornecedores — que é o único motivo dele existir.
   */
  const alinharPeso = (draft: CotacaoPropostaDraft): CotacaoPropostaDraft => {
    const { itens, pesoPorRi } = alinharPesoComVinculo(draft.itens, pesoPorRiRef.current);
    pesoPorRiRef.current = pesoPorRi;
    return { ...draft, itens };
  };

  /** Retorna se a extração deu certo — quem chama (upload ou colagem manual) só deve descartar o markdown de origem em caso de sucesso, senão o usuário perde um arquivo já convertido (às vezes com custo de IA) por uma falha na etapa seguinte. */
  const handleProcessarMarkdown = async (markdown: string, arquivoOrigem: string | null): Promise<boolean> => {
    if (!processo) return false;
    setExtraindo(true);
    setErroExtracao(null);
    setUsoExtracao(null);
    setModeloExtracao(null);
    setCustoExtracaoBrl(null);
    try {
      const resposta = await extrairCotacao({
        markdown,
        arquivoOrigem: arquivoOrigem ?? undefined,
        processoId: processo.id,
        escopo,
      });
      setUsoExtracao(resposta.uso);
      setModeloExtracao(resposta.modelo);
      const custoBrl = resposta.custo_brl ?? (typeof resposta.custo_usd === 'number' ? resposta.custo_usd * 6 : null);
      setCustoExtracaoBrl(custoBrl);
      if (resposta.truncado) {
        toast.warning('A resposta da IA foi cortada por estourar o limite de tokens — mostrando o que veio completo.');
      }

      const novasDrafts = resposta.propostas.map(bruta => {
        const draft = normalizarProposta(bruta, { arquivoOrigem: arquivoOrigem ?? undefined, arquivoMarkdown: markdown });
        draft.extracao_id = resposta.extracao_id;
        return draft;
      });

      // Sugestão de vínculo por proposta — cada fornecedor pode ter um match
      // diferente na memória (cotacao_descricao_map é por CNPJ).
      const processadas: CotacaoPropostaDraft[] = [];
      for (const draft of novasDrafts) {
        if (draft.arquivo_origem && !draft.arquivo_storage_path) {
          const file = arquivosOriginais.get(draft.arquivo_origem);
          if (file) {
            try {
              const enviado = await uploadArquivoCotacao(processo.id, file);
              draft.arquivo_storage_path = enviado.path;
              draft.arquivo_mime_type = enviado.mimeType;
              draft.arquivo_tamanho_bytes = enviado.tamanhoBytes;
            } catch (err) {
              console.warn('Falha no upload antecipado do arquivo da proposta:', err);
            }
          }
        }
        processadas.push(comFreteTeorico(alinharPeso(await resolverVinculos(draft))));
      }

      setPropostas(prev => [...prev, ...processadas]);
      return true;
    } catch (err) {
      setErroExtracao((err as Error).message);
      return false;
    } finally {
      setExtraindo(false);
    }
  };

  const handleCarregarPropostas = async (novasPropostas: CotacaoPropostaDraft[]) => {
    if (!processo) return;
    const processadas: CotacaoPropostaDraft[] = [];

    for (const draft of novasPropostas) {
      const precisaVinculo = draft.itens.some(it => !it.processo_item_id && !it.fora_escopo && !it.desconsiderado);
      const comVinculo = precisaVinculo ? await resolverVinculos(draft) : draft;
      processadas.push(comFreteTeorico(alinharPeso(comVinculo)));
    }

    setPropostas(prev => {
      const chavesExistentes = new Set(prev.map(p => p._key));
      const aAdicionar = processadas.filter(np => !chavesExistentes.has(np._key));
      if (aAdicionar.length === 0) {
        toast.info('As propostas já estão presentes na lista de análise.');
        return prev;
      }
      return [...prev, ...aAdicionar];
    });
  };

  const handleChangeProposta = (key: string, patch: Partial<CotacaoPropostaDraft>) => {
    setPropostas(prev => prev.map(p => (p._key === key ? { ...p, ...patch } : p)));
  };

  /**
   * Corrige o Markdown extraído de uma proposta — o comprador identificou um
   * erro de conversão (tabela quebrada, número trocado pelo OCR) ao conferir
   * a cotação original. `propostaId` é o UUID real: só proposta salva pode
   * ser editada, `VerCotacaoOriginalModal` só mostra a opção nesse caso.
   */
  const handleEditarMarkdown = async (propostaId: string, novoMarkdown: string) => {
    await atualizarMarkdownProposta(propostaId, novoMarkdown, user.name);
    const agora = new Date().toISOString();
    setPropostas(prev => prev.map(p => (p._key === propostaId
      ? { ...p, arquivo_markdown: novoMarkdown, arquivo_markdown_editado_em: agora, arquivo_markdown_editado_por: user.name }
      : p)));
  };

  /** Campos cuja edição muda o frete da carga inteira, e não só a linha editada. */
  const CAMPOS_QUE_MUDAM_O_FRETE = ['peso_unitario_kg', 'quantidade', 'desconsiderado', 'preco_unitario', 'preco_total_item'] as const;
  /** Campos que a RPC de salvamento só grava na inserção — depois de salvo, vão por UPDATE. */
  const CAMPOS_PERSISTIDOS_APOS_SALVAR = ['peso_unitario_kg', 'peso_origem', 'desconsiderado'] as const;

  const handleChangeItem = (propostaKey: string, itemKey: string, patch: Partial<CotacaoPropostaDraft['itens'][number]>) => {
    const afetaFrete = CAMPOS_QUE_MUDAM_O_FRETE.some(c => c in patch);
    const afetaVinculo = afetaFrete || 'unidade_medida' in patch || 'processo_item_id' in patch || 'fora_escopo' in patch;
    let atualizada: CotacaoPropostaDraft | null = null;

    setPropostas(prev => prev.map(p => {
      if (p._key !== propostaKey) return p;
      const itens = p.itens.map(it => {
        if (it._key !== itemKey) return it;
        const novo = { ...it, ...patch };
        return afetaVinculo ? revisarDivergencias(novo, escopo) : novo;
      });
      atualizada = afetaFrete ? comFreteTeorico({ ...p, itens }) : { ...p, itens };
      return atualizada;
    }));

    // Proposta já salva: `salvar_processo_cotacao` só insere, então peso,
    // frete recalculado e item desconsiderado precisam de UPDATE próprio —
    // senão a edição some no próximo recarregamento da tela.
    const proposta = atualizada as CotacaoPropostaDraft | null;
    if (!proposta?._salvo || !CAMPOS_PERSISTIDOS_APOS_SALVAR.some(c => c in patch)) return;

    atualizarItensCotacao(
      proposta.itens.map(it => ({
        id: it._key,
        desconsiderado: it.desconsiderado,
        peso_unitario_kg: it.peso_unitario_kg,
        peso_origem: it.peso_origem,
        frete_teorico: it.frete_teorico,
      })),
    ).catch(err => toast.error((err as Error).message));
  };

  const handleRemoverProposta = (key: string) => {
    setPropostas(prev => prev.filter(p => p._key !== key));
  };

  /** Melhor esforço: avança os itens cobertos para "Análise de Cotações". Falha aqui nunca desfaz o salvamento da proposta. */
  const avancarStatusCobertos = async (draft: CotacaoPropostaDraft) => {
    const risCobertos = new Set(draft.itens.filter(i => i.processo_item_id).map(i => i.ri).filter(Boolean) as string[]);
    if (risCobertos.size === 0) return;
    const requisicoes = localDb.getRequisicoes();
    await Promise.all(Array.from(risCobertos).map(async ri => {
      const req = requisicoes.find(r => r.ri === ri);
      if (!req) return;
      try {
        await localDb.updateBuyerFields(ri, req.obs_comprador || '', req.data_entrega_prevista || '', 'Análise de Cotações');
      } catch (err) {
        console.error(`Falha ao avançar status do item ${ri}:`, err);
      }
    }));
  };

  const recarregarPropostas = async () => {
    if (!processo) return;
    try {
      const { propostas: propsSalvas } = await buscarProcessoCotacao(processo.id);
      const propsSalvasDraft = propsSalvas.map(propostaSalvaParaDraft);
      setPropostas(prev => {
        const outrosNaoSalvos = prev.filter(p => !p._salvo);
        return [...propsSalvasDraft, ...outrosNaoSalvos];
      });
    } catch (err) {
      console.error('Falha ao recarregar propostas:', err);
    }
  };

  // Se o processo estiver aberto e houver propostas marcadas como salvas com chaves temporárias
  // (ex: sessão aberta antes da sincronização de UUIDs), recarrega do banco automaticamente.
  useEffect(() => {
    if (!processo) return;
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const temChaveInvalida = propostas.some(
      p => p._salvo && (!UUID_REGEX.test(p._key) || p.itens.some(it => !UUID_REGEX.test(it._key)))
    );
    if (temChaveInvalida) {
      recarregarPropostas();
    }
  }, [propostas, processo]);

  const handleSalvarProposta = async (key: string) => {
    if (!processo) return;
    const draft = propostas.find(p => p._key === key);
    if (!draft) return;

    setSalvandoKey(key);
    try {
      let payload: CotacaoPropostaDraft = {
        ...draft,
        itens: draft.itens.map(it => ({ ...it, extraido_raw: it.extraido_raw })),
      };

      // O upload só acontece aqui — no primeiro salvamento — nunca antes: um
      // rascunho descartado sem "Salvar proposta" não deve deixar arquivo
      // órfão no Storage. Melhor esforço: se o upload falhar (rede, arquivo
      // já não está mais na memória do navegador), salva a proposta do
      // mesmo jeito — o comprador não pode perder uma extração já pronta por
      // causa da cópia de arquivo, que dá para tentar de novo depois.
      if (!payload.arquivo_storage_path && payload.arquivo_origem) {
        const arquivo = arquivosOriginais.get(payload.arquivo_origem);
        if (arquivo) {
          try {
            const enviado = await uploadArquivoCotacao(processo.id, arquivo);
            payload = {
              ...payload,
              arquivo_storage_path: enviado.path,
              arquivo_mime_type: enviado.mimeType,
              arquivo_tamanho_bytes: enviado.tamanhoBytes,
            };
          } catch (err) {
            console.error('Falha ao enviar o arquivo original da proposta para o Storage:', err);
          }
        } else {
          // Fallback: se o arquivo nao esta mais na memoria (ex: F5 ou sessao compartilhada),
          // tenta localizar pelo nome se ja tiver sido enviado ao Storage
          try {
            const achado = await buscarArquivoOriginalPorNome(payload.arquivo_origem);
            if (achado) {
              payload = {
                ...payload,
                arquivo_storage_path: achado.storagePath,
                arquivo_mime_type: achado.mimeType,
                arquivo_tamanho_bytes: achado.tamanhoBytes,
              };
            }
          } catch (err) {
            console.error('Falha ao buscar arquivo original existente por nome:', err);
          }
        }
      }

      await salvarProcessoCotacao({ processoId: processo.id, propostas: [payload], usuarioId: user.id, usuarioNome: user.name });

      // Recarrega as propostas salvas do Supabase para obter os IDs reais (UUIDs)
      // tanto da proposta quanto de cada um dos seus itens cotados.
      const { propostas: propsSalvas } = await buscarProcessoCotacao(processo.id);
      const propsSalvasDraft = propsSalvas.map(propostaSalvaParaDraft);
      setPropostas(prev => {
        const outrosNaoSalvos = prev.filter(p => !p._salvo && p._key !== key);
        return [...propsSalvasDraft, ...outrosNaoSalvos];
      });

      // Remove a proposta salva do rascunho local em localStorage
      const chave = chaveRascunhoPropostas(processo.id);
      const rascunhoAtual = lerRascunhoPropostas(processo.id);
      const rascunhoRestante = rascunhoAtual.filter(p => p._key !== key);
      try {
        if (rascunhoRestante.length > 0) {
          localStorage.setItem(chave, JSON.stringify(rascunhoRestante));
        } else {
          localStorage.removeItem(chave);
        }
      } catch (err) {
        console.error('Falha ao atualizar rascunho local de propostas:', err);
      }

      toast.success('Proposta salva.');
      avancarStatusCobertos(draft).catch(() => { /* melhor esforço, não bloqueia o salvamento */ });
    } catch (err) {
      const msg = (err as Error).message;
      toast.error(msg);
      if (
        msg.toLowerCase().includes('não existe mais') ||
        msg.toLowerCase().includes('não foi encontrado') ||
        msg.includes('cotacao_propostas_processo_id_fkey')
      ) {
        window.setTimeout(() => {
          voltarParaLista();
        }, 1500);
      }
    } finally {
      setSalvandoKey(null);
    }
  };

  const handleExcluirProposta = (key: string) => {
    const draft = propostas.find(p => p._key === key);
    if (!draft || !draft._salvo || !processo) return;
    const processoId = processo.id;

    // Otimista: some da tela na hora. A exclusão de verdade no Supabase só
    // acontece se a janela de "Desfazer" (toast) expirar sem clique.
    setPropostas(prev => prev.filter(p => p._key !== key));

    const timeoutId = window.setTimeout(async () => {
      pendentesExclusaoRef.current.delete(key);
      try {
        await excluirPropostaCotacao(key);
      } catch (err) {
        console.error('Falha ao excluir proposta:', err);
        if (processoIdAtualRef.current === processoId) {
          setPropostas(prev => (prev.some(p => p._key === key) ? prev : [...prev, draft]));
          toast.error(`Falha ao excluir a proposta de "${draft.fornecedor_razao_social || 'fornecedor'}": ${(err as Error).message}`);
        }
      }
    }, 6000);
    pendentesExclusaoRef.current.set(key, { timeoutId, draft, processoId });

    toast.action(
      `Proposta de "${draft.fornecedor_razao_social || 'fornecedor não identificado'}" excluída.`,
      'Desfazer',
      () => {
        const pendente = pendentesExclusaoRef.current.get(key);
        if (!pendente) return;
        window.clearTimeout(pendente.timeoutId);
        pendentesExclusaoRef.current.delete(key);
        if (processoIdAtualRef.current === pendente.processoId) {
          setPropostas(prev => (prev.some(p => p._key === key) ? prev : [...prev, pendente.draft]));
        }
      }
    );
  };

  const handleArquivosEnviados = (arquivos: { nome: string; file: File | null }[]) => {
    setArquivosOriginais(prev => {
      const next = new Map(prev);
      let mudou = false;
      for (const { nome, file } of arquivos) {
        if (file) { next.set(nome, file); mudou = true; }
      }
      return mudou ? next : prev;
    });
  };

  const propostasSalvas = useMemo(() => propostas.filter(p => p._salvo).length, [propostas]);

  /** Quantos itens já foram marcados para compra no mapa (`mapa_selecionado`), entre as propostas salvas — habilita o botão de revisão do pedido. */
  const itensParaPedido = useMemo(
    () => propostas.reduce((soma, p) => soma + (p._salvo ? p.itens.filter(it => it.mapa_selecionado).length : 0), 0),
    [propostas],
  );

  /** A decisão do mapa já foi gravada no banco quando isto é chamado — só reflete no estado local para a revisão do pedido não depender de recarregar o processo. */
  const handleDecisaoMapaSalva = (itensSelecionados: Set<string>) => {
    setPropostas(prev => prev.map(p => ({
      ...p,
      itens: p.itens.map(it => ({ ...it, mapa_selecionado: itensSelecionados.has(it._key) })),
    })));
    setFase('pedidos');
  };

  const handleProcessoConcluido = () => {
    setProcesso(prev => (prev ? { ...prev, status: 'concluido' } : prev));
  };

  const propostasOrdenadas = useMemo(
    () => [...propostas].sort((a, b) => (b._extraido_em ?? '').localeCompare(a._extraido_em ?? '')),
    [propostas]
  );

  const voltarParaLista = () => {
    window.history.replaceState(null, '', '#/suprimentos/cotacoes');
    setProcesso(null);
    setEscopo([]);
    setPropostas([]);
    setFase('lista');
    carregarLista();
  };

  const tituloFase = useMemo(() => {
    if (fase === 'escopo') return 'Novo processo';
    if (fase === 'mapa' && processo) return `Mapa comparativo — ${processo.numero}`;
    if (fase === 'pedidos' && processo) return `Pedidos de compra — ${processo.numero}`;
    if (fase === 'processo' && processo) return processo.numero;
    return 'Processos de cotação';
  }, [fase, processo]);

  const subtituloFase = fase === 'mapa'
    ? 'Compare as propostas item a item, veja o custo com impostos e frete e marque de quem comprar cada item.'
    : fase === 'pedidos'
    ? 'Revise, por fornecedor, o pedido que vai ser colocado antes de baixar o PDF.'
    : 'Envie os arquivos das propostas dos fornecedores, revise os campos extraídos pela IA e vincule aos itens da RM antes de salvar.';

  return (
    <div ref={topRef} className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          {fase !== 'lista' && (
            <button type="button" onClick={fase === 'mapa' ? () => setFase('processo') : fase === 'pedidos' ? () => setFase('mapa') : voltarParaLista} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200">
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">{tituloFase}</h1>
        </div>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtituloFase}</p>
      </div>

      {fase === 'lista' && (
        <ProcessosList
          processos={processos}
          carregando={carregandoLista}
          onAbrir={abrirProcesso}
          onNovoProcesso={() => onNavigate('/suprimentos/compras')}
          onCriarSemVinculo={() => { setEscopoRascunho([]); setFase('escopo'); }}
          onAbrirHistorico={() => onNavigate('/suprimentos/cotacoes/historico')}
          podeExcluir={user.roles.includes('admin')}
          onExcluir={async (id) => {
            try {
              await excluirProcessoCotacao(id);
              try {
                localStorage.removeItem(chaveRascunhoPropostas(id));
                localStorage.removeItem(`sisten:cotacoes:${id}:conversor:v1`);
              } catch { /* ignora erro de storage */ }
              setProcessos(prev => prev.filter(p => p.id !== id));
              toast.success('Processo de cotação excluído.');
            } catch (err) {
              toast.error((err as Error).message);
              throw err;
            }
          }}
        />
      )}

      {fase === 'escopo' && (
        <NovoProcessoPanel
          itens={escopoRascunho}
          criando={criandoProcesso}
          onCriar={handleCriarProcesso}
          onCancelar={() => { setEscopoRascunho([]); setFase('lista'); carregarLista(); }}
        />
      )}

      {fase === 'mapa' && processo && (
        <MapaComparativo
          processo={processo}
          escopo={escopo}
          propostas={propostas}
          usuarioNome={user.name}
          onVoltar={() => setFase('processo')}
          onAtualizarProposta={handleChangeProposta}
          onDecisaoSalva={handleDecisaoMapaSalva}
          onRecarregarPropostas={recarregarPropostas}
          arquivosOriginais={arquivosOriginais}
          onEditarMarkdown={handleEditarMarkdown}
          compradorPadrao={user.grupo_compras}
        />
      )}

      {fase === 'pedidos' && processo && (
        <RevisaoPedidoCompra
          processo={processo}
          escopo={escopo}
          propostas={propostas}
          onVoltar={() => setFase('mapa')}
          onProcessoConcluido={handleProcessoConcluido}
        />
      )}

      {fase === 'processo' && (
        carregandoProcesso ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              <PackageSearch className="h-3.5 w-3.5" />
              {escopo.length} {escopo.length === 1 ? 'item' : 'itens'} no escopo · {propostas.length} {propostas.length === 1 ? 'proposta' : 'propostas'}
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFase('pedidos')}
                  disabled={itensParaPedido === 0}
                  title={itensParaPedido === 0 ? 'Marque itens no mapa comparativo e salve a decisão para revisar o pedido' : 'Revisar o pedido de compra por fornecedor'}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <ClipboardList className="h-3.5 w-3.5" />
                  Pedidos de compra{itensParaPedido > 0 ? ` (${itensParaPedido})` : ''}
                </button>
                <button
                  type="button"
                  onClick={() => setFase('mapa')}
                  disabled={propostasSalvas === 0}
                  title={propostasSalvas === 0 ? 'Salve pelo menos uma proposta para montar o mapa' : 'Comparar as propostas salvas lado a lado'}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-indigo-600/20 transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  Mapa comparativo{propostasSalvas > 0 ? ` (${propostasSalvas})` : ''}
                </button>
              </div>
            </div>

            <ImportarPropostasPanel
              user={user}
              processoId={processo.id}
              processando={extraindo}
              erro={erroExtracao}
              uso={usoExtracao}
              modelo={modeloExtracao}
              custoBrl={custoExtracaoBrl}
              onProcessar={handleProcessarMarkdown}
              onArquivosEnviados={handleArquivosEnviados}
              onCarregarPropostas={handleCarregarPropostas}
            />

            {propostasOrdenadas.map(p => (
              <PropostaCard
                key={p._key}
                proposta={p}
                escopo={escopo}
                onChange={patch => handleChangeProposta(p._key, patch)}
                onChangeItem={(itemKey, patch) => handleChangeItem(p._key, itemKey, patch)}
                onRemover={() => handleRemoverProposta(p._key)}
                onSalvar={() => handleSalvarProposta(p._key)}
                salvando={salvandoKey === p._key}
                onExcluirSalva={() => handleExcluirProposta(p._key)}
                arquivoOriginal={p.arquivo_origem ? arquivosOriginais.get(p.arquivo_origem) : undefined}
                tabelaFrete={tabelaFrete}
                onEditarMarkdown={md => handleEditarMarkdown(p._key, md)}
                processoId={processo.id}
              />
            ))}

            {propostasOrdenadas.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                <button
                  type="button"
                  onClick={scrollToTop}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                  Ir para o topo
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      scrollToTop();
                      setFase('pedidos');
                    }}
                    disabled={itensParaPedido === 0}
                    title={itensParaPedido === 0 ? 'Marque itens no mapa comparativo e salve a decisão para revisar o pedido' : 'Revisar o pedido de compra por fornecedor'}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    <ClipboardList className="h-3.5 w-3.5" />
                    Pedidos de compra{itensParaPedido > 0 ? ` (${itensParaPedido})` : ''}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      scrollToTop();
                      setFase('mapa');
                    }}
                    disabled={propostasSalvas === 0}
                    title={propostasSalvas === 0 ? 'Salve pelo menos uma proposta para montar o mapa' : 'Comparar as propostas salvas lado a lado'}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm shadow-indigo-600/20 transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                    Mapa comparativo{propostasSalvas > 0 ? ` (${propostasSalvas})` : ''}
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      )}

      {showScrollTop && (
        <button
          type="button"
          onClick={scrollToTop}
          title="Ir para o topo"
          aria-label="Ir para o topo"
          className="fixed bottom-6 right-6 z-30 inline-flex items-center gap-1.5 rounded-full bg-slate-900/90 px-3.5 py-2.5 text-xs font-semibold text-white shadow-lg backdrop-blur-sm transition-all hover:bg-slate-900 hover:scale-105 active:scale-95 dark:bg-slate-100/90 dark:text-slate-900 dark:hover:bg-slate-100"
        >
          <ArrowUp className="h-4 w-4" />
          <span className="hidden sm:inline">Ir para o topo</span>
        </button>
      )}
    </div>
  );
}
