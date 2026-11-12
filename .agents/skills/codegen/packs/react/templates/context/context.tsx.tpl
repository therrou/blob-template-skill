{{#if client}}
'use client';

{{/if}}
import { createContext, useContext, type ReactNode } from 'react';

// TODO(codegen): describe the shared state and actions
export type {{name.pascal}}ContextValue = Record<string, never>;

const {{name.pascal}}Context = createContext<{{name.pascal}}ContextValue | null>(null);

export function {{name.pascal}}Provider({ children }: { children: ReactNode }) {
  // TODO(codegen): hold state here; wrap the value in useMemo when it contains objects or functions
  const value: {{name.pascal}}ContextValue = {};
  return <{{name.pascal}}Context.Provider value={value}>{children}</{{name.pascal}}Context.Provider>;
}

export function use{{name.pascal}}(): {{name.pascal}}ContextValue {
  const context = useContext({{name.pascal}}Context);
  if (!context) throw new Error('use{{name.pascal}} must be used within <{{name.pascal}}Provider>.');
  return context;
}
