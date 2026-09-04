/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Formulário RID - Registro de Identificação de Desvio (SSMA)
 * Responsivo, mobile-first, com botões interativos e captura de fotos.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldAlert,
  UserCheck,
  Search,
  Calendar,
  Building2,
  MapPin,
  FileText,
  CheckCircle2,
  XCircle,
  Camera,
  Paperclip,
  Trash2,
  Loader2,
  AlertTriangle,
  RotateCcw,
  Send,
  HelpCircle,
  ChevronDown,
  UserX,
  Sparkles,
  Info,
  Check,
  CheckSquare,
  Square,
  AlertOctagon,
  SlidersHorizontal,
} from 'lucide-react';
import type { Profile, SsmaFormConfig } from '../../types';
import {
  SETORES_SSMA,
  AREAS_DESVIO_SSMA,
  RESPONSAVEIS_SEGURANCA_SSMA,
  COMPORTAMENTOS_INSEGUROS_SSMA,
  CONDICOES_INSEGURAS_SSMA,
  CONFIG_FORM_PADRAO_RID,
  CONFIG_PERGUNTAS_PADRAO_RID,
  calcularSemanaDoMes,
  gerarNumeroRegistroRid,
  obterProximoNumeroRegistroRid,
  buscarColaboradoresRh,
  listarSetoresDb,
  criarDesvioRid,
  type ColaboradorRhSugestao,
} from '../../lib/ssmaApi';
import { useToast } from '../ui/Toast';

interface SsmaRidFormProps {
  user: Profile;
  config?: SsmaFormConfig;
  onAbrirEditor?: () => void;
  onSuccess?: (desvioId: string) => void;
  onCancel?: () => void;
}

