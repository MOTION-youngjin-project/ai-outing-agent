import { ExternalApiError, fetchPublicDataJson, readApiKey } from "./public-data";
import { normalizeRegion } from "./regions";

const ENDPOINT = "https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty";

export async function getAirQuality(regionInput: string) {
  const region = normalizeRegion(regionInput);
  if (!region) throw new ExternalApiError("INVALID_REGION", "지원하는 시·도 지역명이 아닙니다.", 400);

  const params = new URLSearchParams({
    returnType: "json",
    numOfRows: "200",
    pageNo: "1",
    sidoName: region,
    ver: "1.3",
  });
  const apiKey = readApiKey("AIRKOREA_API_KEY");
  const body = await fetchPublicDataJson(`${ENDPOINT}?serviceKey=${apiKey}&${params}`);
  const serviceError = body?.OpenAPI_ServiceResponse?.cmmMsgHeader?.errMsg;
  if (serviceError) throw new ExternalApiError("AIRKOREA_ERROR", serviceError);
  if (body?.response?.header?.resultCode !== "00") {
    throw new ExternalApiError("AIRKOREA_ERROR", body?.response?.header?.resultMsg ?? "에어코리아 API 오류");
  }

  const items = (body?.response?.body?.items ?? []) as Array<{
    stationName?: string;
    dataTime?: string;
    pm10Value?: string;
    pm25Value?: string;
  }>;
  const numeric = (value?: string) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };
  const stations = items.map((item) => ({
    stationName: item.stationName ?? null,
    measuredAt: item.dataTime ?? null,
    pm10: numeric(item.pm10Value),
    pm25: numeric(item.pm25Value),
  }));

  return { source: "AIRKOREA", region, stationCount: stations.length, stations };
}
