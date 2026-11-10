import { createRoot } from 'react-dom/client';
import Root from './App';

const el = document.getElementById('root');
if (!el) throw new Error('root element missing');
createRoot(el).render(<Root />);

// The service worker is registered in production builds only, so `vite dev`
// never serves a stale cached bundle.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // The worker lives next to index.html and is served from the public dir.
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {
      /* offline support is best-effort */
    });
  });
}
