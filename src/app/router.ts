import { useCallback, useEffect, useState } from 'react';

/**
 * Minimal hash router.
 *
 * The whole app runs from a static bundle (and must work offline as a PWA), so
 * a tiny hash router beats pulling in a router dependency. Routes are plain
 * strings; params are encoded in the hash after the route name.
 */

export type Route =
  | { name: 'home' }
  | { name: 'learn' }
  | { name: 'lesson'; id: string }
  | { name: 'levels' }
  | { name: 'level'; id: string }
  | { name: 'battle' }
  | { name: 'online' }
  | { name: 'practice' }
  | { name: 'daily' }
  | { name: 'review' }
  | { name: 'review-game'; id: string }
  | { name: 'mistakes' }
  | { name: 'profile' }
  | { name: 'library' }
  | { name: 'patterns' };

function parse(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '');
  const [path, arg] = clean.split('/');
  switch (path) {
    case '':
    case 'home':
      return { name: 'home' };
    case 'learn':
      return { name: 'learn' };
    case 'lesson':
      return { name: 'lesson', id: arg ?? '' };
    case 'levels':
      return { name: 'levels' };
    case 'level':
      return { name: 'level', id: arg ?? '' };
    case 'battle':
      return { name: 'battle' };
    case 'online':
      return { name: 'online' };
    case 'practice':
      return { name: 'practice' };
    case 'daily':
      return { name: 'daily' };
    case 'review':
      return { name: 'review' };
    case 'game':
      return { name: 'review-game', id: arg ?? '' };
    case 'mistakes':
      return { name: 'mistakes' };
    case 'profile':
      return { name: 'profile' };
    case 'library':
      return { name: 'library' };
    case 'patterns':
      return { name: 'patterns' };
    default:
      return { name: 'home' };
  }
}

export function routeToHash(r: Route): string {
  switch (r.name) {
    case 'home':
      return '#/';
    case 'lesson':
      return `#/lesson/${r.id}`;
    case 'level':
      return `#/level/${r.id}`;
    case 'review-game':
      return `#/game/${r.id}`;
    default:
      return `#/${r.name}`;
  }
}

export function useRoute() {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));

  useEffect(() => {
    const onHash = () => setRoute(parse(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = useCallback((r: Route, replace = false) => {
    const hash = routeToHash(r);
    if (replace) {
      window.history.replaceState(null, '', hash);
      setRoute(r);
    } else if (window.location.hash === hash) {
      setRoute(parse(hash));
    } else {
      window.location.hash = hash;
    }
    document.querySelector('.app-main')?.scrollTo({ top: 0 });
  }, []);

  const back = useCallback(() => {
    if (window.history.length > 1) window.history.back();
    else {
      window.location.hash = '#/';
    }
  }, []);

  return { route, go, back };
}

export type Navigate = (r: Route, replace?: boolean) => void;
