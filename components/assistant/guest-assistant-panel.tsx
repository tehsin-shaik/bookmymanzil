"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type AssistantMessage = {
  content: string;
  role: "assistant" | "user";
};

export function GuestAssistantPanel({ guestName }: { guestName: string }) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      content:
        "Hi! I can help with BookMyManzil hotel information, room availability, your bookings, reservation-code guidance, and service requests.",
      role: "assistant",
    },
  ]);
  const conversationRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!conversationRef.current) {
      return;
    }

    conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
  }, [messages, isOpen]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedInput = input.trim();

    if (!trimmedInput || isLoading) {
      return;
    }

    const nextUserMessage: AssistantMessage = {
      content: trimmedInput,
      role: "user",
    };

    setMessages((currentMessages) => [...currentMessages, nextUserMessage]);
    setInput("");
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          context: {
            currentPath: pathname,
            currentReservationCode: extractReservationCodeFromPath(pathname),
          },
          history: [...messages, nextUserMessage].slice(-8),
          language: "English",
          message: trimmedInput,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        reply?: string;
      };

      if (!response.ok || !payload.reply) {
        throw new Error(payload.error || "The assistant could not reply right now.");
      }

      const assistantReply = payload.reply;

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          content: assistantReply,
          role: "assistant",
        },
      ]);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The assistant could not reply right now."
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {isOpen ? (
        <section className="flex h-[620px] w-[min(92vw,380px)] flex-col overflow-hidden rounded-[30px] border border-stone-200/80 bg-[rgba(255,252,247,0.96)] shadow-[0_24px_64px_rgba(15,23,42,0.18)] backdrop-blur-xl">
          <div className="border-b border-stone-200/80 bg-white/80 px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700">
                  AI Assistant
                </p>
                <h2 className="mt-2 text-lg font-semibold tracking-tight text-stone-900">
                  Ask BookMyManzil
                </h2>
                <p className="mt-1 text-sm leading-6 text-stone-600">
                  Personalized help for your stays, bookings, and in-stay guidance.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-500 transition hover:border-stone-300 hover:text-stone-900"
                aria-label="Close assistant"
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M5 5l10 10" />
                  <path d="M15 5 5 15" />
                </svg>
              </button>
            </div>
          </div>

          <div ref={conversationRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {messages.map((message, index) => (
              <article
                key={`${message.role}-${index}`}
                className={`max-w-[88%] rounded-[24px] px-4 py-3 text-sm leading-7 shadow-sm ${
                  message.role === "assistant"
                    ? "border border-stone-200/80 bg-white text-stone-700"
                    : "ml-auto bg-stone-900 text-white"
                }`}
              >
                {message.content}
              </article>
            ))}

            {isLoading ? (
              <div className="max-w-[88%] rounded-[24px] border border-stone-200/80 bg-white px-4 py-3 text-sm text-stone-500 shadow-sm">
                Thinking through your BookMyManzil details…
              </div>
            ) : null}
          </div>

          <div className="border-t border-stone-200/80 bg-white/80 px-4 py-4">
            {error ? (
              <div className="mb-3 rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
                {error}
              </div>
            ) : null}

            <form onSubmit={handleSubmit} className="space-y-3">
              <label className="sr-only" htmlFor="guest-assistant-input">
                Ask the BookMyManzil assistant
              </label>
              <textarea
                id="guest-assistant-input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                rows={3}
                className="w-full rounded-[22px] border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-stone-500"
                placeholder={`Ask about availability, your bookings, or service requests, ${guestName}.`}
              />
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs leading-5 text-stone-500">
                  Guest-only guidance for BookMyManzil stays and services.
                </p>
                <button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  className="inline-flex h-11 items-center justify-center rounded-full bg-stone-900 px-5 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
                >
                  Send
                </button>
              </div>
            </form>
          </div>
        </section>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center gap-3 rounded-full bg-stone-900 px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_48px_rgba(15,23,42,0.22)] transition hover:bg-stone-800"
        >
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M12 3c4.97 0 9 3.36 9 7.5S16.97 18 12 18a11.7 11.7 0 0 1-3.84-.63L4 19l1.56-3.28C4.58 14.44 3 12.56 3 10.5 3 6.36 7.03 3 12 3Z" />
            </svg>
          </span>
          Ask BookMyManzil
        </button>
      )}
    </div>
  );
}

function extractReservationCodeFromPath(pathname: string) {
  const match = pathname.match(/^\/guest\/bookings\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]).toUpperCase() : "";
}
