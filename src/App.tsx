import React, { useState, useEffect, Suspense, lazy } from 'react';
import { localDb } from './db/localDb';
import { Profile, Role } from './types';
import { supabase } from './db/supabaseClient';
import { trackLogin, trackPageView } from './lib/usageTracker';
import { canAccessPage, pageIdForPath } from './lib/pages';

// Components
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import ErrorBoundary, { CHUNK_RELOAD_GUARD_KEY } from './components/ErrorBoundary';
import { TourRegistryProvider } from './components/help/TourRegistryContext';
import FeedbackButton from './components/feedback/FeedbackButton';

// Views
import Login from './views/Login';
import Signup from './views/Signup';
import ResetPassword from './views/ResetPassword';
const Dashboard = lazy(() => import('./views/Dashboard'));
const Materials = lazy(() => import('./views/Materials'));
const NewRequest = lazy(() => import('./views/NewRequest'));
const MyRequests = lazy(() => import('./views/MyRequests'));
const Solicitacoes = lazy(() => import('./views/Solicitacoes'));
const Approvals = lazy(() => import('./views/Approvals'));
const SapPanel = lazy(() => import('./views/SapPanel'));
const SapDashboards = lazy(() => import('./views/SapDashboards'));
const Helpdesk = lazy(() => import('./views/Helpdesk'));
const AdminPanel = lazy(() => import('./views/AdminPanel'));
const UsageDashboard = lazy(() => import('./views/UsageDashboard'));
const ProfileView = lazy(() => import('./views/ProfileView'));
const CadastrosSap = lazy(() => import('./views/CadastrosSap'));
const Reports = lazy(() => import('./views/Reports'));
const SuppliersNoPO = lazy(() => import('./views/SuppliersNoPO'));
const AnaliseCotacoes = lazy(() => import('./views/AnaliseCotacoes'));
const HistoricoPedidos = lazy(() => import('./views/HistoricoPedidos'));
const Contratos = lazy(() => import('./views/Contratos'));
const ContasPagar = lazy(() => import('./views/ContasPagar'));
const ContasPagarAnalise = lazy(() => import('./views/ContasPagarAnalise'));
const Fornecedores = lazy(() => import('./views/Fornecedores'));
const RastreioCompras = lazy(() => import('./views/RastreioCompras'));
const Estoque = lazy(() => import('./views/Estoque'));
const Movimentacoes = lazy(() => import('./views/Movimentacoes'));
const ConsumoSemanal = lazy(() => import('./views/ConsumoSemanal'));
const AlmoxarifadoDashboards = lazy(() => import('./views/AlmoxarifadoDashboards'));
const Sobre = lazy(() => import('./views/Sobre'));
const Formularios = lazy(() => import('./views/Formularios'));
const LogisticaExpedicao = lazy(() => import('./views/LogisticaExpedicao'));
const FreteEstimator = lazy(() => import('./views/FreteEstimator'));

