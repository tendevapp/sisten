/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Modal de Edição de Configurações do Formulário RID (Exclusivo Administradores)
 * Permite customizar perguntas (títulos, subtítulos, visibilidade, obrigatoriedade)
 * e o rol de opções de respostas (áreas, comportamentos, condições, responsáveis e empresas).
 */

import React, { useState } from 'react';
import {
  X,
  SlidersHorizontal,
  FileQuestion,
  ListPlus,
  Save,
  RotateCcw,
  Plus,
  Trash2,
  Edit2,
  Check,
  Search,
  ArrowDownAZ,
  AlertCircle,
  Eye,
  EyeOff,
  CheckCircle2,
  Loader2,
  HelpCircle,
} from 'lucide-react';
import type {
  Profile,
  SsmaFormConfig,
  SsmaFormOpcoesConfig,
  SsmaFormPerguntaConfig,
} from '../../types';
import {
  salvarConfiguracaoFormulario,
  restaurarConfiguracaoFormularioPadrao,
  CONFIG_FORM_PADRAO_RID,
} from '../../lib/ssmaApi';
import { useToast } from '../ui/Toast';
import ConfirmDialog from '../ui/ConfirmDialog';

interface SsmaFormEditorModalProps {
  configAtual: SsmaFormConfig;
  user: Profile;
  onClose: () => void;
  onSaved: (novaConfig: SsmaFormConfig) => void;
}

type CategoriaOpcao = keyof SsmaFormOpcoesConfig;

const CATEGORIAS_OPCOES: { key: CategoriaOpcao; rotulo: string; descricao: string; perguntaRef: string }[] = [
  {
    key: 'areas',
    rotulo: 'Áreas / Locais do Desvio',
    descricao: 'Locais operacionais da fábrica onde desvios podem ocorrer.',
    perguntaRef: 'Pergunta 7',
  },
  {
    key: 'comportamentos_inseguros',
    rotulo: 'Comportamentos Inseguros',
    descricao: 'Atitudes ou atos inseguros para seleção múltipla.',
    perguntaRef: 'Pergunta 15',
  },
  {
    key: 'condicoes_inseguras',
    rotulo: 'Condições Inseguras',
    descricao: 'Condições físicas, estruturais ou ambientais de risco.',
    perguntaRef: 'Pergunta 16',
  },
  {
    key: 'responsaveis_seguranca',
    rotulo: 'Profissionais de Segurança (SSMA)',
    descricao: 'Nomes dos técnicos ou responsáveis de SSMA acionáveis.',
    perguntaRef: 'Pergunta 12',
  },
  {
    key: 'empresas',
    rotulo: 'Empresas do Informante',
    descricao: 'Empresas vinculadas ao colaborador informante.',
    perguntaRef: 'Pergunta 6',
  },
];

