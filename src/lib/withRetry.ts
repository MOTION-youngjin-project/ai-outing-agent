// 여러 외부 API 호출부(공공데이터·카카오 등)가 거의 똑같은 "N회 재시도 + 그 사이
// 고정 대기" 루프를 각자 갖고 있던 걸 하나로 합쳤다.
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function withRetry<T>(fn: () => Promise<T>, attempts: number, delayMs = 500): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < attempts) await sleep(delayMs);
    }
  }
  throw lastError;
}
