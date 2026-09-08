// 목업의 아웃라인 아이콘을 인라인 SVG로 옮긴 것. 아이콘 라이브러리를 새로 넣지 않으려고
// 필요한 것만 직접 그림(유니코드 문자로 때우면 아이콘처럼 안 보여서 교체).
export function Icon({ name, className = "h-5 w-5" }: { name: string; className?: string }) {
  const paths: Record<string, React.ReactNode> = {
    back: <path d="M15 5l-7 7 7 7" />,
    next: <path d="M9 5l7 7-7 7" />,
    gear: (
      <>
        <circle cx="12" cy="12" r="3.2" />
        <path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5v.2a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 110-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1h.2a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z" />
      </>
    ),
    heart: <path d="M20.8 8.6c0 5-8.8 10-8.8 10s-8.8-5-8.8-10a5 5 0 018.8-3.2A5 5 0 0120.8 8.6z" />,
    sparkle: <path d="M12 3l2.1 5.4L19.5 10l-5.4 1.6L12 17l-2.1-5.4L4.5 10l5.4-1.6L12 3z" />,
    pin: (
      <>
        <path d="M20 10c0 5.5-8 12-8 12s-8-6.5-8-12a8 8 0 1116 0z" />
        <circle cx="12" cy="10" r="2.6" />
      </>
    ),
    dust: (
      <>
        <circle cx="12" cy="12" r="8.4" />
        <path d="M4.6 14.4c2.6.9 4.6-1.2 7.4-1.2s5 1.6 7.4.6" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2.6v2M12 19.4v2M4.5 4.5l1.4 1.4M18.1 18.1l1.4 1.4M2.6 12h2M19.4 12h2M4.5 19.5l1.4-1.4M18.1 5.9l1.4-1.4" />
      </>
    ),
    home: <path d="M4 10.5L12 4l8 6.5V20a1 1 0 01-1 1h-4v-6H9v6H5a1 1 0 01-1-1v-9.5z" />,
    compass: (
      <>
        <circle cx="12" cy="12" r="8.6" />
        <circle cx="12" cy="12" r="2.6" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8.4" r="3.6" />
        <path d="M4.8 20a7.4 7.4 0 0114.4 0" />
      </>
    ),
    parking: (
      <>
        <circle cx="12" cy="12" r="8.6" />
        <path d="M10 17V7.8h2.9a2.9 2.9 0 010 5.8H10" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="8.6" />
        <path d="M12 7.2V12l3 1.8" />
      </>
    ),
    bookmark: <path d="M6.5 4h11a1 1 0 011 1v15l-6.5-4-6.5 4V5a1 1 0 011-1z" />,
    card: (
      <>
        <rect x="2.5" y="5.5" width="19" height="13" rx="2" />
        <path d="M2.5 9.5h19" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="8.6" />
        <path d="M12 11v5.5M12 8v.1" />
      </>
    ),
    send: <path d="M4.5 12l15-7.5-4 15-3.6-5.6L4.5 12z" />,
    drop: <path d="M12 3.5c3 4 6 7.4 6 11a6 6 0 01-12 0c0-3.6 3-7 6-11z" />,
    users: (
      <>
        <circle cx="9" cy="8.6" r="2.8" />
        <path d="M4 19a5 5 0 0110 0" />
        <path d="M15.5 6.4a2.8 2.8 0 010 5.4" />
        <path d="M15 13.4c2.4.3 4 1.8 4.5 5.6" />
      </>
    ),
    share: (
      <>
        <path d="M12 15V4M8 8l4-4 4 4" />
        <path d="M5 12v6.5A1.5 1.5 0 006.5 20h11a1.5 1.5 0 001.5-1.5V12" />
      </>
    ),
    triangleAlert: <path d="M12 4.2L21.5 20H2.5L12 4.2z" strokeLinejoin="round" />,
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {paths[name]}
    </svg>
  );
}
