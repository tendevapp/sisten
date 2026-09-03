/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Módulo Portaria — Relatório de Ocorrências (FRM.SGP-0010).
 * Livro de ocorrências digital contínuo:
 * - Entradas de veículos e visitantes (com suporte a múltiplas pessoas no mesmo lançamento);
 * - Sessão exclusiva de briefing gerada para cada formulário com pessoas que farão briefing;
 * - Saídas de colaboradores e baixas rápidas no pátio;
 * - Rondas patrimoniais e ocorrências com texto livre e fotos de câmera/upload;
 * - Conversão automática para maiúsculas e campo vigilante limpo para seleção a cada novo registro;
 * - Modais expandidos no desktop (max-w-4xl).
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ArrowLeft, Plus, Search, FileDown,
  Trash2, X, Loader2, ClipboardList, Shield, Clock, AlertTriangle, Info,
  Check, UserCheck, Car, User, UserX, Building2,
  Sparkles, History, ShieldCheck, ChevronRight, CornerDownRight,
  Camera, Upload, Image as ImageIcon, Eye, LogOut, LogIn, Edit3, UserPlus, Users, CheckCircle2
} from 'lucide-react';
import type {
  Profile, PortRelatorioPortaria, PortRelatorioOcorrencia,
  PortRelatorioStatus, PortTurno, PortLocalSetor, PortSeveridade,
  PortTipoRegistroOcorrencia, PortPessoaVeiculoHistorico, RhPessoa
} from '../../types';
import * as api from '../../lib/portariaApi';
import { podeEditarFormulario } from '../../lib/permissoesFormularios';
import { listarRhPessoas } from '../../lib/rhApi';
import { exportRelatorioPortariaPdf } from '../../lib/pdfExport/exportPortariaPdf';
import StatusPortariaBadge from '../../components/portaria/StatusPortariaBadge';
import VigilanteSelect from '../../components/portaria/VigilanteSelect';
import { useToast } from '../../components/ui/Toast';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Modal, { ModalHeader, ModalBody, ModalFooter } from '../../components/ui/Modal';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

interface ItemPessoaForm {
  nome: string;
  cpf: string;
  cnh: string;
  funcao: string;
}

const TIPOS_REGISTRO: {
  id: PortTipoRegistroOcorrencia;
  label: string;
  sublabel: string;
  icon: any;
  cor: string;
  badgeCor: string;
  isLivre: boolean;
}[] = [
  {
    id: 'ENTRADA_VEICULO',
    label: 'Entrada de Veículo',
    sublabel: 'Fornecedor / Prestador / Carga / Passeio',
    icon: Car,
    cor: 'text-blue-600 bg-blue-50 dark:bg-blue-950/60 dark:text-blue-400',
    badgeCor: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
    isLivre: false,
  },
  {
    id: 'ENTRADA_VISITANTE',
    label: 'Entrada de Visitante',
    sublabel: 'Visitante / Terceiro / Prestador a Pé',
    icon: UserCheck,
    cor: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 dark:text-indigo-400',
    badgeCor: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
    isLivre: false,
  },
  {
    id: 'SAIDA_COLABORADOR',
    label: 'Saída de Colaborador',
    sublabel: 'Saída Temporária / Médico / Almoço',
    icon: UserX,
    cor: 'text-amber-600 bg-amber-50 dark:bg-amber-950/60 dark:text-amber-400',
    badgeCor: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    isLivre: false,
  },
  {
    id: 'RONDA_PATRIMONIAL',
    label: 'Ronda Patrimonial',
    sublabel: 'Inspeção de posto / Perímetro / Ronda',
    icon: ShieldCheck,
    cor: 'text-purple-600 bg-purple-50 dark:bg-purple-950/60 dark:text-purple-400',
    badgeCor: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300',
    isLivre: true,
  },
  {
    id: 'OCORRENCIA_GERAL',
    label: 'Ocorrência / Incidente',
    sublabel: 'Anomalia, desvio ou alerta no turno',
    icon: AlertTriangle,
    cor: 'text-rose-600 bg-rose-50 dark:bg-rose-950/60 dark:text-rose-400',
    badgeCor: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
    isLivre: true,
  },
  {
    id: 'OUTRO_REGISTRO',
    label: 'Outro Registro',
    sublabel: 'Informação ou anotação livre da portaria',
    icon: ClipboardList,
    cor: 'text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-300',
    badgeCor: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    isLivre: true,
  },
];

const SETORES: { id: PortLocalSetor; label: string }[] = [
  { id: 'PORTARIA', label: 'Portaria Geral' },
  { id: 'RONDA_01', label: 'Ronda 01 (Perímetro Fábrica)' },
  { id: 'RONDA_02', label: 'Ronda 02 (Pátios & Tramos)' },
  { id: 'PATIO_CHAPAS', label: 'Pátio de Chapas' },
  { id: 'PATIO_TRAMOS', label: 'Pátio de Tramos' },
  { id: 'FABRICA', label: 'Área Produtiva' },
  { id: 'OUTRO', label: 'Outro Local' },
];

