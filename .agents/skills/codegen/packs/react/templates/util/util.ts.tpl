{{#if serverOnly}}
import 'server-only';

{{/if}}
// TODO(codegen): replace the signature with real typed params and return type
export function {{name.camel}}(input: unknown): unknown {
  // TODO(codegen): implement as a pure function (no side effects, no React, no I/O unless the name says so)
  return input;
}
