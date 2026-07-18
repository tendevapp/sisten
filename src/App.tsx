import React, { useState, useEffect, Suspense, lazy } from 'react';
import { localDb } from './db/localDb';
import { Profile, Role } from './types';
import { supabase } from './db/supabaseClient';

// Components
import Sidebar from './components/Sidebar';
import Header from './components/Header';

// Views
import Login from './views/Login';
import Signup from './views/Signup';
import ResetPassword from './views/ResetPassword';
const Dashboard = lazy(() => import('./views/Dashboard'));
const Materials = lazy(() => import('./views/Materials'));
const NewRequest = lazy(() => import('./views/NewRequest'));
const MyRequests = lazy(() => import('./views/MyRequests'));
const Approvals = lazy(() => import('./views/Approvals'));
const SapPanel = lazy(() => import('./views/SapPanel'));
const SapDashboards = lazy(() => import('./views/SapDashboards'));
const DemandDashboard = lazy(() => import('./views/DemandDashboard'));
const Helpdesk = lazy(() => import('./views/Helpdesk'));
const AdminPanel = lazy(() => import('./views/AdminPanel'));
const ProfileView = lazy(() => import('./views/ProfileView'));
const CadastrosSap = lazy(() => import('./views/CadastrosSap'));
const Reports = lazy(() => import('./views/Reports'));
const SuppliersNoPO = lazy(() => import('./views/SuppliersNoPO'));
const HistoricoPedidos = lazy(() => import('./views/HistoricoPedidos'));
const Fornecedores = lazy(() => import('./views/Fornecedores'));

// Telas que mantêm trabalho em andamento do usuário (formulários, filtros, buscas,
// edições inline, rascunhos, textos sendo digitados). Elas NÃO devem ser remontadas
// quando a sincronização em segundo plano chega, pois isso apagaria o estado local.
// As demais (Início, Relatórios, Dashboards) são de leitura e podem remontar para
// refletir os dados recém-sincronizados.
const STATE_PRESERVING_PATHS = new Set<string>([
  '/solicitacoes/nova',
  '/solicitacoes/minhas',
  '/solicitacoes/aprovacoes',
  '/materiais/busca',
  '/suprimentos/painel',
  '/suprimentos/demandas',
  '/suprimentos/fornecedores-sem-po',
  '/suprimentos/historico',
  '/suprimentos/fornecedores',
  '/suprimentos/cadastros-sap',
  '/helpdesk',
  '/helpdesk/relatorios',
  '/perfil',
  '/admin/usuarios',
  '/admin/setores',
  '/admin/permissoes',
  '/admin/importacao-materiais',
  '/admin/helpdesk',
  '/suprimentos/importar',
  '/suprimentos/importar/log',
  '/suprimentos/grupos-comprador',
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
    ? { ...user, roles: [simulatedRole] }
    : user;

  const [currentPath, setCurrentPath] = useState<string>('/');
  const [loading, setLoading] = useState(true);
  // Incrementado quando a sincronização em segundo plano com o Supabase traz dados
  // novos, para que a tela ativa possa se atualizar sem esperar o usuário navegar.
  const [dataVersion, setDataVersion] = useState(0);

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
            const mapped = { ...profile, roles: profile.roles || [] };
            localDb.setCurrentUser(mapped);
            setUser(mapped);
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
              const mapped = { ...profile, roles: profile.roles || [] };
              localDb.setCurrentUser(mapped);
              setUser(mapped);
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

  const handleNavigate = (path: string) => {
    window.location.hash = path;
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
        return <Materials user={user} />;
      
      case '/solicitacoes/nova':
        return <NewRequest user={user} onNavigate={handleNavigate} />;
      
      case '/solicitacoes/minhas':
        return <MyRequests user={user} />;
      
      case '/solicitacoes/aprovacoes':
        if (user.roles.includes('gestor') || user.roles.includes('admin') || user.roles.includes('coordenador_suprimentos')) {
          return <Approvals user={user} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/suprimentos/painel':
        if (localDb.hasPermission(user, 'sap', 'visualizar_painel')) {
          return <SapPanel user={user} onNavigate={handleNavigate} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/suprimentos/dashboards':
        if (localDb.hasPermission(user, 'sap', 'dashboards')) {
          return <SapDashboards onNavigate={handleNavigate} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/suprimentos/demandas':
        if (localDb.hasPermission(user, 'sap', 'dashboards')) {
          return <DemandDashboard />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/suprimentos/fornecedores-sem-po':
        if (localDb.hasPermission(user, 'sap', 'fornecedores')) {
          return <SuppliersNoPO user={user} onNavigate={handleNavigate} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/suprimentos/historico':
        if (localDb.hasPermission(user, 'sap', 'fornecedores')) {
          return <HistoricoPedidos user={user} onNavigate={handleNavigate} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/suprimentos/fornecedores':
        if (user.roles.includes('admin') || user.roles.includes('comprador')) {
          return <Fornecedores user={user} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/helpdesk':
        if (user.roles.includes('atendente') || user.roles.includes('admin')) {
          return <Helpdesk user={user} onNavigate={handleNavigate} initialView="atendimento" />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/helpdesk/relatorios':
        if (user.roles.includes('atendente') || user.roles.includes('admin')) {
          return <Helpdesk user={user} onNavigate={handleNavigate} initialView="dashboard" />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/perfil':
        return <ProfileView user={user} onNavigate={handleNavigate} onProfileUpdate={handleUserSessionChange} />;

      case '/suprimentos/cadastros-sap':
        if (user.roles.includes('admin') || user.roles.includes('coordenador_suprimentos') || user.roles.includes('comprador')) {
          return <CadastrosSap user={user} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      case '/relatorios':
        return <Reports user={user} />;

      case '/admin/usuarios':
      case '/admin/setores':
      case '/admin/permissoes':
      case '/admin/importacao-materiais':
      case '/suprimentos/importar':
      case '/suprimentos/importar/log':
      case '/suprimentos/grupos-comprador':
      case '/admin/helpdesk':
        if (user.roles.includes('admin') || user.roles.includes('coordenador_suprimentos')) {
          return <AdminPanel user={user} />;
        }
        return <Dashboard user={user} onNavigate={handleNavigate} />;

      default:
        return <Dashboard user={user} onNavigate={handleNavigate} />;
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50/50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors">
      {/* Collapsible Sidebar */}
      <Sidebar 
        user={activeUser} 
        currentPath={currentPath} 
        onNavigate={handleNavigate} 
        theme={theme}
        toggleTheme={toggleTheme}
      />

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-950 transition-colors">
        {/* Dynamic Header */}
        <Header 
          user={user} 
          simulatedRole={simulatedRole}
          onSimulateRole={handleSimulateRole}
          onUserChange={handleUserSessionChange} 
          onNavigate={handleNavigate} 
        />

        {/* Dynamic scrollable main pane view */}
        <main className="flex-1 overflow-y-auto p-6">
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
            <div key={STATE_PRESERVING_PATHS.has(currentPath) ? currentPath : `${currentPath}:${dataVersion}`}>
              {renderActiveView()}
            </div>
          </Suspense>
        </main>
      </div>
    </div>
  );
}
