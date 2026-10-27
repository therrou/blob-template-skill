import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
{{#if hasParams}}
  const { {{paramsList}} } = req.query;
{{/if}}
  // TODO(codegen): check req.method, authenticate/authorize, validate input (req.query, req.body), handle errors with proper status codes
  res.status(200).json({ ok: true });
}
