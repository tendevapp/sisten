/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { localDb } from './db/localDb';
import { Profile } from './types';

// Components
import Sidebar from './components/Sidebar';
import Header from './components/Header';

// Views
import Login from './views/Login';
import Signup from './views/Signup';
import Dashboard from './views/Dashboard';
import Materials from './views/Materials';
import NewRequest from './views/NewRequest';
import MyRequests from './views/MyRequests';
import Approvals from './views/Approvals';
import SapPanel from './views/SapPanel';
import SapDashboards from './views/SapDashboards';
import Helpdesk from './views/Helpdesk';
import AdminPanel from './views/AdminPanel';
import ProfileView from './views/ProfileView';
import CadastrosSap from './views/CadastrosSap';
import Reports from './views/Reports';

export default function App() {
  const [user, setUser] = useState<Profile | null>(null);
  const [currentPath, setCurrentPath] = useState<string>('/');
  const [loading, setLoading] = useState(true);

  // Theme management (Dark / Light Mode)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return 'light';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  // Initialize DB and authenticate user
  useEffect(() => {
    (async () => {
      try {
        await localDb.syncFromSupabase();
      } catch (err) {
        console.error("Falha ao sincronizar cache local com o Supabase:", err);
      }

      // Check session
      const currentUser = localDb.getCurrentUser();
      if (currentUser) {
        setUser(currentUser);
      }

      setLoading(false);
    })();

    // Custom Hash Router initialization
    const handleHashChange = () => {
      // Parse hash path, e.g., #/solicitacoes/nova?id=123 -> /solicitacoes/nova
      const hash = window.location.hash || '#/';
      const pathWithParams = hash.slice(1); // remove '#'
      const pathOnly = pathWithParams.split('?')[0] || '/';
      setCurrentPath(pathOnly);
    };

    window.addEventListener('hashchange', handleHashChange);
    handleHashChange(); // trigger on load

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
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
    return <Login onLoginSuccess={handleLoginSuccess} onNavigate={handleNavigate} />;
  }

  // Render view depending on authorized route path
  const renderActiveView = () => {
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
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50/50">
      {/* Collapsible Sidebar */}
      <Sidebar 
        user={user} 
        currentPath={currentPath} 
        onNavigate={handleNavigate} 
        theme={theme}
        toggleTheme={toggleTheme}
      />

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Dynamic Header */}
        <Header 
          user={user} 
          onUserChange={handleUserSessionChange} 
          onNavigate={handleNavigate} 
        />

        {/* Dynamic scrollable main pane view */}
        <main className="flex-1 overflow-y-auto p-6">
          {renderActiveView()}
        </main>
      </div>
    </div>
  );
}
