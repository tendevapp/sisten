/**
 * Sub-visao "Monitoramento de IPs" dentro de AdminPanel > Usuarios.
 * Permite acompanhar IPs por usuario, detectar acessos externos/desconhecidos
 * ou trocas de IP, e gerenciar a whitelist corporativa (CIDR) e IPs confiaveis
 * por usuario. Somente auditoria/classificacao (sem acoes de bloqueio).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Globe,
  Laptop,
  Loader2,
  Network,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import type { Profile, Sector } from '../../types';
import { useToast } from '../ui/Toast';
import ConfirmDialog from '../ui/ConfirmDialog';
import { formatDateTimeBR } from '../../lib/format';
import {
  agruparAcessosPorUsuario,
  calcularKpisMonitorIp,
  detectarIpsCompartilhados,
  normalizarEntradaCidr,
  resumirUserAgent,
  rotuloClassificacao,
  rotuloTipoEvento,
  type AcessoIpRegistro,
  type ClassificacaoIp,
  type IpConfiavelCorporativo,
  type PeriodoMonitorIp,
} from '../../lib/monitoramentoIp';
import {
  adicionarIpConfiavel,
  alternarIpConfiavel,
  aprovarIpParaUsuario,
  detectarMeuIpAtual,
  listarAcessosIp,
  listarIpsConfiaveis,
  removerIpConfiavel,
  revogarIpDoUsuario,
} from '../../lib/monitoramentoIpApi';

interface MonitoramentoIpViewProps {
  currentUser: Profile;
  sectors: Sector[];
}

type SubAbaMonitor = 'usuarios' | 'eventos' | 'whitelist';
type FiltroClassificacao = 'todos' | ClassificacaoIp | 'troca_ip';

const PERIODOS: { valor: PeriodoMonitorIp; label: string }[] = [
  { valor: '24h', label: '24h' },
  { valor: '7d', label: '7 dias' },
  { valor: '30d', label: '30 dias' },
  { valor: '90d', label: '90 dias' },
  { valor: 'tudo', label: 'Tudo' },
];

function badgeClassificacao(c: ClassificacaoIp): string {
  if (c === 'corporativo') {
    return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  }
  if (c === 'confiavel_usuario') {
    return 'bg-sky-50 text-sky-800 border-sky-200';
  }
  return 'bg-rose-50 text-rose-800 border-rose-200';
}

function badgeEvento(tipo: AcessoIpRegistro['tipo_evento']): string {
  if (tipo === 'troca_ip') return 'bg-amber-50 text-amber-800 border-amber-200';
  if (tipo === 'login') return 'bg-slate-100 text-slate-700 border-slate-200';
  return 'bg-slate-50 text-slate-600 border-slate-200';
}

export default function MonitoramentoIpView({ currentUser, sectors }: MonitoramentoIpViewProps) {
  const toast = useToast();

  const [subAba, setSubAba] = useState<SubAbaMonitor>('usuarios');
  const [periodo, setPeriodo] = useState<PeriodoMonitorIp>('7d');
  const [registros, setRegistros] = useState<AcessoIpRegistro[]>([]);
  const [whitelist, setWhitelist] = useState<IpConfiavelCorporativo[]>([]);
  const [meuIp, setMeuIp] = useState<{ ip: string | null; pais: string | null }>({ ip: null, pais: null });
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // Filtros
  const [busca, setBusca] = useState('');
  const [filtroClassificacao, setFiltroClassificacao] = useState<FiltroClassificacao>('todos');
  const [filtroSetor, setFiltroSetor] = useState<string>('all');
  const [expandidos, setExpandidos] = useState<Record<string, boolean>>({});

  // Formulario de whitelist corporativa
  const [cidrInput, setCidrInput] = useState('');
  const [rotuloInput, setRotuloInput] = useState('');
  const [descricaoInput, setDescricaoInput] = useState('');
  const [salvandoCidr, setSalvandoCidr] = useState(false);

  // Estado de acoes pontuais e confirmacao de exclusao
  const [processandoChave, setProcessandoChave] = useState<string | null>(null);
  const [regraParaRemover, setRegraParaRemover] = useState<IpConfiavelCorporativo | null>(null);

  const mapaSetores = useMemo(() => {
    const mapa = new Map<string, string>();
    sectors.forEach(s => mapa.set(s.id, s.name));
    return mapa;
  }, [sectors]);

  const carregarDados = useCallback(async (p: PeriodoMonitorIp) => {
    setCarregando(true);
    setErro(null);
    try {
      const [acessos, redes] = await Promise.all([
        listarAcessosIp(p),
        listarIpsConfiaveis(),
      ]);
      setRegistros(acessos);
      setWhitelist(redes);
    } catch (err) {
      setErro((err as Error).message || 'Erro ao carregar dados de monitoramento.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregarDados(periodo);
  }, [periodo, carregarDados]);

  useEffect(() => {
    let ativo = true;
    detectarMeuIpAtual().then(res => {
      if (ativo) setMeuIp(res);
    });
    return () => { ativo = false; };
  }, []);

  const kpis = useMemo(() => calcularKpisMonitorIp(registros), [registros]);
  const ipsCompartilhados = useMemo(() => detectarIpsCompartilhados(registros), [registros]);
  const usuariosAgrupados = useMemo(() => agruparAcessosPorUsuario(registros), [registros]);

  const regrasAtivasCount = useMemo(
    () => whitelist.filter(w => w.ativo).length,
    [whitelist],
  );

  const usuariosFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return usuariosAgrupados.filter(u => {
      if (filtroSetor !== 'all' && u.sectorId !== filtroSetor) return false;
      if (filtroClassificacao === 'desconhecido' && u.ipsDesconhecidos === 0) return false;
      if (filtroClassificacao === 'corporativo' && !u.ips.some(i => i.classificacao === 'corporativo')) return false;
      if (filtroClassificacao === 'confiavel_usuario' && !u.ips.some(i => i.classificacao === 'confiavel_usuario')) return false;
      if (filtroClassificacao === 'troca_ip' && !u.temTrocaIp) return false;
      if (!q) return true;
      const nomeSetor = (u.sectorId ? mapaSetores.get(u.sectorId) : '') || '';
      return (
        u.userName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        nomeSetor.toLowerCase().includes(q) ||
        u.ips.some(i => i.ip.toLowerCase().includes(q) || (i.regraRotulo || '').toLowerCase().includes(q))
      );
    });
  }, [usuariosAgrupados, busca, filtroClassificacao, filtroSetor, mapaSetores]);

  const eventosFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return registros.filter(r => {
      if (filtroSetor !== 'all' && r.sector_id !== filtroSetor) return false;
      if (filtroClassificacao === 'troca_ip' && r.tipo_evento !== 'troca_ip') return false;
      if (
        filtroClassificacao !== 'todos' &&
        filtroClassificacao !== 'troca_ip' &&
        r.classificacao !== filtroClassificacao
      ) {
        return false;
      }
      if (!q) return true;
      const nomeSetor = (r.sector_id ? mapaSetores.get(r.sector_id) : '') || '';
      return (
        (r.user_name || '').toLowerCase().includes(q) ||
        (r.email || '').toLowerCase().includes(q) ||
        r.ip_texto.toLowerCase().includes(q) ||
        nomeSetor.toLowerCase().includes(q) ||
        (r.regra_rotulo || '').toLowerCase().includes(q)
      );
    });
  }, [registros, busca, filtroClassificacao, filtroSetor, mapaSetores]);

  const toggleExpandido = (userId: string) => {
    setExpandidos(prev => ({ ...prev, [userId]: !prev[userId] }));
  };

  const abrirCadastroCorporativoComIp = (ip: string, sugestaoRotulo = '') => {
    setCidrInput(ip);
    setRotuloInput(sugestaoRotulo);
    setDescricaoInput('');
    setSubAba('whitelist');
  };

  const handleAdicionarWhitelist = async (e: React.FormEvent) => {
    e.preventDefault();
    const validacao = normalizarEntradaCidr(cidrInput);
    if (!validacao.valido) {
      toast.error(validacao.erro || 'IP ou faixa CIDR inválido.');
      return;
    }
    if (rotuloInput.trim().length < 2) {
      toast.error('Informe um rótulo descritivo para a rede.');
      return;
    }

    setSalvandoCidr(true);
    try {
      await adicionarIpConfiavel({
        cidr: validacao.normalizado,
        rotulo: rotuloInput.trim(),
        descricao: descricaoInput.trim(),
        criadoPor: currentUser.id,
      });
      toast.success(`Rede ${validacao.normalizado} adicionada à whitelist corporativa.`);
      setCidrInput('');
      setRotuloInput('');
      setDescricaoInput('');
      await carregarDados(periodo);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSalvandoCidr(false);
    }
  };

  const handleAlternarRegra = async (regra: IpConfiavelCorporativo) => {
    const chave = `toggle:${regra.id}`;
    setProcessandoChave(chave);
    try {
      await alternarIpConfiavel(regra.id, !regra.ativo);
      toast.success(regra.ativo ? 'Regra desativada.' : 'Regra reativada.');
      await carregarDados(periodo);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setProcessandoChave(null);
    }
  };

  const handleConfirmarRemoverRegra = async () => {
    if (!regraParaRemover) return;
    const alvo = regraParaRemover;
    setRegraParaRemover(null);
    const chave = `del:${alvo.id}`;
    setProcessandoChave(chave);
    try {
      await removerIpConfiavel(alvo.id);
      toast.success(`Rede ${alvo.cidr} removida da whitelist.`);
      await carregarDados(periodo);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setProcessandoChave(null);
    }
  };

  const handleConfiarIpUsuario = async (userId: string, userName: string, ip: string) => {
    const chave = `trust:${userId}:${ip}`;
    setProcessandoChave(chave);
    try {
      await aprovarIpParaUsuario({
        userId,
        ip,
        rotulo: `Aprovado por ${currentUser.name}`,
        aprovadoPor: currentUser.id,
      });
      toast.success(`IP ${ip} marcado como confiável para ${userName}.`);
      await carregarDados(periodo);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setProcessandoChave(null);
    }
  };

  const handleRevogarIpUsuario = async (userIpId: string, ip: string) => {
    const chave = `revoke:${userIpId}`;
    setProcessandoChave(chave);
    try {
      await revogarIpDoUsuario(userIpId);
      toast.success(`Confiança removida para o IP ${ip}.`);
      await carregarDados(periodo);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setProcessandoChave(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Barra superior: sub-abas + periodo + atualizar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSubAba('usuarios')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              subAba === 'usuarios'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Por Usuário ({usuariosAgrupados.length})
          </button>

          <button
            type="button"
            onClick={() => setSubAba('eventos')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              subAba === 'eventos'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Histórico de Acessos ({registros.length})
          </button>

          <button
            type="button"
            onClick={() => setSubAba('whitelist')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              subAba === 'whitelist'
                ? 'bg-emerald-800 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Network className="w-3.5 h-3.5" />
            Redes Confiáveis ({regrasAtivasCount})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {meuIp.ip && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600">
              <Globe className="w-3.5 h-3.5 text-slate-400" />
              Seu IP: <span className="font-mono font-bold text-slate-800">{meuIp.ip}</span>
              {meuIp.pais && <span className="text-slate-400">({meuIp.pais})</span>}
            </span>
          )}

          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5">
            {PERIODOS.map(p => (
              <button
                key={p.valor}
                type="button"
                onClick={() => setPeriodo(p.valor)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                  periodo === p.valor
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => carregarDados(periodo)}
            disabled={carregando}
            aria-label="Atualizar monitoramento de IPs"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${carregando ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Aviso de whitelist vazia */}
      {!carregando && regrasAtivasCount === 0 && subAba !== 'whitelist' && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-xs text-amber-900">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Nenhuma rede corporativa cadastrada na whitelist.</p>
              <p className="text-amber-800/90 mt-0.5">
                Cadastre os IPs ou faixas CIDR da empresa (fábrica, escritório, VPN) para diferenciar acessos internos de acessos externos/desconhecidos.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (meuIp.ip) {
                abrirCadastroCorporativoComIp(meuIp.ip, 'Rede Corporativa Principal');
              } else {
                setSubAba('whitelist');
              }
            }}
            className="inline-flex items-center gap-1.5 shrink-0 rounded-xl bg-amber-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-800 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            {meuIp.ip ? `Cadastrar meu IP (${meuIp.ip})` : 'Configurar Redes'}
          </button>
        </div>
      )}

      {/* KPIs clicaveis */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <button
          type="button"
          onClick={() => { setFiltroClassificacao('desconhecido'); if (subAba === 'whitelist') setSubAba('usuarios'); }}
          className={`text-left p-4 rounded-2xl border transition-all cursor-pointer bg-white shadow-2xs hover:shadow-xs flex items-center justify-between ${
            filtroClassificacao === 'desconhecido'
              ? 'border-rose-400 ring-2 ring-rose-100'
              : 'border-slate-200/80'
          }`}
        >
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Acessos Desconhecidos</p>
            <p className={`text-2xl font-black mt-1 tabular-nums ${kpis.acessosDesconhecidos > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
              {kpis.acessosDesconhecidos}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {kpis.ipsDesconhecidosDistintos} {kpis.ipsDesconhecidosDistintos === 1 ? 'IP distinto' : 'IPs distintos'}
            </p>
          </div>
          <div className={`p-2.5 rounded-xl border ${kpis.acessosDesconhecidos > 0 ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-emerald-50 text-emerald-600 border-emerald-200'}`}>
            {kpis.acessosDesconhecidos > 0 ? <ShieldAlert className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
          </div>
        </button>

        <button
          type="button"
          onClick={() => { setSubAba('usuarios'); setFiltroClassificacao('desconhecido'); }}
          className="text-left p-4 rounded-2xl border border-slate-200/80 transition-all cursor-pointer bg-white shadow-2xs hover:shadow-xs flex items-center justify-between"
        >
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Usuários c/ Externo</p>
            <p className={`text-2xl font-black mt-1 tabular-nums ${kpis.usuariosComExterno > 0 ? 'text-amber-700' : 'text-slate-800'}`}>
              {kpis.usuariosComExterno}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">fora da whitelist</p>
          </div>
          <div className="p-2.5 rounded-xl bg-amber-50 text-amber-700 border border-amber-200">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => { setFiltroClassificacao('troca_ip'); if (subAba === 'whitelist') setSubAba('eventos'); }}
          className={`text-left p-4 rounded-2xl border transition-all cursor-pointer bg-white shadow-2xs hover:shadow-xs flex items-center justify-between ${
            filtroClassificacao === 'troca_ip'
              ? 'border-amber-400 ring-2 ring-amber-100'
              : 'border-slate-200/80'
          }`}
        >
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Trocas de IP</p>
            <p className="text-2xl font-black mt-1 tabular-nums text-slate-900">{kpis.trocasIp}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">mudanças de rede</p>
          </div>
          <div className="p-2.5 rounded-xl bg-sky-50 text-sky-700 border border-sky-200">
            <Globe className="w-5 h-5" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => { setFiltroClassificacao('todos'); setBusca(''); setFiltroSetor('all'); }}
          className="text-left p-4 rounded-2xl border border-slate-200/80 transition-all cursor-pointer bg-white shadow-2xs hover:shadow-xs flex items-center justify-between"
        >
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Usuários Monitorados</p>
            <p className="text-2xl font-black mt-1 tabular-nums text-slate-900">{kpis.usuariosMonitorados}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{regrasAtivasCount} redes confiáveis ativas</p>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-100 text-slate-700 border border-slate-200">
            <Users className="w-5 h-5" />
          </div>
        </button>
      </div>

      {erro && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-800">
          {erro}
        </div>
      )}

      {/* Barra de filtros para Por Usuario e Historico */}
      {subAba !== 'whitelist' && (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por usuário, e-mail, IP ou rede..."
              className="w-full pl-9 pr-8 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
            />
            {busca && (
              <button
                type="button"
                onClick={() => setBusca('')}
                aria-label="Limpar busca"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-1">
              {(
                [
                  { id: 'todos', label: 'Todos' },
                  { id: 'desconhecido', label: 'Desconhecidos' },
                  { id: 'confiavel_usuario', label: 'Confiável p/ usuário' },
                  { id: 'corporativo', label: 'Corporativo' },
                  { id: 'troca_ip', label: 'Com troca de IP' },
                ] as { id: FiltroClassificacao; label: string }[]
              ).map(chip => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setFiltroClassificacao(chip.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                    filtroClassificacao === chip.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            <select
              value={filtroSetor}
              onChange={e => setFiltroSetor(e.target.value)}
              aria-label="Filtrar por setor"
              className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            >
              <option value="all">Todos os setores</option>
              {sectors.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Conteudo principal */}
      {carregando ? (
        <div className="flex items-center justify-center py-16 bg-white rounded-2xl border border-slate-200/80 text-slate-500 gap-2 text-sm">
          <Loader2 className="w-5 h-5 animate-spin" />
          Carregando monitoramento de IPs...
        </div>
      ) : subAba === 'usuarios' ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
          {usuariosFiltrados.length === 0 ? (
            <div className="py-14 text-center px-4">
              <Globe className="w-9 h-9 text-slate-300 mx-auto mb-2.5" />
              <p className="text-sm font-bold text-slate-700">Nenhum acesso encontrado neste recorte</p>
              <p className="text-xs text-slate-500 mt-1">
                Os IPs são registrados automaticamente no login, na retomada de sessão e ao trocar de rede.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {usuariosFiltrados.map(u => {
                const aberto = !!expandidos[u.userId];
                const setorNome = u.sectorId ? mapaSetores.get(u.sectorId) : null;
                return (
                  <div key={u.userId} className="transition-colors">
                    <button
                      type="button"
                      onClick={() => toggleExpandido(u.userId)}
                      className="w-full text-left px-4 py-3.5 hover:bg-slate-50/80 flex flex-col lg:flex-row lg:items-center justify-between gap-3 cursor-pointer"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="mt-0.5 text-slate-400">
                          {aberto ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-bold text-slate-900 truncate">{u.userName}</span>
                            {u.ipsDesconhecidos > 0 ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                                <ShieldAlert className="w-3 h-3" />
                                {u.ipsDesconhecidos} {u.ipsDesconhecidos === 1 ? 'IP desconhecido' : 'IPs desconhecidos'}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                                <ShieldCheck className="w-3 h-3" />
                                Somente IPs confiáveis
                              </span>
                            )}
                            {u.temTrocaIp && (
                              <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                                {u.ipsDistintos} IPs distintos
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-0.5">
                            <span>{u.email}</span>
                            {setorNome && (
                              <>
                                <span className="text-slate-300">•</span>
                                <span className="inline-flex items-center gap-1">
                                  <Building2 className="w-3 h-3 text-slate-400" />
                                  {setorNome}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 pl-7 lg:pl-0 shrink-0 text-xs">
                        <div className="text-right">
                          <p className="font-mono font-bold text-slate-800">{u.ultimoIp}</p>
                          <p className="text-[11px] text-slate-400">Último: {formatDateTimeBR(u.ultimoVistoEm)}</p>
                        </div>
                        <span className={`inline-flex items-center rounded-lg border px-2 py-1 text-[11px] font-semibold ${badgeClassificacao(u.ultimaClassificacao)}`}>
                          {rotuloClassificacao(u.ultimaClassificacao)}
                        </span>
                      </div>
                    </button>

                    {aberto && (
                      <div className="bg-slate-50/70 border-t border-slate-100 px-4 sm:px-11 py-3 space-y-2">
                        {u.ips.map(item => {
                          const compartilhadoPor = ipsCompartilhados.get(item.ip) ?? 1;
                          const chaveTrust = `trust:${u.userId}:${item.ip}`;
                          const chaveRevoke = item.userIpConhecidoId ? `revoke:${item.userIpConhecidoId}` : '';
                          return (
                            <div
                              key={item.ip}
                              className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5"
                            >
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-mono text-xs font-bold text-slate-900">{item.ip}</span>
                                  <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold ${badgeClassificacao(item.classificacao)}`}>
                                    {rotuloClassificacao(item.classificacao)}
                                  </span>
                                  {item.regraRotulo && (
                                    <span className="text-[11px] font-medium text-slate-600">
                                      ({item.regraRotulo}{item.regraCidr ? ` · ${item.regraCidr}` : ''})
                                    </span>
                                  )}
                                  {item.pais && (
                                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                                      {item.pais}
                                    </span>
                                  )}
                                  {item.classificacao === 'desconhecido' && compartilhadoPor > 1 && (
                                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                                      <Users className="w-3 h-3" />
                                      Usado por {compartilhadoPor} usuários
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                                  <span className="inline-flex items-center gap-1">
                                    <Laptop className="w-3 h-3 text-slate-400" />
                                    {item.dispositivo}
                                  </span>
                                  <span>Último: {formatDateTimeBR(item.ultimoVistoEm)}</span>
                                  <span>1º visto: {formatDateTimeBR(item.primeiroVistoEm)}</span>
                                  <span>{item.ocorrencias} {item.ocorrencias === 1 ? 'sinal' : 'sinais'}</span>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 shrink-0">
                                {item.classificacao === 'desconhecido' && (
                                  <>
                                    <button
                                      type="button"
                                      disabled={processandoChave === chaveTrust}
                                      onClick={() => handleConfiarIpUsuario(u.userId, u.userName, item.ip)}
                                      className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-800 hover:bg-sky-100 disabled:opacity-50 cursor-pointer"
                                    >
                                      {processandoChave === chaveTrust ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserCheck className="w-3 h-3" />}
                                      Confiar p/ usuário
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => abrirCadastroCorporativoComIp(item.ip, compartilhadoPor > 1 ? 'Rede Corporativa' : '')}
                                      className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100 cursor-pointer"
                                    >
                                      <Plus className="w-3 h-3" />
                                      Whitelist corporativa
                                    </button>
                                  </>
                                )}
                                {item.classificacao === 'confiavel_usuario' && item.userIpConhecidoId && (
                                  <button
                                    type="button"
                                    disabled={processandoChave === chaveRevoke}
                                    onClick={() => handleRevogarIpUsuario(item.userIpConhecidoId!, item.ip)}
                                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 disabled:opacity-50 cursor-pointer"
                                  >
                                    {processandoChave === chaveRevoke ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                                    Remover confiança
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : subAba === 'eventos' ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-x-auto">
          {eventosFiltrados.length === 0 ? (
            <div className="py-14 text-center px-4">
              <Clock className="w-9 h-9 text-slate-300 mx-auto mb-2.5" />
              <p className="text-sm font-bold text-slate-700">Nenhum evento de acesso para os filtros atuais</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4 font-bold">Último Acesso</th>
                  <th className="py-3 px-4 font-bold">Usuário</th>
                  <th className="py-3 px-4 font-bold">IP / Origem</th>
                  <th className="py-3 px-4 font-bold">Classificação</th>
                  <th className="py-3 px-4 font-bold">Evento</th>
                  <th className="py-3 px-4 font-bold">Dispositivo</th>
                  <th className="py-3 px-4 font-bold text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {eventosFiltrados.map(r => {
                  const chaveTrust = `trust:${r.user_id}:${r.ip_texto}`;
                  const chaveRevoke = r.user_ip_conhecido_id ? `revoke:${r.user_ip_conhecido_id}` : '';
                  const compartilhadoPor = ipsCompartilhados.get(r.ip_texto) ?? 1;
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/60">
                      <td className="py-3 px-4 whitespace-nowrap text-slate-600 tabular-nums">
                        <div>{formatDateTimeBR(r.ultimo_visto_em)}</div>
                        {r.ocorrencias > 1 && (
                          <span className="text-[10px] text-slate-400">{r.ocorrencias} sinais na sessão</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{r.user_name || 'Usuário'}</div>
                        <div className="text-[11px] text-slate-500">{r.email}</div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-slate-900">{r.ip_texto}</span>
                          {r.pais && (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                              {r.pais}
                            </span>
                          )}
                        </div>
                        {r.regra_rotulo && (
                          <div className="text-[10px] text-slate-500 mt-0.5">{r.regra_rotulo}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold ${badgeClassificacao(r.classificacao)}`}>
                          {rotuloClassificacao(r.classificacao)}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold ${badgeEvento(r.tipo_evento)}`}>
                          {rotuloTipoEvento(r.tipo_evento)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                        {resumirUserAgent(r.user_agent)}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {r.classificacao === 'desconhecido' ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={processandoChave === chaveTrust}
                              onClick={() => handleConfiarIpUsuario(r.user_id, r.user_name || r.email || 'usuário', r.ip_texto)}
                              className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-bold text-sky-800 hover:bg-sky-100 cursor-pointer"
                            >
                              <UserCheck className="w-3 h-3" />
                              Confiar
                            </button>
                            <button
                              type="button"
                              onClick={() => abrirCadastroCorporativoComIp(r.ip_texto, compartilhadoPor > 1 ? 'Rede Corporativa' : '')}
                              className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100 cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                              Whitelist
                            </button>
                          </div>
                        ) : r.classificacao === 'confiavel_usuario' && r.user_ip_conhecido_id ? (
                          <button
                            type="button"
                            disabled={processandoChave === chaveRevoke}
                            onClick={() => handleRevogarIpUsuario(r.user_ip_conhecido_id!, r.ip_texto)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                            Revogar
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        /* Sub-aba: Whitelist Corporativa */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <form
            onSubmit={handleAdicionarWhitelist}
            className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-4 h-fit"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Cadastrar Rede Confiável</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Aceita IP fixo (ex: <span className="font-mono">200.150.10.5</span>) ou faixa CIDR (ex: <span className="font-mono">200.150.10.0/24</span>).
                </p>
              </div>
            </div>

            {meuIp.ip && (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs">
                <span className="text-emerald-900">
                  Seu IP atual: <strong className="font-mono">{meuIp.ip}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setCidrInput(meuIp.ip || '');
                    if (!rotuloInput) setRotuloInput('Rede Corporativa');
                  }}
                  className="rounded-lg bg-emerald-700 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-800 cursor-pointer"
                >
                  Usar meu IP
                </button>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">IP ou Faixa CIDR *</label>
                <input
                  type="text"
                  required
                  value={cidrInput}
                  onChange={e => setCidrInput(e.target.value)}
                  placeholder="Ex: 200.150.10.5 ou 200.150.10.0/24"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Rótulo da Rede *</label>
                <input
                  type="text"
                  required
                  value={rotuloInput}
                  onChange={e => setRotuloInput(e.target.value)}
                  placeholder="Ex: Fábrica TEN — Link Principal"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Observação (opcional)</label>
                <input
                  type="text"
                  value={descricaoInput}
                  onChange={e => setDescricaoInput(e.target.value)}
                  placeholder="Ex: Operadora Vivo Fibra — portaria e ADM"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={salvandoCidr}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50 cursor-pointer"
            >
              {salvandoCidr ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Adicionar à Whitelist Corporativa
            </button>
          </form>

          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Redes Corporativas Cadastradas ({whitelist.length})</h3>
              <span className="text-[11px] text-slate-500">{regrasAtivasCount} ativas</span>
            </div>

            {whitelist.length === 0 ? (
              <div className="py-14 text-center px-4">
                <Network className="w-9 h-9 text-slate-300 mx-auto mb-2.5" />
                <p className="text-sm font-bold text-slate-700">Nenhuma rede corporativa cadastrada</p>
                <p className="text-xs text-slate-500 mt-1">
                  Adicione os IPs fixos ou faixas da empresa no formulário ao lado.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {whitelist.map(regra => (
                  <div
                    key={regra.id}
                    className={`px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      regra.ativo ? '' : 'bg-slate-50/70 opacity-70'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">
                          {regra.cidr}
                        </span>
                        <span className="text-xs font-bold text-slate-800">{regra.rotulo}</span>
                        {regra.ativo ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                            <CheckCircle2 className="w-3 h-3" />
                            Ativa
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                            Inativa
                          </span>
                        )}
                      </div>
                      {regra.descricao && (
                        <p className="text-[11px] text-slate-500 mt-1">{regra.descricao}</p>
                      )}
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Cadastrada em {formatDateTimeBR(regra.criado_em)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={processandoChave === `toggle:${regra.id}`}
                        onClick={() => handleAlternarRegra(regra)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                      >
                        <Check className="w-3 h-3" />
                        {regra.ativo ? 'Desativar' : 'Ativar'}
                      </button>
                      <button
                        type="button"
                        disabled={processandoChave === `del:${regra.id}`}
                        onClick={() => setRegraParaRemover(regra)}
                        aria-label={`Remover rede ${regra.rotulo}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        Remover
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {regraParaRemover && (
        <ConfirmDialog
          titulo="Remover rede confiável"
          mensagem={`Remover "${regraParaRemover.rotulo}" (${regraParaRemover.cidr}) da whitelist corporativa? Acessos desse IP passarão a aparecer como desconhecidos.`}
          confirmarLabel="Remover"
          variante="perigo"
          onConfirmar={handleConfirmarRemoverRegra}
          onCancelar={() => setRegraParaRemover(null)}
        />
      )}
    </div>
  );
}
