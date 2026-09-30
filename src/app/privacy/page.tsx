export const metadata = {
  title: "개인정보처리방침 | 나들플랜",
};

export default function PrivacyPage() {
  return (
    <div className="flex flex-col gap-6 px-5 py-8 text-sm leading-relaxed text-ink-soft">
      <div>
        <h1 className="text-lg font-bold text-ink">개인정보처리방침</h1>
        <p className="mt-1 text-xs text-muted">시행일자: 2026년 9월 17일</p>
      </div>

      <p>
        나들플랜(이하 &quot;서비스&quot;)은 이용자의 개인정보를 중요시하며, 「개인정보 보호법」 등
        관련 법령을 준수합니다. 본 방침은 서비스가 어떤 개인정보를 수집·이용하는지 안내합니다.
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold text-ink">1. 수집하는 개인정보 항목</h2>
        <ul className="list-disc pl-5">
          <li>회원가입 시: 이메일, 비밀번호(암호화 저장), 이름(선택)</li>
          <li>서비스 이용 시: 위치정보(GPS), AI 챗봇과의 대화 내용, 저장한 장소·코스 정보</li>
          <li>푸시 알림 이용 시: 기기 푸시 토큰(FCM 토큰)</li>
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold text-ink">2. 수집 목적</h2>
        <ul className="list-disc pl-5">
          <li>회원 식별 및 로그인 유지</li>
          <li>현재 위치 기반 나들이 장소·코스 추천</li>
          <li>AI 챗봇을 통한 질의응답 및 맞춤 추천 제공</li>
          <li>공지사항 등 푸시 알림 발송</li>
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold text-ink">3. 개인정보의 처리 위탁 및 제3자 제공</h2>
        <p>서비스는 아래 외부 사업자를 통해 일부 기능을 제공하며, 이 과정에서 필요한 최소한의 정보가 전달됩니다.</p>
        <ul className="list-disc pl-5">
          <li>Google(Firebase Cloud Messaging, Gemini API) — 푸시 알림 발송, AI 응답 생성</li>
          <li>네이버(지도·길찾기 API) — 지도 표시 및 경로 안내</li>
          <li>공공데이터포털(대기질 등 생활정보 API) — 생활정보 제공</li>
        </ul>
        <p>법령에 특별한 규정이 있는 경우를 제외하고, 위 목적 외로 개인정보를 제3자에게 제공하지 않습니다.</p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold text-ink">4. 보유 및 이용 기간</h2>
        <p>
          회원 탈퇴 시까지 보유하며, 탈퇴 시 지체 없이 파기합니다. 단, 관계 법령에 따라 보존이
          필요한 경우 해당 기간 동안 별도 보관합니다.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold text-ink">5. 이용자의 권리</h2>
        <p>
          이용자는 언제든지 자신의 개인정보를 열람·정정·삭제하거나 처리 정지를 요구할 수 있으며,
          마이페이지 또는 아래 문의처를 통해 요청할 수 있습니다.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold text-ink">6. 문의처</h2>
        <p>개인정보 관련 문의: yjwest9@gmail.com</p>
      </section>
    </div>
  );
}
