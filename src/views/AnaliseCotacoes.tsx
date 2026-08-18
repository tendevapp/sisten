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
import { ArrowLeft, PackageSearch, Loader2 } from 'lucide-react';
import { localDb } from '../db/localDb';
import { useToast } from '../components/ui/Toast';
import ProcessosList from '../components/cotacoes/ProcessosList';
import NovoProcessoPanel from '../components/cotacoes/NovoProcessoPanel';
import ColarMarkdownPanel from '../components/cotacoes/ColarMarkdownPanel';
import PropostaCard from '../components/cotacoes/PropostaCard';
import { RASCUNHO_COTACAO_KEY, chaveRascunhoPropostas, normalizarProposta, aplicarSugestoes, normalizarDescricao } from '../lib/cotacoes';
import {
  criarProcessoCotacao, listarProcessosCotacao, buscarProcessoCotacao,
  extrairCotacao, sugerirVinculos, salvarProcessoCotacao,
} from '../lib/cotacoesApi';
import type {
  Profile, CotacaoProcesso, CotacaoProcessoItem, CotacaoProcessoItemDraft,
  CotacaoProposta, CotacaoPropostaDraft, ExtracaoUso,
} from '../types';

interface AnaliseCotacoesProps {
  user: Profile;
  onNavigate: (path: string) => void;
}

type Fase = 'lista' | 'escopo' | 'processo';

