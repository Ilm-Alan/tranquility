// The only server-side code in the project: a thin pass-through to an
// Anthropic-compatible /v1/messages endpoint (Ollama Cloud in dev). It exists so
// the API key stays out of the client bundle and the public repo. The client
// sends prompt + tools; the server contributes credentials, model, and limits.

export interface AssistantConfig {
  baseUrl: string | undefined;
  authToken: string | undefined;
  model: string | undefined;
}

const MAX_TOKENS = 2048; // kimi spends thinking tokens before text; budget for both

export function isConfigured(cfg: AssistantConfig): boolean {
  return Boolean(cfg.baseUrl && cfg.authToken && cfg.model);
}

export async function callAssistant(
  cfg: AssistantConfig,
  clientBody: unknown,
): Promise<{ status: number; body: string }> {
  if (!isConfigured(cfg)) {
    return { status: 503, body: JSON.stringify({ offline: true }) };
  }
  const { messages, system, tools } = (clientBody ?? {}) as Record<string, unknown>;
  if (!Array.isArray(messages) || messages.length === 0) {
    return { status: 400, body: JSON.stringify({ error: 'messages required' }) };
  }
  const res = await fetch(`${cfg.baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.authToken}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: MAX_TOKENS,
      ...(typeof system === 'string' ? { system } : {}),
      ...(Array.isArray(tools) ? { tools } : {}),
      messages,
    }),
  });
  return { status: res.status, body: await res.text() };
}
