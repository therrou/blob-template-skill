'use client';

import { useEffect } from 'react';

type ErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function {{name.pascal}}Error({ error, reset }: ErrorProps) {
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
}
