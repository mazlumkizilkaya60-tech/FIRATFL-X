export function createStore(initialState) {
  let state = structuredClone(initialState);
  const listeners = new Set();

  function getState() {
    return state;
  }

  function setState(nextState) {
    const previousState = state;
    state = nextState;
    listeners.forEach((listener) => listener(state, previousState));
    return state;
  }

  function update(mutator) {
    const previousState = state;
    const draft = structuredClone(state);
    mutator(draft);
    state = draft;
    listeners.forEach((listener) => listener(state, previousState));
    return state;
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return {
    getState,
    setState,
    update,
    subscribe
  };
}