export default function SsmaRidForm({
  user,
  config,
  onAbrirEditor,
  onSuccess,
  onCancel,
}: SsmaRidFormProps) {
  const toast = useToast();
  const ehAdmin = user.roles.includes('admin');
  const cfg = config || CONFIG_FORM_PADRAO_RID;

  const getPergunta = (id: string) =>
    cfg.perguntas?.find((p) => p.id === id) || CONFIG_PERGUNTAS_PADRAO_RID.find((p) => p.id === id);

  const areasDisponiveis = cfg.opcoes?.areas?.length ? cfg.opcoes.areas : [...AREAS_DESVIO_SSMA];
  const empresasDisponiveis = cfg.opcoes?.empresas?.length ? cfg.opcoes.empresas : ['TEN', 'CONTRATADA'];
  const responsaveisSegurancaDisponiveis = cfg.opcoes?.responsaveis_seguranca?.length
    ? cfg.opcoes.responsaveis_seguranca
    : [...RESPONSAVEIS_SEGURANCA_SSMA];
  const comportamentosInsegurosDisponiveis = cfg.opcoes?.comportamentos_inseguros?.length
    ? cfg.opcoes.comportamentos_inseguros
    : [...COMPORTAMENTOS_INSEGUROS_SSMA];
  const condicoesInsegurasDisponiveis = cfg.opcoes?.condicoes_inseguras?.length
    ? cfg.opcoes.condicoes_inseguras
    : [...CONDICOES_INSEGURAS_SSMA];

  // Estados principais do formulário
  const [dataRegistro, setDataRegistro] = useState(() => new Date().toISOString().slice(0, 10));
  const [empresa, setEmpresa] = useState<'TEN' | 'CONTRATADA'>('TEN');
  const [empresaContratadaNome, setEmpresaContratadaNome] = useState('');

  // Setores dinâmicos do banco
  const [setoresDisponiveis, setSetoresDisponiveis] = useState<string[]>([...SETORES_SSMA]);
  const [setor, setSetor] = useState<string>('PRODUÇÃO');
  const [carregandoSetores, setCarregandoSetores] = useState(false);

  // Informante (rh_pessoas vs manual)
  const [modoManual, setModoManual] = useState(false);
  const [nomeInformante, setNomeInformante] = useState('');
  const [matriculaInformante, setMatriculaInformante] = useState('');
  const [pessoaId, setPessoaId] = useState<string | null>(null);

  // Busca de colaboradores no rh_pessoas
  const [buscaColab, setBuscaColab] = useState('');
  const [sugestoesColab, setSugestoesColab] = useState<ColaboradorRhSugestao[]>([]);
  const [buscandoColab, setBuscandoColab] = useState(false);
  const [dropdownAberto, setDropdownAberto] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Localização & Área (em ordem alfabética)
  const [areaDesvio, setAreaDesvio] = useState<string>(AREAS_DESVIO_SSMA[0]);
  const [areaDesvioOutro, setAreaDesvioOutro] = useState('');
  const [filtroArea, setFiltroArea] = useState('');
  const [dropdownAreaAberto, setDropdownAreaAberto] = useState(false);
  const dropdownAreaRef = useRef<HTMLDivElement>(null);

  // Descrição do Desvio (sempre maiúscula)
  const [descricaoDesvio, setDescricaoDesvio] = useState('');

  // Ações Imediatas & Comunicação
  const [sanadoImediato, setSanadoImediato] = useState<boolean | null>(null);
  const [acaoImediata, setAcaoImediata] = useState('');
  const [acaoProposta, setAcaoProposta] = useState('');
  const [comunicadoResponsavel, setComunicadoResponsavel] = useState<boolean | null>(null);
  const [comunicadoSeguranca, setComunicadoSeguranca] = useState<boolean | null>(null);
  const [responsavelSeguranca, setResponsavelSeguranca] = useState<string>('N/A - NÃO APLICÁVEL');

  // Classificações de Risco (Multi-select)
  const [comportamentosInseguros, setComportamentosInseguros] = useState<string[]>([]);
  const [condicoesInseguras, setCondicoesInseguras] = useState<string[]>([]);
  const [classificacaoOutro, setClassificacaoOutro] = useState('');

  // Fotos e Anexos
  const [fotosArquivos, setFotosArquivos] = useState<{ file: File; preview: string }[]>([]);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Estado de envio
  const [enviando, setEnviando] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});

  // Carregar lista de setores da tabela de setores do banco
  useEffect(() => {
    let ativo = true;
    setCarregandoSetores(true);
    listarSetoresDb()
      .then((lista) => {
        if (!ativo) return;
        if (lista.length > 0) {
          setSetoresDisponiveis(lista);
          if (!setor || !lista.includes(setor)) {
            setSetor(lista.includes('PRODUÇÃO') ? 'PRODUÇÃO' : lista[0]);
          }
        }
      })
      .catch((err) => console.warn('Erro ao obter setores:', err))
      .finally(() => {
        if (ativo) setCarregandoSetores(false);
      });

    return () => {
      ativo = false;
    };
  }, []);

  // Se o usuário logado tiver dados de perfil, inicializar com ele se possível
  useEffect(() => {
    if (user?.name && !nomeInformante && !modoManual) {
      setNomeInformante(user.name.toUpperCase());
      buscarColaboradoresRh(user.name).then((res) => {
        if (res.length > 0) {
          const match = res.find((c) => c.nome.toLowerCase() === user.name.toLowerCase()) || res[0];
          setNomeInformante(match.nome);
          setMatriculaInformante(match.registro || '');
          setPessoaId(match.id);
        }
      }).catch(() => {});
    }
  }, [user]);

  // Fechar dropdowns ao clicar fora
  useEffect(() => {
    function handleClickFora(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownAberto(false);
      }
      if (dropdownAreaRef.current && !dropdownAreaRef.current.contains(event.target as Node)) {
        setDropdownAreaAberto(false);
      }
    }
    document.addEventListener('mousedown', handleClickFora);
    return () => document.removeEventListener('mousedown', handleClickFora);
  }, []);

  // Busca com debounce em rh_pessoas
  useEffect(() => {
    if (!dropdownAberto) return;
    const timeout = setTimeout(async () => {
      setBuscandoColab(true);
      try {
        const resultados = await buscarColaboradoresRh(buscaColab);
        setSugestoesColab(resultados);
      } finally {
        setBuscandoColab(false);
      }
    }, 250);

    return () => clearTimeout(timeout);
  }, [buscaColab, dropdownAberto]);

  // Selecionar colaborador do RH
  const selecionarColaborador = (colab: ColaboradorRhSugestao) => {
    setNomeInformante(colab.nome);
    setMatriculaInformante(colab.registro || '');
    setPessoaId(colab.id);
    setDropdownAberto(false);
    setBuscaColab('');
    setErros((prev) => ({ ...prev, nome: '', matricula: '' }));
  };

  // Alternar para digitação manual (Outro)
  const alternarParaManual = () => {
    setModoManual(true);
    setPessoaId(null);
    setDropdownAberto(false);
  };

  // Alternar para seleção via RH
  const alternarParaRh = () => {
    setModoManual(false);
    setDropdownAberto(true);
  };

  // Adicionar arquivos de foto
  const processarArquivos = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const novos = Array.from(files).map((f) => ({
      file: f,
      preview: URL.createObjectURL(f),
    }));
    setFotosArquivos((prev) => [...prev, ...novos]);
  };

  const removerFoto = (index: number) => {
    setFotosArquivos((prev) => {
      const item = prev[index];
      if (item?.preview) URL.revokeObjectURL(item.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  // Alternadores de múltipla escolha para classificações
  const toggleComportamento = (item: string) => {
    setComportamentosInseguros((prev) =>
      prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item]
    );
  };

  const toggleCondicao = (item: string) => {
    setCondicoesInseguras((prev) =>
      prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item]
    );
  };

  // Limpar formulário
  const resetarFormulario = () => {
    setNomeInformante('');
    setMatriculaInformante('');
    setPessoaId(null);
    setModoManual(false);
    setDescricaoDesvio('');
    setSanadoImediato(null);
    setAcaoImediata('');
    setAcaoProposta('');
    setComunicadoResponsavel(null);
    setComunicadoSeguranca(null);
    setResponsavelSeguranca('N/A - NÃO APLICÁVEL');
    setComportamentosInseguros([]);
    setCondicoesInseguras([]);
    setClassificacaoOutro('');
    setFotosArquivos((prev) => {
      prev.forEach((f) => URL.revokeObjectURL(f.preview));
      return [];
    });
    setErros({});
  };

  // Validação estrita antes do envio
  const validar = (): boolean => {
    const novosErros: Record<string, string> = {};

    if (!nomeInformante.trim()) {
      novosErros.nome = 'Informe o nome do colaborador/informante.';
    }
    if (!matriculaInformante.trim()) {
      novosErros.matricula = 'Informe a matrícula ou número de registro.';
    }
    if (!setor) {
      novosErros.setor = 'Selecione o setor.';
    }
    if (empresa === 'CONTRATADA' && !empresaContratadaNome.trim()) {
      novosErros.empresaContratada = 'Informe o nome da empresa contratada.';
    }
    if (areaDesvio === 'OUTROS' && !areaDesvioOutro.trim()) {
      novosErros.areaDesvioOutro = 'Descreva a área/local do desvio.';
    }
    if (!descricaoDesvio.trim()) {
      novosErros.descricao = 'Descreva o que ocorreu no desvio identificado.';
    }
    if (sanadoImediato === null) {
      novosErros.sanado = 'Informe se o desvio foi sanado de imediato.';
    } else if (sanadoImediato === true && !acaoImediata.trim()) {
      novosErros.acaoImediata = 'Descreva o que foi feito para sanar o desvio.';
    } else if (sanadoImediato === false && !acaoProposta.trim()) {
      novosErros.acaoProposta = 'Descreva o que pode ser feito para correção.';
    }
    if (comunicadoResponsavel === null) {
      novosErros.comunicadoResponsavel = 'Informe se foi comunicado ao líder ou supervisor da área.';
    }
    if (comunicadoSeguranca === null) {
      novosErros.comunicadoSeguranca = 'Informe se foi comunicado à Segurança do Trabalho.';
    }

    setErros(novosErros);
    if (Object.keys(novosErros).length > 0) {
      const primeiroErro = Object.values(novosErros)[0];
      toast.error(primeiroErro);
      return false;
    }
    return true;
  };

  // Envio do formulário
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validar()) return;

    setEnviando(true);
    try {
      const semanaCalculada = calcularSemanaDoMes(dataRegistro);
      const numeroRegistro = await obterProximoNumeroRegistroRid(dataRegistro);

      const novoDesvio = await criarDesvioRid(
        {
          numero_registro: numeroRegistro,
          pessoa_id: pessoaId,
          nome_informante: nomeInformante.trim().toUpperCase(),
          matricula_informante: matriculaInformante.trim(),
          origem_informante: modoManual ? 'manual' : 'rh_pessoas',
          setor,
          data_registro: dataRegistro,
          semana: semanaCalculada,
          empresa,
          empresa_contratada_nome: empresa === 'CONTRATADA' ? empresaContratadaNome.trim() : null,
          area_desvio: areaDesvio,
          area_desvio_outro: areaDesvio === 'OUTROS' ? areaDesvioOutro.trim().toUpperCase() : null,
          descricao_desvio: descricaoDesvio.trim().toUpperCase(),
          sanado_imediato: !!sanadoImediato,
          acao_imediata: sanadoImediato ? acaoImediata.trim().toUpperCase() : null,
          acao_proposta: !sanadoImediato ? acaoProposta.trim().toUpperCase() : null,
          comunicado_responsavel_area: !!comunicadoResponsavel,
          comunicado_seguranca: !!comunicadoSeguranca,
          responsavel_seguranca_informado: comunicadoSeguranca ? responsavelSeguranca : 'N/A - NÃO APLICÁVEL',
          comportamentos_inseguros: comportamentosInseguros,
          condicoes_inseguras: condicoesInseguras,
          classificacao_outro: classificacaoOutro.trim() ? classificacaoOutro.trim().toUpperCase() : null,
          status: sanadoImediato ? 'CONCLUIDO' : 'REGISTRADO',
          parecer_ssma: null,
          criado_por: user?.id || null,
        },
        fotosArquivos.map((f) => f.file)
      );

      toast.success(`Desvio registrado com sucesso sob código ${novoDesvio.numero_registro}!`);
      resetarFormulario();
      if (onSuccess) onSuccess(novoDesvio.id);
    } catch (err: any) {
      console.error('Erro ao salvar RID:', err);
      toast.error(`Falha ao registrar o RID: ${err.message || 'Erro inesperado'}`);
    } finally {
      setEnviando(false);
    }
  };

  const areasFiltradas = areasDisponiveis.filter((a) =>
    a.toLowerCase().includes(filtroArea.toLowerCase())
  );

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-4xl space-y-6 pb-16">
      {/* Header do Formulário */}
      <div className="rounded-3xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/70 via-white to-teal-50/40 p-5 sm:p-6 shadow-sm dark:border-emerald-900/40 dark:from-emerald-950/25 dark:via-slate-900 dark:to-teal-950/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white shadow-md shadow-emerald-500/25">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
                  FRM.SSMA-0001
                </span>
                <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">
                  • RID Operacional
                </span>
              </div>
              <h2 className="mt-1 font-display text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                Registro de Identificação de Desvio (RID)
              </h2>
              <p className="mt-0.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                Identifique e registre desvios comportamentais ou condições inseguras para prevenir acidentes.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
            {ehAdmin && onAbrirEditor && (
              <button
                type="button"
                onClick={onAbrirEditor}
                className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 shadow-2xs hover:bg-indigo-100 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-300 transition-colors"
                title="Personalizar perguntas e opções de resposta deste formulário"
              >
                <SlidersHorizontal className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                Editar Formulário
              </button>
            )}
            <button
              type="button"
              onClick={resetarFormulario}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-2xs hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Limpar
            </button>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-2xs hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* SEÇÃO 1: Identificação do Informante & Empresa */}
      <div className="rounded-3xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-100 text-xs font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              1
            </span>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Identificação do Informante & Origem
            </h3>
          </div>
          <button
            type="button"
            onClick={modoManual ? alternarParaRh : alternarParaManual}
            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            {modoManual ? (
              <>
                <UserCheck className="h-3.5 w-3.5" />
                Buscar em Colaboradores (RH)
              </>
            ) : (
              <>
                <UserX className="h-3.5 w-3.5" />
                Outro (digitar livremente)
              </>
            )}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Campo Nome */}
          <div className="relative sm:col-span-2 lg:col-span-2" ref={dropdownRef}>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              {getPergunta('identificacao_informante')?.titulo || '1. NOME DO INFORMANTE'}{' '}
              {getPergunta('identificacao_informante')?.obrigatorio !== false && (
                <span className="text-rose-500">*</span>
              )}
            </label>

            {modoManual ? (
              <div className="relative">
                <input
                  type="text"
                  placeholder="DIGITE O NOME COMPLETO..."
                  value={nomeInformante}
                  onChange={(e) => {
                    setNomeInformante(e.target.value.toUpperCase());
                    setErros((prev) => ({ ...prev, nome: '' }));
                  }}
                  className={`w-full rounded-xl border ${
                    erros.nome ? 'border-rose-400 bg-rose-50/20' : 'border-slate-200 dark:border-slate-700'
                  } bg-white px-3.5 py-2.5 text-xs uppercase font-semibold text-slate-900 focus:border-blue-500 focus:outline-none dark:bg-slate-950 dark:text-slate-100`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md dark:bg-amber-950/60 dark:text-amber-400">
                  DIGITAÇÃO LIVRE
                </span>
              </div>
            ) : (
              <div className="relative">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="DIGITE O NOME OU A MATRÍCULA PARA BUSCAR EM RH_PESSOAS..."
                    value={dropdownAberto ? buscaColab : nomeInformante}
                    onFocus={() => {
                      setDropdownAberto(true);
                      setBuscaColab(nomeInformante);
                    }}
                    onChange={(e) => {
                      setBuscaColab(e.target.value.toUpperCase());
                      setDropdownAberto(true);
                    }}
                    className={`w-full rounded-xl border ${
                      erros.nome ? 'border-rose-400 bg-rose-50/20' : 'border-slate-200 dark:border-slate-700'
                    } bg-white pl-9 pr-20 py-2.5 text-xs uppercase font-semibold text-slate-900 focus:border-blue-500 focus:outline-none dark:bg-slate-950 dark:text-slate-100`}
                  />
                  {buscandoColab ? (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-blue-500" />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDropdownAberto(!dropdownAberto)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                    >
                      BUSCAR
                    </button>
                  )}
                </div>

                {/* Dropdown de Sugestões de rh_pessoas */}
                {dropdownAberto && (
                  <div className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center justify-between px-2.5 py-1 text-[11px] font-bold text-slate-400">
                      <span>Colaboradores Cadastrados (rh_pessoas)</span>
                      <button
                        type="button"
                        onClick={alternarParaManual}
                        className="text-blue-600 hover:underline dark:text-blue-400"
                      >
                        Não encontrou? Clique aqui
                      </button>
                    </div>
                    {sugestoesColab.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-500">
                        {buscandoColab
                          ? 'Buscando colaboradores...'
                          : 'Nenhum colaborador encontrado. Você pode digitar manualmente.'}
                        <button
                          type="button"
                          onClick={alternarParaManual}
                          className="mt-2 block mx-auto rounded-lg bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                        >
                          Usar Digitação Manual (Outro)
                        </button>
                      </div>
                    ) : (
                      sugestoesColab.map((colab) => (
                        <div
                          key={colab.id}
                          onClick={() => selecionarColaborador(colab)}
                          className="flex items-center justify-between gap-3 rounded-xl p-2.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/80 cursor-pointer transition-colors border-b border-slate-100 last:border-0 dark:border-slate-800/50"
                        >
                          <div>
                            <p className="font-bold text-slate-900 dark:text-slate-100">
                              {colab.nome}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              Cargo: {colab.cargo || 'TEN'}
                            </p>
                          </div>
                          <span className="shrink-0 rounded-lg bg-blue-50 px-2 py-0.5 font-mono text-[11px] font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                            Mat: {colab.registro || 'S/N'}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
            {erros.nome && <p className="mt-1 text-[11px] text-rose-500">{erros.nome}</p>}
          </div>

          {/* Campo Matrícula */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              {getPergunta('matricula')?.titulo || '2. MATRÍCULA'}{' '}
              {getPergunta('matricula')?.obrigatorio !== false && (
                <span className="text-rose-500">*</span>
              )}
            </label>
            <input
              type="text"
              placeholder="Ex: 173003..."
              value={matriculaInformante}
              onChange={(e) => {
                setMatriculaInformante(e.target.value);
                setErros((prev) => ({ ...prev, matricula: '' }));
              }}
              className={`w-full rounded-xl border ${
                erros.matricula ? 'border-rose-400 bg-rose-50/20' : 'border-slate-200 dark:border-slate-700'
              } bg-white px-3.5 py-2.5 font-mono text-xs font-bold text-slate-900 focus:border-blue-500 focus:outline-none dark:bg-slate-950 dark:text-slate-100`}
            />
            {erros.matricula && <p className="mt-1 text-[11px] text-rose-500">{erros.matricula}</p>}
          </div>

          {/* Campo Setor (carregado dinamicamente do banco de dados) */}
          <div className="sm:col-span-2 lg:col-span-2">
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                {getPergunta('setor')?.titulo || '3. SETOR DO INFORMANTE'}{' '}
                {getPergunta('setor')?.obrigatorio !== false && (
                  <span className="text-rose-500">*</span>
                )}
              </label>
              {carregandoSetores && (
                <span className="text-[10px] text-blue-500 flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Carregando setores...
                </span>
              )}
            </div>
            <div className="relative">
              <select
                value={setor}
                onChange={(e) => {
                  setSetor(e.target.value);
                  setErros((prev) => ({ ...prev, setor: '' }));
                }}
                className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                {setoresDisponiveis.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            </div>
          </div>

          {/* Campo Data do Registro */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              {getPergunta('data_registro')?.titulo || '4. DATA DO REGISTRO'}{' '}
              {getPergunta('data_registro')?.obrigatorio !== false && (
                <span className="text-rose-500">*</span>
              )}
            </label>
            <div className="relative">
              <input
                type="date"
                value={dataRegistro}
                onChange={(e) => setDataRegistro(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
          </div>

          {/* Pergunta 5: Semana do Mês (Renderizada somente se ativa pelo Admin) */}
          {getPergunta('semana')?.ativo && (
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                {getPergunta('semana')?.titulo || '5. SEMANA DO MÊS'}
              </label>
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                <Calendar className="h-4 w-4 text-slate-400" />
                <span>{calcularSemanaDoMes(dataRegistro)}</span>
              </div>
            </div>
          )}

          {/* Campo Nome da Empresa (TEN / CONTRATADA) */}
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              {getPergunta('empresa')?.titulo || '5. NOME DA EMPRESA'}{' '}
              {getPergunta('empresa')?.obrigatorio !== false && (
                <span className="text-rose-500">*</span>
              )}
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="grid grid-cols-2 gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setEmpresa('TEN')}
                  className={`flex items-center justify-center gap-2 sm:px-8 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    empresa === 'TEN'
                      ? 'border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-500/20 ring-2 ring-blue-500/20'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                  }`}
                >
                  <Building2 className="h-4 w-4" />
                  TEN
                </button>
                <button
                  type="button"
                  onClick={() => setEmpresa('CONTRATADA')}
                  className={`flex items-center justify-center gap-2 sm:px-8 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    empresa === 'CONTRATADA'
                      ? 'border-purple-600 bg-purple-600 text-white shadow-md shadow-purple-500/20 ring-2 ring-purple-500/20'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                  }`}
                >
                  <Building2 className="h-4 w-4" />
                  CONTRATADA
                </button>
              </div>

              {empresa === 'CONTRATADA' && (
                <div className="flex-1">
                  <input
                    type="text"
                    placeholder="DIGITE A RAZÃO SOCIAL OU NOME DA EMPRESA CONTRATADA..."
                    value={empresaContratadaNome}
                    onChange={(e) => setEmpresaContratadaNome(e.target.value.toUpperCase())}
                    className={`w-full rounded-xl border ${
                      erros.empresaContratada
                        ? 'border-rose-400 bg-rose-50/20'
                        : 'border-slate-200 dark:border-slate-700'
                    } bg-white px-3.5 py-2.5 text-xs uppercase font-semibold text-slate-900 focus:border-purple-500 focus:outline-none dark:bg-slate-950 dark:text-slate-100`}
                  />
                  {erros.empresaContratada && (
                    <p className="mt-1 text-[11px] text-rose-500">{erros.empresaContratada}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* SEÇÃO 2: Localização do Desvio & Descrição */}
      <div className="rounded-3xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-100 text-xs font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
            2
          </span>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Localização & Ocorrência do Desvio
          </h3>
        </div>

        <div className="space-y-4">
          {/* Campo Área / Local (Em Ordem Alfabética) */}
          <div className="relative" ref={dropdownAreaRef}>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                {getPergunta('area_desvio')?.titulo || '6. ÁREA / LOCAL DO DESVIO'}{' '}
                {getPergunta('area_desvio')?.obrigatorio !== false && (
                  <span className="text-rose-500">*</span>
                )}
              </label>
              <span className="text-[10px] font-semibold text-slate-400">
                Ordem alfabética (A-Z)
              </span>
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => setDropdownAreaAberto(!dropdownAreaAberto)}
                className="w-full flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-900 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  {areaDesvio || 'SELECIONE A ÁREA...'}
                </span>
                <ChevronDown className="h-4 w-4 text-slate-400" />
              </button>

              {dropdownAreaAberto && (
                <div className="absolute z-30 mt-1 max-h-64 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
                  <div className="p-2 border-b border-slate-100 dark:border-slate-800">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Filtrar áreas (ex: calandra, pátio, pintura)..."
                        value={filtroArea}
                        onChange={(e) => setFiltroArea(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                      />
                    </div>
                  </div>

                  <div className="max-h-48 overflow-y-auto p-1.5">
                    {areasFiltradas.map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => {
                          setAreaDesvio(a);
                          setDropdownAreaAberto(false);
                          setFiltroArea('');
                        }}
                        className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold transition-colors cursor-pointer ${
                          areaDesvio === a
                            ? 'bg-amber-50 text-amber-900 font-bold dark:bg-amber-950/50 dark:text-amber-300'
                            : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span>{a}</span>
                        {areaDesvio === a && <Check className="h-3.5 w-3.5 text-amber-600" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {areaDesvio === 'OUTROS' && (
              <div className="mt-2.5">
                <input
                  type="text"
                  placeholder="ESPECIFIQUE O LOCAL EXATO DO DESVIO..."
                  value={areaDesvioOutro}
                  onChange={(e) => setAreaDesvioOutro(e.target.value.toUpperCase())}
                  className={`w-full rounded-xl border ${
                    erros.areaDesvioOutro
                      ? 'border-rose-400 bg-rose-50/20'
                      : 'border-slate-200 dark:border-slate-700'
                  } bg-white px-3.5 py-2.5 text-xs uppercase font-semibold text-slate-900 focus:border-amber-500 focus:outline-none dark:bg-slate-950 dark:text-slate-100`}
                />
                {erros.areaDesvioOutro && (
                  <p className="mt-1 text-[11px] text-rose-500">{erros.areaDesvioOutro}</p>
                )}
              </div>
            )}
          </div>

          {/* Campo Descrição do Desvio (SEMPRE MAIÚSCULO) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                {getPergunta('descricao_desvio')?.titulo || '7. DESCRIÇÃO DO DESVIO (O QUE?)'}{' '}
                {getPergunta('descricao_desvio')?.obrigatorio !== false && (
                  <span className="text-rose-500">*</span>
                )}
              </label>
              <span className="text-[11px] text-slate-400">
                {descricaoDesvio.length} caracteres
              </span>
            </div>
            {getPergunta('descricao_desvio')?.subtitulo && (
              <p className="text-[11px] text-slate-400 mb-2">
                {getPergunta('descricao_desvio')?.subtitulo}
              </p>
            )}
            <textarea
              rows={3}
              placeholder="DESCREVA DETALHADAMENTE O DESVIO IDENTIFICADO (SITUAÇÃO OBSERVADA, EQUIPAMENTOS ENVOLVIDOS, COMPORTAMENTOS OU RISCOS)..."
              value={descricaoDesvio}
              onChange={(e) => {
                setDescricaoDesvio(e.target.value.toUpperCase());
                setErros((prev) => ({ ...prev, descricao: '' }));
              }}
              className={`w-full rounded-2xl border uppercase font-medium ${
                erros.descricao ? 'border-rose-400 bg-rose-50/20' : 'border-slate-200 dark:border-slate-700'
              } bg-white p-3.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none dark:bg-slate-950 dark:text-slate-100`}
            />
            {erros.descricao && <p className="mt-1 text-[11px] text-rose-500">{erros.descricao}</p>}
          </div>
        </div>
      </div>

      {/* SEÇÃO 3: Ações Imediatas & Comunicação (Botões Sim e Não SEPARADOS) */}
      <div className="rounded-3xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 text-xs font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            3
          </span>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Ações Imediatas & Comunicação
          </h3>
        </div>

        <div className="space-y-6">
          {/* Pergunta 8: Sanado de imediato? (Botões Separados) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
              {getPergunta('sanado_imediato')?.titulo || '8. O DESVIO FOI SANADO DE IMEDIATO?'}{' '}
              {getPergunta('sanado_imediato')?.obrigatorio !== false && (
                <span className="text-rose-500">*</span>
              )}
            </label>
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <button
                type="button"
                onClick={() => {
                  setSanadoImediato(true);
                  setErros((prev) => ({ ...prev, sanado: '', acaoProposta: '' }));
                }}
                className={`flex items-center justify-center gap-2.5 rounded-2xl py-3 px-4 text-xs font-bold border transition-all cursor-pointer ${
                  sanadoImediato === true
                    ? 'border-emerald-600 bg-emerald-600 text-white shadow-md shadow-emerald-600/25 ring-2 ring-emerald-500/20'
                    : 'border-emerald-200/90 bg-white text-emerald-800 hover:bg-emerald-50/70 dark:border-emerald-900/60 dark:bg-slate-950 dark:text-emerald-300 dark:hover:bg-emerald-950/30'
                }`}
              >
                <CheckCircle2 className={`h-4 w-4 ${sanadoImediato === true ? 'text-white' : 'text-emerald-600 dark:text-emerald-400'}`} />
                <span>SIM (SANADO)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSanadoImediato(false);
                  setErros((prev) => ({ ...prev, sanado: '', acaoImediata: '' }));
                }}
                className={`flex items-center justify-center gap-2.5 rounded-2xl py-3 px-4 text-xs font-bold border transition-all cursor-pointer ${
                  sanadoImediato === false
                    ? 'border-rose-600 bg-rose-600 text-white shadow-md shadow-rose-600/25 ring-2 ring-rose-500/20'
                    : 'border-rose-200/90 bg-white text-rose-800 hover:bg-rose-50/70 dark:border-rose-900/60 dark:bg-slate-950 dark:text-rose-300 dark:hover:bg-rose-950/30'
                }`}
              >
                <XCircle className={`h-4 w-4 ${sanadoImediato === false ? 'text-white' : 'text-rose-600 dark:text-rose-400'}`} />
                <span>NÃO (NÃO SANADO)</span>
              </button>
            </div>
            {erros.sanado && <p className="mt-1.5 text-[11px] text-rose-500">{erros.sanado}</p>}

            {/* Pergunta Condicional: Se sanado, o que foi feito? */}
            {sanadoImediato === true && (
              <div className="mt-3.5 rounded-2xl bg-emerald-50/60 p-4 border border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900/40">
                <label className="block text-xs font-bold text-emerald-900 dark:text-emerald-300 mb-1.5">
                  SE FOI SANADO, O QUE FOI FEITO? <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="DESCREVA A AÇÃO IMEDIATA REALIZADA PARA CORRIGIR OU ELIMINAR O RISCO..."
                  value={acaoImediata}
                  onChange={(e) => {
                    setAcaoImediata(e.target.value.toUpperCase());
                    setErros((prev) => ({ ...prev, acaoImediata: '' }));
                  }}
                  className="w-full rounded-xl border border-emerald-300 bg-white p-3 text-xs uppercase font-medium text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none dark:border-emerald-800 dark:bg-slate-950 dark:text-slate-100"
                />
                {erros.acaoImediata && (
                  <p className="mt-1 text-[11px] text-rose-500">{erros.acaoImediata}</p>
                )}
              </div>
            )}

            {/* Pergunta Condicional: Se não sanado, o que pode ser feito? */}
            {sanadoImediato === false && (
              <div className="mt-3.5 rounded-2xl bg-rose-50/60 p-4 border border-rose-200 dark:bg-rose-950/20 dark:border-rose-900/40">
                <label className="block text-xs font-bold text-rose-900 dark:text-rose-300 mb-1.5">
                  SE NÃO FOI SANADO, O QUE PODE SER FEITO? <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="SUGIRA AÇÕES CORRETIVAS, MATERIAIS OU INTERVENÇÕES NECESSÁRIAS..."
                  value={acaoProposta}
                  onChange={(e) => {
                    setAcaoProposta(e.target.value.toUpperCase());
                    setErros((prev) => ({ ...prev, acaoProposta: '' }));
                  }}
                  className="w-full rounded-xl border border-rose-300 bg-white p-3 text-xs uppercase font-medium text-slate-900 placeholder:text-slate-400 focus:border-rose-500 focus:outline-none dark:border-rose-800 dark:bg-slate-950 dark:text-slate-100"
                />
                {erros.acaoProposta && (
                  <p className="mt-1 text-[11px] text-rose-500">{erros.acaoProposta}</p>
                )}
              </div>
            )}
          </div>

          {/* Pergunta 10: Comunicado ao responsável da área (Botões Separados) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
              {getPergunta('comunicado_responsavel')?.titulo ||
                '10. O DESVIO FOI COMUNICADO AO RESPONSÁVEL DA ÁREA (LÍDER OU SUPERVISOR)?'}{' '}
              {getPergunta('comunicado_responsavel')?.obrigatorio !== false && (
                <span className="text-rose-500">*</span>
              )}
            </label>
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <button
                type="button"
                onClick={() => {
                  setComunicadoResponsavel(true);
                  setErros((prev) => ({ ...prev, comunicadoResponsavel: '' }));
                }}
                className={`flex items-center justify-center gap-2 rounded-2xl py-3 px-4 text-xs font-bold border transition-all cursor-pointer ${
                  comunicadoResponsavel === true
                    ? 'border-emerald-600 bg-emerald-600 text-white shadow-md shadow-emerald-600/25 ring-2 ring-emerald-500/20'
                    : 'border-emerald-200/90 bg-white text-emerald-800 hover:bg-emerald-50/70 dark:border-emerald-900/60 dark:bg-slate-950 dark:text-emerald-300 dark:hover:bg-emerald-950/30'
                }`}
              >
                <CheckCircle2 className={`h-4 w-4 ${comunicadoResponsavel === true ? 'text-white' : 'text-emerald-600 dark:text-emerald-400'}`} />
                <span>SIM</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setComunicadoResponsavel(false);
                  setErros((prev) => ({ ...prev, comunicadoResponsavel: '' }));
                }}
                className={`flex items-center justify-center gap-2 rounded-2xl py-3 px-4 text-xs font-bold border transition-all cursor-pointer ${
                  comunicadoResponsavel === false
                    ? 'border-rose-600 bg-rose-600 text-white shadow-md shadow-rose-600/25 ring-2 ring-rose-500/20'
                    : 'border-rose-200/90 bg-white text-rose-800 hover:bg-rose-50/70 dark:border-rose-900/60 dark:bg-slate-950 dark:text-rose-300 dark:hover:bg-rose-950/30'
                }`}
              >
                <XCircle className={`h-4 w-4 ${comunicadoResponsavel === false ? 'text-white' : 'text-rose-600 dark:text-rose-400'}`} />
                <span>NÃO</span>
              </button>
            </div>
            {erros.comunicadoResponsavel && (
              <p className="mt-1.5 text-[11px] text-rose-500">{erros.comunicadoResponsavel}</p>
            )}
          </div>

          {/* Pergunta 11: Comunicado à segurança do trabalho (Botões Separados) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
              {getPergunta('comunicado_seguranca')?.titulo ||
                '11. O DESVIO QUE NÃO FOI SANADO IMEDIATAMENTE, FOI COMUNICADO À SEGURANÇA DO TRABALHO?'}{' '}
              {getPergunta('comunicado_seguranca')?.obrigatorio !== false && (
                <span className="text-rose-500">*</span>
              )}
            </label>
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <button
                type="button"
                onClick={() => {
                  setComunicadoSeguranca(true);
                  setErros((prev) => ({ ...prev, comunicadoSeguranca: '' }));
                }}
                className={`flex items-center justify-center gap-2 rounded-2xl py-3 px-4 text-xs font-bold border transition-all cursor-pointer ${
                  comunicadoSeguranca === true
                    ? 'border-emerald-600 bg-emerald-600 text-white shadow-md shadow-emerald-600/25 ring-2 ring-emerald-500/20'
                    : 'border-emerald-200/90 bg-white text-emerald-800 hover:bg-emerald-50/70 dark:border-emerald-900/60 dark:bg-slate-950 dark:text-emerald-300 dark:hover:bg-emerald-950/30'
                }`}
              >
                <CheckCircle2 className={`h-4 w-4 ${comunicadoSeguranca === true ? 'text-white' : 'text-emerald-600 dark:text-emerald-400'}`} />
                <span>SIM</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setComunicadoSeguranca(false);
                  setResponsavelSeguranca('N/A - NÃO APLICÁVEL');
                  setErros((prev) => ({ ...prev, comunicadoSeguranca: '' }));
                }}
                className={`flex items-center justify-center gap-2 rounded-2xl py-3 px-4 text-xs font-bold border transition-all cursor-pointer ${
                  comunicadoSeguranca === false
                    ? 'border-rose-600 bg-rose-600 text-white shadow-md shadow-rose-600/25 ring-2 ring-rose-500/20'
                    : 'border-rose-200/90 bg-white text-rose-800 hover:bg-rose-50/70 dark:border-rose-900/60 dark:bg-slate-950 dark:text-rose-300 dark:hover:bg-rose-950/30'
                }`}
              >
                <XCircle className={`h-4 w-4 ${comunicadoSeguranca === false ? 'text-white' : 'text-rose-600 dark:text-rose-400'}`} />
                <span>NÃO</span>
              </button>
            </div>
            {erros.comunicadoSeguranca && (
              <p className="mt-1.5 text-[11px] text-rose-500">{erros.comunicadoSeguranca}</p>
            )}
          </div>

          {/* Pergunta 12: Se comunicado a segurança, quem foi informado? */}
          {comunicadoSeguranca === true && (
            <div className="rounded-2xl bg-slate-50 p-4 border border-slate-200 dark:bg-slate-950/40 dark:border-slate-800">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                {getPergunta('responsavel_seguranca')?.titulo ||
                  '12. SE FOI COMUNICADO À SEGURANÇA DO TRABALHO, QUEM FOI INFORMADO?'}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {responsaveisSegurancaDisponiveis.map((resp) => {
                  const ativo = responsavelSeguranca === resp;
                  return (
                    <button
                      key={resp}
                      type="button"
                      onClick={() => setResponsavelSeguranca(resp)}
                      className={`rounded-xl px-3 py-2.5 text-xs font-bold transition-all text-center border cursor-pointer ${
                        ativo
                          ? 'border-blue-600 bg-blue-600 text-white shadow-xs dark:bg-blue-500'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                      }`}
                    >
                      {resp}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SEÇÃO 4: Classificação do Desvio (VISUALIZAÇÃO APRIMORADA 15 E 16) */}
      <div className="rounded-3xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-rose-100 text-xs font-bold text-rose-700 dark:bg-rose-950 dark:text-rose-300">
            4
          </span>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Classificação do Risco (Comportamento & Condição)
          </h3>
        </div>

        <div className="space-y-8">
          {/* Pergunta 15: Comportamento Inseguro — Grid Estruturado */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div>
                <label className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-[11px] font-bold text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                    15
                  </span>
                  <span>{getPergunta('comportamentos_inseguros')?.titulo || 'CLASSIFICAÇÃO DO DESVIO — COMPORTAMENTO INSEGURO'}</span>
                </label>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {getPergunta('comportamentos_inseguros')?.subtitulo || 'Selecione uma ou mais práticas ou atos inseguros observados:'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                  {comportamentosInseguros.length} selecionado(s)
                </span>
                {comportamentosInseguros.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setComportamentosInseguros([])}
                    className="text-[11px] font-semibold text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                  >
                    Limpar
                  </button>
                )}
              </div>
            </div>

            {/* Grid 2 colunas com cartões e checkboxes claros */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {comportamentosInsegurosDisponiveis.map((comp) => {
                const selecionado = comportamentosInseguros.includes(comp);
                return (
                  <div
                    key={comp}
                    onClick={() => toggleComportamento(comp)}
                    className={`flex items-center gap-3 rounded-2xl p-3 border transition-all cursor-pointer select-none ${
                      selecionado
                        ? 'border-rose-400 bg-rose-50/80 text-rose-950 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200 shadow-2xs'
                        : 'border-slate-200/90 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50/80 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-850'
                    }`}
                  >
                    <div
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all ${
                        selecionado
                          ? 'border-rose-500 bg-rose-600 text-white shadow-xs'
                          : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800'
                      }`}
                    >
                      {selecionado && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                    </div>
                    <span className="text-xs font-bold uppercase tracking-tight leading-snug">
                      {comp}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Pergunta 16: Condição Insegura — Grid Estruturado */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div>
                <label className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-[11px] font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                    16
                  </span>
                  <span>{getPergunta('condicoes_inseguras')?.titulo || 'CLASSIFICAÇÃO DO DESVIO — CONDIÇÃO INSEGURA'}</span>
                </label>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {getPergunta('condicoes_inseguras')?.subtitulo || 'Selecione uma ou mais condições físicas ou ambientais irregulares:'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                  {condicoesInseguras.length} selecionado(s)
                </span>
                {condicoesInseguras.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCondicoesInseguras([])}
                    className="text-[11px] font-semibold text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 cursor-pointer"
                  >
                    Limpar
                  </button>
                )}
              </div>
            </div>

            {/* Grid 2 colunas com cartões e checkboxes claros */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {condicoesInsegurasDisponiveis.map((cond) => {
                const selecionado = condicoesInseguras.includes(cond);
                return (
                  <div
                    key={cond}
                    onClick={() => toggleCondicao(cond)}
                    className={`flex items-center gap-3 rounded-2xl p-3 border transition-all cursor-pointer select-none ${
                      selecionado
                        ? 'border-amber-400 bg-amber-50/80 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200 shadow-2xs'
                        : 'border-slate-200/90 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50/80 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-850'
                    }`}
                  >
                    <div
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all ${
                        selecionado
                          ? 'border-amber-500 bg-amber-600 text-white shadow-xs'
                          : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800'
                      }`}
                    >
                      {selecionado && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                    </div>
                    <span className="text-xs font-bold uppercase tracking-tight leading-snug">
                      {cond}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {(comportamentosInseguros.includes('OUTRO') || condicoesInseguras.includes('OUTRO')) && (
            <div className="rounded-2xl bg-slate-50 p-4 border border-slate-200 dark:bg-slate-950/40 dark:border-slate-800">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                ESPECIFIQUE A OUTRA CLASSIFICAÇÃO OU DETALHE DO RISCO:
              </label>
              <input
                type="text"
                placeholder="DIGITE AQUI A CLASSIFICAÇÃO COMPLEMENTAR..."
                value={classificacaoOutro}
                onChange={(e) => setClassificacaoOutro(e.target.value.toUpperCase())}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-900 uppercase focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
          )}
        </div>
      </div>

      {/* SEÇÃO 5: Registro Fotográfico & Evidências (Visível se ativo) */}
      {getPergunta('fotos')?.ativo !== false && (
        <div className="rounded-3xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-teal-100 text-xs font-bold text-teal-700 dark:bg-teal-950 dark:text-teal-300">
                5
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {getPergunta('fotos')?.titulo || '14. Registro Fotográfico / Evidências'}
                </h3>
                {getPergunta('fotos')?.subtitulo && (
                  <p className="text-[11px] text-slate-400">{getPergunta('fotos')?.subtitulo}</p>
                )}
              </div>
            </div>
            <span className="text-xs text-slate-400">
              {fotosArquivos.length} foto(s) anexada(s)
            </span>
          </div>

          {/* Inputs ocultos para Câmera Nativa e Galeria */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              processarArquivos(e.target.files);
              e.target.value = '';
            }}
            className="hidden"
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => {
              processarArquivos(e.target.files);
              e.target.value = '';
            }}
            className="hidden"
          />

          {/* Botões de Ação para Fotos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-teal-300 bg-teal-50/50 p-4 text-xs font-bold text-teal-800 hover:bg-teal-100/60 dark:border-teal-800 dark:bg-teal-950/20 dark:text-teal-300 transition-all cursor-pointer"
            >
              <Camera className="h-5 w-5 text-teal-600 dark:text-teal-400" />
              <span>Tirar Foto com a Câmera</span>
            </button>

            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 text-xs font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 transition-all cursor-pointer"
            >
              <Paperclip className="h-5 w-5 text-slate-500" />
              <span>Anexar Fotos da Galeria</span>
            </button>
          </div>

          {/* Preview das Fotos Selecionadas */}
          {fotosArquivos.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              {fotosArquivos.map((item, idx) => (
                <div
                  key={idx}
                  className="group relative aspect-square overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800"
                >
                  <img
                    src={item.preview}
                    alt={`Evidência ${idx + 1}`}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removerFoto(idx)}
                    className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-xl bg-rose-600/90 text-white shadow-md hover:bg-rose-700 transition-colors cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <div className="absolute bottom-1 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-mono text-white">
                    Foto {idx + 1}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Barra Inferior de Envio */}
      <div className="sticky bottom-4 z-20 flex items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white/95 p-4 shadow-xl backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95">
        <div className="hidden sm:block text-xs text-slate-500 dark:text-slate-400">
          Todos os campos com <span className="text-rose-500">*</span> são obrigatórios.
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-5 py-3 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 cursor-pointer"
            >
              Cancelar
            </button>
          )}

          <button
            type="submit"
            disabled={enviando}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 px-7 py-3 text-xs font-bold text-white shadow-md shadow-emerald-600/25 hover:from-emerald-500 hover:to-teal-600 focus:outline-none disabled:opacity-50 transition-all cursor-pointer"
          >
            {enviando ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Registrando e enviando fotos...</span>
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                <span>REGISTRAR DESVIO (RID)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
