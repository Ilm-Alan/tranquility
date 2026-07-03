// Vercel serverless mount for the same proxy the dev server uses.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callAssistant, isConfigured, type AssistantConfig } from '../server/assistant.js';

const cfg: AssistantConfig = {
  baseUrl: process.env.LLM_BASE_URL,
  authToken: process.env.LLM_API_KEY,
  model: process.env.LLM_MODEL,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    res.json({ configured: isConfigured(cfg) });
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }
  const { status, body } = await callAssistant(cfg, req.body);
  res.status(status).setHeader('Content-Type', 'application/json').send(body);
}
