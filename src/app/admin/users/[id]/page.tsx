import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { loadAdQuota } from "@/lib/ads/quota";

export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<string, string> = {
  grant_ad_credit: "질문권 무료 지급",
  reset_daily_free: "오늘 무료 초기화",
  delete_account: "계정 영구 삭제",
};

export default async function AdminUserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login?next=/admin");
  if (!isAdminEmail(session.user.email)) redirect("/");

  const { id } = await params;
  const { error } = await searchParams;
  let userId: bigint;
  try {
    userId = BigInt(id);
  } catch {
    notFound();
  }

  const [user, usages, payments, actionLogs] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.recommendationUsage.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.payment.findMany({ where: { userId }, orderBy: { requestedAt: "desc" } }),
    prisma.adminActionLog.findMany({ where: { targetUserId: userId }, orderBy: { createdAt: "desc" } }),
  ]);

  if (!user) notFound();
  const adQuota = await loadAdQuota(id);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10 text-ink">
      <div>
        <Link href="/admin" className="text-sm text-muted hover:underline">
          ← 목록으로
        </Link>
        <h1 className="mt-2 text-xl font-bold">{user.email}</h1>
        <p className="text-sm text-ink-soft">
          {user.name ?? "이름 없음"} · 가입일 {user.createdAt.toISOString().slice(0, 10)} ·{" "}
          {user.passwordHash ? "이메일 로그인" : "소셜 로그인 전용"}
        </p>
      </div>

      {error === "confirm_mismatch" && (
        <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
          입력한 이메일이 일치하지 않아 삭제하지 않았습니다.
        </p>
      )}

      <section className="flex flex-col gap-3 rounded-lg border border-hairline p-4">
        <h2 className="font-semibold">광고 질문권</h2>
        <p className="text-sm text-ink-soft">
          오늘 무료: <strong className="text-ink">{adQuota.freeAvailableToday ? "사용 가능" : "이미 사용함"}</strong> · 보유
          질문권 <strong className="text-ink">{adQuota.credits}개</strong>
        </p>

        <div className="flex flex-wrap items-end gap-3 border-t border-hairline pt-3">
          <form action={`/api/admin/users/${id}/ad-credit`} method="POST" className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="action" value="grant" />
            <label className="flex flex-col text-xs text-muted">
              지급 개수
              <input
                name="credits"
                type="number"
                min={1}
                defaultValue={3}
                className="w-20 rounded-lg border border-hairline px-2 py-1 text-sm text-ink"
              />
            </label>
            <button type="submit" className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white">
              질문권 무료로 지급
            </button>
          </form>

          {!adQuota.freeAvailableToday && (
            <form action={`/api/admin/users/${id}/ad-credit`} method="POST">
              <input type="hidden" name="action" value="reset_free" />
              <button type="submit" className="rounded-lg border border-hairline px-3 py-1.5 text-sm text-ink-soft">
                오늘 무료 초기화
              </button>
            </form>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-2 rounded-lg border border-hairline p-4">
        <h2 className="font-semibold">최근 사용 내역 (최대 20건)</h2>
        {usages.length === 0 ? (
          <p className="text-sm text-muted">사용 내역이 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm text-ink-soft">
            {usages.map((u) => (
              <li key={u.id.toString()}>
                {u.createdAt.toISOString().replace("T", " ").slice(0, 19)} · {u.costKrw > 0 ? `${u.costKrw.toLocaleString()}원 차감` : "무료"}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-lg border border-hairline p-4">
        <h2 className="font-semibold">결제 내역</h2>
        {payments.length === 0 ? (
          <p className="text-sm text-muted">결제 내역이 없습니다.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className="py-1 font-medium">일시</th>
                <th className="py-1 font-medium">금액</th>
                <th className="py-1 font-medium">상태</th>
                <th className="py-1 font-medium">비고</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id.toString()} className="border-t border-hairline text-ink-soft">
                  <td className="py-1">{p.requestedAt.toISOString().replace("T", " ").slice(0, 19)}</td>
                  <td className="py-1">{p.amount.toLocaleString()}원</td>
                  <td className="py-1">{p.status}</td>
                  <td className="py-1">{p.failureMessage ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-lg border border-hairline p-4">
        <h2 className="font-semibold">이 계정에 대한 관리자 작업 이력</h2>
        {actionLogs.length === 0 ? (
          <p className="text-sm text-muted">기록이 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm text-ink-soft">
            {actionLogs.map((log) => (
              <li key={log.id.toString()}>
                {log.createdAt.toISOString().replace("T", " ").slice(0, 19)} · {log.adminEmail} ·{" "}
                {ACTION_LABEL[log.action] ?? log.action}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
        <h2 className="font-semibold text-red-700">위험 구역</h2>
        <p className="text-sm text-red-600">
          계정과 연결된 저장 장소·코스·대화 기록·구독·결제 내역이 모두 영구 삭제됩니다. 되돌릴 수 없습니다.
        </p>
        <form action={`/api/admin/users/${id}/delete`} method="POST" className="flex flex-wrap items-center gap-2">
          <input
            name="confirmEmail"
            placeholder="확인을 위해 이메일 입력"
            className="rounded-lg border border-red-200 px-3 py-1.5 text-sm"
          />
          <button type="submit" className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white">
            계정 영구 삭제
          </button>
        </form>
      </section>
    </div>
  );
}
