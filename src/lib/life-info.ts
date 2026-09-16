export const LIFE_INFO_TOPICS = ["parking", "access", "hours", "reservation", "pet"] as const;
export type LifeInfoTopic = (typeof LIFE_INFO_TOPICS)[number];

export type LifeInfoSource = {
  title: string;
  url: string;
  description: string;
  publishedAt: string | null;
  authority: "official" | "media" | "community";
};

export type LifeInfoItem = {
  topic: LifeInfoTopic;
  summary: string;
  confidence: "confirmed" | "reference" | "uncertain";
  sourceIndexes: number[];
};

export type PlaceLifeInfo = {
  placeId: string;
  placeName: string;
  items: LifeInfoItem[];
  sources: LifeInfoSource[];
  cache: "hit" | "miss" | "stale";
  aiUsed: boolean;
  fetchedAt: string;
  expiresAt: string;
  notice?: string;
};

export const TOPIC_LABEL: Record<LifeInfoTopic, string> = {
  parking: "주차",
  access: "셔틀·교통",
  hours: "운영·휴무",
  reservation: "예약·대기",
  pet: "반려동물·이용 제한",
};
