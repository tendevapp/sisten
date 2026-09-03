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
  Mail, Send, AtSign, ExternalLink, HelpCircle, Tag, Copy, Globe, Sparkles, Truck
} from 'lucide-react';
import type { Profile, PortVigilante, ConfigEnvioEmail, EmailModulo, PrazoTransporte, Transportadora } from '../types';
import * as api from '../lib/portariaApi';
import * as emailApi from '../lib/emailConfigApi';
import * as diligApi from '../lib/diligenciamentoApi';
import {
  UFS_BRASIL, PRAZO_ENTREGA_PADRAO_DIAS, PRAZO_ENTREGA_PADRAO_GLOBAL_DIAS,
} from '../data/prazosEntregaPadrao';
import { useToast } from '../components/ui/Toast';
import Modal, { ModalBody, ModalFooter } from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';

interface Props {
  user: Profile;
  onNavigate: (path: string) => void;
}

type TabType = 'portaria_vigilantes' | 'emails_envios' | 'suprimentos';
/** Sub-cadastros do módulo Suprimentos (botões dentro da aba). */
type SubSuprimentos = 'lead_time' | 'transportadoras';

const SUGESTOES_GATILHOS = [
  { chave: 'cadastro_sap', nome: 'Solicitação de Cadastro SAP', modulo: 'SUPRIMENTOS' as EmailModulo, assunto: 'Cadastro SAP' },
  { chave: 'helpdesk_suprimentos', nome: 'Abertura de Chamado Suprimentos (Pendências)', modulo: 'SUPRIMENTOS' as EmailModulo, assunto: 'Pendências de Processamento de Notas Fiscais' },
  { chave: 'pendencia_processamento_conclusao', nome: 'Conclusão de Pendências de Processamento', modulo: 'SUPRIMENTOS' as EmailModulo, assunto: 'Conclusão de Processamento' },
  { chave: 'expedicao_chegada', nome: 'Aviso de Chegada de Veículo na Portaria', modulo: 'LOGISTICA' as EmailModulo, assunto: 'Chegada na portaria' },
  { chave: 'expedicao_tramos', nome: 'Relatório de Carregamento de Tramos', modulo: 'LOGISTICA' as EmailModulo, assunto: 'Carregamento Tramos' },
  { chave: 'portaria_relatorio', nome: 'Relatório de Turno e Ocorrências', modulo: 'PORTARIA' as EmailModulo, assunto: 'Relatório de Turno - Portaria TEN' },
  { chave: 'helpdesk_juridico', nome: 'Avisos de Chamados do Jurídico', modulo: 'HELPDESK' as EmailModulo, assunto: 'Chamado Jurídico - SISTEN' },
  { chave: 'rh_ase_hora_extra', nome: 'ASE - Hora Extra (FRM.RHU-0007)', modulo: 'RH' as EmailModulo, assunto: 'ASE - Autorização de Horas Extras' },
];

function formatarDataBR(dataStr?: string | null): string {
  if (!dataStr) return '—';
  // Se já for YYYY-MM-DD
  const partes = dataStr.split('T')[0].split('-');
  if (partes.length === 3) {
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  }
  return dataStr;
}

