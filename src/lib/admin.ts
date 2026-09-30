import { prisma } from "@/lib/prisma";
import type { AdminActionType, Prisma } from "../../generated/prisma/client";

// 관리자 여부는 DB role 컬럼 없이 환경변수 허용목록으로 판단한다. 팀원이 3명으로
// 고정돼 있고(CONTRIBUTING.md) 수시로 바뀌지 않으므로, 이 정도면 role 컬럼 +
// 마이그레이션보다 가볍고 충분하다. 이메일 비교는 대소문자/공백에 안전하게 정규화한다.
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowlist = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(email.trim().toLowerCase());
}

// 파괴적/과금 관련 관리자 액션의 감사 로그. targetUserId는 계정 삭제 후에도 로그가
// 남아야 하므로 FK 없이 그냥 값만 저장하고(스키마의 admin_action_logs 주석 참고),
// targetEmail을 스냅샷으로 같이 남겨서 삭제된 계정도 로그만 보고 알아볼 수 있게 한다.
// request.url은 리버스 프록시가 Host 헤더를 그대로 넘기지 않으면 백엔드가 바인딩한
// 내부 주소(예: localhost:4000)로 나온다. x-forwarded-host를 우선해서 절대 URL을
// 만든다. x-forwarded-proto는 안 쓴다 — nginx가 자신과 백엔드 사이의 내부 연결
// 스킴(보통 http)을 그대로 넘기는 경우가 흔해서(실측: 이 서버가 그랬다) 못 믿는다.
// x-forwarded-host가 있다는 것 자체가 이 프록시를 거쳤다는 신호이고, 이 배포는
// 프록시 바깥으로 http를 노출하지 않으므로 그때는 그냥 https로 확정한다.
export function absoluteUrlFromRequest(request: Request, path: string): URL {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const origin = forwardedHost ? `https://${forwardedHost}` : new URL(request.url).origin;
  return new URL(path, origin);
}

export async function logAdminAction(input: {
  adminEmail: string;
  action: AdminActionType;
  targetUserId: bigint;
  targetEmail: string;
  detail?: Prisma.InputJsonValue;
}) {
  await prisma.adminActionLog.create({
    data: {
      adminEmail: input.adminEmail,
      action: input.action,
      targetUserId: input.targetUserId,
      targetEmail: input.targetEmail,
      detail: input.detail,
    },
  });
}
