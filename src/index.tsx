import React, { createContext, useContext } from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import { createRepository, createStore, Repository, useDispatcher, useSelector } from './state';

type CounterState = {
  value: number,
  version: number
};

const waitFor = (delay: number) => new Promise(resolve => setTimeout(resolve, delay));

const createCounterActions = (repository: Repository<CounterState>) => ({
  increment: async (count: number = 1) => {
    await waitFor(2000);
    const { state } = repository;
    return { value: state.value + count, version: state.version + 1 };
  },
  decrement: async (count: number = 1) => {
    const { state } = repository;
    return { value: state.value - count, version: state.version + 1 };
  },
  reset: async () => {
    const { state } = repository;
    return { value: 0, version: state.version + 1 };
  }
});

const createCounterStore = () => {
  const repository = createRepository<CounterState>({ value: 0, version: 0 });
  return createStore(
    repository,
    createCounterActions(repository)
  );
};

const CounterContext = createContext(createCounterStore());

const useCounter = () => {
  const store = useContext(CounterContext);
  const {value, version} = useSelector(store.repository, s => s);
  const [actionState, { increment, decrement, reset }] = useDispatcher(store.actions);

  return {
    value,
    version,
    increment,
    decrement,
    reset,
    actionState
  };
}

const Counter = () => {
  const { actionState, value, version, increment, decrement, reset } = useCounter();
  console.log(actionState);
  return (
    <div>
      <div>
        <span>Value: {value}, version: {version}</span>
        {actionState.increment > 0 && (<span>Loading ...</span>)}
      </div>
      <div><button onClick={async () => await increment()}>increment</button></div>
      <div><button onClick={async () => await decrement(2)}>decrement</button></div>
      <div><button onClick={async () => await reset()}>reset</button></div>
    </div>
  )
}

const App = ()=> {
  return (<div><Counter/></div>)
}

ReactDOM.render(
  <React.StrictMode>
      <App />
  </React.StrictMode>,
  document.getElementById('root')
);
