import { NextResponse } from 'next/server';
{{#if hasParams}}

type RouteContext = {
  params: {{#if asyncParams}}Promise<{{paramsType}}>{{else}}{{paramsType}}{{/if}};
};
{{/if}}

export async function GET(request: Request{{#if hasParams}}, { params }: RouteContext{{/if}}) {
{{#if hasParams}}
  const { {{paramsList}} } = {{#if asyncParams}}await params{{else}}params{{/if}};
{{/if}}
  // TODO(codegen): authenticate/authorize, validate input (search params, body), handle errors with proper status codes
  return NextResponse.json({ ok: true });
}
