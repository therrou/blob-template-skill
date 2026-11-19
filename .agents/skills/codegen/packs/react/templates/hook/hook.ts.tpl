{{#if client}}
// Hooks only run in Client Components: the calling component needs 'use client'.
{{/if}}
// TODO(codegen): describe what the hook returns
export type Use{{name.pascal}}Result = Record<string, never>;

{{#if exportIs.function}}
export function use{{name.pascal}}(): Use{{name.pascal}}Result {
{{else}}
{{#if exportIs.inline}}export {{/if}}const use{{name.pascal}} = (): Use{{name.pascal}}Result => {
{{/if}}
  // TODO(codegen): implement; clean up every effect/subscription and keep returned callbacks stable. Don't call setState in an effect body (react-hooks/set-state-in-effect): derive the value while rendering, subscribe with useSyncExternalStore, or set state in the subscription's callback{{#if client}}. useSyncExternalStore's getServerSnapshot must return what the server can know (e.g. null), not a browser value, or hydration fails{{/if}}
  return {};
}{{#unless exportIs.function}};{{/unless}}
{{#if exportIs.const}}

export { use{{name.pascal}} };
{{/if}}
