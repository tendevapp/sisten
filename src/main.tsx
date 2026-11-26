import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ToastProvider } from './components/ui/Toast';
import { installConsoleLogBuffer } from './lib/consoleLogBuffer';
import { initResponsiveTables } from './lib/responsiveTableObserver';
import { instalarProtecaoCampoNumerico } from './lib/protecaoCampoNumerico';
import { initRolagemSuperiorTabelas } from './lib/rolagemSuperiorTabelas';
import { initAssociarRotulos } from './lib/associarRotulos';
import './index.css';

installConsoleLogBuffer();
// A fila offline (formulários, checklists, outbox) mora no IndexedDB. Sem
// armazenamento persistente, o navegador pode apagá-lo quando o celular fica
// sem espaço — e com ele registros que ainda não subiram. Pedir não custa:
// o Chrome concede sem perguntar para PWA instalado/site muito usado.
try { void navigator.storage?.persist?.().catch(() => {}); } catch { /* navegador sem a API */ }
initResponsiveTables();
initRolagemSuperiorTabelas();
initAssociarRotulos();
instalarProtecaoCampoNumerico();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
);
