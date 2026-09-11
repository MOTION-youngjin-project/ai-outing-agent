"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider, useSession } from "next-auth/react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useAppStore } from "@/lib/store";

export function Providers({ children }: { children: ReactNode }) {
  return <SessionProvider><SessionBoundary>{children}</SessionBoundary></SessionProvider>;
}

function SessionBoundary({ children }: { children: ReactNode }) {
  const session = useSession();
  const identity = session.status === "loading" ? "loading" : session.data?.user?.id ?? "guest";
  const previous = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (identity === "loading") return;
    if (previous.current !== null && previous.current !== identity) {
      useAppStore.setState({ input: "", history: [], lastRecommendation: null, sidebarOpen: false });
    }
    previous.current = identity;
  }, [identity]);
  if (identity === "loading") return <div role="status" className="p-5 text-sm text-muted">로그인 상태를 확인하는 중…</div>;
  return <UserQueries key={identity}>{children}</UserQueries>;
}

function UserQueries({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  useEffect(() => () => { queryClient.clear(); }, [queryClient]);
  return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
