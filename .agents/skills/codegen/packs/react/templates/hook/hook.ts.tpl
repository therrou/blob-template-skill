{{#if client}}
// Hooks only run in Client Components: the calling component needs 'use client'.
{{/if}}
export type Use{{name.pascal}}Result = {
  // TODO(codegen): describe what the hook returns
};

export function use{{name.pascal}}(): Use{{name.pascal}}Result {
  // TODO(codegen): implement; clean up every effect/subscription and keep returned callbacks stable
  return {};
}
