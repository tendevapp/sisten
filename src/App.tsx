import React, { useState, useEffect, useMemo, Suspense, lazy } from 'react';
import { localDb } from './db/localDb';
import { Profile, Role } from './types';
import { supabase } from './db/supabaseClient';
import { trackLogin, trackPageView } from './lib/usageTracker';
import { recordRecentPage } from './lib/homePrefs';
import { canAccessPage, canAccessFormGroup, pageIdForPath } from './lib/pages';
import { marcarDiaSessao, limparDiaSessao, sessaoExpirouNoDia } from './lib/sessaoDiaria';

// Components
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import ErrorBoundary, { CHUNK_RELOAD_GUARD_KEY } from './components/ErrorBoundary';
import { TourRegistryProvider } from './components/help/TourRegistryContext';
import FeedbackButton from './components/feedback/FeedbackButton';
import ForcePasswordChangeModal from './components/auth/ForcePasswordChangeModal';
import DataUpdateModal from './components/DataUpdateModal';
import ResumoLoginGate from './components/solicitacoes/ResumoLoginGate';

// Views
import Login from './views/Login';
import Signup from './views/Signup';
import ResetPassword from './views/ResetPassword';
const Dashboard = lazy(() => import('./views/Dashboard'));
const Materials = lazy(() => import('./views/Materials'));
const NewRequest = lazy(() => import('./views/NewRequest'));
const SolicitacoesCentral = lazy(() => import('./views/SolicitacoesCentral'));
const SapDashboards = lazy(() => import('./views/SapDashboards'));
const Helpdesk = lazy(() => import('./views/Helpdesk'));
const AdminPanel = lazy(() => import('./views/AdminPanel'));
const UsageDashboard = lazy(() => import('./views/UsageDashboard'));
const ProfileView = lazy(() => import('./views/ProfileView'));
const CadastrosSap = lazy(() => import('./views/CadastrosSap'));
const Reports = lazy(() => import('./views/Reports'));
const Compras = lazy(() => import('./views/Compras'));
const AnaliseCotacoes = lazy(() => import('./views/AnaliseCotacoes'));
const HistoricoPedidos = lazy(() => import('./views/HistoricoPedidos'));
const Contratos = lazy(() => import('./views/Contratos'));
const ContasPagar = lazy(() => import('./views/ContasPagar'));
const ContasPagarAnalise = lazy(() => import('./views/ContasPagarAnalise'));
const ReconciliacaoPedidos = lazy(() => import('./views/ReconciliacaoPedidos'));
const Fornecedores = lazy(() => import('./views/Fornecedores'));
const RastreioCompras = lazy(() => import('./views/RastreioCompras'));
const Estoque = lazy(() => import('./views/Estoque'));
const Movimentacoes = lazy(() => import('./views/Movimentacoes'));
const ConsumoSemanal = lazy(() => import('./views/ConsumoSemanal'));
const AlmoxarifadoDashboards = lazy(() => import('./views/AlmoxarifadoDashboards'));
const Sobre = lazy(() => import('./views/Sobre'));
const Formularios = lazy(() => import('./views/Formularios'));
const LogisticaExpedicao = lazy(() => import('./views/LogisticaExpedicao'));
const RhAseHoraExtra = lazy(() => import('./views/RhAseHoraExtra'));
const FreteEstimator = lazy(() => import('./views/FreteEstimator'));
const PendenciasProcessamento = lazy(() => import('./views/PendenciasProcessamento'));
const PortariaHub = lazy(() => import('./views/portaria/PortariaHub'));
const PortariaPassagemPlantao = lazy(() => import('./views/portaria/PortariaPassagemPlantao'));
const PortariaEquipamentos = lazy(() => import('./views/portaria/PortariaEquipamentos'));
const PortariaTransportes = lazy(() => import('./views/portaria/PortariaTransportes'));
const PortariaCarretas = lazy(() => import('./views/portaria/PortariaCarretas'));
const PortariaRelatorio = lazy(() => import('./views/portaria/PortariaRelatorio'));
const PortariaBriefing = lazy(() => import('./views/portaria/PortariaBriefing'));
const CadastrosAdmin = lazy(() => import('./views/CadastrosAdmin'));
const FacilitiesHome = lazy(() => import('./views/facilities/FacilitiesHome'));
const FacilitiesRotas = lazy(() => import('./views/facilities/FacilitiesRotas'));
const FacilitiesMateriais = lazy(() => import('./views/facilities/FacilitiesMateriais'));
const ModuleHome = lazy(() => import('./views/ModuleHome'));

