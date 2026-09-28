import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

// prisma 직접 조회하는 서버 컴포넌트라 정적 프리렌더를 끈다(admin/page.tsx와 같은 이유).
export const dynamic = "force-dynamic";

export default async function AdminPhotoReportsPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login?next=/admin/photo-reports");
  if (!isAdminEmail(session.user.email)) redirect("/");

  const reports = await prisma.placeImageReport.findMany({
    where: { resolvedAt: null },
    orderBy: { createdAt: "desc" },
    include: { image: { include: { place: true } } },
  });

  // 사진 하나에 신고가 여러 건 쌓여도 처리(숨기기/무시)는 사진 단위라, 화면에도
  // placeImageId로 묶어서 보여준다 — 신고 건수만큼 같은 사진이 줄줄이 안 나오게.
  const groups = new Map<string, { image: (typeof reports)[number]["image"]; count: number; firstReportId: string; latestAt: Date }>();
  for (const r of reports) {
    const key = r.placeImageId.toString();
    const existing = groups.get(key);
    if (existing) existing.count += 1;
    else groups.set(key, { image: r.image, count: 1, firstReportId: r.id.toString(), latestAt: r.createdAt });
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10 text-ink">
      <div>
        <Link href="/admin" className="text-sm text-muted hover:underline">
          ← 목록으로
        </Link>
        <h1 className="mt-2 text-xl font-bold">신고된 장소 사진</h1>
        <p className="text-sm text-ink-soft">사용자가 부적절하다고 신고한 대표사진 큐입니다. 숨기면 그 장소의 다음 순번 사진으로 넘어갑니다.</p>
      </div>

      <div className="flex flex-col gap-3">
        {[...groups.values()].map((g) => (
          <div key={g.firstReportId} className="flex items-center gap-4 rounded-lg border border-hairline p-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- 관리자 전용 미리보기, 외부 공공데이터 이미지 */}
            <img
              src={g.image.thumbnailUrl ?? g.image.originalUrl}
              alt=""
              className="h-16 w-16 flex-shrink-0 rounded-lg object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{g.image.place.name}</p>
              <p className="text-xs text-ink-soft">
                신고 {g.count}건 · 최근 {g.latestAt.toISOString().replace("T", " ").slice(0, 16)}
              </p>
            </div>
            <form action={`/api/admin/photo-reports/${g.firstReportId}`} method="POST">
              <input type="hidden" name="action" value="dismiss" />
              <button type="submit" className="rounded-lg border border-hairline px-3 py-1.5 text-sm text-ink-soft">
                무시
              </button>
            </form>
            <form action={`/api/admin/photo-reports/${g.firstReportId}`} method="POST">
              <input type="hidden" name="action" value="hide" />
              <button type="submit" className="rounded-lg bg-rose-500 px-3 py-1.5 text-sm font-medium text-white">
                숨기기
              </button>
            </form>
          </div>
        ))}
        {groups.size === 0 && <p className="py-8 text-center text-sm text-muted">대기 중인 신고가 없습니다.</p>}
      </div>
    </div>
  );
}
