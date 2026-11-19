export { {{name.pascal}}{{#if variants}}{{#unless cssInJs}}, {{name.camel}}Variants{{/unless}}{{/if}} } from './{{file.base}}';
{{#unless constExport}}
export type { {{name.pascal}}Props } from './{{file.base}}';
{{/unless}}