/** Converte uma proposta já salva (vinda do Supabase) no mesmo formato de rascunho usado pela grade, marcada como salva. */
function propostaSalvaParaDraft(p: CotacaoProposta): CotacaoPropostaDraft {
  return {
    _key: p.id,
    _salvo: true,
    arquivo_origem: p.arquivo_origem, numero_proposta: p.numero_proposta, data_emissao: p.data_emissao,
    validade_data: p.validade_data, validade_texto: p.validade_texto,
    fornecedor_razao_social: p.fornecedor_razao_social, fornecedor_cnpj: p.fornecedor_cnpj,
    fornecedor_inscricao_estadual: p.fornecedor_inscricao_estadual, fornecedor_cidade: p.fornecedor_cidade,
    fornecedor_uf: p.fornecedor_uf, fornecedor_telefone: p.fornecedor_telefone,
    cod_vendor: p.cod_vendor, contato_id: p.contato_id, fornecedor_match: p.fornecedor_match,
    vendedor_nome: p.vendedor_nome, vendedor_email: p.vendedor_email, vendedor_telefone: p.vendedor_telefone,
    cliente_razao_social: p.cliente_razao_social, cliente_cnpj: p.cliente_cnpj,
    cliente_inscricao_estadual: p.cliente_inscricao_estadual, cliente_cidade: p.cliente_cidade, cliente_uf: p.cliente_uf,
    condicao_pagamento: p.condicao_pagamento, forma_pagamento: p.forma_pagamento,
    prazo_entrega_texto: p.prazo_entrega_texto, prazo_entrega_dias: p.prazo_entrega_dias,
    frete_modalidade: p.frete_modalidade, transportadora_indicada: p.transportadora_indicada,
    faturamento_minimo: p.faturamento_minimo, dados_bancarios_pix: p.dados_bancarios_pix,
    valor_total_orcamento: p.valor_total_orcamento, observacoes_gerais: p.observacoes_gerais,
    campos_faltantes: p.campos_faltantes, revisado: p.revisado, extracao_id: p.extracao_id,
    extraido_raw: p.extraido_raw as any,
    itens: (p.itens ?? []).map(it => ({
      _key: it.id, processo_item_id: it.processo_item_id, fora_escopo: it.fora_escopo,
      vinculo_origem: it.vinculo_origem, vinculo_score: it.vinculo_score, ri: it.ri, material_code: it.material_code,
      item_numero: it.item_numero, codigo_produto: it.codigo_produto, descricao_produto: it.descricao_produto,
      marca_fabricante: it.marca_fabricante, unidade_medida: it.unidade_medida, ncm: it.ncm, cst: it.cst, cfop: it.cfop,
      quantidade: it.quantidade, preco_unitario: it.preco_unitario, preco_total_item: it.preco_total_item,
      aliquota_icms_pct: it.aliquota_icms_pct, aliquota_pis_pct: it.aliquota_pis_pct,
      aliquota_cofins_pct: it.aliquota_cofins_pct, aliquota_ipi_pct: it.aliquota_ipi_pct,
      extraido_raw: it.extraido_raw as any,
    })),
  };
}

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

  const [extraindo, setExtraindo] = useState(false);
  const [erroExtracao, setErroExtracao] = useState<string | null>(null);
  const [usoExtracao, setUsoExtracao] = useState<ExtracaoUso | null>(null);
  const [salvandoKey, setSalvandoKey] = useState<string | null>(null);

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
    carregarLista();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const abrirProcesso = async (id: string) => {
    setCarregandoProcesso(true);
    try {
      const { processo: p, itens, propostas: props } = await buscarProcessoCotacao(id);
      setProcesso(p);
      setEscopo(itens);
      const rascunho = lerRascunhoPropostas(id);
      setPropostas([...props.map(propostaSalvaParaDraft), ...rascunho]);
      if (rascunho.length > 0) {
        toast.info(`${rascunho.length} proposta(s) extraída(s) por IA recuperada(s) do rascunho local — ainda não salvas.`);
      }
      setFase('processo');
    } catch (err) {
      toast.error((err as Error).message);
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
      toast.success(`Processo ${novo.numero} criado.`);
      setEscopoRascunho([]);
      await abrirProcesso(novo.id);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCriandoProcesso(false);
    }
  };

  const handleProcessarMarkdown = async (markdown: string, arquivoOrigem: string | null) => {
    if (!processo) return;
    setExtraindo(true);
    setErroExtracao(null);
    setUsoExtracao(null);
    try {
      const resposta = await extrairCotacao({ markdown, arquivoOrigem: arquivoOrigem ?? undefined, processoId: processo.id });
      setUsoExtracao(resposta.uso);
      if (resposta.truncado) {
        toast.warning('A resposta da IA foi cortada por estourar o limite de tokens — mostrando o que veio completo.');
      }

      const novasDrafts = resposta.propostas.map(bruta => {
        const draft = normalizarProposta(bruta, { arquivoOrigem: arquivoOrigem ?? undefined });
        draft.extracao_id = resposta.extracao_id;
        return draft;
      });

      // Sugestão de vínculo por proposta — cada fornecedor pode ter um match
      // diferente na memória (cotacao_descricao_map é por CNPJ).
      for (const draft of novasDrafts) {
        if (draft.itens.length === 0) continue;
        try {
          const sugestoes = await sugerirVinculos({
            processoId: processo.id,
            fornecedorCnpj: draft.fornecedor_cnpj,
            descricoes: draft.itens.map((it, idx) => ({ idx, descricao: it.descricao_produto, codigoProduto: it.codigo_produto })),
          });
          draft.itens = aplicarSugestoes(draft.itens, sugestoes);
        } catch (err) {
          console.error('Falha ao buscar sugestões de vínculo:', err);
        }
      }

      setPropostas(prev => [...prev, ...novasDrafts]);
    } catch (err) {
      setErroExtracao((err as Error).message);
    } finally {
      setExtraindo(false);
    }
  };

  const handleChangeProposta = (key: string, patch: Partial<CotacaoPropostaDraft>) => {
    setPropostas(prev => prev.map(p => (p._key === key ? { ...p, ...patch } : p)));
  };

  const handleChangeItem = (propostaKey: string, itemKey: string, patch: Partial<CotacaoPropostaDraft['itens'][number]>) => {
    setPropostas(prev => prev.map(p => {
      if (p._key !== propostaKey) return p;
      return { ...p, itens: p.itens.map(it => (it._key === itemKey ? { ...it, ...patch } : it)) };
    }));
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

  const handleSalvarProposta = async (key: string) => {
    if (!processo) return;
    const draft = propostas.find(p => p._key === key);
    if (!draft) return;

    setSalvandoKey(key);
    try {
      const payload: CotacaoPropostaDraft = {
        ...draft,
        itens: draft.itens.map(it => ({ ...it, extraido_raw: it.extraido_raw })),
      };
      await salvarProcessoCotacao({ processoId: processo.id, propostas: [payload], usuarioId: user.id, usuarioNome: user.name });
      setPropostas(prev => prev.map(p => (p._key === key ? { ...p, _salvo: true } : p)));
      toast.success('Proposta salva.');
      avancarStatusCobertos(draft).catch(() => { /* melhor esforço, não bloqueia o salvamento */ });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSalvandoKey(null);
    }
  };

  const voltarParaLista = () => {
    setProcesso(null);
    setEscopo([]);
    setPropostas([]);
    setFase('lista');
    carregarLista();
  };

  const tituloFase = useMemo(() => {
    if (fase === 'escopo') return 'Novo processo';
    if (fase === 'processo' && processo) return processo.numero;
    return 'Processos de cotação';
  }, [fase, processo]);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          {fase !== 'lista' && (
            <button type="button" onClick={voltarParaLista} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200">
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">{tituloFase}</h1>
        </div>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Cole as propostas dos fornecedores em markdown, revise os campos extraídos pela IA e vincule aos itens da RM antes de salvar.
        </p>
      </div>

      {fase === 'lista' && (
        <ProcessosList
          processos={processos}
          carregando={carregandoLista}
          onAbrir={abrirProcesso}
          onNovoProcesso={() => onNavigate('/suprimentos/fornecedores-sem-po')}
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

      {fase === 'processo' && (
        carregandoProcesso ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              <PackageSearch className="h-3.5 w-3.5" />
              {escopo.length} {escopo.length === 1 ? 'item' : 'itens'} no escopo · {propostas.length} {propostas.length === 1 ? 'proposta' : 'propostas'}
            </div>

            <ColarMarkdownPanel
              processando={extraindo}
              erro={erroExtracao}
              uso={usoExtracao}
              onProcessar={handleProcessarMarkdown}
            />

            {propostas.map(p => (
              <PropostaCard
                key={p._key}
                proposta={p}
                escopo={escopo}
                onChange={patch => handleChangeProposta(p._key, patch)}
                onChangeItem={(itemKey, patch) => handleChangeItem(p._key, itemKey, patch)}
                onRemover={() => handleRemoverProposta(p._key)}
                onSalvar={() => handleSalvarProposta(p._key)}
                salvando={salvandoKey === p._key}
              />
            ))}
          </div>
        )
      )}
    </div>
  );
}
