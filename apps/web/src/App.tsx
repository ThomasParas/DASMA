import { useEffect, useState } from 'react';
import { isSupportedBrowser } from './browser';
import { StorageUnavailableError } from './db/repo';
import { FixTags } from './fix/FixTags';
import { useRoute, type Route } from './router';
import { ImportScreen } from './screens/ImportScreen';
import { Library } from './screens/Library';
import { NotFound } from './screens/NotFound';
import { Production } from './screens/Production';
import { ServicesContext, type Services } from './services';

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'library':
      return <Library />;
    case 'new':
      return <ImportScreen />;
    case 'import':
      return <ImportScreen productionId={route.id} />;
    case 'production':
      return <Production id={route.id} />;
    case 'fix':
      return <FixTags key={route.id} productionId={route.id} />;
    default:
      return <NotFound />;
  }
}

export function App({ services }: { services: Services }) {
  const [state, setState] = useState<'opening' | 'ready' | 'blocked'>('opening');
  const route = useRoute();
  useEffect(() => {
    services.repo.open().then(
      () => setState('ready'),
      () => setState('blocked'),
    );
  }, [services]);

  if (state === 'blocked') {
    return (
      <main className="page">
        <h1>DASMA</h1>
        <p>{new StorageUnavailableError().message}</p>
      </main>
    );
  }
  if (state === 'opening') return null;
  return (
    <ServicesContext.Provider value={services}>
      {!isSupportedBrowser(navigator.userAgent) && (
        <p className="notice">DASMA is built for Chrome and Edge. Other browsers may work, but aren't tested yet.</p>
      )}
      <Screen route={route} />
    </ServicesContext.Provider>
  );
}
