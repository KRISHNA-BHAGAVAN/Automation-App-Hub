import { createRoot } from 'react-dom/client';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';

import './index.css';

// In AI Studio Build runtime environment: HMR is disabled, ignore WebSocket errors
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    const msg = String(event.message || event.error?.message || '');
    if (
      msg.includes('WebSocket') ||
      msg.includes('ws://') ||
      msg.includes('wss://') ||
      event.filename?.includes('@vite/client')
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = String(event.reason?.message || event.reason || '');
    if (
      reason.includes('WebSocket') ||
      reason.includes('ws://') ||
      reason.includes('wss://') ||
      reason.includes('@vite/client')
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  });
}

createRoot(document.getElementById('root')!, {
  onCaughtError: (error, errorInfo) => {
    console.warn('[React Caught Error]', error, errorInfo?.componentStack || '');
  },
  onUncaughtError: (error, errorInfo) => {
    console.warn('[React Uncaught Error]', error, errorInfo?.componentStack || '');
  },
  onRecoverableError: (error, errorInfo) => {
    console.warn('[React Recoverable Error]', error, errorInfo?.componentStack || '');
  },
}).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
