export { {{name.pascal}} } from './{{name.kebab}}';
{{#unless constExport}}
export type { {{name.pascal}}Props } from './{{name.kebab}}';
{{/unless}}
