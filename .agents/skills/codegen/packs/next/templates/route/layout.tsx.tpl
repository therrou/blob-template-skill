import type { ReactNode } from 'react';

export default function {{name.pascal}}Layout({ children }: { children: ReactNode }) {
  // TODO(codegen): shared UI for this segment (it persists across child navigations; do not read searchParams here)
  return <>{children}</>;
}
