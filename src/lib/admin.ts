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
