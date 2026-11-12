// TODO(codegen): the props returned by getServerSideProps or getStaticProps
type {{name.pascal}}PageProps = Record<string, never>;

// TODO(codegen): load data with getServerSideProps (per request) or getStaticProps (build time){{#if hasParams}}; read {{paramsList}} from context.params{{/if}}
export default function {{name.pascal}}Page(props: {{name.pascal}}PageProps) {
  void props;
  return (
    <main>
      {/* TODO(codegen): page content */}
    </main>
  );
}
