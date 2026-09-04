import { ExternalApiError, fetchPublicDataJson, readApiKey } from "./public-data";
import { latitudeLongitudeToGrid, normalizeRegion, REGION_COORDINATES } from "./regions";

const ENDPOINT = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst";
const FORECAST_HOURS = [2, 5, 8, 11, 14, 17, 20, 23];

function latestForecastBase() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  let date = `${part("year")}${part("month")}${part("day")}`;
  const currentHour = Number(part("hour"));
  let hour = [...FORECAST_HOURS].reverse().find((value) => value * 100 + 10 <= currentHour * 100);

  if (hour === undefined) {
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(yesterday).replaceAll("-", "");
    hour = 23;
  }

  return { baseDate: date, baseTime: `${String(hour).padStart(2, "0")}00` };
}

export async function getWeather(regionInput: string) {
  const region = normalizeRegion(regionInput);
  if (!region) throw new ExternalApiError("INVALID_REGION", "지원하는 시·도 지역명이 아닙니다.", 400);

  const coordinates = REGION_COORDINATES[region];
  const { nx, ny } = latitudeLongitudeToGrid(coordinates.latitude, coordinates.longitude);
  const { baseDate, baseTime } = latestForecastBase();
  const params = new URLSearchParams({
    dataType: "JSON",
    numOfRows: "1000",
    pageNo: "1",
    base_date: baseDate,
    base_time: baseTime,
    nx: String(nx),
    ny: String(ny),
  });
  const apiKey = readApiKey("KMA_API_KEY");
  const body = await fetchPublicDataJson(`${ENDPOINT}?serviceKey=${apiKey}&${params}`);
  const serviceError = body?.OpenAPI_ServiceResponse?.cmmMsgHeader?.errMsg;
  if (serviceError) throw new ExternalApiError("KMA_ERROR", serviceError);
  if (body?.response?.header?.resultCode !== "00") {
    throw new ExternalApiError("KMA_ERROR", body?.response?.header?.resultMsg ?? "기상청 API 오류");
  }

  const items = (body?.response?.body?.items?.item ?? []) as Array<{
    category: string;
    fcstDate: string;
    fcstTime: string;
    fcstValue: string;
  }>;
  if (items.length === 0) throw new ExternalApiError("KMA_EMPTY_RESPONSE", "예보 데이터가 없습니다.");
  const target = items.map((item) => `${item.fcstDate}${item.fcstTime}`).sort()[0];
  const slot = items.filter((item) => `${item.fcstDate}${item.fcstTime}` === target);
  const value = (category: string) => slot.find((item) => item.category === category)?.fcstValue ?? null;

  return {
    source: "KMA",
    region,
    grid: { nx, ny },
    forecastAt: target,
    temperatureC: value("TMP"),
    precipitationProbability: value("POP"),
    precipitationType: value("PTY"),
    sky: value("SKY"),
  };
}
