// Shared client for structured model calls. One pattern everywhere: JSON mode,
// the exact schema stated in the system prompt, strict validation of the reply,
// one retry, then an honest null. No coercion - if the model's answer does not
// validate, it did not answer.

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: string[]; // base64, no data: prefix (Ollama native format)
}

export async function checkAssistant(): Promise<boolean> {
  try {
    const res = await fetch('/api/assistant');
    return res.ok && (await res.json()).configured === true;
  } catch {
    return false;
  }
}

// Models sometimes fence JSON in markdown when images are present; extracting
// the fenced body is a defined transform, not a guess.
function parseJson(content: string): unknown {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
    if (fenced) {
      try {
        return JSON.parse(fenced[1]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function callOnce(messages: ChatMessage[]): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const res = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ json: true, messages }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { message?: { content?: string } };
    return parseJson(data.message?.content ?? '');
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function structuredCall<T>(
  system: string,
  schema: object,
  messages: ChatMessage[],
  validate: (raw: unknown) => T | null,
): Promise<T | null> {
  const withSchema: ChatMessage[] = [
    {
      role: 'system',
      content:
        `${system}\n\nRespond ONLY with a JSON object that validates against this exact JSON schema - no prose, no markdown:\n` +
        JSON.stringify(schema),
    },
    ...messages,
  ];
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await callOnce(withSchema);
    if (raw !== null) {
      const valid = validate(raw);
      if (valid !== null) return valid;
    }
  }
  return null;
}
