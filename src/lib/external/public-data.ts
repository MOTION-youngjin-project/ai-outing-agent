export class ExternalApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 502,
  ) {
    super(message);
  }
}

export async function fetchPublicDataJson(url: string) {
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
  } catch (error) {
    throw new ExternalApiError(
      "EXTERNAL_API_UNREACHABLE",
      error instanceof Error ? error.message : "외부 API에 연결할 수 없습니다.",
    );
  }

  const text = await response.text();
  if (!response.ok) {
    throw new ExternalApiError("EXTERNAL_API_HTTP_ERROR", `외부 API가 HTTP ${response.status}를 반환했습니다.`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new ExternalApiError("EXTERNAL_API_INVALID_RESPONSE", "외부 API가 JSON이 아닌 응답을 반환했습니다.");
  }
}

export function readApiKey(name: "AIRKOREA_API_KEY" | "KMA_API_KEY") {
  const value = process.env[name]?.trim();
  if (!value) throw new ExternalApiError("API_KEY_NOT_CONFIGURED", `${name}가 설정되지 않았습니다.`, 503);
  return value;
}
