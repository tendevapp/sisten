/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Página de Cadastros Gerais no Painel Administrativo.
 * Centraliza a gestão de tabelas mestres, listas suspensas (Vigilantes, Setores, Grupos)
 * e gestão de envios de e-mails/Outlook (destinatários, cópias, assuntos padrão).
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Database, Shield, Users, Boxes, Plus, Search, Edit2, Trash2,
  CheckCircle2, XCircle, RefreshCw, AlertTriangle, ArrowRight,
  Filter, Check, UserCheck, ShieldCheck, Building2, Clock, Layers,
  Mail, Send, AtSign, ExternalLink, HelpCircle, Tag, Copy, Globe
} from 'lucide-react';
import type { Profile, PortVigilante, ConfigEnvioEmail, EmailModulo } from '../types';
import * as api from '../lib/portariaApi';
import * as emailApi from '../lib/emailConfigApi';
import { useToast } from '../components/ui/Toast';
import Modal, { ModalBody, ModalFooter } from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

type TabType = 'portaria_vigilantes' | 'emails_envios';

const SUGESTOES_GATILHOS = [
  { chave: 'cadastro_sap', nome: 'Solicitação de Cadastro SAP', modulo: 'SUPRIMENTOS' as EmailModulo, assunto: 'Cadastro SAP' },
  { chave: 'expedicao_chegada', nome: 'Aviso de Chegada de Veículo na Portaria', modulo: 'LOGISTICA' as EmailModulo, assunto: 'Chegada na portaria' },
  { chave: 'expedicao_tramos', nome: 'Relatório de Carregamento de Tramos', modulo: 'LOGISTICA' as EmailModulo, assunto: 'Carregamento Tramos' },
  { chave: 'portaria_relatorio', nome: 'Relatório de Turno e Ocorrências', modulo: 'PORTARIA' as EmailModulo, assunto: 'Relatório de Turno - Portaria TEN' },
  { chave: 'helpdesk_juridico', nome: 'Avisos de Chamados do Jurídico', modulo: 'HELPDESK' as EmailModulo, assunto: 'Chamado Jurídico - SISTEN' },
  { chave: 'rh_ase_hora_extra', nome: 'ASE - Hora Extra (FRM.RHU-0007)', modulo: 'RH' as EmailModulo, assunto: 'ASE - Autorização de Horas Extras' },
];

