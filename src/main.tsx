import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ToastProvider } from './components/ui/Toast';
import { installConsoleLogBuffer } from './lib/consoleLogBuffer';
import { initResponsiveTables } from './lib/responsiveTableObserver';
import './index.css';

installConsoleLogBuffer();
initResponsiveTables();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
);
