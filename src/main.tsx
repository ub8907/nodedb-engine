// Guard against environments where window.fetch has only a getter
try {
  if (typeof window !== 'undefined') {
    const originalFetch = window.fetch ? window.fetch.bind(window) : null;
    let currentFetch = originalFetch;
    Object.defineProperty(window, 'fetch', {
      get() {
        return currentFetch || originalFetch;
      },
      set(val) {
        currentFetch = val;
      },
      configurable: true,
      enumerable: true
    });
  }
} catch (_) {}

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
