"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";

type Message = { role: "user" | "assistant"; content: string };

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      const reply = res.ok ? data.reply : `오류: ${data.error ?? "알 수 없는 오류"}`;
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "요청에 실패했습니다. 잠시 후 다시 시도해주세요." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 dark:bg-black">
      <main className="flex w-full max-w-2xl flex-1 flex-col px-4 py-8">
        <h1 className="mb-6 text-xl font-semibold text-black dark:text-zinc-50">
          나들이 추천 에이전트
        </h1>

        <div className="flex-1 space-y-4 overflow-y-auto">
          {messages.length === 0 && (
            <p className="text-zinc-500">
              예: &quot;서울에서 애기랑 나갈만한 곳 있어? 유모차도 가지고 갈 거야&quot;
            </p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`rounded-lg px-4 py-3 text-sm ${
                m.role === "user"
                  ? "ml-auto max-w-[80%] whitespace-pre-wrap bg-black text-white dark:bg-zinc-50 dark:text-black"
                  : "max-w-[85%] bg-white text-black [&_h3]:mt-3 [&_h3]:font-semibold [&_li]:ml-4 [&_li]:list-disc [&_p]:my-2 dark:bg-zinc-900 dark:text-zinc-50"
              }`}
            >
              {m.role === "assistant" ? <ReactMarkdown>{m.content}</ReactMarkdown> : m.content}
            </div>
          ))}
          {loading && <p className="text-zinc-500">생각하는 중... (도구 여러 개를 확인하느라 시간이 걸릴 수 있어요)</p>}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="mt-4 flex gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="어디 갈까?"
            className="flex-1 rounded-full border border-zinc-300 px-4 py-2 text-sm outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-full bg-black px-5 py-2 text-sm text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-black"
          >
            보내기
          </button>
        </form>
      </main>
    </div>
  );
}