// Remontar uma tela quando a sincronização em segundo plano chega apaga todo o
// estado local dela: formulário preenchido, filtros, busca, seleção, edição
// inline, texto sendo digitado. Como o sync dispara sozinho (polling de 5 min,
// volta de foco à aba e cada gravação que notifica o localDb), a regra é
// preservar por padrão — a lista abaixo é a exceção, não o contrário.
//
// Só entram aqui telas de leitura, sem nada que o usuário possa perder: o
// Início, os Relatórios e os hubs de módulo. Elas carregam dados no mount, então
// remontar é o que faz os números recém-sincronizados aparecerem.
const REMOUNT_ON_SYNC_PATHS = new Set<string>([
  '/',
  '/relatorios',
  '/suprimentos',
  '/almoxarifado',
  '/financeiro',
  '/admin',
  '/facilities',
  '/helpdesk/inicio',
]);

/**
 * Endereços que deixaram de existir e para onde levam hoje. O Painel SAP foi
 * absorvido pela Central Compras (que já carregava a mesma base de requisições
 * e ainda edita status/previsão em massa), e a própria Central saiu de
 * `/suprimentos/fornecedores-sem-po` — nome que só descrevia o recorte inicial
 * da tela — para `/suprimentos/compras`.
 *
 * A reescrita preserva a query porque os drill-downs dos Dashboards chegam com
 * `?status=`, `?alert=` ou `?buyer=`, e deixa o usuário com a URL canônica na
 * barra de endereços (link salvo antigo continua funcionando e se corrige
 * sozinho ao ser aberto).
 */
const LEGACY_PATH_REDIRECTS: Record<string, string> = {
  '/suprimentos/painel': '/suprimentos/compras',
  '/suprimentos/fornecedores-sem-po': '/suprimentos/compras',
};

// Telas com layout mestre-detalhe (lista + painel) que preenchem toda a
// altura visível e rolam internamente, em vez de rolar com a página. Antes
// simulavam isso com uma altura fixa em vh menos um "chute" de pixels para
// cabeçalho + preenchimento (`calc(100vh-100px)` + margem negativa para
// cancelar o padding do <main>). Esse chute só batia se o cabeçalho
// renderizasse com exatamente a altura assumida — qualquer diferença de
// fonte, zoom do navegador ou escala do Windows entre computadores fazia o
// conteúdo transbordar ou sobrar um vão, exigindo o usuário ajustar o zoom
// manualmente. Aqui o <main> deixa de aplicar seu padding para essas rotas e
// a própria tela ocupa 100% da altura computada pelo flexbox — sem números
// mágicos, então sempre bate com o espaço realmente disponível.
const FULL_BLEED_PATHS = new Set<string>([
  '/helpdesk',
  '/helpdesk/relatorios',
]);

function ViewLoadingFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center py-24">
      <svg className="h-8 w-8 text-blue-500 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
        <path d="M12 12L12 2M12 12L4 16.5M12 12L20 16.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<Profile | null>(null);
  const [simulatedRole, setSimulatedRole] = useState<Role | null>(() => {
    const saved = sessionStorage.getItem('simulated_role');
    return (saved as Role) || null;
  });

  const handleSimulateRole = (role: Role | null) => {
    setSimulatedRole(role);
    if (role) {
      sessionStorage.setItem('simulated_role', role);
    } else {
      sessionStorage.removeItem('simulated_role');
    }
  };

  const activeUser = useMemo(() => {
    return user && simulatedRole && user.roles.includes('admin')
      ? { ...user, roles: [simulatedRole], page_access: {} }
      : user;
  }, [user, simulatedRole]);

  const [currentPath, setCurrentPath] = useState<string>('/');
  const [loading, setLoading] = useState(true);
  // Incrementado quando a sincronização em segundo plano com o Supabase traz dados
  // novos, para que a tela ativa possa se atualizar sem esperar o usuário navegar.
  const [dataVersion, setDataVersion] = useState(0);

  // Mobile off-canvas sidebar
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Theme management (Dark / Light Mode)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return 'light';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark' && user) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme, user]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  // Um mount bem-sucedido confirma que os chunks atuais carregam normalmente,
  // então o guard de recarregamento único (ErrorBoundary) pode ser liberado
  // para a próxima vez que um deploy invalidar chunks antigos.
  useEffect(() => {
    sessionStorage.removeItem(CHUNK_RELOAD_GUARD_KEY);
  }, []);

  // Initialize DB and authenticate user.
  useEffect(() => {
    let authSubscription: any = null;

    (async () => {
      await localDb.ready;

      if (supabase) {
        const isRecovery = window.location.hash.includes('type=recovery') || 
                           window.location.hash.includes('recovery') || 
                           window.location.search.includes('type=recovery') ||
                           window.location.search.includes('code=');

        if (isRecovery) {
          setCurrentPath('/reset-password');
          localDb.setCurrentUser(null);
          setUser(null);
        }

        // Obter sessão inicial
        let { data: { session } } = await supabase.auth.getSession();

        // Expiração diária: se a sessão foi aberta em outro dia (virou a
        // meia-noite), descarta antes de restaurar — o usuário faz login
        // de novo. Zera `session` para cair no fluxo de "sem sessão".
        if (session && session.user && !isRecovery && sessaoExpirouNoDia()) {
          await supabase.auth.signOut().catch(() => {});
          limparDiaSessao();
          session = null;
        }

        if (session && session.user) {
          if (isRecovery) {
            // Em fluxo de recuperação de senha, NÃO busca profile nem marca usuário como logado
            setCurrentPath('/reset-password');
            localDb.setCurrentUser(null);
            setUser(null);
          } else {
            // Buscar profile atualizado
            const { data: profile } = await supabase
              .from('core_perfis')
              .select('*')
              .eq('id', session.user.id)
              .maybeSingle();

            if (profile && profile.status === 'ativo') {
              const mapped = { ...profile, roles: profile.roles || [], tours_seen: profile.tours_seen || {} };
              localDb.setCurrentUser(mapped);
              setUser(mapped);
              marcarDiaSessao();
              trackLogin(mapped);
              // Sincroniza logo de início se estiver com sessão ativa
              localDb.syncFromSupabase().catch(err => {
                console.error("Falha ao sincronizar cache local com o Supabase:", err);
              });
            } else {
              await supabase.auth.signOut();
              localDb.setCurrentUser(null);
              setUser(null);
            }
          }
        } else {
          if (!isRecovery) {
            localDb.setCurrentUser(null);
            setUser(null);
          }
        }

        // Ouvir mudanças de auth
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
          console.log(`Auth event: ${event}`);
          const inRecovery = isRecovery || 
                             window.location.hash.includes('type=recovery') || 
                             window.location.hash.includes('recovery') || 
                             window.location.search.includes('type=recovery');

          if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && inRecovery)) {
            console.log('Detectado evento de recuperação de senha — forçando rota /reset-password');
            setCurrentPath('/reset-password');
            setUser(null);
            return;
          } else if (session && session.user) {
            if (sessionStorage.getItem('is_signing_up') === 'true') {
              console.log('Ignorando login automático durante cadastro');
              return;
            }
            if (inRecovery) {
              console.log('Ignorando busca de profile durante recuperação de senha');
              return;
            }
            const { data: profile } = await supabase
              .from('core_perfis')
              .select('*')
              .eq('id', session.user.id)
              .maybeSingle();

            if (profile && profile.status === 'ativo') {
              const mapped = { ...profile, roles: profile.roles || [], tours_seen: profile.tours_seen || {} };
              localDb.setCurrentUser(mapped);
              setUser(mapped);
              marcarDiaSessao();
              trackLogin(mapped);
              // Sincroniza ao detectar login com sucesso
              localDb.syncFromSupabase().catch(err => {
                console.error("Falha ao sincronizar cache local com o Supabase:", err);
              });
            }
          } else if (event === 'SIGNED_OUT') {
            limparDiaSessao();
            localDb.setCurrentUser(null);
            setUser(null);
          }
        });
        authSubscription = subscription;
      } else {
        const currentUser = localDb.getCurrentUser();
        if (currentUser) {
          setUser(currentUser);
        }
      }

      setLoading(false);
    })();

    const unsubscribe = localDb.subscribe(() => setDataVersion(v => v + 1));

    // Custom Hash Router initialization
    const handleHashChange = () => {
      const hash = window.location.hash || '#/';
      if (hash.includes('type=recovery') || hash.includes('recovery')) {
        setCurrentPath('/reset-password');
        // Não sobrescreve window.location.hash para não apagar o token de autenticação
        return;
      }
      if (hash.includes('error_description') || hash.includes('error_code') || hash.includes('error=')) {
        setCurrentPath('/reset-password');
        return;
      }
      const pathWithParams = hash.slice(1); // remove '#'
      const pathOnly = pathWithParams.split('?')[0] || '/';

      const destinoLegado = LEGACY_PATH_REDIRECTS[pathOnly];
      if (destinoLegado) {
        // `replace` em vez de atribuir o hash: não deixa o endereço antigo no
        // histórico, então o "voltar" do navegador não cai num laço.
        window.location.replace(`#${destinoLegado}${pathWithParams.slice(pathOnly.length)}`);
        return;
      }
      
      // Limpa os caches de todas as páginas ao mudar de rota, exceto a do Catálogo SAP
      localDb.clearAllPageCachesExcept('materials');

      setCurrentPath(pathOnly);
    };

    window.addEventListener('hashchange', handleHashChange);
    handleHashChange(); // trigger on load

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      unsubscribe();
      if (authSubscription) {
        authSubscription.unsubscribe();
      }
    };
  }, []);

  // Sincronização automática em segundo plano:
  // 1. Verifica atualizações periodicamente (a cada 5 minutos) comparando carimbos de versão leves.
  // 2. Verifica atualizações imediatamente sempre que o usuário retornar o foco/visibilidade para a aba.
  // Um TTL de 60s dentro de syncFromSupabase (ver localDb.ts) absorve qualquer
  // sobreposição entre estes dois gatilhos e a troca de rota — ver plano de
  // egress, P1.

  useEffect(() => {
    if (!user || !supabase) return;

    // Polling leve a cada 5 minutos. Pula quando a aba está em segundo plano —
    // o handler de focus/visibilitychange abaixo já cobre a volta ao primeiro
    // plano, então não há motivo para gastar egress com a aba escondida.
    const intervalId = setInterval(() => {
      if (document.hidden) return;
      localDb.syncFromSupabase().catch(err => {
        console.warn("Falha na sincronização periódica automática:", err);
      });
    }, 5 * 60 * 1000);

    // Verificação instantânea ao reativar a aba (focus / visibilitychange)
    const handleFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        localDb.syncFromSupabase().catch(err => {
          console.warn("Falha na sincronização ao focar a página:", err);
        });
      }
    };

    window.addEventListener('focus', handleFocusOrVisible);
    document.addEventListener('visibilitychange', handleFocusOrVisible);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('focus', handleFocusOrVisible);
      document.removeEventListener('visibilitychange', handleFocusOrVisible);
    };
  }, [user?.id]);

  // Expiração diária da sessão: quando vira a meia-noite com o usuário
  // logado, faz logoff. Checa a cada minuto e também ao voltar o foco para
  // a aba (uma aba que passou a madrugada aberta expira assim que reativa).
  useEffect(() => {
    if (!user) return;

    const encerrarSePassouODia = async () => {
      if (!sessaoExpirouNoDia()) return;
      await localDb.logout();
      handleUserSessionChange();
    };

    const intervalId = setInterval(encerrarSePassouODia, 60 * 1000);
    const aoFocar = () => {
      if (document.visibilityState === 'visible') void encerrarSePassouODia();
    };
    window.addEventListener('focus', aoFocar);
    document.addEventListener('visibilitychange', aoFocar);

    void encerrarSePassouODia();

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('focus', aoFocar);
      document.removeEventListener('visibilitychange', aoFocar);
    };
  }, [user?.id]);

  // Telemetria de navegação: registra uma visualização de página sempre que a
  // rota muda com um usuário autenticado (fire-and-forget, não bloqueia a UI).
  // Não dispara mais um sync aqui: com o polling de 5 min + sync ao focar a
  // aba, um sync por troca de rota era redundante e, em sessões com muita
  // navegação, virava o maior gatilho de egress do app (ver plano, P1).
  useEffect(() => {
    if (user) {
      trackPageView(user, currentPath);
      // Histórico local de navegação para a seção "Recentes" da tela Início.
      recordRecentPage(currentPath);
    }
    // Depende de user?.id (não do objeto user) para não re-registrar a mesma
    // página quando o objeto de usuário é recriado (edição de perfil, sync).
  }, [currentPath, user?.id]);


  const handleNavigate = (path: string) => {
    window.location.hash = path;
    setMobileSidebarOpen(false);
  };

  const handleLoginSuccess = (authenticatedUser: Profile) => {
    setUser(authenticatedUser);
    marcarDiaSessao();
    handleNavigate('/');
  };

  const handleUserSessionChange = () => {
    const updatedUser = localDb.getCurrentUser();
    setUser(updatedUser);
    if (!updatedUser) {
      handleNavigate('/login');
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-900 text-slate-100">
        <div className="text-center space-y-3">
          <svg className="mx-auto h-12 w-12 text-blue-500 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
            <path d="M12 12L12 2M12 12L4 16.5M12 12L20 16.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <p className="text-sm font-semibold tracking-wider uppercase text-slate-400">Iniciando SISTEN...</p>
        </div>
      </div>
    );
  }

  // Redefinição de senha tem prioridade máxima de exibição
  if (currentPath === '/reset-password') {
    return <ResetPassword onNavigate={handleNavigate} />;
  }

  // Auth gate
  if (!user) {
    if (currentPath === '/cadastro') {
      return <Signup onNavigate={handleNavigate} />;
    }
    return <Login onLoginSuccess={handleLoginSuccess} onNavigate={handleNavigate} />;
  }

  // Reset de senha forçado pelo admin: bloqueia todo o app até o usuário
  // definir uma nova senha pessoal.
  if (user.must_change_password) {
    return (
      <ForcePasswordChangeModal
        user={user}
        onDone={handleUserSessionChange}
        onLogout={async () => {
          await localDb.logout();
          handleUserSessionChange();
        }}
      />
    );
  }

  // Render view depending on authorized route path
  const renderActiveView = () => {
    const user = activeUser;
    if (!user) return null;

    switch (currentPath) {
      case '/':
        return <Dashboard user={user} onNavigate={handleNavigate} />;
      
      case '/materiais/busca':
        if (canAccessPage(user, 'materiais_busca')) {
          return <Materials user={user} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      // Sobre: acesso universal (todos os perfis) por padrão, mas ainda pode
      // ser restringido explicitamente via page_access.
      case '/sobre':
        if (canAccessPage(user, 'sobre')) {
          return <Sobre user={user} onNavigate={handleNavigate} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      // Rastreio Compras: acesso universal (todos os perfis) por padrão, mas
      // ainda pode ser restringido explicitamente via page_access.
      case '/rastreio':
        if (canAccessPage(user, 'rastreio')) {
          return <RastreioCompras user={user} onNavigate={handleNavigate} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      // Formulários: acesso universal (todos os perfis) por padrão, mas ainda
      // pode ser restringido explicitamente via page_access.
      case '/formularios':
        if (canAccessPage(user, 'formularios')) {
          return <Formularios user={user} onNavigate={handleNavigate} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      // Os formulários vivem sob /formularios/* e respeitam as subpermissões por grupo:
      case '/formularios/portaria':
        if (canAccessPage(user, 'formularios') && canAccessFormGroup(user, 'portaria')) {
          return <PortariaHub user={user} onNavigate={handleNavigate} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/formularios/portaria-passagem-plantao':
        if (canAccessPage(user, 'formularios') && canAccessFormGroup(user, 'portaria')) {
          return <PortariaPassagemPlantao user={user} onNavigate={handleNavigate} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/formularios/portaria-equipamentos':
        if (canAccessPage(user, 'formularios') && canAccessFormGroup(user, 'portaria')) {
          return <PortariaEquipamentos user={user} onNavigate={handleNavigate} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/formularios/portaria-transportes':
        if (canAccessPage(user, 'formularios') && canAccessFormGroup(user, 'portaria')) {
          return <PortariaTransportes user={user} onNavigate={handleNavigate} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/formularios/portaria-carretas':
        if (canAccessPage(user, 'formularios') && canAccessFormGroup(user, 'portaria')) {
          return <PortariaCarretas user={user} onNavigate={handleNavigate} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/formularios/portaria-relatorio':
        if (canAccessPage(user, 'formularios') && canAccessFormGroup(user, 'portaria')) {
          return <PortariaRelatorio user={user} onNavigate={handleNavigate} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/formularios/portaria-briefing':
        if (canAccessPage(user, 'formularios') && canAccessFormGroup(user, 'portaria')) {
          return <PortariaBriefing user={user} onNavigate={handleNavigate} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/formularios/logistica-expedicao':
        if (canAccessPage(user, 'formularios') && canAccessFormGroup(user, 'logistica')) {
          return <LogisticaExpedicao user={user} onNavigate={handleNavigate} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/formularios/rh-ase-hora-extra':
        if (canAccessPage(user, 'formularios') && canAccessFormGroup(user, 'rh')) {
          return <RhAseHoraExtra user={user} onNavigate={handleNavigate} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/solicitacoes/nova':
        if (canAccessPage(user, 'sol_nova')) {
          return <NewRequest user={user} onNavigate={handleNavigate} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      // Rotas históricas: as três telas viraram abas da Central. Continuam vivas
      // porque estão em links salvos, em notificações já enviadas e nos atalhos
      // da tela Início — cada uma abre a Central já no escopo que prometia.
      case '/solicitacoes/minhas':
        return <SolicitacoesCentral user={user} onNavigate={handleNavigate} escopoInicial="minhas" />;

      case '/solicitacoes/todas':
        return (
          <SolicitacoesCentral
            user={user}
            onNavigate={handleNavigate}
            escopoInicial={canAccessPage(user, 'sol_todas') ? 'todas' : undefined}
          />
        );

      case '/solicitacoes/aprovacoes':
        return <SolicitacoesCentral user={user} onNavigate={handleNavigate} escopoInicial="acao" />;

      case '/suprimentos/dashboards':
        if (canAccessPage(user, 'sup_dashboards')) {
          return <SapDashboards onNavigate={handleNavigate} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      // Rota histórica: a antiga tela de Demandas virou uma aba da página de
      // Gestão de Suprimentos. Mantida viva para não quebrar link salvo — abre
      // a mesma página já na aba correspondente.
      case '/suprimentos/demandas':
        if (canAccessPage(user, 'sup_dashboards')) {
          return <SapDashboards onNavigate={handleNavigate} abaInicial="demandas" />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      // Rota histórica: a Análise de Compras virou uma aba da página de
      // Dashboards. Mantida viva para não quebrar link salvo.
      case '/suprimentos/historico/dashboards':
        if (canAccessPage(user, 'sup_dashboards')) {
          return <SapDashboards onNavigate={handleNavigate} abaInicial="compras" />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/suprimentos/compras':
        if (canAccessPage(user, 'sup_central_compras')) {
          return <Compras user={user} onNavigate={handleNavigate} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/suprimentos/cotacoes':
        if (canAccessPage(user, 'sup_analise_cotacoes')) {
          return <AnaliseCotacoes user={user} onNavigate={handleNavigate} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/suprimentos/historico':
        if (canAccessPage(user, 'sup_historico')) {
          return <HistoricoPedidos user={user} onNavigate={handleNavigate} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/suprimentos/fornecedores':
        if (canAccessPage(user, 'sup_fornecedores')) {
          return <Fornecedores user={user} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/suprimentos/contratos':
        if (canAccessPage(user, 'sup_contratos')) {
          return <Contratos user={user} onNavigate={handleNavigate} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/suprimentos/frete':
        if (canAccessPage(user, 'sup_estimador_frete')) {
          return <FreteEstimator user={user} onNavigate={handleNavigate} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/suprimentos/pendencias-processamento':
        if (canAccessPage(user, 'sup_pendencias_processamento')) {
          return <PendenciasProcessamento user={user} onNavigate={handleNavigate} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      // Rota histórica: o Diligenciamento deixou de ser página própria e virou
      // o conteúdo do filtro "Sem MIGO" da Central de Compras — é o mesmo
      // recorte (PO emitido, ainda sem chegada), então não fazia sentido ter
      // dois lugares para a mesma pergunta. Mantida viva para não quebrar link
      // salvo: abre a Central de Compras já no filtro "Sem MIGO".
      case '/suprimentos/diligenciamento':
        if (canAccessPage(user, 'sup_central_compras')) {
          return <Compras user={user} onNavigate={handleNavigate} poFilterInicial="Sem MIGO" />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/financeiro/contas-pagar':
        if (canAccessPage(user, 'fin_contas_pagar')) {
          return <ContasPagar user={user} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/financeiro/contas-pagar/analise':
        if (canAccessPage(user, 'fin_contas_pagar_analise')) {
          return <ContasPagarAnalise user={user} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/financeiro/reconciliacao-pedidos':
        if (canAccessPage(user, 'fin_reconciliacao_pedidos')) {
          return <ReconciliacaoPedidos user={user} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/helpdesk':
        if (canAccessPage(user, 'helpdesk_atendimento')) {
          return <Helpdesk user={user} onNavigate={handleNavigate} initialView="atendimento" />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/helpdesk/relatorios':
        if (canAccessPage(user, 'helpdesk_relatorios')) {
          return <Helpdesk user={user} onNavigate={handleNavigate} initialView="dashboard" />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/perfil':
        return <ProfileView user={user} onNavigate={handleNavigate} onProfileUpdate={handleUserSessionChange} />;

      case '/suprimentos/cadastros-sap':
        if (canAccessPage(user, 'sup_cadastros_sap')) {
          return <CadastrosSap user={user} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/relatorios':
        if (canAccessPage(user, 'relatorios')) {
          return <Reports user={user} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/almoxarifado/estoque':
        if (canAccessPage(user, 'almox_estoque')) {
          return <Estoque user={user} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/almoxarifado/movimentacoes':
        if (canAccessPage(user, 'almox_movimentacoes')) {
          return <Movimentacoes user={user} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      // Atalhos diretos para as análises: abrem a mesma página já na aba
      // correspondente, como as rotas históricas de /suprimentos/demandas.
      case '/almoxarifado/movimentacoes/giro':
        if (canAccessPage(user, 'almox_movimentacoes')) {
          return <Movimentacoes user={user} abaInicial="giro" />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/almoxarifado/movimentacoes/idade':
        if (canAccessPage(user, 'almox_movimentacoes')) {
          return <Movimentacoes user={user} abaInicial="idade" />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/almoxarifado/movimentacoes/urgencia':
        if (canAccessPage(user, 'almox_movimentacoes')) {
          return <Movimentacoes user={user} abaInicial="urgencia" />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/almoxarifado/consumo-semanal':
        if (canAccessPage(user, 'almox_consumo_semanal')) {
          return <ConsumoSemanal user={user} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/almoxarifado/movimentacoes/minimo':
        if (canAccessPage(user, 'almox_movimentacoes')) {
          return <Movimentacoes user={user} abaInicial="minimo" />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/almoxarifado/dashboards':
        if (canAccessPage(user, 'almox_dashboards')) {
          return <AlmoxarifadoDashboards user={user} onNavigate={handleNavigate} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      // Telas iniciais (hubs) dos módulos — grade de cards para as subpáginas
      // do módulo. O conteúdo vem de `lib/moduleHomes.ts`.
      case '/solicitacoes':
        if (canAccessPage(user, 'solicitacoes_home')) {
          return <SolicitacoesCentral user={user} onNavigate={handleNavigate} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/suprimentos':
        if (canAccessPage(user, 'suprimentos_home')) {
          return <ModuleHome user={user} onNavigate={handleNavigate} moduleId="suprimentos" />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/almoxarifado':
        if (canAccessPage(user, 'almoxarifado_home')) {
          return <ModuleHome user={user} onNavigate={handleNavigate} moduleId="almoxarifado" />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/financeiro':
        if (canAccessPage(user, 'financeiro_home')) {
          return <ModuleHome user={user} onNavigate={handleNavigate} moduleId="financeiro" />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/helpdesk/inicio':
        if (canAccessPage(user, 'helpdesk_home')) {
          return <ModuleHome user={user} onNavigate={handleNavigate} moduleId="helpdesk" />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/admin':
        if (canAccessPage(user, 'admin_home')) {
          return <ModuleHome user={user} onNavigate={handleNavigate} moduleId="admin" />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      // Módulo Facilities — hub + relatórios/cadastros alimentados pelos
      // formulários de Portaria e RH/ASE.
      case '/facilities':
        if (canAccessPage(user, 'facilities')) {
          return <FacilitiesHome user={user} onNavigate={handleNavigate} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/facilities/rotas':
        if (canAccessPage(user, 'facilities_rotas')) {
          return <FacilitiesRotas user={user} onNavigate={handleNavigate} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/facilities/materiais':
        if (canAccessPage(user, 'facilities_materiais')) {
          return <FacilitiesMateriais user={user} onNavigate={handleNavigate} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/admin/uso':
        if (canAccessPage(user, 'admin_uso')) {
          return <UsageDashboard />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/admin/cadastros':
        if (canAccessPage(user, 'admin_cadastros')) {
          return <CadastrosAdmin user={user} onNavigate={handleNavigate} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/admin/usuarios':
      case '/admin/setores':
      case '/admin/permissoes':
      case '/admin/importacao-materiais':
      case '/suprimentos/importar':
      case '/suprimentos/importar/log':
      case '/suprimentos/grupos-comprador':
      case '/admin/helpdesk':
      case '/admin/feedback':
      case '/admin/apis':
      case '/admin/diretrizes':
        if (canAccessPage(user, pageIdForPath(currentPath) as string)) {
          return <AdminPanel user={user} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      default:
        return <Dashboard user={user} onNavigate={handleNavigate} />;
    }
  };

  return (
    <TourRegistryProvider>
    <div className="flex h-full w-full overflow-hidden bg-slate-50/50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors">
      {/* Collapsible / off-canvas Sidebar */}
      <Sidebar
        user={activeUser}
        currentPath={currentPath}
        onNavigate={handleNavigate}
        theme={theme}
        toggleTheme={toggleTheme}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-950 transition-colors min-w-0">
        {/* Dynamic Header */}
        <Header
          user={user}
          simulatedRole={simulatedRole}
          onSimulateRole={handleSimulateRole}
          onUserChange={handleUserSessionChange}
          onNavigate={handleNavigate}
          onOpenMobileMenu={() => setMobileSidebarOpen(true)}
        />

        {/* Dynamic scrollable main pane view */}
        <main
          className={
            FULL_BLEED_PATHS.has(currentPath)
              ? 'flex-1 overflow-hidden'
              : 'flex-1 overflow-y-auto p-3 sm:p-6 pb-[calc(0.75rem+env(safe-area-inset-bottom))]'
          }
        >
          {/*
            ErrorBoundary chaveado pelo path: se o import() de uma tela lazy falhar
            (chunk antigo removido após um novo deploy) ou a tela lançar um erro de
            render, a árvore inteira ficava em branco até um F5, pois nada capturava
            o erro. A chave por currentPath garante que navegar para outra tela
            remonta o boundary e limpa o estado de erro.
          */}
          <ErrorBoundary key={currentPath}>
            <Suspense fallback={<ViewLoadingFallback />}>
              {/*
                Chave estável (só o path) por padrão: remontar destrói todo o estado
                local da tela — formulário, filtros, busca, edição inline, rascunho,
                texto sendo digitado — e o sync chega sozinho, no meio do trabalho.

                Só as telas de leitura de REMOUNT_ON_SYNC_PATHS incluem dataVersion na
                chave, para reexibir os números que acabaram de ser sincronizados.
              */}
              <div
                key={REMOUNT_ON_SYNC_PATHS.has(currentPath) ? `${currentPath}:${dataVersion}` : currentPath}
                className={FULL_BLEED_PATHS.has(currentPath) ? 'h-full' : undefined}
              >
                {renderActiveView()}
              </div>
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
      <FeedbackButton pagePath={currentPath} />
      <DataUpdateModal currentPath={currentPath} />
      {activeUser && <ResumoLoginGate user={activeUser} onNavigate={handleNavigate} />}
    </div>
    </TourRegistryProvider>
  );
}
