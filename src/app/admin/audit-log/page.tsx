import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const ACTION_LABEL: Record<string, string> = {
  grant_ad_credit: "질문권 무료 지급",
  reset_daily_free: "오늘 무료 초기화",
  delete_account: "계정 영구 삭제",
};

export default async function AdminAuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login?next=/admin/audit-log");
  if (!isAdminEmail(session.user.email)) redirect("/");

  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const [logs, total] = await Promise.all([
    prisma.adminActionLog.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.adminActionLog.count(),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // 대상 계정이 이미 삭제됐으면 상세 페이지로 링크를 걸 수 없다 — 지금 존재하는
  // 계정만 골라서 링크로, 나머지는 이메일 텍스트로만 보여준다.
  const candidateIds = [...new Set(logs.map((l) => l.targetUserId).filter((id): id is bigint => id !== null))];
  const existingIds = new Set(
    (await prisma.user.findMany({ where: { id: { in: candidateIds } }, select: { id: true } })).map((u) => u.id.toString())
  );

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10 text-ink">
      <div>
        <Link href="/admin" className="text-sm text-muted hover:underline">
          ← 목록으로
        </Link>
        <h1 className="mt-2 text-xl font-bold">관리자 작업 이력</h1>
        <p className="text-sm text-ink-soft">구독 지급/해지, 계정 삭제 같은 조작이 여기 전부 기록됩니다. 대상 계정이 나중에 삭제돼도 기록은 남습니다.</p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-hairline">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-page text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">일시</th>
              <th className="px-4 py-2 font-medium">관리자</th>
              <th className="px-4 py-2 font-medium">작업</th>
              <th className="px-4 py-2 font-medium">대상 계정</th>
              <th className="px-4 py-2 font-medium">상세</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id.toString()} className="border-t border-hairline">
                <td className="px-4 py-2 text-ink-soft">{log.createdAt.toISOString().replace("T", " ").slice(0, 19)}</td>
                <td className="px-4 py-2 text-ink-soft">{log.adminEmail}</td>
                <td className="px-4 py-2 text-ink-soft">{ACTION_LABEL[log.action] ?? log.action}</td>
                <td className="px-4 py-2">
                  {log.targetUserId && existingIds.has(log.targetUserId.toString()) ? (
                    <Link href={`/admin/users/${log.targetUserId}`} className="text-accent-deep hover:underline">
                      {log.targetEmail}
                    </Link>
                  ) : (
                    <span className="text-ink-soft">{log.targetEmail} (삭제됨)</span>
                  )}
                </td>
                <td className="px-4 py-2 text-ink-soft">{log.detail ? JSON.stringify(log.detail) : "-"}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  기록이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex gap-2 text-sm">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/admin/audit-log?page=${p}`}
              className={`rounded-lg px-3 py-1 ${p === page ? "bg-accent text-white" : "border border-hairline text-ink-soft"}`}
            >
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
