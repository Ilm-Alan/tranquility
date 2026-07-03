// The only server-side code in the project: a thin pass-through to Ollama's
// native /api/chat (cloud or local). It exists so the API key stays out of the
// client bundle and the public repo. The client sends messages (+ optional
// images per message); the server contributes credentials, model, and limits.
//
// Structured output strategy, verified against ollama.com 2026-07-03: the
// cloud ignores full JSON-schema `format` objects (grammar enforcement is
// local-only for now) but honors `format: "json"`, and the model complies with
// a schema stated in the system prompt. `think: false` suppresses thinking
// tokens, which otherwise dominate latency.

export interface AssistantConfig {
  baseUrl: string | undefined; // e.g. https://ollama.com
  authToken: string | undefined;
  model: string | undefined;
}

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
  const { messages, json } = (clientBody ?? {}) as Record<string, unknown>;
  if (!Array.isArray(messages) || messages.length === 0) {
    return { status: 400, body: JSON.stringify({ error: 'messages required' }) };
  }
  const res = await fetch(`${cfg.baseUrl}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.authToken}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      stream: false,
      think: false,
      ...(json === true ? { format: 'json' } : {}),
      options: { num_predict: 2048 },
      messages,
    }),
  });
  const body = await res.text();
  if (process.env.ASSISTANT_DEBUG) {
    try {
      const content = (JSON.parse(body) as { message?: { content?: string } }).message?.content;
      console.log(`[assistant] status=${res.status} content=${(content ?? body).slice(0, 1000)}`);
    } catch {
      console.log(`[assistant] status=${res.status} unparseable=${body.slice(0, 300)}`);
    }
  }
  return { status: res.status, body };
}
