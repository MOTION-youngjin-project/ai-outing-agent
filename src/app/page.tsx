"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";

type Message = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "서울에서 애기랑 나갈만한 곳 있어? 유모차도 가지고 갈 거야",
  "대구에서 여자친구랑 데이트할만한 곳 있어?",
  "요즘 날씨가 별로네, 실내에서 놀만한 곳 있어?",
  "돈 안 쓰고 반나절만 나갔다 올 데 있어?",
];

function randomSuggestion() {
  return SUGGESTIONS[Math.floor(Math.random() * SUGGESTIONS.length)];
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  // 서버/클라이언트 초기 렌더가 일치해야 하므로 고정값으로 시작하고, 마운트 후에만 랜덤화한다.
  const [suggestion, setSuggestion] = useState(SUGGESTIONS[0]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 의도적으로 클라이언트에서만 랜덤화 (서버와 값이 달라도 되는 장식용 텍스트)
    setSuggestion(randomSuggestion());
  }, []);

  function acceptSuggestion() {
    if (!input && suggestion) setInput(suggestion);
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    const historyWithUser: Message[] = [...messages, { role: "user", content: text }];
    setMessages(historyWithUser);
    setInput("");
    setSuggestion(""); // 새 맥락 기반 제안이 올 때까지 이전 정적 예시를 보여주지 않음
    setLoading(true);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: historyWithUser }),
      });
      const data = await res.json();
      const reply = res.ok ? data.reply : `오류: ${data.error ?? "알 수 없는 오류"}`;
      const historyWithReply: Message[] = [...historyWithUser, { role: "assistant", content: reply }];
      setMessages(historyWithReply);

      // 대화 맥락 기반 다음 입력 제안 — 실패해도 채팅 자체엔 영향 없게 별도로 처리
      fetch("/api/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: historyWithReply }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (d.suggestion) setSuggestion(d.suggestion);
        })
        .catch(() => {});
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
          <div className="relative flex-1">
            {!input && (
              <div className="pointer-events-none absolute inset-0 flex items-center truncate rounded-full px-4 text-sm text-zinc-400 dark:text-zinc-600">
                {suggestion}
              </div>
            )}
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (!input && (e.key === "ArrowRight" || e.key === "Tab")) {
                  e.preventDefault();
                  acceptSuggestion();
                }
              }}
              className="relative w-full rounded-full border border-zinc-300 bg-transparent px-4 py-2 text-sm outline-none dark:border-zinc-700 dark:text-zinc-50"
            />
          </div>
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
