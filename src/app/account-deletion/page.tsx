export const metadata = {
  title: "계정 및 데이터 삭제 안내 | 나들플랜",
};

export default function AccountDeletionPage() {
  return (
    <div className="flex flex-col gap-6 px-5 py-8 text-sm leading-relaxed text-ink-soft">
      <div>
        <h1 className="text-lg font-bold text-ink">계정 및 데이터 삭제 안내</h1>
      </div>

      <p>
        나들플랜은 현재 앱 내 자동 탈퇴 기능을 제공하지 않으며, 아래 이메일로 요청하시면
        영업일 기준 7일 이내에 계정과 관련 데이터를 삭제해 드립니다.
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold text-ink">삭제 요청 방법</h2>
        <p>
          가입 시 사용한 이메일로 <strong className="text-ink">yjwest9@gmail.com</strong>에
          &quot;계정 삭제 요청&quot; 제목으로 메일을 보내주세요. 본인 확인을 위해 가입 이메일과
          동일한 주소로 보내주셔야 합니다.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold text-ink">삭제되는 데이터</h2>
        <ul className="list-disc pl-5">
          <li>계정 정보(이메일, 비밀번호, 이름)</li>
          <li>AI 챗봇과의 대화 내용</li>
          <li>저장한 장소·코스 정보</li>
          <li>기기 푸시 토큰(FCM 토큰)</li>
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold text-ink">문의처</h2>
        <p>yjwest9@gmail.com</p>
      </section>
    </div>
  );
}