// Telas que mantêm trabalho em andamento do usuário (formulários, filtros, buscas,
// edições inline, rascunhos, textos sendo digitados). Elas NÃO devem ser remontadas
// quando a sincronização em segundo plano chega, pois isso apagaria o estado local.
// As demais (Início, Relatórios) são de leitura e podem remontar para
// refletir os dados recém-sincronizados.
const STATE_PRESERVING_PATHS = new Set<string>([
  '/solicitacoes/nova',
  '/solicitacoes/minhas',
  // Mantém filtros, seleção e a resposta sendo digitada — remontar a cada
  // sincronização jogaria fora o recorte e o texto do usuário.
  '/solicitacoes/todas',
  '/solicitacoes/aprovacoes',
  '/materiais/busca',
  '/suprimentos/painel',
  // A página de Gestão de Suprimentos passou a manter filtros e aba ativa —
  // remontá-la a cada sincronização em segundo plano jogaria fora o recorte
  // que o usuário acabou de montar.
  '/suprimentos/dashboards',
  '/suprimentos/demandas',
  '/suprimentos/fornecedores-sem-po',
  // Mantém a fila de importação (arquivos em memória, resultados já
  // convertidos), o markdown colado, a grade em revisão e o processo aberto —
  // remontar a cada sincronização em segundo plano jogaria fora a extração.
  '/suprimentos/cotacoes',
  '/suprimentos/historico',
  '/suprimentos/historico/dashboards',
  '/suprimentos/fornecedores',
  '/suprimentos/contratos',
  '/financeiro/contas-pagar',
  '/financeiro/contas-pagar/analise',
  '/suprimentos/cadastros-sap',
  '/helpdesk',
  '/helpdesk/relatorios',
  '/perfil',
  '/admin/usuarios',
  '/admin/setores',
  '/admin/permissoes',
  '/admin/importacao-materiais',
  '/admin/helpdesk',
  '/admin/uso',
  '/admin/feedback',
  '/admin/diretrizes',
  '/suprimentos/importar',
  '/suprimentos/importar/log',
  '/suprimentos/grupos-comprador',
  '/rastreio',
  '/almoxarifado/estoque',
  '/almoxarifado/movimentacoes',
  '/almoxarifado/movimentacoes/giro',
  '/almoxarifado/movimentacoes/idade',
  '/almoxarifado/movimentacoes/urgencia',
  '/almoxarifado/movimentacoes/minimo',
  // Mantém material selecionado, filtros e ordenação da lista — remontar a
  // cada sincronização em segundo plano jogaria fora o recorte montado.
  '/almoxarifado/consumo-semanal',
  '/almoxarifado/dashboards',
  // A página Sobre é só leitura, mas remontá-la a cada sincronização em segundo
  // plano reiniciaria as animações de entrada no meio da leitura.
  '/sobre',
  '/formularios',
  // Formulário longo, preenchido ao longo do dia: remontar a cada sync em
  // segundo plano jogaria fora os campos digitados e ainda não salvos.
  '/formularios/logistica-expedicao',
]);

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
  '/solicitacoes/aprovacoes',
  '/solicitacoes/minhas',
  '/helpdesk',
  '/helpdesk/relatorios',
  '/suprimentos/painel',
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

  const activeUser = user && simulatedRole && user.roles.includes('admin')
    ? { ...user, roles: [simulatedRole], page_access: {} }
    : user;

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
        // Obter sessão inicial
        const { data: { session } } = await supabase.auth.getSession();
        if (session && session.user) {
          // Buscar profile atualizado
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();

          if (profile && profile.status === 'ativo') {
            const mapped = { ...profile, roles: profile.roles || [], tours_seen: profile.tours_seen || {} };
            localDb.setCurrentUser(mapped);
            setUser(mapped);
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
        } else {
          localDb.setCurrentUser(null);
          setUser(null);
        }

        // Ouvir mudanças de auth
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
          console.log(`Auth event: ${event}`);
          if (event === 'PASSWORD_RECOVERY') {
            handleNavigate('/reset-password');
          } else if (session && session.user) {
            if (sessionStorage.getItem('is_signing_up') === 'true') {
              console.log('Ignorando login automático durante cadastro');
              return;
            }
            const { data: profile } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', session.user.id)
              .maybeSingle();

            if (profile && profile.status === 'ativo') {
              const mapped = { ...profile, roles: profile.roles || [], tours_seen: profile.tours_seen || {} };
              localDb.setCurrentUser(mapped);
              setUser(mapped);
              trackLogin(mapped);
              // Sincroniza ao detectar login com sucesso
              localDb.syncFromSupabase().catch(err => {
                console.error("Falha ao sincronizar cache local com o Supabase:", err);
              });
            }
          } else if (event === 'SIGNED_OUT') {
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
        window.location.hash = '/reset-password';
        return;
      }
      if (hash.includes('error_description') || hash.includes('error_code') || hash.includes('error=')) {
        setCurrentPath('/reset-password');
        return;
      }
      const pathWithParams = hash.slice(1); // remove '#'
      const pathOnly = pathWithParams.split('?')[0] || '/';
      
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

  // Telemetria de navegação: registra uma visualização de página sempre que a
  // rota muda com um usuário autenticado (fire-and-forget, não bloqueia a UI).
  // Não dispara mais um sync aqui: com o polling de 5 min + sync ao focar a
  // aba, um sync por troca de rota era redundante e, em sessões com muita
  // navegação, virava o maior gatilho de egress do app (ver plano, P1).
  useEffect(() => {
    if (user) {
      trackPageView(user, currentPath);
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

  // Auth gate
  if (!user) {
    if (currentPath === '/cadastro') {
      return <Signup onNavigate={handleNavigate} />;
    }
    if (currentPath === '/reset-password') {
      return <ResetPassword onNavigate={handleNavigate} />;
    }
    return <Login onLoginSuccess={handleLoginSuccess} onNavigate={handleNavigate} />;
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
          return <Formularios onNavigate={handleNavigate} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      // Os formulários vivem sob /formularios/*, mas compartilham o gate da
      // página que os reúne — quem enxerga o hub opera os formulários.
      case '/formularios/logistica-expedicao':
        if (canAccessPage(user, 'formularios')) {
          return <LogisticaExpedicao user={user} onNavigate={handleNavigate} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/solicitacoes/nova':
        if (canAccessPage(user, 'sol_nova')) {
          return <NewRequest user={user} onNavigate={handleNavigate} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/solicitacoes/minhas':
        if (canAccessPage(user, 'sol_minhas')) {
          return <MyRequests user={user} onNavigate={handleNavigate} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;
      
      case '/solicitacoes/todas':
        if (canAccessPage(user, 'sol_todas')) {
          return <Solicitacoes user={user} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/solicitacoes/aprovacoes':
        if (canAccessPage(user, 'sol_aprovacoes')) {
          return <Approvals user={user} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/suprimentos/painel':
        if (canAccessPage(user, 'sup_painel')) {
          return <SapPanel user={user} onNavigate={handleNavigate} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

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

      case '/suprimentos/fornecedores-sem-po':
        if (canAccessPage(user, 'sup_central_compras')) {
          return <SuppliersNoPO user={user} onNavigate={handleNavigate} />;
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

      case '/admin/uso':
        if (canAccessPage(user, 'admin_uso')) {
          return <UsageDashboard />;
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
                A chave inclui dataVersion para forçar remontagem quando a sincronização
                em segundo plano traz dados novos — útil para telas de leitura que carregam
                dados apenas no mount (Início, Relatórios, Dashboards).

                PORÉM, remontar destrói todo o estado local da tela (formulários, filtros,
                buscas, edições inline, rascunhos, textos sendo digitados). Em telas onde o
                usuário está trabalhando, isso apagaria o que ele faz quando o sync chega.
                Por isso essas telas usam uma chave estável (só o path), sem dataVersion.
              */}
              <div
                key={STATE_PRESERVING_PATHS.has(currentPath) ? currentPath : `${currentPath}:${dataVersion}`}
                className={FULL_BLEED_PATHS.has(currentPath) ? 'h-full' : undefined}
              >
                {renderActiveView()}
              </div>
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
      <FeedbackButton pagePath={currentPath} />
    </div>
    </TourRegistryProvider>
  );
}