export default function CadastrosAdmin({ user, onNavigate }: Props) {
  const toast = useToast();
  const abaParamInicial = useMemo(
    () => new URLSearchParams(window.location.hash.split('?')[1] || '').get('aba')
      || new URLSearchParams(window.location.hash.split('?')[1] || '').get('tab'),
    [],
  );
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    if (abaParamInicial === 'emails' || abaParamInicial === 'emails_envios' || abaParamInicial === 'outlook') {
      return 'emails_envios';
    }
    if (['suprimentos', 'lead_time', 'prazos', 'transportadoras'].includes(abaParamInicial || '')) {
      return 'suprimentos';
    }
    return 'portaria_vigilantes';
  });
  const [subSuprimentos, setSubSuprimentos] = useState<SubSuprimentos>(
    abaParamInicial === 'transportadoras' ? 'transportadoras' : 'lead_time',
  );

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
  const [formEmpresa, setFormEmpresa] = useState('PROSEG / PATRIMONIAL');
  const [formFuncao, setFormFuncao] = useState('VIGILANTE');
  const [formTurno, setFormTurno] = useState('REVEZAMENTO');
  const [formAdmissao, setFormAdmissao] = useState('');
  const [formNascimento, setFormNascimento] = useState('');
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

  // ==========================================
  // ESTADO - SUPRIMENTOS: LEAD TIME DE ENTREGAS (sup_prazos_transporte)
  // ==========================================
  const [prazos, setPrazos] = useState<PrazoTransporte[]>([]);
  const [loadingPrazos, setLoadingPrazos] = useState(false);
  const [erroPrazos, setErroPrazos] = useState<string | null>(null);
  const [salvandoPrazo, setSalvandoPrazo] = useState<string | null>(null); // uf em gravação
  // Rascunho editável por UF ('' = padrão global): string p/ deixar o campo vazio.
  const [rascunhoPrazo, setRascunhoPrazo] = useState<Record<string, string>>({});
  const [prazoParaExcluir, setPrazoParaExcluir] = useState<PrazoTransporte | null>(null);
  const [semeandoPrazos, setSemeandoPrazos] = useState(false);

  // ==========================================
  // ESTADO - SUPRIMENTOS: CADASTRO DE TRANSPORTADORAS (sup_transportadoras)
  // ==========================================
  const [transportadoras, setTransportadoras] = useState<Transportadora[]>([]);
  const [loadingTransp, setLoadingTransp] = useState(false);
  const [erroTransp, setErroTransp] = useState<string | null>(null);
  const [novaTransp, setNovaTransp] = useState('');
  const [salvandoTransp, setSalvandoTransp] = useState(false);
  // Rascunho de renomear, por id.
  const [rascunhoTransp, setRascunhoTransp] = useState<Record<string, string>>({});
  const [transpParaExcluir, setTranspParaExcluir] = useState<Transportadora | null>(null);

  const ORDEM_REGIAO = ['Sudeste', 'Sul', 'Centro-Oeste', 'Nordeste', 'Norte'];

  const prazoGlobal = useMemo(
    () => prazos.find(p => p.uf === '' && p.transportadora === '') || null,
    [prazos],
  );

  // Todas as 27 UFs, cada uma com a linha do banco (se houver) ou o padrão
  // da região. Ordena por região e depois por UF.
  const linhasUf = useMemo(() => {
    return UFS_BRASIL
      .map(u => {
        const row = prazos.find(p => p.uf === u.uf && p.transportadora === '') || null;
        return {
          ...u,
          id: row?.id ?? null,
          row,
          dias: row ? row.dias_corridos : (PRAZO_ENTREGA_PADRAO_DIAS[u.uf] ?? PRAZO_ENTREGA_PADRAO_GLOBAL_DIAS),
          salvo: !!row,
        };
      })
      .sort((a, b) => {
        const ra = ORDEM_REGIAO.indexOf(a.regiao);
        const rb = ORDEM_REGIAO.indexOf(b.regiao);
        return ra !== rb ? ra - rb : a.uf.localeCompare(b.uf);
      });
  }, [prazos]);

  const totalUfSalvas = useMemo(() => linhasUf.filter(l => l.salvo).length, [linhasUf]);
  const ufsNaoSalvas = useMemo(() => linhasUf.filter(l => !l.salvo), [linhasUf]);

  const carregarPrazos = async () => {
    setLoadingPrazos(true);
    setErroPrazos(null);
    try {
      const lista = await diligApi.listarPrazosTransporte();
      setPrazos(lista);
      setRascunhoPrazo({});
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (/schema cache|does not exist|not find the table/i.test(msg)) {
        setErroPrazos('A tabela sup_prazos_transporte ainda não existe no banco. Os valores abaixo são o padrão sugerido — aplique a migration (supabase db push) para poder salvar edições.');
      } else {
        toast.error('Erro ao carregar lead time de entregas: ' + msg);
      }
    } finally {
      setLoadingPrazos(false);
    }
  };

  const salvarPrazo = async (uf: string, valorBruto: string) => {
    const dias = Number(valorBruto);
    if (!Number.isFinite(dias) || dias < 0 || !Number.isInteger(dias)) {
      toast.error('Informe um número inteiro de dias (0 ou mais).');
      return;
    }
    setSalvandoPrazo(uf || '__GLOBAL__');
    try {
      await diligApi.salvarPrazoTransporte(uf, '', dias);
      toast.success(uf ? `Prazo de ${uf} salvo: remessa + ${dias} dia(s).` : `Prazo padrão salvo: remessa + ${dias} dia(s).`);
      await carregarPrazos();
    } catch (err: any) {
      toast.error('Falha ao salvar: ' + (err.message || ''));
    } finally {
      setSalvandoPrazo(null);
    }
  };

  const confirmarExcluirPrazo = async () => {
    if (!prazoParaExcluir) return;
    try {
      await diligApi.excluirPrazoTransporte(prazoParaExcluir.id);
      toast.success(`Prazo de ${prazoParaExcluir.uf} removido.`);
      setPrazoParaExcluir(null);
      await carregarPrazos();
    } catch (err: any) {
      toast.error('Falha ao excluir: ' + (err.message || ''));
    }
  };

  // Persiste no banco todas as UFs ainda não salvas (com o padrão da região)
  // + o padrão global, se faltar.
  const semearPrazosPadrao = async () => {
    setSemeandoPrazos(true);
    try {
      const faltantes = ufsNaoSalvas;
      if (faltantes.length === 0 && prazoGlobal) {
        toast.info('Todas as UFs já estão cadastradas.');
        return;
      }
      for (const u of faltantes) {
        await diligApi.salvarPrazoTransporte(u.uf, '', PRAZO_ENTREGA_PADRAO_DIAS[u.uf] ?? PRAZO_ENTREGA_PADRAO_GLOBAL_DIAS);
      }
      if (!prazoGlobal) {
        await diligApi.salvarPrazoTransporte('', '', PRAZO_ENTREGA_PADRAO_GLOBAL_DIAS);
      }
      toast.success(`${faltantes.length} UF(s) cadastrada(s) com o padrão da região.`);
      await carregarPrazos();
    } catch (err: any) {
      toast.error('Falha ao cadastrar as UFs: ' + (err.message || ''));
    } finally {
      setSemeandoPrazos(false);
    }
  };

  // -------------------------------------------------------------
  // HANDLERS - CADASTRO DE TRANSPORTADORAS
  // -------------------------------------------------------------
  const carregarTransportadoras = async () => {
    setLoadingTransp(true);
    setErroTransp(null);
    try {
      const lista = await diligApi.listarTransportadoras();
      setTransportadoras(lista);
      setRascunhoTransp({});
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (/schema cache|does not exist|not find the table/i.test(msg)) {
        setErroTransp('A tabela sup_transportadoras ainda não existe no banco. Aplique a migration (supabase db push) para cadastrar transportadoras.');
      } else {
        toast.error('Erro ao carregar transportadoras: ' + msg);
      }
    } finally {
      setLoadingTransp(false);
    }
  };

  const adicionarTransportadora = async () => {
    const nome = novaTransp.trim();
    if (!nome) { toast.error('Informe o nome da transportadora.'); return; }
    if (transportadoras.some(t => t.nome.trim().toLowerCase() === nome.toLowerCase())) {
      toast.error(`"${nome}" já está cadastrada.`);
      return;
    }
    setSalvandoTransp(true);
    try {
      await diligApi.salvarTransportadora(nome);
      setNovaTransp('');
      toast.success(`Transportadora "${nome}" cadastrada.`);
      await carregarTransportadoras();
    } catch (err: any) {
      toast.error('Não foi possível cadastrar: ' + (err.message || ''));
    } finally {
      setSalvandoTransp(false);
    }
  };

  const renomearTransportadora = async (t: Transportadora) => {
    const nome = (rascunhoTransp[t.id] ?? t.nome).trim();
    if (!nome || nome === t.nome) { setRascunhoTransp(r => { const { [t.id]: _, ...rest } = r; return rest; }); return; }
    setSalvandoTransp(true);
    try {
      await diligApi.salvarTransportadora(nome, t.id);
      toast.success('Transportadora renomeada.');
      await carregarTransportadoras();
    } catch (err: any) {
      toast.error('Não foi possível renomear: ' + (err.message || ''));
    } finally {
      setSalvandoTransp(false);
    }
  };

  const alternarAtivoTransportadora = async (t: Transportadora) => {
    try {
      await diligApi.definirTransportadoraAtiva(t.id, !t.ativo);
      setTransportadoras(prev => prev.map(x => x.id === t.id ? { ...x, ativo: !t.ativo } : x));
    } catch (err: any) {
      toast.error('Não foi possível alterar o status: ' + (err.message || ''));
    }
  };

  const confirmarExcluirTransportadora = async () => {
    if (!transpParaExcluir) return;
    try {
      await diligApi.excluirTransportadora(transpParaExcluir.id);
      toast.success(`"${transpParaExcluir.nome}" removida.`);
      setTranspParaExcluir(null);
      await carregarTransportadoras();
    } catch (err: any) {
      toast.error('Não foi possível remover: ' + (err.message || ''));
    }
  };

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

  // Lead time de entregas: carrega só ao abrir a aba (tabela de baixo volume,
  // e evita ruído se a migration ainda não tiver sido aplicada).
  useEffect(() => {
    if (activeTab === 'suprimentos' && subSuprimentos === 'lead_time' && prazos.length === 0 && !loadingPrazos && !erroPrazos) {
      carregarPrazos();
    }
    if (activeTab === 'suprimentos' && subSuprimentos === 'transportadoras' && transportadoras.length === 0 && !loadingTransp && !erroTransp) {
      carregarTransportadoras();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, subSuprimentos]);

  // -------------------------------------------------------------
  // HANDLERS - VIGILANTES
  // -------------------------------------------------------------
  const abrirModalNovoVigilante = () => {
    setVigilanteEditando(null);
    setFormNome('');
    setFormMatricula('');
    setFormEmpresa('PROSEG / PATRIMONIAL');
    setFormFuncao('VIGILANTE');
    setFormTurno('REVEZAMENTO');
    setFormAdmissao('');
    setFormNascimento('');
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
    setFormAdmissao(v.data_admissao || '');
    setFormNascimento(v.data_nascimento || '');
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
          data_admissao: formAdmissao || null,
          data_nascimento: formNascimento || null,
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
          data_admissao: formAdmissao || null,
          data_nascimento: formNascimento || null,
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
      await emailApi.alternarStatusConfigEmail(c.id, novoStatus, c.chave);
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
      await emailApi.excluirConfigEmail(configEmailParaExcluir.id, configEmailParaExcluir.chave);
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
          onClick={() => setActiveTab('suprimentos')}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${
            activeTab === 'suprimentos'
              ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
          }`}
        >
          <Boxes className="h-4 w-4" />
          Suprimentos — Cadastros
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
                    <th className="px-4 py-3.5">Função</th>
                    <th className="px-4 py-3.5">Data Admissão</th>
                    <th className="px-4 py-3.5">Data Nascimento</th>
                    <th className="px-4 py-3.5">Empresa</th>
                    <th className="px-4 py-3.5">Turno</th>
                    <th className="px-4 py-3.5 text-center">Status</th>
                    <th className="px-4 py-3.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {vigilantesFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
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
                        <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300">
                          <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {v.funcao}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 font-mono text-slate-600 dark:text-slate-300">
                          {v.data_admissao ? formatarDataBR(v.data_admissao) : '—'}
                        </td>
                        <td className="px-4 py-3.5 font-mono text-slate-600 dark:text-slate-300">
                          {v.data_nascimento ? formatarDataBR(v.data_nascimento) : '—'}
                        </td>
                        <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300">
                          {v.empresa}
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

              <button
                type="button"
                onClick={async () => {
                  setLoadingEmails(true);
                  try {
                    const res = await emailApi.sincronizarGatilhosPadrao();
                    await carregarConfigsEmail();
                    if (res.inseridos > 0) {
                      toast.success(`${res.inseridos} gatilho(s) padrão adicionado(s) com sucesso!`);
                    } else {
                      toast.info('Todos os gatilhos padrão do sistema já estão sincronizados.');
                    }
                  } catch (e: any) {
                    toast.error('Erro ao sincronizar gatilhos: ' + (e.message || ''));
                  } finally {
                    setLoadingEmails(false);
                  }
                }}
                disabled={loadingEmails}
                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-950/60 disabled:opacity-50"
                title="Sincroniza automaticamente quaisquer novos gatilhos padrão do sistema que ainda não foram gravados no banco"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                <span className="hidden md:inline">Sincronizar Padrões</span>
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
      {/* ABA: SUPRIMENTOS — CADASTROS (sub-janelas por botão)     */}
      {/* ========================================================= */}
      {activeTab === 'suprimentos' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1.5 dark:border-slate-800 dark:bg-slate-900/40">
            {([
              { chave: 'lead_time' as const, icone: Clock, rotulo: 'Lead Time de Entregas', contagem: totalUfSalvas },
              { chave: 'transportadoras' as const, icone: Truck, rotulo: 'Transportadoras', contagem: transportadoras.length },
            ]).map(({ chave, icone: Icone, rotulo, contagem }) => (
              <button
                key={chave}
                type="button"
                onClick={() => setSubSuprimentos(chave)}
                className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
                  subSuprimentos === chave
                    ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-800 dark:text-blue-300'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <Icone className="h-4 w-4" />
                {rotulo}
                <span className={`ml-0.5 rounded-full px-1.5 py-0.2 text-[10px] ${
                  subSuprimentos === chave ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                }`}>
                  {contagem}
                </span>
              </button>
            ))}
          </div>

          {subSuprimentos === 'lead_time' && (
          <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400">
                <Clock className="h-5 w-5" />
              </span>
              <div className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                <p className="text-sm font-bold text-slate-900 dark:text-slate-50">Lead time de entregas por UF de origem</p>
                <p className="mt-0.5">
                  A previsão de entrega é <strong>data de remessa + N dias corridos</strong>, conforme a UF de
                  origem do fornecedor (ex.: pedido de <strong>SP</strong> → remessa + {PRAZO_ENTREGA_PADRAO_DIAS.SP} dias;{' '}
                  <strong>MG</strong> + {PRAZO_ENTREGA_PADRAO_DIAS.MG}; <strong>PE</strong> + {PRAZO_ENTREGA_PADRAO_DIAS.PE};{' '}
                  <strong>BA</strong> + {PRAZO_ENTREGA_PADRAO_DIAS.BA}). Editável — usado no Diligenciamento de Compras.
                </p>
              </div>
            </div>
          </div>

          {erroPrazos && (
            <div className="flex items-start gap-2.5 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{erroPrazos}</span>
            </div>
          )}

          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-end sm:justify-between dark:border-slate-800 dark:bg-slate-900">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Prazo padrão (UF não cadastrada)
              </label>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-xs text-slate-400">remessa +</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={rascunhoPrazo[''] ?? String(prazoGlobal?.dias_corridos ?? PRAZO_ENTREGA_PADRAO_GLOBAL_DIAS)}
                  onChange={(e) => setRascunhoPrazo((r) => ({ ...r, ['']: e.target.value }))}
                  className="h-9 w-20 rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
                />
                <span className="text-xs text-slate-500 dark:text-slate-400">dia(s)</span>
                <button
                  type="button"
                  onClick={() => salvarPrazo('', rascunhoPrazo[''] ?? String(prazoGlobal?.dias_corridos ?? PRAZO_ENTREGA_PADRAO_GLOBAL_DIAS))}
                  disabled={salvandoPrazo === '__GLOBAL__'}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                  Salvar
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={semearPrazosPadrao}
              disabled={semeandoPrazos || (ufsNaoSalvas.length === 0 && !!prazoGlobal)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              title="Grava no banco as UFs ainda não salvas com o prazo padrão da região"
            >
              <Sparkles className="h-4 w-4" />
              {semeandoPrazos ? 'Cadastrando...' : `Cadastrar UFs pendentes (${ufsNaoSalvas.length})`}
            </button>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            {loadingPrazos ? (
              <div className="flex items-center justify-center py-12"><RefreshCw className="h-5 w-5 animate-spin text-slate-400" /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-100 bg-slate-50/75 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-3">UF</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3">Prazo</th>
                      <th className="px-4 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {linhasUf.map((l, idx) => {
                      const valorAtual = rascunhoPrazo[l.uf] ?? String(l.dias);
                      const mudou = valorAtual !== String(l.dias);
                      const primeiraDaRegiao = idx === 0 || linhasUf[idx - 1].regiao !== l.regiao;
                      return (
                        <React.Fragment key={l.uf}>
                          {primeiraDaRegiao && (
                            <tr className="bg-slate-50/60 dark:bg-slate-950/40">
                              <td colSpan={4} className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                {l.regiao}
                              </td>
                            </tr>
                          )}
                          <tr className="text-slate-700 dark:text-slate-300">
                            <td className="px-4 py-2.5 font-mono font-bold text-slate-900 dark:text-slate-100">{l.uf}</td>
                            <td className="px-4 py-2.5">
                              {l.nome}
                              {!l.salvo && (
                                <span className="ml-1.5 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-bold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                                  PADRÃO
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2">
                                <span className="text-slate-400">remessa +</span>
                                <input
                                  type="number"
                                  min={0}
                                  step={1}
                                  value={valorAtual}
                                  onChange={(e) => setRascunhoPrazo((r) => ({ ...r, [l.uf]: e.target.value }))}
                                  className="h-8 w-20 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
                                />
                                <span className="text-slate-400">dia(s)</span>
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {(mudou || !l.salvo) && (
                                  <button
                                    type="button"
                                    onClick={() => salvarPrazo(l.uf, valorAtual)}
                                    disabled={salvandoPrazo === l.uf}
                                    className="rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                                  >
                                    {l.salvo ? 'Salvar' : 'Cadastrar'}
                                  </button>
                                )}
                                {l.salvo && l.row && (
                                  <button
                                    type="button"
                                    onClick={() => setPrazoParaExcluir(l.row)}
                                    className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                                    title="Voltar ao padrão da região"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          </div>
          )}

          {subSuprimentos === 'transportadoras' && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400">
                  <Truck className="h-5 w-5" />
                </span>
                <div className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-50">Transportadoras do Diligenciamento</p>
                  <p className="mt-0.5">
                    Lista de escolha da coluna <strong>Transportadora</strong> no painel de Diligenciamento (aba "Sem MIGO").
                    <strong> Coleta</strong> e <strong>CIF</strong> não são transportadoras, mas entram aqui porque é a mesma escolha do comprador.
                    Inativar esconde da lista sem apagar o histórico; excluir remove de vez.
                  </p>
                </div>
              </div>
            </div>

            {erroTransp && (
              <div className="flex items-start gap-2.5 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{erroTransp}</span>
              </div>
            )}

            <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-end dark:border-slate-800 dark:bg-slate-900">
              <div className="flex-1">
                <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Nova transportadora
                </label>
                <input
                  value={novaTransp}
                  onChange={(e) => setNovaTransp(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionarTransportadora(); } }}
                  placeholder="Ex.: Jamef, Braspress…"
                  className="mt-1.5 h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
                />
              </div>
              <button
                type="button"
                onClick={adicionarTransportadora}
                disabled={salvandoTransp || !novaTransp.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Adicionar
              </button>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              {loadingTransp ? (
                <div className="flex items-center justify-center py-12"><RefreshCw className="h-5 w-5 animate-spin text-slate-400" /></div>
              ) : transportadoras.length === 0 ? (
                <p className="px-4 py-10 text-center text-xs text-slate-400">Nenhuma transportadora cadastrada ainda.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-100 bg-slate-50/75 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
                      <tr>
                        <th className="px-4 py-3">Nome</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {transportadoras.map((t) => {
                        const rascunho = rascunhoTransp[t.id] ?? t.nome;
                        const mudou = rascunho.trim() !== t.nome && rascunho.trim() !== '';
                        return (
                          <tr key={t.id} className="text-slate-700 dark:text-slate-300">
                            <td className="px-4 py-2.5">
                              <input
                                value={rascunho}
                                onChange={(e) => setRascunhoTransp((r) => ({ ...r, [t.id]: e.target.value }))}
                                onBlur={() => { if (mudou) renomearTransportadora(t); }}
                                className="h-8 w-full max-w-xs rounded-lg border border-slate-300 bg-white px-2 text-sm font-medium text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
                              />
                            </td>
                            <td className="px-4 py-2.5">
                              <button
                                type="button"
                                onClick={() => alternarAtivoTransportadora(t)}
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                                  t.ativo
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                                    : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                }`}
                                title={t.ativo ? 'Clique para inativar' : 'Clique para ativar'}
                              >
                                {t.ativo ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                                {t.ativo ? 'Ativa' : 'Inativa'}
                              </button>
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {mudou && (
                                  <button
                                    type="button"
                                    onClick={() => renomearTransportadora(t)}
                                    disabled={salvandoTransp}
                                    className="rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                                  >
                                    Salvar
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setTranspParaExcluir(t)}
                                  className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                                  title="Excluir"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
          )}
        </div>
      )}

      {transpParaExcluir && (
        <ConfirmDialog
          titulo="Remover transportadora"
          mensagem={`Remover "${transpParaExcluir.nome}" do cadastro? Itens que já usam esse nome mantêm o texto; ele só deixa de aparecer na lista. Prefira "Inativar" se houver histórico.`}
          confirmarLabel="Sim, remover"
          variante="perigo"
          onConfirmar={confirmarExcluirTransportadora}
          onCancelar={() => setTranspParaExcluir(null)}
        />
      )}

      {prazoParaExcluir && (
        <ConfirmDialog
          titulo="Remover prazo de entrega"
          mensagem={`Remover o lead time cadastrado para ${prazoParaExcluir.uf}? Pedidos dessa UF passarão a usar o prazo padrão.`}
          confirmarLabel="Sim, remover"
          variante="perigo"
          onConfirmar={confirmarExcluirPrazo}
          onCancelar={() => setPrazoParaExcluir(null)}
        />
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
                    <input
                      type="text"
                      list="funcoesVigilanteList"
                      placeholder="Ex: VIGILANTE"
                      value={formFuncao}
                      onChange={(e) => setFormFuncao(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                    <datalist id="funcoesVigilanteList">
                      <option value="VIGILANTE" />
                      <option value="VIGILANTE / FERISTA" />
                      <option value="VIGILANTE LÍDER" />
                      <option value="SUPERVISOR PATRIMONIAL" />
                      <option value="PORTEIRO" />
                    </datalist>
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

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                      Data de Admissão
                    </label>
                    <input
                      type="date"
                      value={formAdmissao}
                      onChange={(e) => setFormAdmissao(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                      Data de Nascimento
                    </label>
                    <input
                      type="date"
                      value={formNascimento}
                      onChange={(e) => setFormNascimento(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
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
