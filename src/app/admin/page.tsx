import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { loadQuota } from "@/lib/billing/quota";

// Prisma를 직접 조회하는 서버 컴포넌트라 정적 프리렌더를 끈다(billing/page.tsx와 같은 이유).
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; deleted?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login?next=/admin");
  if (!isAdminEmail(session.user.email)) redirect("/");

  const { q = "", page: pageParam, deleted } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const where = q ? { OR: [{ email: { contains: q } }, { name: { contains: q } }] } : {};
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [users, total, totalUsers, activeSubscriptions, todayUsage, recentFailedPayments] = await Promise.all([
    prisma.user.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.user.count({ where }),
    prisma.user.count(),
    prisma.subscription.count({ where: { status: "active" } }),
    prisma.recommendationUsage.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.payment.count({ where: { status: "failed", requestedAt: { gte: sevenDaysAgo } } }),
  ]);

  const quotas = await Promise.all(users.map((u) => loadQuota(u.id.toString())));
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10 text-ink">
      <h1 className="text-xl font-bold">관리자 · 계정 관리</h1>

      {deleted === "1" && (
        <p className="rounded-lg bg-mint-bg px-4 py-2 text-sm text-ink-soft">계정을 삭제했습니다.</p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="총 가입자" value={totalUsers} />
        <StatCard label="활성 구독자" value={activeSubscriptions} />
        <StatCard label="오늘 사용 횟수" value={todayUsage} />
        <StatCard label="최근 7일 결제 실패" value={recentFailedPayments} />
      </div>

      <form className="flex gap-2" action="/admin">
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

      <div className="overflow-x-auto rounded-lg border border-hairline">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-page text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">이메일</th>
              <th className="px-4 py-2 font-medium">이름</th>
              <th className="px-4 py-2 font-medium">가입일</th>
              <th className="px-4 py-2 font-medium">인증수단</th>
              <th className="px-4 py-2 font-medium">플랜</th>
              <th className="px-4 py-2 font-medium">이번 기간 사용량</th>
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
                <td className="px-4 py-2 text-ink-soft">{quotas[i].tierName}</td>
                <td className="px-4 py-2 text-ink-soft">
                  {quotas[i].used}/{quotas[i].limit}
                </td>
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
              href={`/admin?q=${encodeURIComponent(q)}&page=${p}`}
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

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-hairline bg-white px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-lg font-bold text-ink">{value}</p>
    </div>
  );
}
