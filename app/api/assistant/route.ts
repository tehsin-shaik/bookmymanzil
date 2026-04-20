import { NextRequest, NextResponse } from "next/server";
import { loadAuthenticatedGuestAccount } from "@/lib/auth/guest-account";
import { buildBookMyManzilAssistantReply } from "@/lib/assistant/bookmymanzil-assistant";

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
