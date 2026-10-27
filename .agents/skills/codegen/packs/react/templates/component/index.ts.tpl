export { {{name.pascal}}{{#if variants}}{{#unless cssInJs}}, {{name.camel}}Variants{{/unless}}{{/if}} } from './{{name.kebab}}';
export type { {{name.pascal}}Props } from './{{name.kebab}}';
