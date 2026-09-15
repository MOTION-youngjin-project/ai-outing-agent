import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { searchNaverLifeInfo } from "@/lib/external/naver-search";
import { LIFE_INFO_TOPICS, type LifeInfoItem, type LifeInfoSource, type LifeInfoTopic, type PlaceLifeInfo } from "@/lib/life-info";

const CACHE_MS = 7 * 24 * 60 * 60 * 1000;
const REFRESH_COOLDOWN_MS = 60 * 60 * 1000;
const inFlight = new Map<string, Promise<PlaceLifeInfo | null>>();
const KEYWORDS: Record<LifeInfoTopic, RegExp> = {
  parking: /주차|주차장|발렛|파킹|무료\s*주차|제휴\s*주차/,
  access: /셔틀|교통통제|임시\s*주차|픽업|운행|탑승|우회/,
  hours: /영업시간|운영시간|휴무|휴관|라스트\s*오더|입장\s*마감/,
  reservation: /예약|웨이팅|대기|현장접수|사전접수/,
  pet: /반려동물|애견|반려견|노키즈|키즈존|출입\s*(?:가능|불가)/,
};
const RuleSchema = z.object({
  items: z.array(z.object({
    topic: z.enum(LIFE_INFO_TOPICS), summary: z.string().max(180), sourceIndexes: z.array(z.number().int().min(0).max(4)),
  })).max(5),
});

function topicFromText(text: string): LifeInfoTopic[] {
  return LIFE_INFO_TOPICS.filter((topic) => KEYWORDS[topic].test(text));
}

function scoreSource(source: LifeInfoSource): number {
  const age = source.publishedAt ? Date.now() - Date.parse(source.publishedAt) : Infinity;
  return (source.authority === "official" ? 3 : source.authority === "media" ? 2 : 1) + (age < 365 * 86400000 ? 1 : 0);
}

export function extractLifeInfoByRules(sources: LifeInfoSource[]): LifeInfoItem[] {
  const best = new Map<LifeInfoTopic, { source: LifeInfoSource; index: number }>();
  sources.forEach((source, index) => {
    for (const topic of topicFromText(`${source.title} ${source.description}`)) {
      const previous = best.get(topic);
      if (!previous || scoreSource(source) > scoreSource(previous.source)) best.set(topic, { source, index });
    }
  });
  return [...best].map(([topic, { source, index }]) => ({
    topic,
    summary: (source.description || source.title).slice(0, 180),
    confidence: source.authority === "official" ? "confirmed" : "uncertain",
    sourceIndexes: [index],
  }));
}

async function extractWithAi(placeName: string, sources: LifeInfoSource[]): Promise<LifeInfoItem[] | null> {
  if (!process.env.GEMINI_API_KEY?.trim() || sources.length === 0) return null;
  const compact = sources.map((s, i) => `[${i}] ${s.title}\n${s.description.slice(0, 240)}`).join("\n");
  try {
    const model = new ChatGoogleGenerativeAI({ model: "gemini-3.1-flash-lite", apiKey: process.env.GEMINI_API_KEY, temperature: 0, maxRetries: 0, maxOutputTokens: 700 });
    const structured = model.withStructuredOutput(RuleSchema);
    const result = await Promise.race([
      structured.invoke(`장소 '${placeName}'의 생활정보만 추출하라. 주차·셔틀·운영·예약·반려동물 정보가 문장에 명시된 경우만 쓰고 추측하지 마라. 출처 번호를 유지하라.\n${compact}`),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("AI_TIMEOUT")), 6_000)),
    ]);
    return result.items.map((item) => ({ ...item, confidence: sources[item.sourceIndexes[0]]?.authority === "official" ? "confirmed" : "reference" }));
  } catch {
    return null;
  }
}

function response(place: { publicId: string; name: string }, cache: { payloadJson: unknown; aiUsed: boolean; fetchedAt: Date; expiresAt: Date }, state: PlaceLifeInfo["cache"]): PlaceLifeInfo {
  const payload = cache.payloadJson as { items: LifeInfoItem[]; sources: LifeInfoSource[]; notice?: string };
  return { placeId: place.publicId, placeName: place.name, ...payload, cache: state, aiUsed: cache.aiUsed, fetchedAt: cache.fetchedAt.toISOString(), expiresAt: cache.expiresAt.toISOString() };
}

async function loadPlaceLifeInfo(placePublicId: string, refresh: boolean): Promise<PlaceLifeInfo | null> {
  const place = await prisma.place.findUnique({ where: { publicId: placePublicId }, select: { id: true, publicId: true, name: true, roadAddress: true, jibunAddress: true } });
  if (!place) return null;
  const now = new Date();
  const cached = await prisma.placeLifeInfoCache.findUnique({ where: { placeId_topic: { placeId: place.id, topic: "all" } } });
  const refreshAllowed = refresh && (!cached || now.getTime() - cached.fetchedAt.getTime() >= REFRESH_COOLDOWN_MS);
  if (!refreshAllowed && cached && cached.expiresAt > now) return response(place, cached, "hit");

  try {
    const address = place.roadAddress ?? place.jibunAddress ?? "";
    const query = `\"${place.name}\" ${address.split(" ").slice(0, 2).join(" ")} 주차 셔틀 휴무 예약 이용 안내`;
    const sources = await searchNaverLifeInfo(query);
    const ruleItems = extractLifeInfoByRules(sources);
    const needsAi = sources.length > 0 && (ruleItems.length === 0 || sources.some((s) => topicFromText(`${s.title} ${s.description}`).length > 1));
    const aiItems = needsAi ? await extractWithAi(place.name, sources) : null;
    const items = aiItems?.length ? aiItems : ruleItems;
    const payload = { items, sources, notice: items.length ? undefined : "검색 결과에서 확인 가능한 생활정보를 찾지 못했습니다." };
    const fetchedAt = new Date();
    const expiresAt = new Date(fetchedAt.getTime() + CACHE_MS);
    const saved = await prisma.placeLifeInfoCache.upsert({
      where: { placeId_topic: { placeId: place.id, topic: "all" } },
      update: { payloadJson: payload, sourceCount: sources.length, aiUsed: !!aiItems?.length, fetchedAt, expiresAt },
      create: { placeId: place.id, topic: "all", payloadJson: payload, sourceCount: sources.length, aiUsed: !!aiItems?.length, fetchedAt, expiresAt },
    });
    return response(place, saved, "miss");
  } catch (error) {
    if (cached) return response(place, cached, "stale");
    throw error;
  }
}

export function getPlaceLifeInfo(placePublicId: string, refresh = false): Promise<PlaceLifeInfo | null> {
  const key = placePublicId;
  const existing = inFlight.get(key);
  if (existing) return existing;
  const pending = loadPlaceLifeInfo(placePublicId, refresh).finally(() => inFlight.delete(key));
  inFlight.set(key, pending);
  return pending;
}
