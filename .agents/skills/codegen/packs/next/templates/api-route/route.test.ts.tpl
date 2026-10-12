{{#if vitest}}
import { describe, expect, it } from 'vitest';

{{/if}}
import { GET } from './route';

describe('GET /api/{{route}}', () => {
  it('responds with 200', async () => {
    const response = await GET(new Request('http://localhost/api/{{urlPath}}'){{#if hasParams}}, {
      params: {{#if asyncParams}}Promise.resolve({{paramsSample}}){{else}}{{paramsSample}}{{/if}},
    }{{/if}});
    expect(response.status).toBe(200);
  });

  // TODO(codegen): cover validation errors, auth failures and the success payload shape
});
