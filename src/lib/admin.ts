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
