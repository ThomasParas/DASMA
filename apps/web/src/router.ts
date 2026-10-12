import { useEffect, useState } from 'react';

export type Route =
  | { name: 'library' }
  | { name: 'new' }
  | { name: 'production'; id: string }
  | { name: 'import'; id: string }
  | { name: 'fix'; id: string }
  | { name: 'reimport'; id: string }
  | { name: 'notFound' };

export type AppRoute = Exclude<Route, { name: 'notFound' }>;

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '') || '/';
  if (path === '/') return { name: 'library' };
  if (path === '/new') return { name: 'new' };
  const m = /^\/p\/([^/]+)(?:\/(import|fix|reimport))?$/.exec(path);
  if (!m) return { name: 'notFound' };
  let id: string;
  try {
    id = decodeURIComponent(m[1]);
  } catch {
    return { name: 'notFound' };
  }
  return m[2] ? { name: m[2] as 'import' | 'fix' | 'reimport', id } : { name: 'production', id };
}

export function href(route: AppRoute): string {
  switch (route.name) {
    case 'library':
      return '#/';
    case 'new':
      return '#/new';
    case 'production':
      return `#/p/${encodeURIComponent(route.id)}`;
    default:
      return `#/p/${encodeURIComponent(route.id)}/${route.name}`;
  }
}

export function navigate(route: AppRoute): void {
  window.location.hash = href(route);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
