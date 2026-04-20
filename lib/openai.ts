import "server-only";

type OpenAIMessage = {
  content: string;
  role: "assistant" | "system" | "user";
};

type OpenAIResponsesRequest = {
  maxOutputTokens?: number;
  messages: OpenAIMessage[];
  model?: string;
};

type AIProvider = "openai" | "openrouter";

export class AIProviderRequestError extends Error {
  code: string;
  model: string;
  param: string;
  provider: AIProvider;
  status: number;
  type: string;

  constructor(input: {
    code?: string;
    message: string;
    model: string;
    param?: string;
    provider: AIProvider;
    status: number;
    type?: string;
  }) {
    super(input.message);
    this.name = "AIProviderRequestError";
    this.code = input.code || "";
    this.model = input.model;
    this.param = input.param || "";
    this.provider = input.provider;
    this.status = input.status;
    this.type = input.type || "";
  }
}

export async function createOpenAITextResponse({
  maxOutputTokens = 500,
  messages,
  model,
}: OpenAIResponsesRequest) {
  const provider = resolveAIProvider();

  if (provider === "openrouter") {
    return createOpenRouterTextResponse({
      maxOutputTokens,
      messages,
      model,
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const selectedModel = model || process.env.OPENAI_MODEL || "gpt-4.1-mini";

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: messages.map((message) => buildResponsesInputMessage(message)),
      max_output_tokens: maxOutputTokens,
      model: selectedModel,
    }),
  });

  if (!response.ok) {
    const errorPayload = await readJsonSafely(response);
    const message = readNestedString(errorPayload, ["error", "message"]) || `OpenAI request failed with status ${response.status}.`;
    throw new AIProviderRequestError({
      code: readNestedString(errorPayload, ["error", "code"]),
      message,
      model: selectedModel,
      param: readNestedString(errorPayload, ["error", "param"]),
      provider: "openai",
      status: response.status,
      type: readNestedString(errorPayload, ["error", "type"]),
    });
  }

  const payload = await readJsonSafely(response);
  const text = extractOutputText(payload);

  if (!text) {
    throw new Error("OpenAI returned an empty response.");
  }

  return text;
}

async function createOpenRouterTextResponse({
  maxOutputTokens = 500,
  messages,
  model,
}: OpenAIResponsesRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const selectedModel = model || process.env.OPENROUTER_MODEL || "openai/gpt-5.2";

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured.");
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(process.env.OPENROUTER_SITE_URL ? { "HTTP-Referer": process.env.OPENROUTER_SITE_URL } : {}),
      ...(process.env.OPENROUTER_SITE_NAME ? { "X-OpenRouter-Title": process.env.OPENROUTER_SITE_NAME } : {}),
    },
    body: JSON.stringify({
      max_tokens: maxOutputTokens,
      messages: messages.map((message) => ({
        content: message.content,
        role: message.role,
      })),
      model: selectedModel,
    }),
  });

  if (!response.ok) {
    const errorPayload = await readJsonSafely(response);
    const message =
      readNestedString(errorPayload, ["error", "message"]) ||
      readNestedString(errorPayload, ["message"]) ||
      `OpenRouter request failed with status ${response.status}.`;

    throw new AIProviderRequestError({
      code: readNestedString(errorPayload, ["error", "code"]) || readNestedString(errorPayload, ["code"]),
      message,
      model: selectedModel,
      param: readNestedString(errorPayload, ["error", "param"]),
      provider: "openrouter",
      status: response.status,
      type: readNestedString(errorPayload, ["error", "type"]) || readNestedString(errorPayload, ["type"]),
    });
  }

  const payload = await readJsonSafely(response);
  const text = readNestedString(payload, ["choices", "0", "message", "content"]) || extractChatCompletionText(payload);

  if (!text) {
    throw new Error("OpenRouter returned an empty response.");
  }

  return text;
}

async function readJsonSafely(response: Response) {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function extractOutputText(payload: Record<string, unknown>) {
  const directText = readString(payload.output_text);

  if (directText) {
    return directText;
  }

  const output = Array.isArray(payload.output) ? payload.output : [];
  const textParts: string[] = [];

  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const content = Array.isArray((item as { content?: unknown[] }).content)
      ? ((item as { content?: unknown[] }).content as unknown[])
      : [];

    for (const contentPart of content) {
      if (!contentPart || typeof contentPart !== "object") {
        continue;
      }

      const partType = readString((contentPart as { type?: unknown }).type);
      const text =
        partType === "output_text"
          ? readString((contentPart as { text?: unknown }).text) ||
            readString((contentPart as { output_text?: unknown }).output_text)
          : partType === "refusal"
            ? readString((contentPart as { refusal?: unknown }).refusal)
            : "";

      if (text) {
        textParts.push(text);
      }
    }
  }

  return textParts.join("\n").trim();
}

function readNestedString(value: Record<string, unknown>, path: string[]) {
  let current: unknown = value;

  for (const segment of path) {
    if (Array.isArray(current)) {
      const index = Number(segment);

      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return "";
      }

      current = current[index];
      continue;
    }

    if (!current || typeof current !== "object" || !(segment in current)) {
      return "";
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return readString(current);
}

function extractChatCompletionText(payload: Record<string, unknown>) {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const contentParts: string[] = [];

  for (const choice of choices) {
    if (!choice || typeof choice !== "object") {
      continue;
    }

    const message = (choice as { message?: unknown }).message;

    if (!message || typeof message !== "object") {
      continue;
    }

    const content = (message as { content?: unknown }).content;

    if (typeof content === "string" && content.trim()) {
      contentParts.push(content.trim());
      continue;
    }

    if (Array.isArray(content)) {
      for (const part of content) {
        if (!part || typeof part !== "object") {
          continue;
        }

        const text = readString((part as { text?: unknown }).text);

        if (text) {
          contentParts.push(text);
        }
      }
    }
  }

  return contentParts.join("\n").trim();
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function buildResponsesInputMessage(message: OpenAIMessage) {
  if (message.role === "assistant") {
    return {
      content: [
        {
          text: message.content,
          type: "output_text",
        },
      ],
      role: "assistant",
    };
  }

  return {
    content: [
      {
        text: message.content,
        type: "input_text",
      },
    ],
    role: message.role,
  };
}

function resolveAIProvider(): AIProvider {
  const configuredProvider = readString(process.env.AI_PROVIDER).toLowerCase();

  if (configuredProvider === "openrouter") {
    return "openrouter";
  }

  if (configuredProvider === "openai") {
    return "openai";
  }

  return process.env.OPENROUTER_API_KEY && !process.env.OPENAI_API_KEY ? "openrouter" : "openai";
}
