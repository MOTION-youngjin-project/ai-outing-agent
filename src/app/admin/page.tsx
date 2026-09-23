import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { loadAdQuota } from "@/lib/ads/quota";

// Prisma를 직접 조회하는 서버 컴포넌트라 정적 프리렌더를 끈다(billing/page.tsx와 같은 이유).
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

type StatFilter = "has_credits" | "usage_today" | "failed_payments";

const FILTER_LABEL: Record<StatFilter, string> = {
  has_credits: "질문권 보유 사용자만",
  usage_today: "오늘 사용한 사용자만",
  failed_payments: "최근 7일 결제 실패 사용자만",
};

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; deleted?: string; filter?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login?next=/admin");
  if (!isAdminEmail(session.user.email)) redirect("/");

  const { q = "", page: pageParam, deleted, filter: filterParam } = await searchParams;
  const filter: StatFilter | null =
    filterParam === "has_credits" || filterParam === "usage_today" || filterParam === "failed_payments" ? filterParam : null;
  const page = Math.max(1, Number(pageParam) || 1);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // 통계 카드 클릭 = 그 조건으로 목록을 필터링(드릴다운). 검색어와는 AND로 같이 걸린다.
  const searchWhere = q ? { OR: [{ email: { contains: q } }, { name: { contains: q } }] } : null;
  const filterWhere =
    filter === "has_credits"
      ? { adCredit: { credits: { gt: 0 } } }
      : filter === "usage_today"
        ? { usages: { some: { createdAt: { gte: todayStart } } } }
        : filter === "failed_payments"
          ? { payments: { some: { status: "failed" as const, requestedAt: { gte: sevenDaysAgo } } } }
          : null;
  const where = searchWhere && filterWhere ? { AND: [searchWhere, filterWhere] } : (searchWhere ?? filterWhere ?? {});

  const [users, total, totalUsers, usersWithCredits, todayUsage, recentFailedPayments] = await Promise.all([
    prisma.user.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.user.count({ where }),
    prisma.user.count(),
    prisma.adCredit.count({ where: { credits: { gt: 0 } } }),
    prisma.recommendationUsage.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.payment.count({ where: { status: "failed", requestedAt: { gte: sevenDaysAgo } } }),
  ]);

  const adQuotas = await Promise.all(users.map((u) => loadAdQuota({ userId: u.id.toString() })));
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (overrides: Record<string, string | number | null>) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (filter) params.set("filter", filter);
    for (const [key, value] of Object.entries(overrides)) {
      if (value === null) params.delete(key);
      else params.set(key, String(value));
    }
    const s = params.toString();
    return s ? `/admin?${s}` : "/admin";
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10 text-ink">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">관리자 · 계정 관리</h1>
        <Link href="/admin/audit-log" className="text-sm text-accent-deep hover:underline">
          관리자 작업 이력 →
        </Link>
      </div>

      {deleted === "1" && (
        <p className="rounded-lg bg-mint-bg px-4 py-2 text-sm text-ink-soft">계정을 삭제했습니다.</p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="총 가입자" value={totalUsers} href={qs({ filter: null, page: null })} active={filter === null} />
        <StatCard label="질문권 보유" value={usersWithCredits} href={qs({ filter: "has_credits", page: null })} active={filter === "has_credits"} />
        <StatCard label="오늘 사용 횟수" value={todayUsage} href={qs({ filter: "usage_today", page: null })} active={filter === "usage_today"} />
        <StatCard
          label="최근 7일 결제 실패"
          value={recentFailedPayments}
          href={qs({ filter: "failed_payments", page: null })}
          active={filter === "failed_payments"}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <form className="flex gap-2" action="/admin">
          {filter && <input type="hidden" name="filter" value={filter} />}
          <input
            name="q"
            defaultValue={q}
            placeholder="이메일 또는 이름으로 검색"
            className="w-full max-w-xs rounded-lg border border-hairline px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
            검색
          </button>
        </form>
        {filter && (
          <p className="flex items-center gap-2 text-sm text-ink-soft">
            {FILTER_LABEL[filter]}만 보는 중
            <Link href={qs({ filter: null, page: null })} className="text-accent-deep hover:underline">
              필터 해제
            </Link>
          </p>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-hairline">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-page text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">이메일</th>
              <th className="px-4 py-2 font-medium">이름</th>
              <th className="px-4 py-2 font-medium">가입일</th>
              <th className="px-4 py-2 font-medium">인증수단</th>
              <th className="px-4 py-2 font-medium">오늘 무료</th>
              <th className="px-4 py-2 font-medium">질문권</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user, i) => (
              <tr key={user.id.toString()} className="border-t border-hairline hover:bg-page">
                <td className="px-4 py-2">
                  <Link href={`/admin/users/${user.id}`} className="font-medium text-accent-deep hover:underline">
                    {user.email}
                  </Link>
                </td>
                <td className="px-4 py-2 text-ink-soft">{user.name ?? "-"}</td>
                <td className="px-4 py-2 text-ink-soft">{user.createdAt.toISOString().slice(0, 10)}</td>
                <td className="px-4 py-2 text-ink-soft">{user.passwordHash ? "이메일" : "소셜"}</td>
                <td className="px-4 py-2 text-ink-soft">{adQuotas[i].freeAvailableToday ? "가능" : "사용함"}</td>
                <td className="px-4 py-2 text-ink-soft">{adQuotas[i].credits}개</td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  검색 결과가 없습니다.
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
              href={qs({ page: p })}
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

function StatCard({ label, value, href, active }: { label: string; value: number; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded-lg border px-4 py-3 transition-colors ${
        active ? "border-accent bg-mint-bg" : "border-hairline bg-white hover:border-accent"
      }`}
    >
      <p className="text-xs text-muted">{label}</p>
      <p className="text-lg font-bold text-ink">{value}</p>
    </Link>
  );
}
