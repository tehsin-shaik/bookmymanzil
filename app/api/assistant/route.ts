import { NextRequest, NextResponse } from "next/server";
import { loadAuthenticatedGuestAccount } from "@/lib/auth/guest-account";
import { buildBookMyManzilAssistantReply } from "@/lib/assistant/bookmymanzil-assistant";
import { AIProviderRequestError } from "@/lib/openai";

export const dynamic = "force-dynamic";

type AssistantRequestBody = {
  context?: {
    currentPath?: string;
    currentReservationCode?: string;
  };
  history?: Array<{
    content?: string;
    role?: string;
  }>;
  language?: string;
  message?: string;
};

export async function POST(request: NextRequest) {
  try {
    const guestAccountResolution = await loadAuthenticatedGuestAccount();

    if (!guestAccountResolution.authenticated) {
      return NextResponse.json(
        { error: "Please log in to use the BookMyManzil assistant." },
        { status: 401 }
      );
    }

    if (guestAccountResolution.error || !guestAccountResolution.isGuest || !guestAccountResolution.guestAccount) {
      return NextResponse.json(
        { error: guestAccountResolution.error || "The BookMyManzil assistant is available to guest accounts only." },
        { status: 403 }
      );
    }

    const body = (await request.json()) as AssistantRequestBody;
    const message = readString(body.message);

    if (!message) {
      return NextResponse.json(
        { error: "Please enter a message for the assistant." },
        { status: 400 }
      );
    }

    const reply = await buildBookMyManzilAssistantReply({
      currentReservationCode: readString(body.context?.currentReservationCode),
      guestName: guestAccountResolution.guestAccount.firstName || "Guest",
      guestUserId: guestAccountResolution.guestAccount.id,
      history: sanitizeHistory(body.history),
      language: readString(body.language) || "English",
      message,
    });

    return NextResponse.json({ reply });
  } catch (error) {
    if (error instanceof AIProviderRequestError) {
      console.error("[assistant] ai-provider-request-failed", {
        code: error.code,
        message: error.message,
        model: error.model,
        param: error.param,
        provider: error.provider,
        status: error.status,
        type: error.type,
      });

      const friendlyMessage =
        error.status === 429 && (error.code === "insufficient_quota" || error.message.toLowerCase().includes("quota"))
          ? `${capitalizeProviderName(error.provider)} quota or billing is blocking the assistant right now. Current model: ${error.model}. Please check your ${capitalizeProviderName(error.provider)} project billing, usage limits, and remaining credits.`
          : error.status === 401
            ? `${capitalizeProviderName(error.provider)} rejected the API key for model ${error.model}. Please verify the key and restart the server after updating .env.local.`
            : error.message;

      return NextResponse.json(
        {
          error: friendlyMessage,
        },
        { status: 500 }
      );
    }

    const message = error instanceof Error ? error.message : "The BookMyManzil assistant is unavailable right now.";

    return NextResponse.json(
      {
        error: message,
      },
      { status: 500 }
    );
  }
}

function sanitizeHistory(history: AssistantRequestBody["history"]) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .map((entry) => {
      const role = entry?.role === "assistant" ? "assistant" : entry?.role === "user" ? "user" : null;
      const content = readString(entry?.content);

      if (!role || !content) {
        return null;
      }

      return {
        content: content.slice(0, 1500),
        role,
      } as const;
    })
    .filter((entry): entry is { content: string; role: "assistant" | "user" } => Boolean(entry))
    .slice(-8);
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function capitalizeProviderName(value: string) {
  return value ? `${value.slice(0, 1).toUpperCase()}${value.slice(1)}` : "AI provider";
}
