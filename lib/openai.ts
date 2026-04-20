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

export async function createOpenAITextResponse({
  maxOutputTokens = 500,
  messages,
  model,
}: OpenAIResponsesRequest) {
  const apiKey = process.env.OPENAI_API_KEY;

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
      model: model || process.env.OPENAI_MODEL || "gpt-4.1-mini",
    }),
  });

  if (!response.ok) {
    const errorPayload = await readJsonSafely(response);
    const message =
      readNestedString(errorPayload, ["error", "message"]) ||
      `OpenAI request failed with status ${response.status}.`;
    throw new Error(message);
  }

  const payload = await readJsonSafely(response);
  const text = extractOutputText(payload);

  if (!text) {
    throw new Error("OpenAI returned an empty response.");
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
    if (!current || typeof current !== "object" || !(segment in current)) {
      return "";
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return readString(current);
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
