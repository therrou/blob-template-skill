// TODO(codegen): register this page in the router (path + lazy import if the app code-splits routes)
{{#if exportIs.function}}
export function {{name.pascal}}Page() {
{{else}}
{{#if exportIs.inline}}export {{/if}}const {{name.pascal}}Page = () => {
{{/if}}
  return (
    <main>
      {/* TODO(codegen): page content; fetch data via the repo's data layer, not in raw effects */}
    </main>
  );
}{{#unless exportIs.function}};{{/unless}}
{{#if exportIs.const}}

export { {{name.pascal}}Page };
{{/if}}