export default function SsmaFormEditorModal({
  configAtual,
  user,
  onClose,
  onSaved,
}: SsmaFormEditorModalProps) {
  const toast = useToast();

  // Estados locais do rascunho de configuração
  const [config, setConfig] = useState<SsmaFormConfig>(JSON.parse(JSON.stringify(configAtual)));
  const [abaAtiva, setAbaAtiva] = useState<'perguntas' | 'opcoes'>('perguntas');

  // Controle de opções de respostas
  const [categoriaOpcao, setCategoriaOpcao] = useState<CategoriaOpcao>('areas');
  const [novaOpcaoTexto, setNovaOpcaoTexto] = useState('');
  const [filtroOpcoes, setFiltroOpcoes] = useState('');
  const [itemEmEdicao, setItemEmEdicao] = useState<{ index: number; texto: string } | null>(null);

  // Busca de perguntas
  const [filtroPerguntas, setFiltroPerguntas] = useState('');

  // Estados de confirmação e salvamento
  const [salvando, setSalvando] = useState(false);
  const [confirmarRestauracao, setConfirmarRestauracao] = useState(false);

  // ===================================================================
  // MANIPULAÇÃO DE PERGUNTAS
  // ===================================================================

  const atualizarPergunta = (id: string, campo: Partial<SsmaFormPerguntaConfig>) => {
    setConfig((prev) => ({
      ...prev,
      perguntas: prev.perguntas.map((p) => (p.id === id ? { ...p, ...campo } : p)),
    }));
  };

  const perguntasFiltradas = config.perguntas.filter(
    (p) =>
      p.titulo.toLowerCase().includes(filtroPerguntas.toLowerCase()) ||
      p.subtitulo.toLowerCase().includes(filtroPerguntas.toLowerCase()) ||
      String(p.numero).includes(filtroPerguntas)
  );

  // ===================================================================
  // MANIPULAÇÃO DE OPÇÕES DE RESPOSTA
  // ===================================================================

  const listaAtualOpcoes = config.opcoes[categoriaOpcao] || [];

  const handleAdicionarOpcao = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const textoLimpo = novaOpcaoTexto.trim().toUpperCase();
    if (!textoLimpo) return;

    if (listaAtualOpcoes.some((op) => op.toUpperCase() === textoLimpo)) {
      toast.error('Esta opção já existe na lista.');
      return;
    }

    setConfig((prev) => {
      const atual = prev.opcoes[categoriaOpcao] || [];
      // Se houver 'OUTROS', insere logo antes de 'OUTROS'
      let novaLista: string[];
      if (atual.includes('OUTROS')) {
        novaLista = [...atual.filter((item) => item !== 'OUTROS'), textoLimpo, 'OUTROS'];
      } else {
        novaLista = [...atual, textoLimpo];
      }
      return {
        ...prev,
        opcoes: {
          ...prev.opcoes,
          [categoriaOpcao]: novaLista,
        },
      };
    });

    setNovaOpcaoTexto('');
    toast.success('Opção adicionada com sucesso.');
  };

  const handleRemoverOpcao = (opcaoRemover: string) => {
    setConfig((prev) => ({
      ...prev,
      opcoes: {
        ...prev.opcoes,
        [categoriaOpcao]: (prev.opcoes[categoriaOpcao] || []).filter((op) => op !== opcaoRemover),
      },
    }));
    toast.info(`Opção "${opcaoRemover}" removida.`);
  };

  const handleSalvarEdicaoItem = () => {
    if (!itemEmEdicao) return;
    const textoLimpo = itemEmEdicao.texto.trim().toUpperCase();
    if (!textoLimpo) return;

    setConfig((prev) => {
      const lista = [...(prev.opcoes[categoriaOpcao] || [])];
      lista[itemEmEdicao.index] = textoLimpo;
      return {
        ...prev,
        opcoes: {
          ...prev.opcoes,
          [categoriaOpcao]: lista,
        },
      };
    });

    setItemEmEdicao(null);
    toast.success('Opção atualizada.');
  };

  const handleOrdenarAZ = () => {
    setConfig((prev) => {
      const lista = [...(prev.opcoes[categoriaOpcao] || [])];
      const temOutros = lista.includes('OUTROS');
      const semOutros = lista.filter((item) => item !== 'OUTROS');
      semOutros.sort((a, b) => a.localeCompare(b, 'pt-BR'));
      const ordenada = temOutros ? [...semOutros, 'OUTROS'] : semOutros;
      return {
        ...prev,
        opcoes: {
          ...prev.opcoes,
          [categoriaOpcao]: ordenada,
        },
      };
    });
    toast.success('Lista ordenada alfabeticamente (A-Z).');
  };

  const opcoesFiltradas = listaAtualOpcoes.filter((op) =>
    op.toLowerCase().includes(filtroOpcoes.toLowerCase())
  );

  // ===================================================================
  // PERSISTÊNCIA & RESTAURAÇÃO
  // ===================================================================

  const handleSalvarTudo = async () => {
    setSalvando(true);
    try {
      const salvo = await salvarConfiguracaoFormulario(config, user.id);
      toast.success('Configurações do formulário RID salvas com sucesso!');
      onSaved(salvo);
      onClose();
    } catch (err: any) {
      console.error('Erro ao salvar configurações do formulário:', err);
      toast.error('Erro ao salvar alterações no banco de dados.');
    } finally {
      setSalvando(false);
    }
  };

  const handleConfirmarRestauracao = async () => {
    setSalvando(true);
    try {
      const padrao = await restaurarConfiguracaoFormularioPadrao(user.id);
      setConfig(padrao);
      toast.success('Configurações originais de fábrica restauradas!');
      onSaved(padrao);
      setConfirmarRestauracao(false);
      onClose();
    } catch (err: any) {
      console.error('Erro ao restaurar configurações:', err);
      toast.error('Erro ao restaurar configurações.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col rounded-3xl bg-white shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Cabeçalho do Modal */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-400">
              <SlidersHorizontal className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
                  Editar Formulário RID
                </h2>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                  Exclusivo Admin
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Personalize os enunciados das perguntas, dicas e o rol de opções de respostas disponíveis.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Barra de Abas Principais */}
        <div className="flex border-b border-slate-200 px-6 pt-3 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAbaAtiva('perguntas')}
              className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition-colors ${
                abaAtiva === 'perguntas'
                  ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <FileQuestion className="h-4 w-4" />
              Perguntas do Formulário ({config.perguntas.length})
            </button>

            <button
              type="button"
              onClick={() => setAbaAtiva('opcoes')}
              className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition-colors ${
                abaAtiva === 'opcoes'
                  ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <ListPlus className="h-4 w-4" />
              Opções de Respostas ({CATEGORIAS_OPCOES.length} listas)
            </button>
          </div>
        </div>

        {/* Corpo do Modal com Rolagem */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* ======================================================= */}
          {/* ABA 1: CONFIGURAÇÃO DE PERGUNTAS                        */}
          {/* ======================================================= */}
          {abaAtiva === 'perguntas' && (
            <div className="space-y-4">
              {/* Barra de Busca de Perguntas */}
              <div className="flex items-center justify-between gap-4">
                <div className="relative flex-1 max-w-md">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Filtrar perguntas por título, instrução ou número..."
                    value={filtroPerguntas}
                    onChange={(e) => setFiltroPerguntas(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                  />
                </div>
                <div className="text-xs text-slate-400">
                  Mostrando {perguntasFiltradas.length} de {config.perguntas.length} perguntas
                </div>
              </div>

              {/* Lista de Perguntas */}
              <div className="space-y-3">
                {perguntasFiltradas.map((pergunta) => {
                  const ativa = pergunta.ativo;
                  return (
                    <div
                      key={pergunta.id}
                      className={`rounded-2xl border p-4 transition-all ${
                        ativa
                          ? 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/60 shadow-2xs'
                          : 'border-slate-200/60 bg-slate-50/70 dark:border-slate-800/60 dark:bg-slate-950/40 opacity-70'
                      }`}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        {/* Identificador da Pergunta */}
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-slate-100 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            P{pergunta.numero}
                          </span>
                          <div>
                            <span className="text-[10px] font-mono uppercase text-slate-400">
                              campo: {pergunta.campo} ({pergunta.tipo})
                            </span>
                          </div>
                        </div>

                        {/* Controles de Visibilidade e Obrigatoriedade */}
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-slate-600 dark:text-slate-300">
                            <input
                              type="checkbox"
                              checked={pergunta.obrigatorio}
                              onChange={(e) =>
                                atualizarPergunta(pergunta.id, { obrigatorio: e.target.checked })
                              }
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900"
                            />
                            Obrigatório
                          </label>

                          <button
                            type="button"
                            onClick={() => atualizarPergunta(pergunta.id, { ativo: !pergunta.ativo })}
                            className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-bold transition-all ${
                              pergunta.ativo
                                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-400'
                                : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
                            }`}
                          >
                            {pergunta.ativo ? (
                              <>
                                <Eye className="h-3.5 w-3.5" /> Ativa no Form
                              </>
                            ) : (
                              <>
                                <EyeOff className="h-3.5 w-3.5" /> Oculta no Form
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Campos de Edição de Texto */}
                      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-400">
                            Título da Pergunta
                          </label>
                          <input
                            type="text"
                            value={pergunta.titulo}
                            onChange={(e) =>
                              atualizarPergunta(pergunta.id, { titulo: e.target.value })
                            }
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-400">
                            Subtítulo / Instrução
                          </label>
                          <input
                            type="text"
                            value={pergunta.subtitulo}
                            onChange={(e) =>
                              atualizarPergunta(pergunta.id, { subtitulo: e.target.value })
                            }
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ======================================================= */}
          {/* ABA 2: GERENCIAMENTO DE OPÇÕES DE RESPOSTA               */}
          {/* ======================================================= */}
          {abaAtiva === 'opcoes' && (
            <div className="space-y-5">
              {/* Seletor de Categoria de Opções */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {CATEGORIAS_OPCOES.map((cat) => {
                  const ativa = categoriaOpcao === cat.key;
                  const total = (config.opcoes[cat.key] || []).length;
                  return (
                    <button
                      key={cat.key}
                      type="button"
                      onClick={() => {
                        setCategoriaOpcao(cat.key);
                        setFiltroOpcoes('');
                        setItemEmEdicao(null);
                      }}
                      className={`flex flex-col items-start rounded-2xl border p-3 text-left transition-all ${
                        ativa
                          ? 'border-indigo-600 bg-indigo-50/40 dark:border-indigo-500 dark:bg-indigo-950/30 shadow-xs'
                          : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900'
                      }`}
                    >
                      <span className="text-[10px] font-bold uppercase text-slate-400">
                        {cat.perguntaRef}
                      </span>
                      <span
                        className={`text-xs font-bold mt-0.5 line-clamp-1 ${
                          ativa
                            ? 'text-indigo-700 dark:text-indigo-400'
                            : 'text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {cat.rotulo}
                      </span>
                      <span className="mt-1 inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                        {total} opções
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Informações da Categoria Ativa */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-2xl bg-slate-50 p-4 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {CATEGORIAS_OPCOES.find((c) => c.key === categoriaOpcao)?.rotulo}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {CATEGORIAS_OPCOES.find((c) => c.key === categoriaOpcao)?.descricao}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleOrdenarAZ}
                  className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 transition-colors shadow-2xs"
                >
                  <ArrowDownAZ className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  Ordenar de A a Z
                </button>
              </div>

              {/* Formulário para Adicionar Nova Opção */}
              <form onSubmit={handleAdicionarOpcao} className="flex gap-2">
                <input
                  type="text"
                  placeholder={`Nova opção para ${CATEGORIAS_OPCOES.find((c) => c.key === categoriaOpcao)?.rotulo}...`}
                  value={novaOpcaoTexto}
                  onChange={(e) => setNovaOpcaoTexto(e.target.value)}
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold uppercase text-slate-800 placeholder:normal-case placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                />
                <button
                  type="submit"
                  disabled={!novaOpcaoTexto.trim()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
                >
                  <Plus className="h-4 w-4" />
                  Adicionar
                </button>
              </form>

              {/* Filtro Rápido na Lista de Opções */}
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Pesquisar opção na lista..."
                  value={filtroOpcoes}
                  onChange={(e) => setFiltroOpcoes(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                />
              </div>

              {/* Lista de Opções */}
              <div className="max-h-80 overflow-y-auto rounded-2xl border border-slate-200 divide-y divide-slate-100 dark:border-slate-800 dark:divide-slate-850">
                {opcoesFiltradas.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">
                    Nenhuma opção encontrada para o filtro informado.
                  </div>
                ) : (
                  opcoesFiltradas.map((opcao, idx) => {
                    const indiceReal = listaAtualOpcoes.indexOf(opcao);
                    const emEdicao = itemEmEdicao?.index === indiceReal;

                    return (
                      <div
                        key={`${opcao}-${idx}`}
                        className="flex items-center justify-between p-3 hover:bg-slate-50/80 dark:hover:bg-slate-950/40 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 flex-1 mr-3">
                          <span className="text-[11px] font-mono text-slate-400 w-6">
                            #{indiceReal + 1}
                          </span>

                          {emEdicao ? (
                            <input
                              type="text"
                              value={itemEmEdicao.texto}
                              onChange={(e) =>
                                setItemEmEdicao({ ...itemEmEdicao, texto: e.target.value })
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSalvarEdicaoItem();
                                if (e.key === 'Escape') setItemEmEdicao(null);
                              }}
                              autoFocus
                              className="flex-1 rounded-lg border border-indigo-500 bg-white px-2 py-1 text-xs font-semibold uppercase text-slate-900 focus:outline-none dark:bg-slate-900 dark:text-slate-100"
                            />
                          ) : (
                            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                              {opcao}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          {emEdicao ? (
                            <>
                              <button
                                type="button"
                                onClick={handleSalvarEdicaoItem}
                                className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50"
                                title="Salvar alteração"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setItemEmEdicao(null)}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                                title="Cancelar"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => setItemEmEdicao({ index: indiceReal, texto: opcao })}
                                className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors"
                                title="Editar texto da opção"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoverOpcao(opcao)}
                                className="rounded-lg p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors"
                                title="Remover opção"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Rodapé com Ações de Gravação e Restauração */}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-slate-200 px-6 py-4 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40">
          <button
            type="button"
            onClick={() => setConfirmarRestauracao(true)}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 transition-colors self-start sm:self-auto"
          >
            <RotateCcw className="h-4 w-4" />
            Restaurar Padrões de Fábrica
          </button>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={salvando}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleSalvarTudo}
              disabled={salvando}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
            >
              {salvando ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Salvar Configurações
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Diálogo de Confirmação para Restaurar Padrões */}
      {confirmarRestauracao && (
        <ConfirmDialog
          titulo="Restaurar Configurações Padrão?"
          mensagem="Esta ação irá restaurar todos os enunciados originais das 16 perguntas e o rol de opções padrão do RID (incluindo áreas e classificações). Alterações customizadas serão descartadas."
          confirmarLabel="Sim, Restaurar Padrões"
          cancelarLabel="Cancelar"
          variante="perigo"
          confirmando={salvando}
          onConfirmar={handleConfirmarRestauracao}
          onCancelar={() => setConfirmarRestauracao(false)}
        />
      )}
    </div>
  );
}
