import Image from "next/image";

// 서비스 로고(NAPL 워드마크). 원본은 public/napl-logo.png — 628×160 투명 PNG이고,
// 마크만 필요한 자리는 public/napl-mark.png(256×256), 브라우저 탭 아이콘은
// src/app/icon.png를 Next가 자동으로 집어간다.
//
// 높이만 className으로 주고 너비는 w-auto로 따라가게 한다 — 워드마크는 가로세로
// 비율이 틀어지면 바로 티가 나므로 한쪽만 지정한다.
export function Logo({
  className = "h-6",
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/napl-logo.png"
      alt="NAPL"
      width={628}
      height={160}
      priority={priority}
      className={`w-auto ${className}`}
    />
  );
}

// 가로가 좁은 자리(작은 버튼·빈 상태 등)에서 쓰는 마크 단독 버전.
export function LogoMark({ className = "h-7" }: { className?: string }) {
  return (
    <Image src="/napl-mark.png" alt="NAPL" width={256} height={256} className={`w-auto ${className}`} />
  );
}
