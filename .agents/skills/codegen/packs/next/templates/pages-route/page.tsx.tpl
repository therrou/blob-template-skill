// TODO(codegen): the props returned by getServerSideProps or getStaticProps
type {{name.pascal}}PageProps = Record<string, never>;

// TODO(codegen): load data with getServerSideProps (per request) or getStaticProps (build time){{#if hasParams}}; read {{paramsList}} from context.params{{/if}}
{{#if exportIs.function}}
export default function {{name.pascal}}Page(props: {{name.pascal}}PageProps) {
{{else}}
const {{name.pascal}}Page = (props: {{name.pascal}}PageProps) => {
{{/if}}
  void props;
  return (
    <main>
      {/* TODO(codegen): page content */}
    </main>
  );
}{{#unless exportIs.function}};{{/unless}}
{{#unless exportIs.function}}

export default {{name.pascal}}Page;
{{/unless}}
