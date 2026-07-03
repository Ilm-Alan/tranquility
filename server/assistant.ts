// The only server-side code in the project: a thin pass-through to an
// Anthropic-compatible /v1/messages endpoint (Ollama Cloud in dev). It exists so
// the API key stays out of the client bundle and the public repo. The client
// sends prompt + tools; the server contributes credentials, model, and limits.

export interface AssistantConfig {
  baseUrl: string | undefined;
  authToken: string | undefined;
  model: string | undefined;
}

const MAX_TOKENS = 8192; // kimi spends freely on thinking before answering; a
// tool call that arrives after 3k thinking tokens is still cheaper than a retry

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
  const body = await res.text();
  if (process.env.ASSISTANT_DEBUG) {
    const tools = Array.isArray((clientBody as Record<string, unknown>)?.tools)
      ? ((clientBody as Record<string, { name?: string }[]>).tools ?? []).map((t) => t.name)
      : [];
    try {
      const parsed = JSON.parse(body) as {
        content?: { type: string; input?: unknown }[];
        stop_reason?: string;
      };
      const blocks = parsed.content?.map((b) => b.type).join(',');
      const toolInput = parsed.content?.find((b) => b.type === 'tool_use')?.input;
      console.log(
        `[assistant] tools=${tools.join(',')} status=${res.status} stop=${parsed.stop_reason} blocks=${blocks} input=${JSON.stringify(toolInput)?.slice(0, 800)}`,
      );
    } catch {
      console.log(`[assistant] tools=${tools.join(',')} status=${res.status} unparseable=${body.slice(0, 200)}`);
    }
  }
  return { status: res.status, body };
}
