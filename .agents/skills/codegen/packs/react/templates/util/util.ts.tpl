{{#if serverOnly}}
import 'server-only';

{{/if}}
// TODO(codegen): replace the signature with real typed params and return type
{{#if exportIs.function}}
export function {{name.camel}}(input: unknown): unknown {
{{else}}
{{#if exportIs.inline}}export {{/if}}const {{name.camel}} = (input: unknown): unknown => {
{{/if}}
  // TODO(codegen): implement as a pure function (no side effects, no React, no I/O unless the name says so)
  return input;
}{{#unless exportIs.function}};{{/unless}}
{{#if exportIs.const}}

export { {{name.camel}} };
{{/if}}
