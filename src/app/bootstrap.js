import { createLocalStore } from '../core/storage/local-store.js';
import { createSessionStore } from '../core/storage/session-store.js';
import { FocusEngine } from '../core/focus/focus-engine.js';
import { RemoteControl } from '../core/focus/remote-control.js';
import { createInitialState, DEFAULT_PLAYER_STATE, DEFAULT_PREFERENCES, DEFAULT_SOURCES_STATE, DEFAULT_USER_STATE } from '../state/schema.js';
import { createStore } from '../state/store.js';
import { Router } from '../router/router.js';
import { SourceManager } from '../services/source-manager.js';
import { AppShell } from './app-shell.js';

export async function bootstrapApp(root) {
  const localStore = createLocalStore('ffx');
  const sessionStore = createSessionStore('ffx');
  const sourceManager = new SourceManager(localStore);

  const store = createStore(
    createInitialState({
      preferences: {
        ...DEFAULT_PREFERENCES,
        ...localStore.read('preferences', {})
      },
      user: {
        ...DEFAULT_USER_STATE,
        ...localStore.read('user', {})
      },
      sources: {
        ...DEFAULT_SOURCES_STATE,
        ...localStore.read('sources', {})
      },
      player: {
        ...DEFAULT_PLAYER_STATE,
        ...sessionStore.read('player', {})
      }
    })
  );

  const router = new Router();
  const focus = new FocusEngine(document);
  const remote = new RemoteControl();
  const shell = new AppShell({
    root,
    store,
    router,
    focus,
    remote,
    sourceManager,
    localStore,
    sessionStore
  });

  focus.bindRemote(remote);
  remote.start();
  shell.mount();

  store.subscribe((state) => {
    localStore.write('preferences', state.preferences);
    localStore.write('user', state.user);
    localStore.write('sources', state.sources);
    sessionStore.write('player', state.player);
  });

  const seedSources = sourceManager.bootstrap();
  store.update((draft) => {
    draft.sources = seedSources;
  });

  router.subscribe((route) => {
    store.update((draft) => {
      draft.app.route = route;
      draft.app.drawers.left = false;
      draft.app.drawers.right = false;
      draft.app.drawers.search = false;
    });
  });
  router.start();

  shell.updateClock();
  window.setInterval(() => shell.updateClock(), 60_000);
  await shell.reloadLibrary(false);

}
