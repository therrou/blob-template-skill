'use client';

import { useEffect } from 'react';

type ErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

{{#if exportIs.function}}
export default function {{name.pascal}}Error({ error, reset }: ErrorProps) {
{{else}}
const {{name.pascal}}Error = ({ error, reset }: ErrorProps) => {
{{/if}}
  useEffect(() => {
    // TODO(codegen): report to the repo's error tracker instead of the console
    console.error(error);
  }, [error]);

  return (
    <div role="alert">
      {/* TODO(codegen): user-facing message using the repo's UI primitives */}
      <button type="button" onClick={reset}>
        Try again
      </button>
    </div>
  );
}{{#unless exportIs.function}};{{/unless}}
{{#unless exportIs.function}}

export default {{name.pascal}}Error;
{{/unless}}
