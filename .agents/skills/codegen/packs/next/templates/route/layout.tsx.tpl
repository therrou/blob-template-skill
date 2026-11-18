import type { ReactNode } from 'react';

{{#if exportIs.function}}
export default function {{name.pascal}}Layout({ children }: { children: ReactNode }) {
{{else}}
const {{name.pascal}}Layout = ({ children }: { children: ReactNode }) => {
{{/if}}
  // TODO(codegen): shared UI for this segment (it persists across child navigations; do not read searchParams here)
  return <>{children}</>;
}{{#unless exportIs.function}};{{/unless}}
{{#unless exportIs.function}}

export default {{name.pascal}}Layout;
{{/unless}}