export default function CadastrosAdmin({ user, onNavigate }: Props) {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<TabType>('portaria_vigilantes');

  // ==========================================
  // ESTADO - VIGILANTES
  // ==========================================
  const [vigilantes, setVigilantes] = useState<PortVigilante[]>([]);
  const [loadingVigilantes, setLoadingVigilantes] = useState(false);
  const [searchVigilante, setSearchVigilante] = useState('');
  const [filtroStatusVigilante, setFiltroStatusVigilante] = useState<'TODOS' | 'ATIVOS' | 'INATIVOS'>('TODOS');
  
  // Modal Novo / Edição de Vigilante
  const [modalVigilanteOpen, setModalVigilanteOpen] = useState(false);
  const [vigilanteEditando, setVigilanteEditando] = useState<PortVigilante | null>(null);
  const [salvandoVigilante, setSalvandoVigilante] = useState(false);
  
  // Formulário do Vigilante
  const [formNome, setFormNome] = useState('');
  const [formMatricula, setFormMatricula] = useState('');
  const [formEmpresa, setFormEmpresa] = useState('PATRIMONIAL TEN');
  const [formFuncao, setFormFuncao] = useState('Vigilante Portaria');
  const [formTurno, setFormTurno] = useState('REVEZAMENTO');
  const [formAtivo, setFormAtivo] = useState(true);
  const [formObs, setFormObs] = useState('');

  // Confirmação de Exclusão de Vigilante
  const [vigilanteParaExcluir, setVigilanteParaExcluir] = useState<PortVigilante | null>(null);

  // ==========================================
  // ESTADO - GESTÃO DE E-MAILS & OUTLOOK
  // ==========================================
  const [configsEmail, setConfigsEmail] = useState<ConfigEnvioEmail[]>([]);
  const [loadingEmails, setLoadingEmails] = useState(false);
  const [searchEmail, setSearchEmail] = useState('');
  const [filtroStatusEmail, setFiltroStatusEmail] = useState<'TODOS' | 'ATIVOS' | 'INATIVOS'>('TODOS');
  const [filtroModuloEmail, setFiltroModuloEmail] = useState<'TODOS' | EmailModulo>('TODOS');

  // Modal Novo / Edição de E-mail
  const [modalEmailOpen, setModalEmailOpen] = useState(false);
  const [configEmailEditando, setConfigEmailEditando] = useState<ConfigEnvioEmail | null>(null);
  const [salvandoEmail, setSalvandoEmail] = useState(false);

  // Formulário de E-mail
  const [formEmailChave, setFormEmailChave] = useState('');
  const [formEmailNome, setFormEmailNome] = useState('');
  const [formEmailModulo, setFormEmailModulo] = useState<EmailModulo>('SUPRIMENTOS');
  const [formEmailDescricao, setFormEmailDescricao] = useState('');
  const [formEmailDestinatarios, setFormEmailDestinatarios] = useState('');
  const [formEmailCopia, setFormEmailCopia] = useState('');
  const [formEmailCopiaOculta, setFormEmailCopiaOculta] = useState('');
  const [formEmailAssunto, setFormEmailAssunto] = useState('');
  const [formEmailAtivo, setFormEmailAtivo] = useState(true);

  // Confirmação de Exclusão de E-mail
  const [configEmailParaExcluir, setConfigEmailParaExcluir] = useState<ConfigEnvioEmail | null>(null);

  // Carregamento de Vigilantes
  const carregarVigilantes = async () => {
    setLoadingVigilantes(true);
    try {
      const lista = await api.listarVigilantes(false);
      setVigilantes(lista);
    } catch (err: any) {
      toast.error('Erro ao carregar lista de vigilantes: ' + (err.message || ''));
    } finally {
      setLoadingVigilantes(false);
    }
  };

  // Carregamento de Configurações de E-mail
  const carregarConfigsEmail = async () => {
    setLoadingEmails(true);
    try {
      const lista = await emailApi.listarConfigsEmail(false);
      setConfigsEmail(lista);
    } catch (err: any) {
      toast.error('Erro ao carregar configurações de e-mail: ' + (err.message || ''));
    } finally {
      setLoadingEmails(false);
    }
  };

  useEffect(() => {
    carregarVigilantes();
    carregarConfigsEmail();
  }, []);

  // -------------------------------------------------------------
  // HANDLERS - VIGILANTES
  // -------------------------------------------------------------
  const abrirModalNovoVigilante = () => {
    setVigilanteEditando(null);
    setFormNome('');
    setFormMatricula('');
    setFormEmpresa('PATRIMONIAL TEN');
    setFormFuncao('Vigilante Portaria');
    setFormTurno('REVEZAMENTO');
    setFormAtivo(true);
    setFormObs('');
    setModalVigilanteOpen(true);
  };

  const abrirModalEditarVigilante = (v: PortVigilante) => {
    setVigilanteEditando(v);
    setFormNome(v.nome);
    setFormMatricula(v.matricula || '');
    setFormEmpresa(v.empresa);
    setFormFuncao(v.funcao);
    setFormTurno(v.turno_preferencial || 'REVEZAMENTO');
    setFormAtivo(v.ativo);
    setFormObs(v.observacoes || '');
    setModalVigilanteOpen(true);
  };

  const handleSalvarVigilante = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNome.trim()) {
      toast.error('O nome do vigilante é obrigatório.');
      return;
    }

    setSalvandoVigilante(true);
    try {
      if (vigilanteEditando) {
        await api.atualizarVigilante(vigilanteEditando.id, {
          nome: formNome.trim(),
          matricula: formMatricula.trim() || null,
          empresa: formEmpresa.trim(),
          funcao: formFuncao.trim(),
          turno_preferencial: formTurno,
          ativo: formAtivo,
          observacoes: formObs.trim() || null,
        });
        toast.success(`Vigilante "${formNome}" atualizado com sucesso!`);
      } else {
        await api.criarVigilante({
          nome: formNome.trim(),
          matricula: formMatricula.trim() || null,
          empresa: formEmpresa.trim(),
          funcao: formFuncao.trim(),
          turno_preferencial: formTurno,
          ativo: formAtivo,
          observacoes: formObs.trim() || null,
          criado_por: user.id,
        });
        toast.success(`Vigilante "${formNome}" cadastrado com sucesso!`);
      }
      setModalVigilanteOpen(false);
      await carregarVigilantes();
    } catch (err: any) {
      toast.error('Erro ao salvar vigilante: ' + (err.message || ''));
    } finally {
      setSalvandoVigilante(false);
    }
  };

  const handleToggleAtivoVigilante = async (v: PortVigilante) => {
    const novoStatus = !v.ativo;
    try {
      await api.alternarStatusVigilante(v.id, novoStatus);
      setVigilantes((prev) =>
        prev.map((item) => (item.id === v.id ? { ...item, ativo: novoStatus } : item))
      );
      toast.success(
        `Vigilante ${v.nome} ${novoStatus ? 'ativado' : 'inativado'} com sucesso!`
      );
    } catch (err: any) {
      toast.error('Erro ao alterar status: ' + (err.message || ''));
    }
  };

  const handleExcluirVigilante = async () => {
    if (!vigilanteParaExcluir) return;
    try {
      await api.excluirVigilante(vigilanteParaExcluir.id);
      setVigilantes((prev) => prev.filter((item) => item.id !== vigilanteParaExcluir.id));
      toast.success(`Vigilante ${vigilanteParaExcluir.nome} excluído com sucesso!`);
      setVigilanteParaExcluir(null);
    } catch (err: any) {
      toast.error('Erro ao excluir vigilante: ' + (err.message || ''));
    }
  };

  // -------------------------------------------------------------
  // HANDLERS - CONFIGURAÇÕES DE E-MAIL
  // -------------------------------------------------------------
  const abrirModalNovoEmail = () => {
    setConfigEmailEditando(null);
    setFormEmailChave('');
    setFormEmailNome('');
    setFormEmailModulo('SUPRIMENTOS');
    setFormEmailDescricao('');
    setFormEmailDestinatarios('');
    setFormEmailCopia('');
    setFormEmailCopiaOculta('');
    setFormEmailAssunto('');
    setFormEmailAtivo(true);
    setModalEmailOpen(true);
  };

  const abrirModalEditarEmail = (c: ConfigEnvioEmail) => {
    setConfigEmailEditando(c);
    setFormEmailChave(c.chave);
    setFormEmailNome(c.nome);
    setFormEmailModulo(c.modulo);
    setFormEmailDescricao(c.descricao || '');
    setFormEmailDestinatarios(c.destinatarios);
    setFormEmailCopia(c.copia || '');
    setFormEmailCopiaOculta(c.copia_oculta || '');
    setFormEmailAssunto(c.assunto_padrao || '');
    setFormEmailAtivo(c.ativo);
    setModalEmailOpen(true);
  };

  const aplicarSugestaoGatilho = (s: typeof SUGESTOES_GATILHOS[0]) => {
    setFormEmailChave(s.chave);
    if (!formEmailNome) setFormEmailNome(s.nome);
    setFormEmailModulo(s.modulo);
    if (!formEmailAssunto) setFormEmailAssunto(s.assunto);
  };

  const handleSalvarEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formEmailChave.trim()) {
      toast.error('A chave identificadora do gatilho é obrigatória.');
      return;
    }
    if (!formEmailNome.trim()) {
      toast.error('O nome do gatilho é obrigatório.');
      return;
    }
    const emailsValidos = emailApi.normalizarListaEmails(formEmailDestinatarios);
    if (emailsValidos.length === 0) {
      toast.error('Informe ao menos um e-mail de destinatário válido (@).');
      return;
    }

    setSalvandoEmail(true);
    try {
      if (configEmailEditando) {
        await emailApi.atualizarConfigEmail(configEmailEditando.id, {
          chave: formEmailChave.trim(),
          nome: formEmailNome.trim(),
          modulo: formEmailModulo,
          descricao: formEmailDescricao.trim() || null,
          destinatarios: formEmailDestinatarios.trim(),
          copia: formEmailCopia.trim() || null,
          copia_oculta: formEmailCopiaOculta.trim() || null,
          assunto_padrao: formEmailAssunto.trim() || null,
          ativo: formEmailAtivo,
        });
        toast.success(`Configuração "${formEmailNome}" atualizada com sucesso!`);
      } else {
        await emailApi.criarConfigEmail({
          chave: formEmailChave.trim(),
          nome: formEmailNome.trim(),
          modulo: formEmailModulo,
          descricao: formEmailDescricao.trim() || null,
          destinatarios: formEmailDestinatarios.trim(),
          copia: formEmailCopia.trim() || null,
          copia_oculta: formEmailCopiaOculta.trim() || null,
          assunto_padrao: formEmailAssunto.trim() || null,
          ativo: formEmailAtivo,
          criado_por: user.id,
        });
        toast.success(`Configuração "${formEmailNome}" cadastrada com sucesso!`);
      }
      setModalEmailOpen(false);
      await carregarConfigsEmail();
    } catch (err: any) {
      toast.error('Erro ao salvar configuração de e-mail: ' + (err.message || ''));
    } finally {
      setSalvandoEmail(false);
    }
  };

  const handleToggleAtivoEmail = async (c: ConfigEnvioEmail) => {
    const novoStatus = !c.ativo;
    try {
      await emailApi.alternarStatusConfigEmail(c.id, novoStatus);
      setConfigsEmail((prev) =>
        prev.map((item) => (item.id === c.id ? { ...item, ativo: novoStatus } : item))
      );
      toast.success(
        `Gatilho "${c.nome}" ${novoStatus ? 'ativado' : 'inativado'} com sucesso!`
      );
    } catch (err: any) {
      toast.error('Erro ao alterar status: ' + (err.message || ''));
    }
  };

  const handleExcluirEmail = async () => {
    if (!configEmailParaExcluir) return;
    try {
      await emailApi.excluirConfigEmail(configEmailParaExcluir.id);
      setConfigsEmail((prev) => prev.filter((item) => item.id !== configEmailParaExcluir.id));
      toast.success(`Configuração "${configEmailParaExcluir.nome}" excluída com sucesso!`);
      setConfigEmailParaExcluir(null);
    } catch (err: any) {
      toast.error('Erro ao excluir configuração: ' + (err.message || ''));
    }
  };

  const handleTestarOutlook = (c: {
    destinatarios: string;
    copia?: string | null;
    copiaOculta?: string | null;
    assunto?: string | null;
  }) => {
    const mailto = emailApi.montarMailtoComConfig({
      destinatarios: c.destinatarios,
      copia: c.copia,
      copiaOculta: c.copiaOculta,
      assunto: c.assunto ? `[TESTE] ${c.assunto}` : '[TESTE SISTEN] Verificação de Envio de E-mail',
      corpo: `Olá!\n\nEste é um e-mail de teste gerado pelo painel de Cadastros Gerais do SISTEN.\n\nData do teste: ${new Date().toLocaleString('pt-BR')}\nUsuário: ${user.name} (${user.email})\n\nSe você recebeu esta janela no Outlook com os destinatários corretos, a configuração está funcionando perfeitamente!`,
    });

    window.location.href = mailto;
    toast.info('Abrindo cliente de e-mail (Outlook) para validação do teste...');
  };

  // -------------------------------------------------------------
  // FILTRAGEM
  // -------------------------------------------------------------
  const vigilantesFiltrados = useMemo(() => {
    return vigilantes.filter((v) => {
      const matchBusca =
        !searchVigilante ||
        v.nome.toLowerCase().includes(searchVigilante.toLowerCase()) ||
        (v.matricula && v.matricula.toLowerCase().includes(searchVigilante.toLowerCase())) ||
        v.empresa.toLowerCase().includes(searchVigilante.toLowerCase()) ||
        v.funcao.toLowerCase().includes(searchVigilante.toLowerCase());

      const matchStatus =
        filtroStatusVigilante === 'TODOS' ||
        (filtroStatusVigilante === 'ATIVOS' && v.ativo) ||
        (filtroStatusVigilante === 'INATIVOS' && !v.ativo);

      return matchBusca && matchStatus;
    });
  }, [vigilantes, searchVigilante, filtroStatusVigilante]);

  const configsEmailFiltradas = useMemo(() => {
    return configsEmail.filter((c) => {
      const matchBusca =
        !searchEmail ||
        c.nome.toLowerCase().includes(searchEmail.toLowerCase()) ||
        c.chave.toLowerCase().includes(searchEmail.toLowerCase()) ||
        c.destinatarios.toLowerCase().includes(searchEmail.toLowerCase()) ||
        (c.copia && c.copia.toLowerCase().includes(searchEmail.toLowerCase())) ||
        (c.descricao && c.descricao.toLowerCase().includes(searchEmail.toLowerCase())) ||
        (c.assunto_padrao && c.assunto_padrao.toLowerCase().includes(searchEmail.toLowerCase()));

      const matchModulo =
        filtroModuloEmail === 'TODOS' || c.modulo === filtroModuloEmail;

      const matchStatus =
        filtroStatusEmail === 'TODOS' ||
        (filtroStatusEmail === 'ATIVOS' && c.ativo) ||
        (filtroStatusEmail === 'INATIVOS' && !c.ativo);

      return matchBusca && matchModulo && matchStatus;
    });
  }, [configsEmail, searchEmail, filtroModuloEmail, filtroStatusEmail]);

  const totalVigilantesAtivos = useMemo(() => vigilantes.filter((v) => v.ativo).length, [vigilantes]);
  const totalVigilantesInativos = useMemo(() => vigilantes.filter((v) => !v.ativo).length, [vigilantes]);

  const totalEmailsAtivos = useMemo(() => configsEmail.filter((c) => c.ativo).length, [configsEmail]);
  const modulosUnicos = useMemo(() => new Set(configsEmail.map(c => c.modulo)).size, [configsEmail]);

  // Helpers de cor para os badges de módulo
  const getModuloBadgeClass = (modulo: EmailModulo) => {
    switch (modulo) {
      case 'SUPRIMENTOS':
        return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-900';
      case 'LOGISTICA':
        return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-900';
      case 'PORTARIA':
        return 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-900';
      case 'RH':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-900';
      case 'HELPDESK':
        return 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-900';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-sm shadow-indigo-500/20">
            <Database className="h-6 w-6" />
          </span>
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-50">
              Cadastros Gerais & Tabelas Mestres
            </h1>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Gerenciamento de listas suspensas, regras de envio de e-mails/Outlook e parâmetros mestres
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('/admin/usuarios')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Users className="h-4 w-4" />
            Perfis & Usuários
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setActiveTab('portaria_vigilantes')}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${
            activeTab === 'portaria_vigilantes'
              ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
          }`}
        >
          <Shield className="h-4 w-4" />
          Vigilantes (Portaria)
          <span className={`ml-1 rounded-full px-1.5 py-0.2 text-[10px] ${
            activeTab === 'portaria_vigilantes' ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
          }`}>
            {vigilantes.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('emails_envios')}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${
            activeTab === 'emails_envios'
              ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
          }`}
        >
          <Mail className="h-4 w-4" />
          Destinatários de E-mail (Outlook)
          <span className={`ml-1 rounded-full px-1.5 py-0.2 text-[10px] ${
            activeTab === 'emails_envios' ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
          }`}>
            {configsEmail.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('/admin/setores')}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          <Building2 className="h-4 w-4" />
          Setores da Fábrica
          <ArrowRight className="h-3 w-3 opacity-60" />
        </button>

        <button
          type="button"
          onClick={() => onNavigate('/suprimentos/grupos-comprador')}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          <Boxes className="h-4 w-4" />
          Grupos Comprador (SAP)
          <ArrowRight className="h-3 w-3 opacity-60" />
        </button>
      </div>

      {/* ========================================================= */}
      {/* ABA: VIGILANTES DA PORTARIA                               */}
      {/* ========================================================= */}
      {activeTab === 'portaria_vigilantes' && (
        <div className="space-y-4">
          {/* Stats Bar */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total de Vigilantes</span>
                <Shield className="h-4 w-4 text-blue-500" />
              </div>
              <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-50">{vigilantes.length}</p>
              <p className="text-[11px] text-slate-400">Registrados na base</p>
            </div>

            <div className="rounded-2xl border border-emerald-200/60 bg-emerald-50/50 p-4 dark:border-emerald-950/60 dark:bg-emerald-950/20">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Vigilantes Ativos</span>
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="mt-2 text-2xl font-bold text-emerald-900 dark:text-emerald-300">{totalVigilantesAtivos}</p>
              <p className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80">Aparecem nos formulários da Portaria</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Inativos / Afastados</span>
                <XCircle className="h-4 w-4 text-slate-400" />
              </div>
              <p className="mt-2 text-2xl font-bold text-slate-700 dark:text-slate-300">{totalVigilantesInativos}</p>
              <p className="text-[11px] text-slate-400">Ocultos das listas suspensas</p>
            </div>
          </div>

          {/* Controls & Search */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <div className="relative min-w-[240px] flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar vigilante por nome, matrícula, empresa..."
                  value={searchVigilante}
                  onChange={(e) => setSearchVigilante(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-xs text-slate-900 transition-colors focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <select
                value={filtroStatusVigilante}
                onChange={(e) => setFiltroStatusVigilante(e.target.value as any)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                <option value="TODOS">Todos os Status</option>
                <option value="ATIVOS">Apenas Ativos</option>
                <option value="INATIVOS">Apenas Inativos</option>
              </select>

              <button
                type="button"
                onClick={carregarVigilantes}
                disabled={loadingVigilantes}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                title="Recarregar"
              >
                <RefreshCw className={`h-4 w-4 ${loadingVigilantes ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <button
              type="button"
              onClick={abrirModalNovoVigilante}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm shadow-blue-500/20 transition-colors hover:bg-blue-700 focus:outline-none"
            >
              <Plus className="h-4 w-4" />
              Novo Vigilante
            </button>
          </div>

          {/* Table */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50/80 font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3.5">Nome do Vigilante</th>
                    <th className="px-4 py-3.5">Matrícula</th>
                    <th className="px-4 py-3.5">Empresa</th>
                    <th className="px-4 py-3.5">Função</th>
                    <th className="px-4 py-3.5">Turno Preferencial</th>
                    <th className="px-4 py-3.5 text-center">Status</th>
                    <th className="px-4 py-3.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {vigilantesFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                        {loadingVigilantes ? (
                          <div className="flex items-center justify-center gap-2">
                            <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
                            <span>Carregando vigilantes...</span>
                          </div>
                        ) : (
                          <div>
                            <Shield className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
                            <p className="mt-2 font-medium">Nenhum vigilante encontrado.</p>
                            <button
                              type="button"
                              onClick={abrirModalNovoVigilante}
                              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Cadastrar primeiro vigilante
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ) : (
                    vigilantesFiltrados.map((v) => (
                      <tr
                        key={v.id}
                        className="transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
                      >
                        <td className="px-4 py-3.5 font-bold text-slate-900 dark:text-slate-100">
                          <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 font-bold text-blue-700 dark:bg-blue-950/60 dark:text-blue-400">
                              {v.nome.charAt(0).toUpperCase()}
                            </span>
                            <div>
                              <span>{v.nome}</span>
                              {v.observacoes && (
                                <p className="text-[10px] font-normal text-slate-400">{v.observacoes}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 font-mono text-slate-600 dark:text-slate-300">
                          {v.matricula || '—'}
                        </td>
                        <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300">
                          {v.empresa}
                        </td>
                        <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300">
                          <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {v.funcao}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300">
                          {v.turno_preferencial || 'REVEZAMENTO'}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleAtivoVigilante(v)}
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${
                              v.ativo
                                ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300'
                                : 'bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-400'
                            }`}
                            title="Clique para alternar Ativo / Inativo"
                          >
                            {v.ativo ? (
                              <>
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Ativo
                              </>
                            ) : (
                              <>
                                <XCircle className="h-3.5 w-3.5" />
                                Inativo
                              </>
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => abrirModalEditarVigilante(v)}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-800 dark:hover:text-blue-400"
                              title="Editar"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setVigilanteParaExcluir(v)}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30 dark:hover:text-rose-400"
                              title="Excluir"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* ABA: GESTÃO DE E-MAILS & ENVIOS OUTLOOK                   */}
      {/* ========================================================= */}
      {activeTab === 'emails_envios' && (
        <div className="space-y-4">
          {/* Stats Bar */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total de Gatilhos de E-mail</span>
                <Mail className="h-4 w-4 text-blue-500" />
              </div>
              <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-50">{configsEmail.length}</p>
              <p className="text-[11px] text-slate-400">Fluxos com abertura de Outlook</p>
            </div>

            <div className="rounded-2xl border border-emerald-200/60 bg-emerald-50/50 p-4 dark:border-emerald-950/60 dark:bg-emerald-950/20">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Gatilhos Ativos</span>
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="mt-2 text-2xl font-bold text-emerald-900 dark:text-emerald-300">{totalEmailsAtivos}</p>
              <p className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80">Destinatários em operação no SISTEN</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Módulos Cobertos</span>
                <Boxes className="h-4 w-4 text-indigo-500" />
              </div>
              <p className="mt-2 text-2xl font-bold text-slate-700 dark:text-slate-300">{modulosUnicos}</p>
              <p className="text-[11px] text-slate-400">Suprimentos, Logística, Portaria, etc.</p>
            </div>
          </div>

          {/* Controls & Search */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <div className="relative min-w-[240px] flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar por nome, chave, destinatário ou assunto..."
                  value={searchEmail}
                  onChange={(e) => setSearchEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-xs text-slate-900 transition-colors focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <select
                value={filtroModuloEmail}
                onChange={(e) => setFiltroModuloEmail(e.target.value as any)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                <option value="TODOS">Todos os Módulos</option>
                <option value="SUPRIMENTOS">Suprimentos</option>
                <option value="LOGISTICA">Logística</option>
                <option value="PORTARIA">Portaria</option>
                <option value="RH">RH</option>
                <option value="HELPDESK">Helpdesk / Jurídico</option>
                <option value="GERAL">Geral</option>
              </select>

              <select
                value={filtroStatusEmail}
                onChange={(e) => setFiltroStatusEmail(e.target.value as any)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                <option value="TODOS">Todos os Status</option>
                <option value="ATIVOS">Apenas Ativos</option>
                <option value="INATIVOS">Apenas Inativos</option>
              </select>

              <button
                type="button"
                onClick={carregarConfigsEmail}
                disabled={loadingEmails}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                title="Recarregar"
              >
                <RefreshCw className={`h-4 w-4 ${loadingEmails ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <button
              type="button"
              onClick={abrirModalNovoEmail}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm shadow-blue-500/20 transition-colors hover:bg-blue-700 focus:outline-none"
            >
              <Plus className="h-4 w-4" />
              Novo Gatilho de E-mail
            </button>
          </div>

          {/* Table */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50/80 font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3.5">Gatilho / Finalidade</th>
                    <th className="px-4 py-3.5">Módulo</th>
                    <th className="px-4 py-3.5">Destinatários (Para)</th>
                    <th className="px-4 py-3.5">Cópias (CC / BCC)</th>
                    <th className="px-4 py-3.5">Assunto Padrão</th>
                    <th className="px-4 py-3.5 text-center">Status</th>
                    <th className="px-4 py-3.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {configsEmailFiltradas.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                        {loadingEmails ? (
                          <div className="flex items-center justify-center gap-2">
                            <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
                            <span>Carregando configurações de e-mail...</span>
                          </div>
                        ) : (
                          <div>
                            <Mail className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
                            <p className="mt-2 font-medium">Nenhum gatilho de e-mail encontrado.</p>
                            <button
                              type="button"
                              onClick={abrirModalNovoEmail}
                              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Cadastrar novo gatilho
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ) : (
                    configsEmailFiltradas.map((c) => {
                      const listaDest = emailApi.normalizarListaEmails(c.destinatarios);
                      const listaCc = emailApi.normalizarListaEmails(c.copia);
                      const listaBcc = emailApi.normalizarListaEmails(c.copia_oculta);

                      return (
                        <tr
                          key={c.id}
                          className="transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
                        >
                          <td className="px-4 py-3.5">
                            <div>
                              <p className="font-bold text-slate-900 dark:text-slate-100">{c.nome}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="font-mono text-[10px] bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 px-1.5 py-0.5 rounded">
                                  {c.chave}
                                </span>
                                {c.descricao && (
                                  <span className="text-[11px] text-slate-400 truncate max-w-xs" title={c.descricao}>
                                    {c.descricao}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <span className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-[11px] font-bold ${getModuloBadgeClass(c.modulo)}`}>
                              {c.modulo}
                            </span>
                          </td>

                          <td className="px-4 py-3.5">
                            <div className="flex flex-wrap gap-1 max-w-xs">
                              {listaDest.map((email, i) => (
                                <span
                                  key={i}
                                  className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200/60 dark:border-blue-900/60"
                                  title={email}
                                >
                                  <AtSign className="h-3 w-3 opacity-70" />
                                  {email}
                                </span>
                              ))}
                            </div>
                          </td>

                          <td className="px-4 py-3.5">
                            <div className="space-y-1">
                              {listaCc.length > 0 && (
                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] font-bold text-slate-400">CC:</span>
                                  <span className="text-[11px] text-slate-600 dark:text-slate-300 truncate max-w-[160px]" title={listaCc.join(', ')}>
                                    {listaCc.join(', ')}
                                  </span>
                                </div>
                              )}
                              {listaBcc.length > 0 && (
                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] font-bold text-slate-400">BCC:</span>
                                  <span className="text-[11px] text-slate-600 dark:text-slate-300 truncate max-w-[160px]" title={listaBcc.join(', ')}>
                                    {listaBcc.join(', ')}
                                  </span>
                                </div>
                              )}
                              {listaCc.length === 0 && listaBcc.length === 0 && (
                                <span className="text-slate-400 text-[11px]">—</span>
                              )}
                            </div>
                          </td>

                          <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300">
                            {c.assunto_padrao ? (
                              <span className="font-medium text-slate-700 dark:text-slate-200">
                                {c.assunto_padrao}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>

                          <td className="px-4 py-3.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleToggleAtivoEmail(c)}
                              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${
                                c.ativo
                                  ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300'
                                  : 'bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-400'
                              }`}
                              title="Clique para alternar Ativo / Inativo"
                            >
                              {c.ativo ? (
                                <>
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  Ativo
                                </>
                              ) : (
                                <>
                                  <XCircle className="h-3.5 w-3.5" />
                                  Inativo
                                </>
                              )}
                            </button>
                          </td>

                          <td className="px-4 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleTestarOutlook({
                                  destinatarios: c.destinatarios,
                                  copia: c.copia,
                                  copiaOculta: c.copia_oculta,
                                  assunto: c.assunto_padrao,
                                })}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/40 dark:hover:text-blue-400"
                                title="Testar no Outlook (Abre o cliente de e-mail com teste)"
                              >
                                <Send className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => abrirModalEditarEmail(c)}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-800 dark:hover:text-blue-400"
                                title="Editar Configuração"
                              >
                                <Edit2 className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfigEmailParaExcluir(c)}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30 dark:hover:text-rose-400"
                                title="Excluir"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL NOVO / EDITAR VIGILANTE                             */}
      {/* ========================================================= */}
      {modalVigilanteOpen && (
        <Modal
          onClose={() => setModalVigilanteOpen(false)}
          maxWidth="max-w-lg"
          ariaLabel={vigilanteEditando ? 'Editar Vigilante' : 'Novo Vigilante'}
        >
          <form onSubmit={handleSalvarVigilante}>
            <ModalBody className="p-6 space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100 dark:border-slate-800">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400">
                  <Shield className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">
                    {vigilanteEditando ? 'Editar Cadastro de Vigilante' : 'Novo Vigilante da Portaria'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Preencha os dados do profissional de segurança patrimonial
                  </p>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Nome Completo *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Carlos Silva"
                    value={formNome}
                    onChange={(e) => setFormNome(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                      Matrícula / ID
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: VIG-012"
                      value={formMatricula}
                      onChange={(e) => setFormMatricula(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                      Empresa Prestadora
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: PATRIMONIAL TEN"
                      value={formEmpresa}
                      onChange={(e) => setFormEmpresa(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                      Função
                    </label>
                    <select
                      value={formFuncao}
                      onChange={(e) => setFormFuncao(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    >
                      <option value="Vigilante Portaria">Vigilante Portaria</option>
                      <option value="Vigilante Ronda">Vigilante Ronda</option>
                      <option value="Líder de Vigilância">Líder de Vigilância</option>
                      <option value="Supervisor Patrimonial">Supervisor Patrimonial</option>
                      <option value="Porteiro">Porteiro</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                      Turno Padrão
                    </label>
                    <select
                      value={formTurno}
                      onChange={(e) => setFormTurno(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    >
                      <option value="MANHA">Manhã</option>
                      <option value="TARDE">Tarde</option>
                      <option value="NOITE">Noite</option>
                      <option value="TURNO_A">Turno A</option>
                      <option value="TURNO_B">Turno B</option>
                      <option value="TURNO_C">Turno C</option>
                      <option value="REVEZAMENTO">Revezamento / 12x36</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Observações
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Escala 12x36 diurna"
                    value={formObs}
                    onChange={(e) => setFormObs(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="formAtivoCheck"
                    checked={formAtivo}
                    onChange={(e) => setFormAtivo(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800"
                  />
                  <label
                    htmlFor="formAtivoCheck"
                    className="text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    Vigilante ativo (disponível para seleção nas listas dos formulários)
                  </label>
                </div>
              </div>
            </ModalBody>

            <ModalFooter>
              <div className="flex w-full items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalVigilanteOpen(false)}
                  disabled={salvandoVigilante}
                  className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvandoVigilante}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm shadow-blue-500/20 hover:bg-blue-700 disabled:opacity-50"
                >
                  {salvandoVigilante ? 'Salvando...' : 'Salvar Vigilante'}
                </button>
              </div>
            </ModalFooter>
          </form>
        </Modal>
      )}

      {/* ========================================================= */}
      {/* MODAL NOVO / EDITAR GATILHO DE E-MAIL                      */}
      {/* ========================================================= */}
      {modalEmailOpen && (
        <Modal
          onClose={() => setModalEmailOpen(false)}
          maxWidth="max-w-xl"
          ariaLabel={configEmailEditando ? 'Editar Gatilho de E-mail' : 'Novo Gatilho de E-mail'}
        >
          <form onSubmit={handleSalvarEmail}>
            <ModalBody className="p-6 space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100 dark:border-slate-800">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400">
                  <Mail className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">
                    {configEmailEditando ? 'Editar Gatilho de E-mail / Outlook' : 'Novo Gatilho de E-mail / Outlook'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Configure os destinatários e assuntos para abertura automática no cliente de e-mail
                  </p>
                </div>
              </div>

              {/* Sugestões Rápidas (apenas ao criar novo) */}
              {!configEmailEditando && (
                <div className="rounded-xl bg-slate-50 p-3 border border-slate-200/80 dark:bg-slate-800/60 dark:border-slate-700/60">
                  <div className="flex items-center gap-1 text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                    <Tag className="h-3.5 w-3.5 text-blue-500" />
                    <span>Sugestões de Gatilhos Conhecidos do SISTEN:</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {SUGESTOES_GATILHOS.map((s) => (
                      <button
                        key={s.chave}
                        type="button"
                        onClick={() => aplicarSugestaoGatilho(s)}
                        className={`rounded-lg px-2 py-1 text-[10px] font-semibold transition-colors ${
                          formEmailChave === s.chave
                            ? 'bg-blue-600 text-white'
                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-blue-50 hover:text-blue-700 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                        }`}
                      >
                        {s.nome}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-3 pt-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                      Chave Identificadora *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: cadastro_sap, expedicao_tramos"
                      value={formEmailChave}
                      onChange={(e) => setFormEmailChave(e.target.value)}
                      disabled={Boolean(configEmailEditando)}
                      className="mt-1 w-full font-mono rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none disabled:bg-slate-100 dark:disabled:bg-slate-800/80 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                    <p className="mt-0.5 text-[10px] text-slate-400">Identificador único do código do sistema</p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                      Módulo de Origem *
                    </label>
                    <select
                      value={formEmailModulo}
                      onChange={(e) => setFormEmailModulo(e.target.value as EmailModulo)}
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    >
                      <option value="SUPRIMENTOS">Suprimentos</option>
                      <option value="LOGISTICA">Logística & Expedição</option>
                      <option value="PORTARIA">Portaria & Segurança</option>
                      <option value="RH">Recursos Humanos (RH)</option>
                      <option value="HELPDESK">Helpdesk & Jurídico</option>
                      <option value="GERAL">Geral</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Nome do Gatilho / Finalidade *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Solicitação de Cadastro SAP"
                    value={formEmailNome}
                    onChange={(e) => setFormEmailNome(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Destinatários Principais (Para) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: jefferson.santana@ten.ind.br, equipe.compras@ten.ind.br"
                    value={formEmailDestinatarios}
                    onChange={(e) => setFormEmailDestinatarios(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    Separe múltiplos e-mails por vírgula ou ponto e vírgula.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                      Cópia (CC)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: coordenador@ten.ind.br"
                      value={formEmailCopia}
                      onChange={(e) => setFormEmailCopia(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                      Cópia Oculta (BCC)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: auditoria@ten.ind.br"
                      value={formEmailCopiaOculta}
                      onChange={(e) => setFormEmailCopiaOculta(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Assunto Padrão
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Cadastro SAP, Carregamento Tramos"
                    value={formEmailAssunto}
                    onChange={(e) => setFormEmailAssunto(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    O módulo poderá complementar este assunto (ex: com número da solicitação ou placa).
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Descrição / Contexto Operacional
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Disparado ao submeter nova solicitação de cadastro SAP"
                    value={formEmailDescricao}
                    onChange={(e) => setFormEmailDescricao(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="formEmailAtivoCheck"
                    checked={formEmailAtivo}
                    onChange={(e) => setFormEmailAtivo(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800"
                  />
                  <label
                    htmlFor="formEmailAtivoCheck"
                    className="text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    Gatilho ativo (utilizado para abertura automática no Outlook nos formulários)
                  </label>
                </div>
              </div>
            </ModalBody>

            <ModalFooter>
              <div className="flex w-full items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => handleTestarOutlook({
                    destinatarios: formEmailDestinatarios,
                    copia: formEmailCopia,
                    copiaOculta: formEmailCopiaOculta,
                    assunto: formEmailAssunto,
                  })}
                  disabled={!formEmailDestinatarios.trim()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 disabled:opacity-50"
                  title="Abrir no Outlook agora para testar o preenchimento dos campos"
                >
                  <Send className="h-3.5 w-3.5 text-blue-500" />
                  <span>Testar no Outlook</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setModalEmailOpen(false)}
                    disabled={salvandoEmail}
                    className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={salvandoEmail}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm shadow-blue-500/20 hover:bg-blue-700 disabled:opacity-50"
                  >
                    {salvandoEmail ? 'Salvando...' : 'Salvar Gatilho'}
                  </button>
                </div>
              </div>
            </ModalFooter>
          </form>
        </Modal>
      )}

      {/* Confirm Excluir Vigilante */}
      {vigilanteParaExcluir && (
        <ConfirmDialog
          titulo="Excluir Vigilante"
          mensagem={`Deseja realmente remover o vigilante "${vigilanteParaExcluir.nome}" da base de cadastros?`}
          confirmarLabel="Sim, Excluir"
          variante="perigo"
          onConfirmar={handleExcluirVigilante}
          onCancelar={() => setVigilanteParaExcluir(null)}
        />
      )}

      {/* Confirm Excluir Configuração de E-mail */}
      {configEmailParaExcluir && (
        <ConfirmDialog
          titulo="Excluir Gatilho de E-mail"
          mensagem={`Deseja realmente remover o gatilho de e-mail "${configEmailParaExcluir.nome}" (${configEmailParaExcluir.chave})? Ao excluir, o sistema passará a utilizar o destinatário de fallback caso o módulo seja acionado.`}
          confirmarLabel="Sim, Excluir"
          variante="perigo"
          onConfirmar={handleExcluirEmail}
          onCancelar={() => setConfigEmailParaExcluir(null)}
        />
      )}
    </div>
  );
}
