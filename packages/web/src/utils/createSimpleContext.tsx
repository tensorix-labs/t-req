import {
  type Accessor,
  createContext,
  createMemo,
  type JSX,
  type ParentProps,
  Show,
  useContext
} from 'solid-js';

interface CreateSimpleContextInput<T, Props extends Record<string, unknown>> {
  name: string;
  init: ((input: Props) => T) | (() => T);
  gate?: boolean;
}

interface CreateSimpleContextReturn<T, Props extends Record<string, unknown>> {
  provider: (props: ParentProps<Props>) => JSX.Element;
  use: () => T;
}

export function createSimpleContext<
  T,
  Props extends Record<string, unknown> = Record<string, never>
>(input: CreateSimpleContextInput<T, Props>): CreateSimpleContextReturn<T, Props> {
  const ctx = createContext<T>();

  const provider = (props: ParentProps<Props>): JSX.Element => {
    const init = (input.init as (input: Props) => T)(props as unknown as Props);
    const gate = input.gate ?? true;

    if (!gate) {
      return <ctx.Provider value={init}>{props.children}</ctx.Provider>;
    }

    const isReady = createMemo(() => {
      const ready = (init as { ready?: Accessor<boolean> | boolean }).ready;
      return ready === undefined || (typeof ready === 'function' ? ready() : ready);
    });

    return (
      <Show when={isReady()}>
        <ctx.Provider value={init}>{props.children}</ctx.Provider>
      </Show>
    );
  };

  const use = (): T => {
    const value = useContext(ctx);
    if (value === undefined) {
      throw new Error(`${input.name} context must be used within a context provider`);
    }
    return value;
  };

  return { provider, use };
}
