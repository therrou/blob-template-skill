{{#unless hasParams}}
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '{{name.pascal}}', // TODO(codegen): real title and description
};

{{/unless}}
{{#if hasParams}}
type {{name.pascal}}PageProps = {
  params: {{#if asyncParams}}Promise<{{paramsType}}>{{else}}{{paramsType}}{{/if}};
};

// TODO(codegen): add generateMetadata({ params }) if the title depends on params
export default async function {{name.pascal}}Page({ params }: {{name.pascal}}PageProps) {
  const { {{paramsList}} } = {{#if asyncParams}}await params{{else}}params{{/if}};
  {{paramsVoid}}
{{else}}
export default async function {{name.pascal}}Page() {
{{/if}}
  // TODO(codegen): fetch data here on the server and pass plain props down; keep client components at the leaves
  return (
    <main>
      {/* TODO(codegen): page content */}
    </main>
  );
}
