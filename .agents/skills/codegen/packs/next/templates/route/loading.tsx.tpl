{{#if exportIs.function}}
export default function Loading() {
{{else}}
const Loading = () => {
{{/if}}
  return (
    <div aria-busy="true" aria-live="polite">
      {/* TODO(codegen): skeleton that matches the page layout (reuse the repo's Skeleton primitive if there is one) */}
    </div>
  );
}{{#unless exportIs.function}};{{/unless}}
{{#unless exportIs.function}}

export default Loading;
{{/unless}}