export default function PortariaRelatorio({ user, onNavigate }: Props) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const [relatorios, setRelatorios] = useState<PortRelatorioPortaria[]>([]);
  const [loading, setLoading] = useState(true);
  const [relatorioAtivo, setRelatorioAtivo] = useState<PortRelatorioPortaria | null>(null);
  // Só o autor do livro de plantão (ou um admin) altera lançamentos; os
  // demais só consultam. Espelha a RLS em `form_pode_editar`.
  const podeEditarAtivo = podeEditarFormulario(user, relatorioAtivo);

  // Modais
  const [modalNovoRelatorio, setModalNovoRelatorio] = useState(false);
  const [modalNovaOcorrencia, setModalNovaOcorrencia] = useState(false);
  const [modalRegistrarSaida, setModalRegistrarSaida] = useState(false);
  const [modalFotoZoom, setModalFotoZoom] = useState<string | null>(null);
  const [itemParaExcluir, setItemParaExcluir] = useState<PortRelatorioPortaria | null>(null);
  const [ocorrenciaParaExcluir, setOcorrenciaParaExcluir] = useState<PortRelatorioOcorrencia | null>(null);
  const [ocorrenciaEmEdicao, setOcorrenciaEmEdicao] = useState<PortRelatorioOcorrencia | null>(null);
  const [ocorrenciaParaSaida, setOcorrenciaParaSaida] = useState<PortRelatorioOcorrencia | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Filtros de Linha do Tempo
  const [filtroCategoria, setFiltroCategoria] = useState<string>('TODAS');
  const [termoBuscaPlantao, setTermoBuscaPlantao] = useState('');

  // Form Novo Plantão
  const [formRelatorio, setFormRelatorio] = useState({
    data: api.hojeISO(),
    turno: api.sugerirTurno(),
    horario_inicio: '06:00',
    horario_fim: '18:00',
    vigilante_principal: '',
    vigilante_ronda01: '',
    vigilante_ronda02: '',
    observacoes_gerais: '',
  });

  // Lista de Pessoas no Form de Ocorrência
  const [pessoasForm, setPessoasForm] = useState<ItemPessoaForm[]>([
    { nome: '', cpf: '', cnh: '', funcao: '' },
  ]);

  // Form Nova Ocorrência
  const [formOcorrencia, setFormOcorrencia] = useState<{
    id?: string;
    tipo_registro: PortTipoRegistroOcorrencia;
    horario: string;
    hora_saida: string;
    vigilante_saida: string;
    local_setor: PortLocalSetor;
    severidade: PortSeveridade;
    vigilante: string;
    empresa: string;
    placa_veiculo: string;
    autorizado_por: string;
    motivo_observacao: string;
    fara_briefing: boolean;
    foto_url: string | null;
  }>({
    tipo_registro: 'ENTRADA_VEICULO',
    horario: api.horaAgora(),
    hora_saida: '',
    vigilante_saida: '',
    local_setor: 'PORTARIA',
    severidade: 'INFO',
    vigilante: '',
    empresa: '',
    placa_veiculo: '',
    autorizado_por: '',
    motivo_observacao: '',
    fara_briefing: false,
    foto_url: null,
  });

  // Form Registrar Saída Rápida
  const [formSaidaRapida, setFormSaidaRapida] = useState({
    hora_saida: api.horaAgora(),
    vigilante_saida: '',
    motivo_observacao: '',
  });

  // Autocomplete e busca histórica (Visitantes e Veículos)
  const [buscaHistorico, setBuscaHistorico] = useState('');
  const [sugestoesHistorico, setSugestoesHistorico] = useState<PortPessoaVeiculoHistorico[]>([]);
  const [mostrandoSugestoes, setMostrandoSugestoes] = useState(false);

  // RH Pessoas — Saída de Colaborador
  const [colaboradoresRh, setColaboradoresRh] = useState<RhPessoa[]>([]);
  const [buscaColaborador, setBuscaColaborador] = useState('');
  const [mostrandoSugestoesColab, setMostrandoSugestoesColab] = useState(false);

  // Carrega lista de colaboradores do RH ao iniciar
  useEffect(() => {
    listarRhPessoas()
      .then((data) => setColaboradoresRh(data || []))
      .catch((err) => console.error('Erro ao carregar colaboradores do RH:', err));
  }, []);

  const colaboradoresFiltrados = useMemo(() => {
    if (!buscaColaborador.trim()) return [];
    const termo = buscaColaborador.trim().toUpperCase();
    return colaboradoresRh
      .filter(
        (p) =>
          (p.nome && p.nome.toUpperCase().includes(termo)) ||
          (p.registro && p.registro.toUpperCase().includes(termo)) ||
          (p.cargo && p.cargo.toUpperCase().includes(termo))
      )
      .slice(0, 10);
  }, [buscaColaborador, colaboradoresRh]);

  const aplicarColaborador = (p: RhPessoa) => {
    setPessoasForm([
      {
        nome: p.nome.toUpperCase(),
        cpf: p.registro, // Salva o registro / matrícula como identificador
        cnh: '',
        funcao: (p.cargo || '').toUpperCase(),
      },
    ]);
    setFormOcorrencia((prev) => ({
      ...prev,
      empresa: 'TEN - TORRES EÓLICAS DO NORDESTE',
      tipo_registro: 'SAIDA_COLABORADOR',
    }));
    setBuscaColaborador('');
    setMostrandoSugestoesColab(false);
    toast.success(`Colaborador ${p.nome} (Matrícula: ${p.registro}) preenchido com sucesso!`);
  };

  // Checagem de Validade de Briefing (Validade estrita: 30 dias)
  const [statusBriefingPorPessoa, setStatusBriefingPorPessoa] = useState<Record<number, api.ResultadoChecagemBriefing>>({});
  const [checandoBriefing, setChecandoBriefing] = useState(false);

  const handleChecarBriefing = async (index?: number) => {
    setChecandoBriefing(true);
    try {
      if (index !== undefined) {
        const p = pessoasForm[index];
        const doc = (p.cpf || p.cnh || '').replace(/\D/g, '');
        if (!doc) {
          toast.warning('Informe o CPF ou documento da pessoa para checar a validade do briefing.');
          return;
        }

        const res = await api.checarStatusBriefingCpf(doc, 30);
        setStatusBriefingPorPessoa((prev) => ({ ...prev, [index]: res }));

        if (res.status === 'NUNCA_REALIZADO' || res.status === 'VENCIDO') {
          setFormOcorrencia((prev) => ({ ...prev, fara_briefing: true }));
        }
      } else {
        // Checar todas as pessoas cadastradas no formulário
        const novosStatus: Record<number, api.ResultadoChecagemBriefing> = {};
        let temInvalido = false;
        let checouAlgum = false;

        for (let i = 0; i < pessoasForm.length; i++) {
          const p = pessoasForm[i];
          const doc = (p.cpf || p.cnh || '').replace(/\D/g, '');
          if (doc) {
            checouAlgum = true;
            const res = await api.checarStatusBriefingCpf(doc, 30);
            novosStatus[i] = res;
            if (res.status === 'NUNCA_REALIZADO' || res.status === 'VENCIDO') {
              temInvalido = true;
            }
          }
        }

        setStatusBriefingPorPessoa(novosStatus);

        if (!checouAlgum) {
          toast.warning('Informe o CPF/Documento dos visitantes para checar a validade.');
          return;
        }

        if (temInvalido) {
          setFormOcorrencia((prev) => ({ ...prev, fara_briefing: true }));
        } else {
          setFormOcorrencia((prev) => ({ ...prev, fara_briefing: false }));
        }
      }
    } catch (e: any) {
      toast.error('Erro ao consultar briefing: ' + (e.message || ''));
    } finally {
      setChecandoBriefing(false);
    }
  };

  const tipoAtual = useMemo(() => {
    return TIPOS_REGISTRO.find((t) => t.id === formOcorrencia.tipo_registro) || TIPOS_REGISTRO[0];
  }, [formOcorrencia.tipo_registro]);

  // Função estável para carregar relatórios sem loop de dependência
  const carregarRelatorios = useCallback(async (selecionarId?: string) => {
    try {
      const data = await api.listarRelatorios();
      setRelatorios(data);
      setRelatorioAtivo((prev) => {
        if (selecionarId) {
          const matchNovo = data.find((r) => r.id === selecionarId);
          if (matchNovo) return matchNovo;
        }
        if (prev) {
          const match = data.find((r) => r.id === prev.id);
          return match || data[0] || null;
        }
        return data[0] || null;
      });
    } catch (e) {
      toast.error(`Erro ao carregar relatórios: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    carregarRelatorios();
  }, [carregarRelatorios]);

  // Busca sugestões no autocomplete
  useEffect(() => {
    let ativo = true;
    if (!buscaHistorico.trim()) {
      setSugestoesHistorico([]);
      return;
    }
    api.buscarHistoricoPessoasVeiculos(buscaHistorico).then((res) => {
      if (ativo) setSugestoesHistorico(res);
    });
    return () => {
      ativo = false;
    };
  }, [buscaHistorico]);

  const aplicarPerfilHistorico = (item: PortPessoaVeiculoHistorico) => {
    setFormOcorrencia((prev) => ({
      ...prev,
      empresa: (item.empresa || prev.empresa).toUpperCase(),
      placa_veiculo: (item.placa || prev.placa_veiculo).toUpperCase(),
      tipo_registro: item.tipo_padrao || prev.tipo_registro,
    }));

    // Atualiza a primeira pessoa ou preenche os dados
    setPessoasForm((prev) => {
      const nova = [...prev];
      if (nova.length === 0) {
        nova.push({
          nome: (item.nome || '').toUpperCase(),
          cpf: item.cpf || '',
          cnh: item.cnh || '',
          funcao: (item.funcao || '').toUpperCase(),
        });
      } else {
        nova[0] = {
          nome: (item.nome || nova[0].nome).toUpperCase(),
          cpf: item.cpf || nova[0].cpf,
          cnh: item.cnh || nova[0].cnh,
          funcao: (item.funcao || nova[0].funcao).toUpperCase(),
        };
      }
      return nova;
    });

    setMostrandoSugestoes(false);
    setBuscaHistorico('');
    toast.success(`Dados de ${item.nome || item.empresa || item.placa} preenchidos!`);
  };

  const handleCriarRelatorio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formRelatorio.vigilante_principal.trim()) {
      toast.error('Selecione o vigilante principal da portaria.');
      return;
    }

    setSalvando(true);
    try {
      const novo = await api.criarRelatorio({
        ...formRelatorio,
        criado_por: user.id,
      });
      toast.success('Relatório de ocorrências aberto com sucesso!');
      setModalNovoRelatorio(false);
      setRelatorioAtivo(novo);
      carregarRelatorios(novo.id);
    } catch (e) {
      toast.error(`Falha ao abrir relatório: ${(e as Error).message}`);
    } finally {
      setSalvando(false);
    }
  };

  // Upload e Câmera com compressão
  const handleSelecionarImagem = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      toast.error('Imagem muito grande (máx 8MB).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 1200;
        let width = img.width;
        let height = img.height;

        if (width > height && width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedData = canvas.toDataURL('image/jpeg', 0.72);
          setFormOcorrencia((prev) => ({ ...prev, foto_url: compressedData }));
          toast.success('Foto anexada com sucesso!');
        }
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Gerenciador de Lista de Pessoas no Form
  const handleAdicionarPessoa = () => {
    setPessoasForm((prev) => [...prev, { nome: '', cpf: '', cnh: '', funcao: '' }]);
  };

  const handleRemoverPessoa = (index: number) => {
    if (pessoasForm.length <= 1) return;
    setPessoasForm((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAlterarPessoa = (index: number, campo: keyof ItemPessoaForm, valor: string) => {
    setPessoasForm((prev) => {
      const nova = [...prev];
      nova[index] = {
        ...nova[index],
        [campo]: campo === 'cpf' || campo === 'cnh' ? valor : valor.toUpperCase(),
      };
      return nova;
    });
  };

  // Montagem do texto em tempo real
  const textoPrevia = useMemo(() => {
    return api.formatarTextoOcorrencia({
      ...formOcorrencia,
      pessoas: pessoasForm,
    });
  }, [formOcorrencia, pessoasForm]);

  const abrirModalOcorrencia = () => {
    setOcorrenciaEmEdicao(null);
    setPessoasForm([{ nome: '', cpf: '', cnh: '', funcao: '' }]);
    setFormOcorrencia({
      tipo_registro: 'ENTRADA_VEICULO',
      horario: api.horaAgora(),
      hora_saida: '',
      vigilante_saida: '',
      local_setor: 'PORTARIA',
      severidade: 'INFO',
      vigilante: '', // Exibe "Selecione o vigilante..." conforme solicitado
      empresa: '',
      placa_veiculo: '',
      autorizado_por: '',
      motivo_observacao: '',
      fara_briefing: false,
      foto_url: null,
    });
    setBuscaHistorico('');
    setMostrandoSugestoes(false);
    setBuscaColaborador('');
    setMostrandoSugestoesColab(false);
    setStatusBriefingPorPessoa({});
    setModalNovaOcorrencia(true);
  };

  const abrirModalEdicao = (oc: PortRelatorioOcorrencia) => {
    setOcorrenciaEmEdicao(oc);
    if (oc.pessoas && oc.pessoas.length > 0) {
      setPessoasForm(
        oc.pessoas.map((p) => ({
          nome: p.nome || '',
          cpf: p.cpf || '',
          cnh: p.cnh || '',
          funcao: p.funcao || '',
        }))
      );
    } else {
      setPessoasForm([
        {
          nome: oc.nome_pessoa || '',
          cpf: oc.documento_cpf || '',
          cnh: oc.documento_cnh || '',
          funcao: '',
        },
      ]);
    }

    setFormOcorrencia({
      id: oc.id,
      tipo_registro: oc.tipo_registro || (oc.descricao.includes('Veículo') ? 'ENTRADA_VEICULO' : 'OUTRO_REGISTRO'),
      horario: oc.horario,
      hora_saida: oc.hora_saida || '',
      vigilante_saida: oc.vigilante_saida || '',
      local_setor: oc.local_setor,
      severidade: oc.severidade,
      vigilante: oc.vigilante || '',
      empresa: (oc.empresa || '').toUpperCase(),
      placa_veiculo: (oc.placa || '').toUpperCase(),
      autorizado_por: (oc.autorizado_por || '').toUpperCase(),
      motivo_observacao: (oc.motivo_observacao || oc.descricao).toUpperCase(),
      fara_briefing: !!oc.fara_briefing,
      foto_url: oc.foto_url || null,
    });
    setModalNovaOcorrencia(true);
  };

  const abrirModalDarSaida = (oc: PortRelatorioOcorrencia) => {
    setOcorrenciaParaSaida(oc);
    setFormSaidaRapida({
      hora_saida: api.horaAgora(),
      vigilante_saida: '',
      motivo_observacao: '',
    });
    setModalRegistrarSaida(true);
  };

  const handleSalvarSaidaRapida = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ocorrenciaParaSaida || !relatorioAtivo) return;

    if (!formSaidaRapida.vigilante_saida.trim()) {
      toast.error('Selecione o vigilante que está liberando a saída.');
      return;
    }

    setSalvando(true);
    try {
      const horaS = formSaidaRapida.hora_saida || api.horaAgora();
      const vigS = formSaidaRapida.vigilante_saida.trim().toUpperCase();

      const novaDescricao = api.formatarTextoOcorrencia({
        tipo_registro: ocorrenciaParaSaida.tipo_registro || 'ENTRADA_VEICULO',
        horario: ocorrenciaParaSaida.horario,
        hora_saida: horaS,
        vigilante_saida: vigS,
        empresa: ocorrenciaParaSaida.empresa,
        nome_pessoa: ocorrenciaParaSaida.nome_pessoa,
        documento_cnh: ocorrenciaParaSaida.documento_cnh,
        documento_cpf: ocorrenciaParaSaida.documento_cpf,
        placa_veiculo: ocorrenciaParaSaida.placa,
        autorizado_por: ocorrenciaParaSaida.autorizado_por,
        motivo_observacao: (formSaidaRapida.motivo_observacao || ocorrenciaParaSaida.motivo_observacao || '').toUpperCase(),
        fara_briefing: ocorrenciaParaSaida.fara_briefing,
        pessoas: ocorrenciaParaSaida.pessoas,
      });

      await api.atualizarOcorrencia(ocorrenciaParaSaida.id, {
        hora_saida: horaS,
        vigilante_saida: vigS,
        status_permanencia: 'FINALIZADO',
        descricao: novaDescricao,
        motivo_observacao: (formSaidaRapida.motivo_observacao || ocorrenciaParaSaida.motivo_observacao || '').toUpperCase(),
      });

      toast.success(`Saída registrada às ${horaS}!`);
      setModalRegistrarSaida(false);
      setOcorrenciaParaSaida(null);

      const relAtualizado = await api.obterRelatorio(relatorioAtivo.id);
      if (relAtualizado) setRelatorioAtivo(relAtualizado);
      carregarRelatorios(relatorioAtivo.id);
    } catch (err: any) {
      toast.error('Erro ao registrar saída: ' + (err.message || ''));
    } finally {
      setSalvando(false);
    }
  };

  const handleSalvarOcorrencia = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formOcorrencia.vigilante.trim()) {
      toast.error('Por favor, selecione o vigilante responsável.');
      return;
    }

    const descricaoFinal = textoPrevia.trim();
    if (!descricaoFinal) {
      toast.error('Preencha a descrição da ocorrência.');
      return;
    }

    const pessoasValidas = pessoasForm.filter((p) => p.nome.trim());
    if (!tipoAtual.isLivre && pessoasValidas.length === 0) {
      toast.error('Informe ao menos o nome de uma pessoa / visitante.');
      return;
    }

    setSalvando(true);
    try {
      let relId = relatorioAtivo?.id;

      if (!relId) {
        const novoRel = await api.criarRelatorio({
          data: api.hojeISO(),
          turno: api.sugerirTurno(),
          vigilante_principal: formOcorrencia.vigilante,
          criado_por: user.id,
        });
        relId = novoRel.id;
        setRelatorioAtivo(novoRel);
      }

      const statusPermanencia = tipoAtual.isLivre
        ? 'NAO_APLICA'
        : formOcorrencia.hora_saida
        ? 'FINALIZADO'
        : formOcorrencia.tipo_registro === 'SAIDA_COLABORADOR'
        ? 'AGUARDANDO_RETORNO'
        : 'NO_PATIO';

      const primeiraPessoa = pessoasValidas[0] || { nome: '', cpf: '', cnh: '', funcao: '' };

      const payloadOcorrencia = {
        horario: formOcorrencia.horario,
        hora_saida: formOcorrencia.hora_saida || null,
        vigilante_saida: formOcorrencia.vigilante_saida ? formOcorrencia.vigilante_saida.toUpperCase() : null,
        tipo_registro: formOcorrencia.tipo_registro,
        status_permanencia: statusPermanencia,
        local_setor: formOcorrencia.local_setor,
        descricao: descricaoFinal,
        severidade: formOcorrencia.severidade,
        vigilante: formOcorrencia.vigilante.toUpperCase(),
        foto_url: formOcorrencia.foto_url,
        empresa: formOcorrencia.empresa.toUpperCase(),
        nome_pessoa: primeiraPessoa.nome.toUpperCase(),
        documento_cpf: primeiraPessoa.cpf,
        documento_cnh: primeiraPessoa.cnh,
        placa: formOcorrencia.placa_veiculo.toUpperCase(),
        autorizado_por: formOcorrencia.autorizado_por.toUpperCase(),
        fara_briefing: formOcorrencia.fara_briefing,
        motivo_observacao: formOcorrencia.motivo_observacao.toUpperCase(),
        pessoas: pessoasValidas,
      };

      if (ocorrenciaEmEdicao?.id) {
        await api.atualizarOcorrencia(ocorrenciaEmEdicao.id, payloadOcorrencia);
        toast.success('Lançamento atualizado com sucesso!');
      } else {
        await api.adicionarOcorrencia(relId, payloadOcorrencia);
        toast.success('Lançamento registrado no livro de ocorrências!');
      }

      // Salva no histórico para autocompletar futuramente
      for (const p of pessoasValidas) {
        api.salvarNoHistoricoLocal({
          nome: p.nome.trim().toUpperCase(),
          empresa: formOcorrencia.empresa.trim().toUpperCase(),
          cpf: p.cpf.trim(),
          cnh: p.cnh.trim(),
          placa: formOcorrencia.placa_veiculo.trim().toUpperCase(),
          funcao: p.funcao.trim().toUpperCase(),
          tipo_padrao: formOcorrencia.tipo_registro,
        });
      }

      // Se marcado "Fará Briefing", abre uma sessão de Briefing ÚNICA para este formulário
      if (formOcorrencia.fara_briefing && pessoasValidas.length > 0 && !ocorrenciaEmEdicao) {
        await api.criarSessaoBriefingParaOcorrencia({
          empresa: formOcorrencia.empresa,
          pessoas: pessoasValidas,
          autorizado_por: formOcorrencia.autorizado_por,
          motivo: formOcorrencia.motivo_observacao,
          horario: formOcorrencia.horario,
        });
        toast.success(`Sessão de Briefing criada para ${pessoasValidas.length} participante(s)!`);
      }

      setModalNovaOcorrencia(false);
      setOcorrenciaEmEdicao(null);

      const relAtualizado = await api.obterRelatorio(relId);
      if (relAtualizado) setRelatorioAtivo(relAtualizado);
      carregarRelatorios(relId);
    } catch (err: any) {
      toast.error('Erro ao salvar ocorrência: ' + (err.message || ''));
    } finally {
      setSalvando(false);
    }
  };

  const handleExcluirOcorrencia = async () => {
    if (!ocorrenciaParaExcluir || !relatorioAtivo) return;
    try {
      await api.excluirOcorrencia(ocorrenciaParaExcluir.id);
      toast.success('Ocorrência removida com sucesso!');
      setOcorrenciaParaExcluir(null);
      const relAtualizado = await api.obterRelatorio(relatorioAtivo.id);
      if (relAtualizado) setRelatorioAtivo(relAtualizado);
      carregarRelatorios(relatorioAtivo.id);
    } catch (err: any) {
      toast.error('Erro ao excluir ocorrência: ' + (err.message || ''));
    }
  };

  const handleExcluirPlantao = async () => {
    if (!itemParaExcluir) return;
    try {
      await api.excluirRelatorio(itemParaExcluir.id);
      toast.success(`Plantão ${itemParaExcluir.numero_protocolo} excluído!`);
      setItemParaExcluir(null);
      if (relatorioAtivo?.id === itemParaExcluir.id) {
        setRelatorioAtivo(null);
      }
      carregarRelatorios();
    } catch (e) {
      toast.error(`Erro ao excluir plantão: ${(e as Error).message}`);
    }
  };

  // Filtragem de ocorrências
  const ocorrenciasFiltradas = useMemo(() => {
    if (!relatorioAtivo) return [];
    const lista = relatorioAtivo.ocorrencias || [];

    if (filtroCategoria === 'TODAS') return lista;
    if (filtroCategoria === 'PATIO') {
      return lista.filter(
        (o) =>
          o.status_permanencia === 'NO_PATIO' ||
          (!o.hora_saida && (o.tipo_registro === 'ENTRADA_VEICULO' || o.tipo_registro === 'ENTRADA_VISITANTE'))
      );
    }
    if (filtroCategoria === 'VEICULOS') {
      return lista.filter(
        (o) =>
          o.tipo_registro === 'ENTRADA_VEICULO' ||
          o.descricao.toLowerCase().includes('veículo') ||
          o.descricao.toLowerCase().includes('placa')
      );
    }
    if (filtroCategoria === 'PESSOAS') {
      return lista.filter(
        (o) =>
          o.tipo_registro === 'ENTRADA_VISITANTE' ||
          o.tipo_registro === 'SAIDA_COLABORADOR' ||
          o.descricao.toLowerCase().includes('acessou') ||
          o.descricao.toLowerCase().includes('saiu')
      );
    }
    if (filtroCategoria === 'RONDAS') {
      return lista.filter(
        (o) =>
          o.tipo_registro === 'RONDA_PATRIMONIAL' ||
          o.local_setor.includes('RONDA') ||
          o.descricao.toLowerCase().includes('ronda')
      );
    }
    if (filtroCategoria === 'ALERTAS') {
      return lista.filter((o) => o.severidade === 'ALERTA' || o.severidade === 'GRAVE');
    }
    return lista;
  }, [relatorioAtivo, filtroCategoria]);

  const plantoesFiltrados = useMemo(() => {
    if (!termoBuscaPlantao.trim()) return relatorios;
    const t = termoBuscaPlantao.toLowerCase();
    return relatorios.filter(
      (r) =>
        r.data.includes(t) ||
        r.numero_protocolo.toLowerCase().includes(t) ||
        r.vigilante_principal.toLowerCase().includes(t) ||
        r.turno.toLowerCase().includes(t)
    );
  }, [relatorios, termoBuscaPlantao]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={() => onNavigate('/formularios/portaria')}
            className="group mb-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 shadow-xs transition-all hover:border-purple-400 hover:bg-purple-50/50 hover:text-purple-700 hover:shadow-sm active:scale-95 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-purple-500 dark:hover:bg-purple-950/40 dark:hover:text-purple-300"
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
            <span>Voltar para o Painel da Portaria</span>
          </button>
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-purple-600 text-white shadow-sm shadow-purple-500/20">
              <ClipboardList className="h-6 w-6" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-50">
                  Relatório de Ocorrências
                </h1>
                <span className="rounded-md bg-purple-50 px-2 py-0.5 font-mono text-xs font-bold text-purple-700 dark:bg-purple-950/60 dark:text-purple-400">
                  FRM.SGP-0010
                </span>
              </div>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Livro Digital de Ocorrências · Entradas, Saídas, Permanência de Visitantes e Rondas com Registro Fotográfico
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {relatorioAtivo && (
            <button
              type="button"
              onClick={() => exportRelatorioPortariaPdf(relatorioAtivo)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            >
              <FileDown className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              Exportar Livro (PDF)
            </button>
          )}

          <button
            type="button"
            onClick={abrirModalOcorrencia}
            className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-purple-500"
          >
            <Plus className="h-4 w-4" />
            Nova Ocorrência
          </button>
        </div>
      </div>

      {/* Main Grid: Left = Shifts / Right = Occurrence Timeline */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Shifts List */}
        <div className="space-y-3 lg:col-span-4">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Livros por Data & Turno
              </h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                {relatorios.length}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setFormRelatorio({
                  data: api.hojeISO(),
                  turno: api.sugerirTurno(),
                  horario_inicio: '06:00',
                  horario_fim: '18:00',
                  vigilante_principal: '',
                  vigilante_ronda01: '',
                  vigilante_ronda02: '',
                  observacoes_gerais: '',
                });
                setModalNovoRelatorio(true);
              }}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-600 hover:text-purple-700 dark:text-purple-400"
              title="Abrir novo período / turno"
            >
              <Plus className="h-3 w-3" />
              Novo Turno
            </button>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Filtrar por data, vigilante, protocolo..."
              value={termoBuscaPlantao}
              onChange={(e) => setTermoBuscaPlantao(e.target.value.toUpperCase())}
              className="w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-xs uppercase text-slate-900 focus:border-purple-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          {loading ? (
            <div className="flex h-32 items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <Loader2 className="h-5 w-5 animate-spin text-purple-600" />
            </div>
          ) : plantoesFiltrados.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs text-slate-500 dark:text-slate-400">Nenhum plantão encontrado.</p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[700px] overflow-y-auto pr-1">
              {plantoesFiltrados.map((rel) => {
                const isSelected = relatorioAtivo?.id === rel.id;
                const countOcorrencias = (rel.ocorrencias || []).length;
                const countNoPatio = (rel.ocorrencias || []).filter(
                  (o) =>
                    o.status_permanencia === 'NO_PATIO' ||
                    (!o.hora_saida && (o.tipo_registro === 'ENTRADA_VEICULO' || o.tipo_registro === 'ENTRADA_VISITANTE'))
                ).length;

                return (
                  <div
                    key={rel.id}
                    onClick={() => setRelatorioAtivo(rel)}
                    className={`cursor-pointer rounded-2xl border p-4 transition-all ${
                      isSelected
                        ? 'border-purple-500 bg-purple-50/40 ring-2 ring-purple-500/20 dark:border-purple-500 dark:bg-purple-950/20'
                        : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="font-mono text-xs font-bold text-purple-600 dark:text-purple-400">
                          {rel.numero_protocolo}
                        </span>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                          {rel.data.split('-').reverse().join('/')} · Turno {rel.turno}
                        </h4>
                      </div>
                      <StatusPortariaBadge status={rel.status} />
                    </div>

                    <div className="mt-2.5 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 pt-2 dark:border-slate-800/80">
                      <span className="truncate max-w-[140px]">Vig: {rel.vigilante_principal}</span>
                      <div className="flex items-center gap-2">
                        {countNoPatio > 0 && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            {countNoPatio} no pátio
                          </span>
                        )}
                        <span className="font-bold text-purple-600 dark:text-purple-400">
                          {countOcorrencias} reg
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Selected Shift Timeline & Ocorrências */}
        <div className="lg:col-span-8">
          {relatorioAtivo ? (
            <div className="rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900 flex flex-col">
              {/* Shift Header Bar */}
              <div className="border-b border-slate-100 p-5 dark:border-slate-800">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-xs font-bold text-purple-600 dark:text-purple-400">
                        {relatorioAtivo.numero_protocolo}
                      </span>
                      <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                        Plantão {relatorioAtivo.data.split('-').reverse().join('/')} — Turno {relatorioAtivo.turno}
                      </h2>
                      <StatusPortariaBadge status={relatorioAtivo.status} />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <span>Horário: <strong>{relatorioAtivo.horario_inicio} às {relatorioAtivo.horario_fim}</strong></span>
                      <span>•</span>
                      <span>Portaria: <strong>{relatorioAtivo.vigilante_principal}</strong></span>
                      {relatorioAtivo.vigilante_ronda01 && (
                        <>
                          <span>•</span>
                          <span>Ronda 01: <strong>{relatorioAtivo.vigilante_ronda01}</strong></span>
                        </>
                      )}
                      {relatorioAtivo.vigilante_ronda02 && (
                        <>
                          <span>•</span>
                          <span>Ronda 02: <strong>{relatorioAtivo.vigilante_ronda02}</strong></span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {podeEditarAtivo ? (
                      <>
                        <button
                          type="button"
                          onClick={abrirModalOcorrencia}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-purple-500"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Nova Ocorrência
                        </button>
                        <button
                          type="button"
                          onClick={() => setItemParaExcluir(relatorioAtivo)}
                          className="rounded-xl p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-400"
                          title="Excluir livro do período"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    ) : (
                      <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        Somente leitura — livro de outro usuário
                      </span>
                    )}
                  </div>
                </div>

                {/* Filtros de Categoria */}
                <div className="flex flex-wrap items-center gap-1.5 pt-4">
                  {[
                    { id: 'TODAS', label: 'Todas as Ocorrências' },
                    { id: 'PATIO', label: '🟢 No Pátio (Sem Saída)' },
                    { id: 'VEICULOS', label: '🚗 Veículos' },
                    { id: 'PESSOAS', label: '🚶‍♂️ Visitantes & Terceiros' },
                    { id: 'RONDAS', label: '🛡️ Rondas' },
                    { id: 'ALERTAS', label: '⚠️ Alertas' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setFiltroCategoria(tab.id)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${
                        filtroCategoria === tab.id
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Occurrences Feed */}
              <div className="p-5 space-y-3.5">
                {ocorrenciasFiltradas.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-10 text-center dark:border-slate-800 dark:bg-slate-950/30">
                    <ClipboardList className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
                    <p className="mt-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                      Nenhum lançamento registrado neste filtro.
                    </p>
                    <button
                      type="button"
                      onClick={abrirModalOcorrencia}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-purple-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-purple-500 shadow-sm"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Nova Ocorrência
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {ocorrenciasFiltradas.map((oc, index) => {
                      const isBriefing = oc.descricao.includes('[BRIEFING PENDENTE]');
                      const isAlerta = oc.severidade === 'ALERTA' || oc.severidade === 'GRAVE';
                      const tipoObj = TIPOS_REGISTRO.find((t) => t.id === oc.tipo_registro);
                      const temSaidaPendente =
                        (oc.tipo_registro === 'ENTRADA_VEICULO' || oc.tipo_registro === 'ENTRADA_VISITANTE') &&
                        !oc.hora_saida;

                      return (
                        <div
                          key={oc.id || index}
                          className={`group flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border p-4 transition-all ${
                            isAlerta
                              ? 'border-amber-300 bg-amber-50/30 dark:border-amber-900/60 dark:bg-amber-950/20'
                              : temSaidaPendente
                              ? 'border-emerald-200 bg-emerald-50/20 dark:border-emerald-900/40 dark:bg-emerald-950/10'
                              : 'border-slate-200/90 bg-white hover:border-purple-300 dark:border-slate-800 dark:bg-slate-900'
                          }`}
                        >
                          <div className="flex items-start gap-3.5 min-w-0">
                            {/* Tag de Horário e Setor */}
                            <div className="flex flex-col items-center justify-center rounded-xl bg-purple-100/70 px-2.5 py-1.5 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 shrink-0">
                              <span className="font-mono text-xs font-bold">{oc.horario}</span>
                              <span className="text-[10px] font-semibold uppercase">{oc.local_setor}</span>
                            </div>

                            {/* Conteúdo formatado da Ocorrência */}
                            <div className="space-y-1.5 min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                {tipoObj && (
                                  <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold ${tipoObj.badgeCor}`}>
                                    {tipoObj.label}
                                  </span>
                                )}
                                {temSaidaPendente ? (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 animate-pulse">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                    No Pátio
                                  </span>
                                ) : oc.hora_saida ? (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                    <LogOut className="h-3 w-3 text-slate-500" />
                                    Saída às {oc.hora_saida}
                                  </span>
                                ) : null}

                                {isBriefing && (
                                  <span className="rounded-md bg-cyan-100 px-1.5 py-0.5 text-[10px] font-bold text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300">
                                    Briefing de Segurança
                                  </span>
                                )}
                              </div>

                              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 break-words leading-relaxed">
                                {oc.descricao}
                              </p>

                              <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                                <span>
                                  Vigilante: <strong className="text-slate-600 dark:text-slate-300">{oc.vigilante}</strong>
                                </span>
                                {oc.vigilante_saida && (
                                  <span>
                                    · Saída por: <strong className="text-slate-600 dark:text-slate-300">{oc.vigilante_saida}</strong>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Foto e Ações */}
                          <div className="flex items-center justify-end gap-2 shrink-0 self-end sm:self-center pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800/80">
                            {/* Miniatura de Foto se houver */}
                            {oc.foto_url && (
                              <button
                                type="button"
                                onClick={() => setModalFotoZoom(oc.foto_url || null)}
                                className="relative group/foto h-10 w-10 rounded-xl overflow-hidden border border-purple-300 bg-slate-100 dark:bg-slate-800 shrink-0 shadow-xs hover:ring-2 hover:ring-purple-500 transition-all"
                                title="Ver foto em tamanho real"
                              >
                                <img
                                  src={oc.foto_url}
                                  alt="Registro de ocorrência"
                                  className="h-full w-full object-cover"
                                />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/foto:opacity-100 flex items-center justify-center transition-opacity text-white">
                                  <Eye className="h-4 w-4" />
                                </div>
                              </button>
                            )}

                            {/* Botão Registrar Saída se estiver no pátio */}
                            {temSaidaPendente && podeEditarAtivo && (
                              <button
                                type="button"
                                onClick={() => abrirModalDarSaida(oc)}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-500 transition-all active:scale-95"
                                title="Dar baixa / Registrar saída"
                              >
                                <LogOut className="h-3.5 w-3.5" />
                                Registrar Saída
                              </button>
                            )}

                            {podeEditarAtivo && (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => abrirModalEdicao(oc)}
                                  className="p-1.5 text-slate-400 hover:text-purple-600 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-950/50 transition-all"
                                  title="Editar ou reabrir lançamento"
                                >
                                  <Edit3 className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setOcorrenciaParaExcluir(oc)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-all"
                                  title="Excluir lançamento"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-16 text-center dark:border-slate-800 dark:bg-slate-900">
              <ClipboardList className="h-10 w-10 text-purple-400 dark:text-purple-500" />
              <h3 className="mt-3 text-base font-bold text-slate-900 dark:text-slate-100">
                Livro de Ocorrências da Portaria
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-md leading-relaxed">
                Lance entradas de veículos, visitantes, saídas de colaboradores ou rondas patrimoniais com registro fotográfico integrado.
              </p>
              <button
                type="button"
                onClick={abrirModalOcorrencia}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-purple-500"
              >
                <Plus className="h-4 w-4" />
                Nova Ocorrência
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Input oculto para upload de arquivo e câmera */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleSelecionarImagem}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleSelecionarImagem}
      />

      {/* Modal: Lançar / Editar Ocorrência (Desktop Expandido max-w-4xl) */}
      {modalNovaOcorrencia && (
        <Modal onClose={() => setModalNovaOcorrencia(false)} maxWidth="max-w-4xl">
          <ModalHeader onClose={() => setModalNovaOcorrencia(false)}>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-400">
                <ClipboardList className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-50">
                  {ocorrenciaEmEdicao ? 'Editar Lançamento no Livro' : 'Novo Lançamento no Livro de Ocorrências'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {relatorioAtivo ? `Livro ${relatorioAtivo.numero_protocolo} · Turno ${relatorioAtivo.turno}` : 'Registro de Ocorrência — Hoje'}
                </p>
              </div>
            </div>
          </ModalHeader>

          <form onSubmit={handleSalvarOcorrencia} className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <ModalBody className="space-y-4">
              {/* 1. Seleção Visual do Tipo de Lançamento */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                  Tipo de Lançamento *
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                  {TIPOS_REGISTRO.map((tipo) => {
                    const Icon = tipo.icon;
                    const isSelected = formOcorrencia.tipo_registro === tipo.id;
                    return (
                      <button
                        key={tipo.id}
                        type="button"
                        onClick={() =>
                          setFormOcorrencia((prev) => ({
                            ...prev,
                            tipo_registro: tipo.id,
                            empresa:
                              tipo.id === 'SAIDA_COLABORADOR'
                                ? (prev.empresa || 'TEN - TORRES EÓLICAS DO NORDESTE')
                                : prev.empresa,
                          }))
                        }
                        className={`flex flex-col items-start p-2.5 rounded-xl border text-left transition-all ${
                          isSelected
                            ? 'border-purple-600 bg-purple-50 ring-2 ring-purple-500/20 dark:border-purple-500 dark:bg-purple-950/30'
                            : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900'
                        }`}
                      >
                        <span className={`p-1.5 rounded-lg ${tipo.cor} mb-1.5 shrink-0`}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100 leading-tight">
                          {tipo.label}
                        </span>
                        <span className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">
                          {tipo.sublabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Horário, Local e Vigilante */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Horário da Entrada / Evento *
                  </label>
                  <input
                    type="time"
                    required
                    value={formOcorrencia.horario}
                    onChange={(e) => setFormOcorrencia({ ...formOcorrencia, horario: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Local / Posto *
                  </label>
                  <select
                    value={formOcorrencia.local_setor}
                    onChange={(e) => setFormOcorrencia({ ...formOcorrencia, local_setor: e.target.value as PortLocalSetor })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 uppercase"
                  >
                    {SETORES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <VigilanteSelect
                    label="Vigilante Responsável *"
                    placeholder="Selecione o vigilante..."
                    required
                    value={formOcorrencia.vigilante}
                    onChange={(val) => setFormOcorrencia({ ...formOcorrencia, vigilante: val })}
                  />
                </div>
              </div>

              {/* 3. Formulário Condicional */}
              {tipoAtual.isLivre ? (
                /* CASO A: Ronda Patrimonial, Ocorrência Geral, Outro Registro (Texto Livre + Câmera/Foto) */
                <div className="rounded-2xl border border-purple-200 bg-purple-50/30 p-4 sm:p-5 space-y-4 dark:border-purple-900/40 dark:bg-purple-950/20">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-purple-900 dark:text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                      <ShieldCheck className="h-4 w-4" />
                      <span>Descrição da Ronda / Ocorrência & Foto</span>
                    </h4>
                    {formOcorrencia.tipo_registro === 'OCORRENCIA_GERAL' && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Severidade:</span>
                        <select
                          value={formOcorrencia.severidade}
                          onChange={(e) => setFormOcorrencia({ ...formOcorrencia, severidade: e.target.value as PortSeveridade })}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 uppercase"
                        >
                          <option value="INFO">Informativo</option>
                          <option value="ALERTA">Alerta / Atenção</option>
                          <option value="GRAVE">Grave / Crítico</option>
                        </select>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Texto do Registro / Ocorrência *
                    </label>
                    <textarea
                      rows={4}
                      required
                      placeholder={
                        formOcorrencia.tipo_registro === 'RONDA_PATRIMONIAL'
                          ? 'EX: RONDA PERIMETRAL E VISTORIA DE PORTÕES REALIZADA SEM ALTERAÇÕES.'
                          : 'EX: IDENTIFICADO PORTÃO DA FÁBRICA ABERTO FORA DO HORÁRIO PADRÃO...'
                      }
                      value={formOcorrencia.motivo_observacao}
                      onChange={(e) => setFormOcorrencia({ ...formOcorrencia, motivo_observacao: e.target.value.toUpperCase() })}
                      className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs uppercase text-slate-900 focus:border-purple-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>

                  {/* Anexo de Foto da Câmera / Upload */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                      Foto da Câmera / Registro Fotográfico (Opcional)
                    </label>

                    {formOcorrencia.foto_url ? (
                      <div className="flex items-center gap-3 p-3 rounded-xl border border-purple-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                        <img
                          src={formOcorrencia.foto_url}
                          alt="Prévia"
                          className="h-16 w-20 object-cover rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
                          onClick={() => setModalFotoZoom(formOcorrencia.foto_url)}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase">
                            Foto anexada ao registro
                          </p>
                          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">
                            ✓ Pronta para inclusão no livro
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFormOcorrencia((prev) => ({ ...prev, foto_url: null }))}
                          className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                          title="Remover foto"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => cameraInputRef.current?.click()}
                          className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-purple-500 active:scale-95"
                        >
                          <Camera className="h-4 w-4" />
                          Tirar Foto (Câmera)
                        </button>

                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                        >
                          <Upload className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                          Carregar da Galeria
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : formOcorrencia.tipo_registro === 'SAIDA_COLABORADOR' ? (
                /* CASO B: Saída de Colaborador (TEN) integrado à tabela rh_pessoas */
                <div className="space-y-4">
                  {/* Autocomplete de Colaboradores do RH */}
                  <div className="relative rounded-2xl border border-amber-200 bg-amber-50/50 p-3.5 sm:p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="flex items-center gap-1.5 text-xs font-bold text-amber-950 dark:text-amber-300">
                        <UserCheck className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                        <span>Buscar Colaborador por Nome ou Matrícula (RH_PESSOAS)</span>
                      </label>
                      <span className="text-[10px] text-amber-700 dark:text-amber-400 font-semibold">
                        {colaboradoresRh.length} colaboradores carregados
                      </span>
                    </div>

                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-600 dark:text-amber-400" />
                      <input
                        type="text"
                        placeholder="DIGITE O NOME OU A MATRÍCULA PARA AUTOCOMPLETAR..."
                        value={buscaColaborador}
                        onChange={(e) => {
                          setBuscaColaborador(e.target.value.toUpperCase());
                          setMostrandoSugestoesColab(true);
                        }}
                        onFocus={() => setMostrandoSugestoesColab(true)}
                        className="w-full rounded-xl border border-amber-300 bg-white pl-9 pr-4 py-2.5 text-xs uppercase font-semibold text-slate-900 placeholder:text-amber-500/70 focus:border-amber-500 focus:outline-none dark:border-amber-800 dark:bg-slate-950 dark:text-slate-100"
                      />

                      {/* Dropdown de Sugestões de RH */}
                      {mostrandoSugestoesColab && colaboradoresFiltrados.length > 0 && (
                        <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
                          {colaboradoresFiltrados.map((colab) => (
                            <div
                              key={colab.id || colab.registro}
                              onClick={() => aplicarColaborador(colab)}
                              className="flex items-center justify-between gap-2 rounded-lg p-2.5 text-xs hover:bg-amber-50 dark:hover:bg-amber-950/40 cursor-pointer transition-colors border-b border-slate-100 last:border-0 dark:border-slate-800"
                            >
                              <div>
                                <p className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                  <span>{colab.nome}</span>
                                  <span className="font-mono text-[11px] font-bold text-amber-700 bg-amber-100 dark:bg-amber-950 dark:text-amber-300 px-1.5 py-0.5 rounded">
                                    Matrícula: {colab.registro}
                                  </span>
                                </p>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                  Função: {colab.cargo || 'TEN'} · Empresa: TEN
                                </p>
                              </div>
                              <span className="rounded-lg bg-amber-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-xs hover:bg-amber-500">
                                Selecionar
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Dados do Colaborador */}
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 sm:p-5 space-y-4 dark:border-slate-800 dark:bg-slate-950/40">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
                      <User className="h-4 w-4 text-amber-600" />
                      Identificação do Colaborador (TEN)
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Matrícula / Registro RH *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="EX: 001234"
                          value={pessoasForm[0]?.cpf || ''}
                          onChange={(e) => handleAlterarPessoa(0, 'cpf', e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-mono font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Nome Completo *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="NOME DO COLABORADOR..."
                          value={pessoasForm[0]?.nome || ''}
                          onChange={(e) => handleAlterarPessoa(0, 'nome', e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs uppercase font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Função / Cargo
                        </label>
                        <input
                          type="text"
                          placeholder="EX: SOLDADOR, OPERADOR..."
                          value={pessoasForm[0]?.funcao || ''}
                          onChange={(e) => handleAlterarPessoa(0, 'funcao', e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs uppercase text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Empresa / Unidade
                        </label>
                        <input
                          type="text"
                          value={formOcorrencia.empresa || 'TEN - TORRES EÓLICAS DO NORDESTE'}
                          onChange={(e) => setFormOcorrencia({ ...formOcorrencia, empresa: e.target.value.toUpperCase() })}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs uppercase text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Autorizado por (Gestor / Supervisor / Ambulatório) *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="EX: SUPERVISOR MARCOS, DR. ROBERTO (AMBULATÓRIO)..."
                          value={formOcorrencia.autorizado_por}
                          onChange={(e) => setFormOcorrencia({ ...formOcorrencia, autorizado_por: e.target.value.toUpperCase() })}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs uppercase text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Motivo da Saída do Colaborador *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="EX: CONSULTA MÉDICA, SERVIÇO EXTERNO, PARTICULAR..."
                        value={formOcorrencia.motivo_observacao}
                        onChange={(e) => setFormOcorrencia({ ...formOcorrencia, motivo_observacao: e.target.value.toUpperCase() })}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs uppercase text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />

                      {/* Motivos Rápidos */}
                      <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                        <span className="text-[11px] font-semibold text-slate-500 mr-1">Sugestões rápidas:</span>
                        {[
                          'CONSULTA MÉDICA',
                          'SERVIÇO EXTERNO',
                          'PARTICULAR / FAMILIAR',
                          'ALMOÇO / INTERVALO',
                          'LIBERAÇÃO AMBULATÓRIO',
                          'COMPENSAÇÃO DE HORAS',
                          'TREINAMENTO EXTERNO',
                        ].map((motivo) => (
                          <button
                            key={motivo}
                            type="button"
                            onClick={() => setFormOcorrencia((prev) => ({ ...prev, motivo_observacao: motivo }))}
                            className="rounded-lg border border-amber-200 bg-amber-50/80 px-2 py-0.5 text-[11px] font-semibold text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300 transition-colors"
                          >
                            {motivo}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Horário da Saída da Fábrica *
                        </label>
                        <input
                          type="time"
                          required
                          value={formOcorrencia.horario}
                          onChange={(e) => setFormOcorrencia({ ...formOcorrencia, horario: e.target.value })}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Horário de Retorno (Opcional)
                        </label>
                        <input
                          type="time"
                          value={formOcorrencia.hora_saida}
                          onChange={(e) => setFormOcorrencia({ ...formOcorrencia, hora_saida: e.target.value })}
                          placeholder="Vazio = Aguardando Retorno"
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        />
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {formOcorrencia.hora_saida ? 'Retorno já registrado' : 'Deixe em branco se o colaborador ainda não retornou'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* CASO C: Entrada de Veículo ou Entrada de Visitante */
                <div className="space-y-4">
                  {/* Autocomplete Histórico */}
                  <div className="relative rounded-2xl border border-purple-200 bg-purple-50/40 p-3 sm:p-3.5 dark:border-purple-900/40 dark:bg-purple-950/20">
                    <div className="flex items-center justify-between mb-1">
                      <label className="flex items-center gap-1.5 text-xs font-bold text-purple-900 dark:text-purple-300">
                        <Sparkles className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                        <span>Preenchimento Automático pelo Histórico</span>
                      </label>
                      <span className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold">
                        Busca por Nome, CPF, CNH, Placa ou Empresa
                      </span>
                    </div>

                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-purple-500" />
                      <input
                        type="text"
                        placeholder="Comece a digitar para autocompletar..."
                        value={buscaHistorico}
                        onChange={(e) => {
                          setBuscaHistorico(e.target.value.toUpperCase());
                          setMostrandoSugestoes(true);
                        }}
                        onFocus={() => setMostrandoSugestoes(true)}
                        className="w-full rounded-xl border border-purple-200 bg-white pl-8 pr-4 py-2 text-xs uppercase text-slate-900 placeholder:text-purple-400 focus:border-purple-500 focus:outline-none dark:border-purple-800 dark:bg-slate-950 dark:text-slate-100"
                      />

                      {/* Dropdown de Sugestões */}
                      {mostrandoSugestoes && sugestoesHistorico.length > 0 && (
                        <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
                          {sugestoesHistorico.map((sug) => (
                            <div
                              key={sug.id || sug.nome}
                              onClick={() => aplicarPerfilHistorico(sug)}
                              className="flex items-center justify-between gap-2 rounded-lg p-2 text-xs hover:bg-purple-50 dark:hover:bg-purple-950/40 cursor-pointer transition-colors"
                            >
                              <div>
                                <p className="font-bold text-slate-900 dark:text-slate-100">
                                  {sug.nome || sug.empresa}
                                </p>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                  {sug.empresa && `Empresa: ${sug.empresa} · `}
                                  {sug.cnh && `CNH: ${sug.cnh} · `}
                                  {sug.cpf && `CPF: ${sug.cpf} · `}
                                  {sug.placa && `Placa: ${sug.placa}`}
                                </p>
                              </div>
                              <span className="rounded bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-700 dark:bg-purple-950 dark:text-purple-400">
                                Selecionar
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Dados Gerais da Visita / Empresa */}
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 sm:p-5 space-y-4 dark:border-slate-800 dark:bg-slate-950/40">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                      Dados Gerais da Visita / Acesso
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Empresa / Fornecedor / Setor *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="EX: PADARIA IDEAL, BAHIA SUL, TEN..."
                          value={formOcorrencia.empresa}
                          onChange={(e) => setFormOcorrencia({ ...formOcorrencia, empresa: e.target.value.toUpperCase() })}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs uppercase text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        />
                      </div>

                      {formOcorrencia.tipo_registro === 'ENTRADA_VEICULO' && (
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Placa do Veículo *
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="EX: ABC1D23"
                            value={formOcorrencia.placa_veiculo}
                            onChange={(e) => setFormOcorrencia({ ...formOcorrencia, placa_veiculo: e.target.value.toUpperCase() })}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs uppercase font-mono font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                          />
                        </div>
                      )}

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Autorizado por / Responsável
                        </label>
                        <input
                          type="text"
                          placeholder="EX: ADEMIR, AMBULATÓRIO..."
                          value={formOcorrencia.autorizado_por}
                          onChange={(e) => setFormOcorrencia({ ...formOcorrencia, autorizado_por: e.target.value.toUpperCase() })}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs uppercase text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Horário da Saída (Opcional)
                        </label>
                        <input
                          type="time"
                          value={formOcorrencia.hora_saida}
                          onChange={(e) => setFormOcorrencia({ ...formOcorrencia, hora_saida: e.target.value })}
                          placeholder="Vazio = No Pátio"
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        />
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {formOcorrencia.hora_saida ? 'Saída já registrada' : 'Deixe em branco para saída pendente'}
                        </p>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Motivo / Observações Adicionais
                      </label>
                      <input
                        type="text"
                        placeholder="EX: ENTREGA DE MATERIAIS, MANUTENÇÃO, REUNIÃO..."
                        value={formOcorrencia.motivo_observacao}
                        onChange={(e) => setFormOcorrencia({ ...formOcorrencia, motivo_observacao: e.target.value.toUpperCase() })}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs uppercase text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                    </div>

                    {/* Checkbox Fará Briefing de Segurança & Botão Checar Validade (30 dias) */}
                    {(formOcorrencia.tipo_registro === 'ENTRADA_VEICULO' || formOcorrencia.tipo_registro === 'ENTRADA_VISITANTE') && (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 dark:border-emerald-900/60 dark:bg-emerald-950/20 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2.5">
                          <div className="flex items-start gap-2.5 flex-1 min-w-[240px]">
                            <input
                              type="checkbox"
                              id="checkFaraBriefing"
                              checked={formOcorrencia.fara_briefing}
                              onChange={(e) => setFormOcorrencia({ ...formOcorrencia, fara_briefing: e.target.checked })}
                              className="mt-0.5 h-4 w-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                            />
                            <label htmlFor="checkFaraBriefing" className="cursor-pointer text-xs font-medium text-emerald-900 dark:text-emerald-200">
                              <span className="font-bold">Fará Briefing de Segurança? (Validade: 30 dias)</span>
                              <p className="text-[11px] text-emerald-700 dark:text-emerald-300 mt-0.5">
                                {formOcorrencia.fara_briefing
                                  ? 'Marcado: Uma sessão de briefing (FRM.SGP-0013) será aberta para colher assinaturas.'
                                  : 'Desmarcado: Visitantes com briefing válido nos últimos 30 dias não precisam refazer.'}
                              </p>
                            </label>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleChecarBriefing()}
                            disabled={checandoBriefing}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-3 py-1.5 text-xs font-bold text-emerald-800 shadow-2xs hover:bg-emerald-100 dark:border-emerald-700 dark:bg-slate-900 dark:text-emerald-300 dark:hover:bg-slate-800 transition-all active:scale-95 shrink-0 disabled:opacity-50"
                          >
                            {checandoBriefing ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                            )}
                            <span>Checar Validade de Todos</span>
                          </button>
                        </div>

                        {/* Painel de Resumo Inline da Checagem de Validade */}
                        {Object.keys(statusBriefingPorPessoa).length > 0 && (
                          <div className="rounded-xl border border-emerald-300/80 bg-white/90 p-3 text-xs space-y-2 dark:border-emerald-800 dark:bg-slate-900/90 shadow-2xs">
                            <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                              <span className="flex items-center gap-1.5">
                                <Shield className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                                Relatório de Validade do Briefing (30 dias)
                              </span>
                              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                {Object.values(statusBriefingPorPessoa).some((s) => s.status !== 'VALIDO') ? (
                                  <span className="text-amber-700 font-bold dark:text-amber-400">⚠️ Briefing Obrigatório</span>
                                ) : (
                                  <span className="text-emerald-700 font-bold dark:text-emerald-400">✅ Todos em Dia (Opcional)</span>
                                )}
                              </span>
                            </div>

                            <div className="space-y-1.5">
                              {pessoasForm.map((p, i) => {
                                const st = statusBriefingPorPessoa[i];
                                if (!st) return null;
                                return (
                                  <div
                                    key={i}
                                    className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800"
                                  >
                                    <div>
                                      <strong className="text-slate-900 dark:text-slate-100">{p.nome || `Pessoa #${i + 1}`}</strong>
                                      {p.cpf && <span className="font-mono text-slate-500 ml-1.5">({p.cpf})</span>}
                                      <span className="text-slate-500 dark:text-slate-400 ml-2">
                                        · {st.status === 'NUNCA_REALIZADO' ? (
                                          'Nunca realizou briefing'
                                        ) : (
                                          <>
                                            Realizado em: <strong className="text-slate-700 dark:text-slate-300">{st.dataRealizacao?.split('-').reverse().join('/')}</strong>
                                          </>
                                        )}
                                      </span>
                                    </div>

                                    <div className="shrink-0 font-bold ml-2">
                                      {st.status === 'VALIDO' ? (
                                        <span className="text-emerald-700 dark:text-emerald-400 bg-emerald-100/70 dark:bg-emerald-950 px-2 py-0.5 rounded">
                                          Válido · Restam {st.diasRestantes} dia(s)
                                        </span>
                                      ) : st.status === 'VENCIDO' ? (
                                        <span className="text-amber-800 dark:text-amber-300 bg-amber-100/70 dark:bg-amber-950 px-2 py-0.5 rounded">
                                          Vencido há {st.diasDecorridos} dia(s)
                                        </span>
                                      ) : (
                                        <span className="text-rose-700 dark:text-rose-400 bg-rose-100/70 dark:bg-rose-950 px-2 py-0.5 rounded">
                                          Pendente (1º Briefing)
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Lista de Pessoas / Visitantes que Chegaram Juntos */}
                  <div className="rounded-2xl border border-purple-200 bg-purple-50/30 p-4 sm:p-5 space-y-3 dark:border-purple-900/40 dark:bg-purple-950/20">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                        <h4 className="text-xs font-bold text-purple-900 dark:text-purple-300 uppercase tracking-wider">
                          Pessoas / Visitantes no Lançamento ({pessoasForm.length})
                        </h4>
                      </div>
                      <button
                        type="button"
                        onClick={handleAdicionarPessoa}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-purple-500 transition-all active:scale-95"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        <span>Adicionar Mais Pessoas</span>
                      </button>
                    </div>

                    <div className="space-y-3">
                      {pessoasForm.map((pessoa, idx) => (
                        <div
                          key={idx}
                          className="relative rounded-xl border border-purple-100 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="rounded-md bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                              Pessoa #{idx + 1} {idx === 0 ? '(Principal / Motorista)' : '(Acompanhante)'}
                            </span>
                            {pessoasForm.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoverPessoa(idx)}
                                className="text-slate-400 hover:text-rose-600 text-xs font-bold inline-flex items-center gap-1"
                                title="Remover esta pessoa"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span>Remover</span>
                              </button>
                            )}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="sm:col-span-1">
                              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                Nome Completo *
                              </label>
                              <input
                                type="text"
                                required
                                placeholder="NOME DO VISITANTE..."
                                value={pessoa.nome}
                                onChange={(e) => handleAlterarPessoa(idx, 'nome', e.target.value)}
                                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs uppercase text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                              />
                            </div>

                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                                  CPF / Documento
                                </label>
                                <button
                                  type="button"
                                  onClick={() => handleChecarBriefing(idx)}
                                  disabled={checandoBriefing || !pessoa.cpf.trim()}
                                  className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 inline-flex items-center gap-1 disabled:opacity-40"
                                  title="Checar se o briefing deste CPF está dentro da validade de 30 dias"
                                >
                                  <ShieldCheck className="h-3 w-3" />
                                  Checar
                                </button>
                              </div>
                              <input
                                type="text"
                                placeholder="EX: 173019462..."
                                value={pessoa.cpf}
                                onChange={(e) => {
                                  handleAlterarPessoa(idx, 'cpf', e.target.value);
                                  setStatusBriefingPorPessoa((prev) => {
                                    const next = { ...prev };
                                    delete next[idx];
                                    return next;
                                  });
                                }}
                                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                              />

                              {/* Feedback visual de validade do Briefing por pessoa com Data e Dias */}
                              {statusBriefingPorPessoa[idx] && (
                                <div className="mt-2">
                                  {statusBriefingPorPessoa[idx].status === 'VALIDO' ? (
                                    <div className="rounded-lg border border-emerald-200 bg-emerald-50/90 p-2 text-[11px] text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                                      <div className="flex items-center justify-between font-bold">
                                        <span className="flex items-center gap-1">
                                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                                          Briefing Válido
                                        </span>
                                        <span className="bg-emerald-200/70 dark:bg-emerald-900 px-1.5 py-0.5 rounded text-[10px]">
                                          Restam {statusBriefingPorPessoa[idx].diasRestantes} dia(s)
                                        </span>
                                      </div>
                                      <p className="mt-1 text-emerald-700 dark:text-emerald-400 text-[10px]">
                                        Realizado em: <strong>{statusBriefingPorPessoa[idx].dataRealizacao?.split('-').reverse().join('/')}</strong> (Validade: 30 dias)
                                      </p>
                                    </div>
                                  ) : statusBriefingPorPessoa[idx].status === 'VENCIDO' ? (
                                    <div className="rounded-lg border border-amber-200 bg-amber-50/90 p-2 text-[11px] text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                                      <div className="flex items-center justify-between font-bold">
                                        <span className="flex items-center gap-1">
                                          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                                          Briefing Vencido
                                        </span>
                                        <span className="bg-amber-200/70 dark:bg-amber-900 px-1.5 py-0.5 rounded text-[10px]">
                                          Vencido há {statusBriefingPorPessoa[idx].diasDecorridos} dia(s)
                                        </span>
                                      </div>
                                      <p className="mt-1 text-amber-700 dark:text-amber-400 text-[10px]">
                                        Realizado em: <strong>{statusBriefingPorPessoa[idx].dataRealizacao?.split('-').reverse().join('/')}</strong> — Limite de 30 dias ultrapassado.
                                      </p>
                                      <p className="mt-0.5 font-bold text-[10px] text-amber-800 dark:text-amber-200">
                                        Obrigatório realizar novo treinamento.
                                      </p>
                                    </div>
                                  ) : (
                                    <div className="rounded-lg border border-rose-200 bg-rose-50/90 p-2 text-[11px] text-rose-900 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300">
                                      <div className="flex items-center justify-between font-bold">
                                        <span className="flex items-center gap-1">
                                          <X className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
                                          Nunca Fez Briefing
                                        </span>
                                        <span className="bg-rose-200/70 dark:bg-rose-900 px-1.5 py-0.5 rounded text-[10px]">
                                          Pendente
                                        </span>
                                      </div>
                                      <p className="mt-1 text-rose-700 dark:text-rose-400 text-[10px]">
                                        Nenhum registro anterior na base.
                                      </p>
                                      <p className="mt-0.5 font-bold text-[10px] text-rose-800 dark:text-rose-200">
                                        Obrigatório realizar treinamento institucional.
                                      </p>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {formOcorrencia.tipo_registro === 'ENTRADA_VEICULO' ? (
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                  CNH (se condutor)
                                </label>
                                <input
                                  type="text"
                                  placeholder="EX: 0796390711..."
                                  value={pessoa.cnh}
                                  onChange={(e) => handleAlterarPessoa(idx, 'cnh', e.target.value)}
                                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                />
                              </div>
                            ) : (
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                  Função / Cargo
                                </label>
                                <input
                                  type="text"
                                  placeholder="EX: TÉCNICO, AUDITOR..."
                                  value={pessoa.funcao}
                                  onChange={(e) => handleAlterarPessoa(idx, 'funcao', e.target.value)}
                                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs uppercase text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 4. Prévia do Registro */}
              <div className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Pré-visualização da linha no livro de ocorrências:
                </p>
                <p className="text-xs font-mono font-semibold text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-950 p-2 rounded-lg border border-slate-100 dark:border-slate-800 break-words">
                  {textoPrevia || 'Preencha os campos para gerar a linha do livro...'}
                </p>
              </div>
            </ModalBody>

            <ModalFooter>
              <button
                type="button"
                onClick={() => setModalNovaOcorrencia(false)}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvando}
                className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-6 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-purple-500 disabled:opacity-50"
              >
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {ocorrenciaEmEdicao ? 'Salvar Alterações' : 'Confirmar Lançamento'}
              </button>
            </ModalFooter>
          </form>
        </Modal>
      )}

      {/* Modal: Registrar Saída Rápida */}
      {modalRegistrarSaida && ocorrenciaParaSaida && (
        <Modal onClose={() => setModalRegistrarSaida(false)} maxWidth="max-w-lg">
          <ModalHeader onClose={() => setModalRegistrarSaida(false)}>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                <LogOut className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">
                  Registrar Saída do Pátio
                </h3>
                <p className="text-xs text-slate-500">
                  {ocorrenciaParaSaida.nome_pessoa || ocorrenciaParaSaida.empresa || 'Registro de Entrada'}
                </p>
              </div>
            </div>
          </ModalHeader>

          <form onSubmit={handleSalvarSaidaRapida}>
            <ModalBody className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-950">
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  <strong>Entrada às {ocorrenciaParaSaida.horario}:</strong> {ocorrenciaParaSaida.descricao}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Horário da Saída *
                  </label>
                  <input
                    type="time"
                    required
                    value={formSaidaRapida.hora_saida}
                    onChange={(e) => setFormSaidaRapida({ ...formSaidaRapida, hora_saida: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <VigilanteSelect
                    label="Vigilante de Saída *"
                    placeholder="Selecione o vigilante..."
                    required
                    value={formSaidaRapida.vigilante_saida}
                    onChange={(val) => setFormSaidaRapida({ ...formSaidaRapida, vigilante_saida: val })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Observações da Saída (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="EX: SAÍDA NORMAL, INSPEÇÃO REALIZADA SEM ALTERAÇÕES..."
                  value={formSaidaRapida.motivo_observacao}
                  onChange={(e) => setFormSaidaRapida({ ...formSaidaRapida, motivo_observacao: e.target.value.toUpperCase() })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs uppercase text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
            </ModalBody>

            <ModalFooter>
              <button
                type="button"
                onClick={() => setModalRegistrarSaida(false)}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvando}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50"
              >
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Confirmar Saída
              </button>
            </ModalFooter>
          </form>
        </Modal>
      )}

      {/* Modal Foto Zoom */}
      {modalFotoZoom && (
        <Modal onClose={() => setModalFotoZoom(null)} maxWidth="max-w-2xl" zIndexClassName="z-[115]">
          <ModalHeader onClose={() => setModalFotoZoom(null)}>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Registro Fotográfico da Ocorrência
            </h3>
          </ModalHeader>
          <ModalBody className="p-2 sm:p-4 flex items-center justify-center bg-black/5 dark:bg-black/40">
            <img
              src={modalFotoZoom}
              alt="Foto ampliada"
              className="max-h-[75vh] w-auto rounded-xl object-contain shadow-lg"
            />
          </ModalBody>
          <ModalFooter>
            <button
              type="button"
              onClick={() => setModalFotoZoom(null)}
              className="rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold text-white hover:bg-purple-500"
            >
              Fechar
            </button>
          </ModalFooter>
        </Modal>
      )}

      {/* Modal: Abrir Novo Plantão */}
      {modalNovoRelatorio && (
        <Modal onClose={() => setModalNovoRelatorio(false)} maxWidth="max-w-xl">
          <ModalHeader onClose={() => setModalNovoRelatorio(false)}>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">
              Abrir Novo Plantão — Livro de Ocorrências
            </h3>
          </ModalHeader>

          <form onSubmit={handleCriarRelatorio}>
            <ModalBody className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Data do Plantão *
                  </label>
                  <input
                    type="date"
                    required
                    value={formRelatorio.data}
                    onChange={(e) => setFormRelatorio({ ...formRelatorio, data: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Turno *
                  </label>
                  <select
                    value={formRelatorio.turno}
                    onChange={(e) => setFormRelatorio({ ...formRelatorio, turno: e.target.value as PortTurno })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 uppercase"
                  >
                    <option value="MANHA">Manhã</option>
                    <option value="TARDE">Tarde</option>
                    <option value="NOITE">Noite</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Horário Início
                  </label>
                  <input
                    type="time"
                    value={formRelatorio.horario_inicio}
                    onChange={(e) => setFormRelatorio({ ...formRelatorio, horario_inicio: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Horário Fim
                  </label>
                  <input
                    type="time"
                    value={formRelatorio.horario_fim}
                    onChange={(e) => setFormRelatorio({ ...formRelatorio, horario_fim: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <VigilanteSelect
                  label="Vigilante Responsável (Portaria)"
                  placeholder="Selecione o vigilante..."
                  required
                  value={formRelatorio.vigilante_principal}
                  onChange={(val) => setFormRelatorio({ ...formRelatorio, vigilante_principal: val })}
                  excludeNames={[formRelatorio.vigilante_ronda01, formRelatorio.vigilante_ronda02]}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <VigilanteSelect
                  label="Vigilante Ronda 01 (Opcional)"
                  placeholder="Selecione o vigilante..."
                  value={formRelatorio.vigilante_ronda01}
                  onChange={(val) => setFormRelatorio({ ...formRelatorio, vigilante_ronda01: val })}
                  excludeNames={[formRelatorio.vigilante_principal, formRelatorio.vigilante_ronda02]}
                />
                <VigilanteSelect
                  label="Vigilante Ronda 02 (Opcional)"
                  placeholder="Selecione o vigilante..."
                  value={formRelatorio.vigilante_ronda02}
                  onChange={(val) => setFormRelatorio({ ...formRelatorio, vigilante_ronda02: val })}
                  excludeNames={[formRelatorio.vigilante_principal, formRelatorio.vigilante_ronda01]}
                />
              </div>
            </ModalBody>

            <ModalFooter>
              <button
                type="button"
                onClick={() => setModalNovoRelatorio(false)}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvando}
                className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-purple-500 disabled:opacity-50"
              >
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Abrir Plantão
              </button>
            </ModalFooter>
          </form>
        </Modal>
      )}

      {/* ConfirmDialog: Excluir Plantão */}
      {itemParaExcluir && (
        <ConfirmDialog
          titulo="Excluir Relatório de Ocorrências"
          mensagem={`Tem certeza que deseja excluir o plantão ${itemParaExcluir.numero_protocolo} de ${itemParaExcluir.data}? Todas as ocorrências registradas serão removidas.`}
          confirmarLabel="Sim, Excluir Plantão"
          cancelarLabel="Cancelar"
          variante="perigo"
          onConfirmar={handleExcluirPlantao}
          onCancelar={() => setItemParaExcluir(null)}
        />
      )}

      {/* ConfirmDialog: Excluir Ocorrência Individual */}
      {ocorrenciaParaExcluir && (
        <ConfirmDialog
          titulo="Remover Lançamento de Ocorrência"
          mensagem={`Deseja realmente remover o lançamento das ${ocorrenciaParaExcluir.horario} ("${ocorrenciaParaExcluir.descricao}")?`}
          confirmarLabel="Remover Registro"
          cancelarLabel="Cancelar"
          variante="perigo"
          onConfirmar={handleExcluirOcorrencia}
          onCancelar={() => setOcorrenciaParaExcluir(null)}
        />
      )}
    </div>
  );
}
