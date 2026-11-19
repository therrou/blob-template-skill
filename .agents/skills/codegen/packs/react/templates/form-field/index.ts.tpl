export { {{name.pascal}} } from './{{file.base}}';
{{#unless constExport}}
export type { {{name.pascal}}Props } from './{{file.base}}';
{{/unless}}
