import { EventEmitter } from "events";
import { useEffect, useReducer, useRef, useMemo } from "react";

export type Action<TState, P extends any[] = any[]> = (
  ...args: P
) => Promise<TState>;

export type Actions<TState> = Record<string, Action<TState>>;

type ExtractActionArgs<TAction> = 
  TAction extends Action<infer TState, infer P> ? P : never;

type VoidReturnActions<TState, TActions extends Actions<TState>> =
  { [TKey in keyof TActions]: (
    ...args: ExtractActionArgs<TActions[TKey]>
  ) => Promise<void> };

const RepositoryEventEmitter = Symbol("RepositoryEventEmitter");

export type Repository<T> = {
  state: T,
  setState: (nextState: T) => void,
  onChange: (listener: (newState: T, oldState: T) => void) => () => void,
  [RepositoryEventEmitter]: EventEmitter
};

export type Store<TState, TActions extends Actions<TState>> = {
  repository: Repository<TState>,
  actions: VoidReturnActions<TState, TActions>;
};

type PromiseState = "pending" | "resolved" | "rejected";

type WrappedActionListener<TState, TActions extends Actions<TState>> = (
  actionName: keyof TActions,
  state: PromiseState) => void;

export type ActionsState<TState, TActions extends Actions<TState>> = Record<keyof TActions, number>;

export const createRepository = <TState>(initialState: TState) => {
  var eventEmitter = new EventEmitter();
  const repository: Repository<TState> = {
    state: initialState,
    setState: (nextState) => {
      const prevState = repository.state;
      repository.state = nextState;
      eventEmitter.emit("change", nextState, prevState);
    },
    onChange: (listener) => {
      eventEmitter.on("change", listener);
      return () => eventEmitter.off("change", listener);
    },
    [RepositoryEventEmitter]: eventEmitter
  }

  return repository;
}

const storifyAction = <TState, P extends any[] = any[]>(
  repository: Repository<TState>,
  action: Action<TState, P>
): Action<void, P> => {
  const impl = async (...args: P) => {
    try {
      const result = await action(...args);
      repository.setState(result);
    } catch (error) {
      throw error;
    }
  }
  return impl;
}

const storifyActions = <TState, TActions extends Actions<TState>>(
  repository: Repository<TState>,
  actions: TActions
): VoidReturnActions<TState, TActions> => {
  const entries = Object.entries(actions).map(
      ([key, value]) => [key, storifyAction(repository, value)]);
  return Object.fromEntries(entries);
}

export const createStore = <TState, TActions extends Actions<TState>>(
  repository: Repository<TState>,
  actions: TActions
): Store<TState, TActions> => ({ repository, actions: storifyActions(repository, actions) });

const wrapAction = <TState, P extends any[] = any[]>(
  action: Action<TState, P>,
  onChange: (state: PromiseState) => void
): { action: Action<TState, P>, unsubscribe: () => void } => {
  let isSubscribed = true;
  const unsubscribe = () => { isSubscribed = false; }
  const emitChange = (state: PromiseState) => {
    if (isSubscribed) { onChange(state); }
  }
  const impl = async (...args: P) => {
    emitChange("pending");
    try {
      const response = await action(...args);
      emitChange("resolved");
      return response;
    } catch (error) {
      emitChange("rejected");
      throw error;
    }
  }
  return { action: impl, unsubscribe };
}

export const wrapActions = <TState, TActions extends Actions<TState>>(
  actions: TActions,
  onChange: WrappedActionListener<TState, TActions>
): TActions => {
  const handleChange = (key: keyof TActions, state: PromiseState) => {
    onChange(key, state);
  }
  var wrappedActions = Object.entries(actions).map(
    ([key, value]) => [key, wrapAction(value, (state) => handleChange(key, state)).action]);
  return Object.fromEntries(wrappedActions);
};

export const isEqualRef = (a: any, b: any) => a === b;

export const trackActions = <TState, TActions extends Actions<TState>>(
  actions: TActions,
  onChange: (state: ActionsState<TState, TActions>) => void
) : {wrappedActions: TActions, initialState: ActionsState<TState, TActions> } => {
  let promiseState = (Object.fromEntries(Object.keys(actions).map(key => [key, 0]))
  ) as ActionsState<TState, TActions>;

  const handleChange = (name: keyof TActions, state: PromiseState) => {
    let newState = { ...promiseState };
    switch (state) {
      case "pending": newState[name]++; break;
      case "rejected": newState[name]--; break;
      case "resolved": newState[name]--; break;
    }
    promiseState = newState;
    onChange(newState);
  }

  let wrappedActions = wrapActions(actions, handleChange);
  return { wrappedActions: wrappedActions, initialState: promiseState };
};

export const useSelector = <TState, TSelectedState>(
  repository: Repository<TState>,
  selector: (state: TState)=>TSelectedState,
  equalityFn: (first: TSelectedState, second:TSelectedState)=> boolean = isEqualRef
): TSelectedState => {
  const [, forceRender] = useReducer((s) => s + 1, 0);
  const selectedStateRef = useRef<TSelectedState>(selector(repository.state));

  useEffect(() => {
    function refresh() {
      const newSelectedState = selector(repository.state);
      if (!equalityFn(newSelectedState, selectedStateRef.current)) {
        selectedStateRef.current = newSelectedState;
        forceRender();
      }
    }
    const unsubscribe = repository.onChange(refresh);
    return unsubscribe;
  }, [repository, selector, equalityFn, selectedStateRef]);

  return selectedStateRef.current;
}

export const useDispatcher = <TState, TActions extends Actions<TState>>(actions: TActions
) : [state: ActionsState<TState, TActions>, actions: TActions] => {
  const [, forceRender] = useReducer((s) => s + 1, 0);

  let actionsState = useRef<ActionsState<TState, TActions>>();

  let trackedActions = useMemo(() => {
    const handleChange = (nextState: ActionsState<TState, TActions>) => {
      actionsState.current = nextState;
      forceRender();
    }
    const { wrappedActions, initialState } = trackActions(actions, handleChange);
    actionsState.current = initialState;
    return wrappedActions;
  }, [actions]);
  return [actionsState.current!, trackedActions];
}