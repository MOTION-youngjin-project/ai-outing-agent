// 토스페이먼츠 API 호출부. **서버 전용** — 시크릿 키를 읽으므로 클라이언트 컴포넌트에서
// import하면 안 된다.
//
// 구독은 일반 결제(결제위젯)가 아니라 빌링키 방식이다: 카드 등록으로 빌링키를 한 번
// 발급받고, 이후 결제는 서버가 그 키로 승인 API를 직접 호출한다.

const API_BASE = "https://api.tosspayments.com";

export class TossError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "TossError";
  }
}

// 인증은 Basic base64(secretKey + ":") — **콜론이 필수다.** 시크릿 키가 사용자명이고
// 비밀번호가 빈 문자열인 HTTP Basic 인증이라, 콜론을 빠뜨리면 401이 난다(흔한 실수).
function authHeader(): string {
  const secretKey = process.env.TOSS_SECRET_KEY;
  if (!secretKey) throw new TossError("MISSING_SECRET_KEY", "결제 설정이 완료되지 않았습니다.");
  return `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`;
}

async function tossFetch<T>(path: string, init: { method: "GET" | "POST"; body?: unknown; idempotencyKey?: string }): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: init.method,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      // 멱등키. 네트워크 재시도로 같은 승인이 두 번 나가면 이중 결제가 된다 —
      // 같은 키로 다시 오면 토스가 처음 결과를 그대로 돌려준다.
      ...(init.idempotencyKey ? { "Idempotency-Key": init.idempotencyKey } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // 에러 본문은 { code, message } 형태다. 시크릿 키가 메시지에 섞여 나올 일은 없지만,
    // 원문을 그대로 사용자에게 노출하지 않고 호출부가 골라 쓰게 둔다.
    const code = typeof data?.code === "string" ? data.code : `HTTP_${res.status}`;
    const message = typeof data?.message === "string" ? data.message : "결제 요청에 실패했습니다.";
    throw new TossError(code, message);
  }
  return data as T;
}

export type TossPayment = {
  paymentKey: string;
  orderId: string;
  status: string; // DONE / CANCELED / ABORTED / EXPIRED ...
  totalAmount: number;
  approvedAt: string | null;
};

// 카드 등록(requestBillingAuth) 성공 후 받은 1회용 authKey를 빌링키로 바꾼다.
export async function issueBillingKey(authKey: string, customerKey: string): Promise<string> {
  const data = await tossFetch<{ billingKey: string }>("/v1/billing/authorizations/issue", {
    method: "POST",
    body: { authKey, customerKey },
  });
  if (!data?.billingKey) throw new TossError("NO_BILLING_KEY", "빌링키 발급 응답이 올바르지 않습니다.");
  return data.billingKey;
}

// 빌링키로 실제 승인. amount는 반드시 호출부가 서버의 TOPUP_AMOUNT_KRW에서 읽은 값이어야 한다 —
// 이 함수는 클라이언트가 보낸 금액을 받을 경로 자체가 없다.
export async function chargeWithBillingKey(params: {
  billingKey: string;
  customerKey: string;
  orderId: string;
  orderName: string;
  amount: number;
  customerEmail?: string | null;
}): Promise<TossPayment> {
  return tossFetch<TossPayment>(`/v1/billing/${encodeURIComponent(params.billingKey)}`, {
    method: "POST",
    idempotencyKey: params.orderId,
    body: {
      customerKey: params.customerKey,
      orderId: params.orderId,
      orderName: params.orderName,
      amount: params.amount,
      ...(params.customerEmail ? { customerEmail: params.customerEmail } : {}),
    },
  });
}

// 웹훅이 왔을 때 본문 대신 이걸로 진짜 상태를 확인한다 — 본문은 누구나 우리 엔드포인트에
// POST할 수 있으므로 신뢰 경계 밖이다. orderId만 힌트로 받고 결제 상태는 우리 시크릿 키로
// 직접 물어본다(서명 검증 코드를 따로 짜지 않고도 신뢰 경계가 닫힌다).
export async function fetchPaymentByOrderId(orderId: string): Promise<TossPayment> {
  return tossFetch<TossPayment>(`/v1/payments/orders/${encodeURIComponent(orderId)}`, { method: "GET" });
}
