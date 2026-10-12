import { CodegenError } from './errors.mjs';
import { nameCases, toWords } from './names.mjs';

// Next.js App Router segments: [[...opt]], [...all], [param], (group), @slot, static
const SEGMENT =
  /^(?:\[\[\.\.\.([A-Za-z_]\w*)\]\]|\[\.\.\.([A-Za-z_]\w*)\]|\[([A-Za-z_]\w*)\]|\(([a-z0-9][a-z0-9-]*)\)|@([a-z0-9][a-z0-9-]*)|([a-z0-9][a-z0-9-]*))$/;

export function parseRoute(raw) {
  if (typeof raw !== 'string') throw new CodegenError('Invalid route: missing.');
  const route = raw.trim().replace(/^\/+|\/+$/g, '');
  const segments = route ? route.split('/') : [];
  const params = [];
  const words = [];
  const urlParts = [];

  for (const segment of segments) {
    const m = SEGMENT.exec(segment);
    if (!m) {
      throw new CodegenError(
        `Invalid route segment "${segment}" in "${raw}": use lowercase kebab-case, [param], [...param], [[...param]], (group) or @slot.`,
      );
    }
    const [, optionalAll, all, param, , , literal] = m;
    const paramName = optionalAll ?? all ?? param;
    if (paramName) {
      params.push({
        name: paramName,
        type: param ? 'string' : 'string[]',
        optional: Boolean(optionalAll),
      });
      words.push(...toWords(paramName));
      urlParts.push('test');
    } else if (literal) {
      words.push(...toWords(literal));
      urlParts.push(literal);
    }
  }

  const sample = (p) => `${p.name}: ${p.type === 'string' ? "'test'" : "['test']"}`;
  return {
    route,
    name: { raw, ...nameCases(words.length ? words : ['home']) },
    hasParams: params.length > 0,
    paramsType: `{ ${params.map((p) => `${p.name}${p.optional ? '?' : ''}: ${p.type}`).join('; ')} }`,
    paramsList: params.map((p) => p.name).join(', '),
    paramsSample: `{ ${params.map(sample).join(', ')} }`,
    urlPath: urlParts.join('/'),
  };
}
