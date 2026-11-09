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
