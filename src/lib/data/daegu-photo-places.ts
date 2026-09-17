import { z } from "zod";
import { photoPlaceSchema } from "../photo-places";

const kto = (id: number, fields: ("location" | "hours" | "features" | "access")[]) => ({ label: "한국관광공사 VISITKOREA", url: `https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=${id}`, fields });
const common = { coordinateUse: "venue-reference", checkedAt: "2026-09-17" };

export const PHOTO_PLACES = z.array(photoPlaceSchema).parse([
  {
    ...common, id: "photo:kim-gwangseok", name: "김광석다시그리기길", aliases: ["김광석 길", "김광석 다시그리기길"],
    address: "대구광역시 중구 달구벌대로 2238", latitude: 35.8614155786079, longitude: 128.607460730067,
    environment: "outdoor", shootingArea: "벽화가 있는 골목의 공개 보행 구간", tags: ["벽화", "골목", "인물"], suggestedTimes: ["daylight"], estimatedVisitMinutes: 30,
    hours: "거리 24시간 개방 안내", closures: "거리와 주변 점포의 휴무는 별도 확인",
    shootingTips: ["벽화의 주요 그림 옆에 인물을 배치해 배경을 가리지 않아 보세요.", "카메라를 벽면과 나란히 두면 벽화의 형태를 담기 좋습니다."],
    visitNotice: "보행 동선을 비워 두고 촬영하세요. 주변 카페의 실내 이용은 이 장소 정보에 포함하지 않습니다.", indoorPhotoPermission: "not-applicable",
    sources: [kto(75464, ["location", "hours", "features"])],
  },
  {
    ...common, id: "photo:suseongmot", name: "수성못", aliases: ["수성못 유원지", "수성유원지"],
    address: "대구광역시 수성구 두산동 512", latitude: 35.8267975731041, longitude: 128.612847307235,
    environment: "outdoor", shootingArea: "호수 주변 공개 산책로", tags: ["노을", "실루엣", "탁 트인 배경", "야경", "인물", "자연"], suggestedTimes: ["before-sunset", "after-sunset"], estimatedVisitMinutes: 45,
    hours: "공원 24시간 개방 안내", closures: "연중 개방 안내. 행사·기상에 따른 통제는 방문 전 확인",
    shootingTips: ["해가 보이는 방향을 현장에서 확인하고 인물 뒤에 밝은 하늘을 두어 실루엣을 시도해 보세요.", "수면 반사와 하늘을 함께 담되 수평선을 기울이지 않아 보세요."],
    visitNotice: "분수·조명 운영은 별도 일정입니다. 일몰 시각과 구름에 따라 노을이 보이지 않을 수 있습니다.", indoorPhotoPermission: "not-applicable",
    sources: [kto(68482, ["location", "hours", "features"])],
  },
  {
    ...common, id: "photo:ayang-railway", name: "아양기찻길", aliases: ["아양철교"],
    address: "대구광역시 동구 해동로 82", latitude: 35.8903043855305, longitude: 128.6383125597,
    environment: "outdoor", shootingArea: "옛 철교의 공개 보행 구간", tags: ["건축", "탁 트인 배경", "인물"], suggestedTimes: ["daylight", "before-sunset"], estimatedVisitMinutes: 30,
    hours: "출처에 세부 개방 시간이 없어 방문 전 확인 필요", closures: "연중 개방 안내. 시설별 운영·현장 통제 별도 확인",
    shootingTips: ["난간의 선이 화면 안쪽으로 이어지도록 구도를 잡아 보세요.", "인물을 화면 중앙에서 조금 비켜 세워 다리의 구조도 함께 담아 보세요."],
    visitNotice: "카페·전시공간의 실내 촬영은 포함하지 않습니다. 보행 구간을 막거나 난간을 넘어 촬영하지 마세요.", indoorPhotoPermission: "not-applicable",
    sources: [kto(60210, ["location", "hours", "features"])],
  },
  {
    ...common, id: "photo:cheongna-hill", name: "청라언덕", aliases: ["동산청라언덕", "동산 청라언덕"],
    address: "대구광역시 중구 달구벌대로 2029", latitude: 35.86616641793866, longitude: 128.5856431815708,
    environment: "outdoor", shootingArea: "공개된 정원·산책 구간에서 바라보는 근대 건축 외관", tags: ["건축", "골목", "자연", "인물"], suggestedTimes: ["daylight"], estimatedVisitMinutes: 40,
    hours: "야외 구간 24시간 개방 안내. 건물 내부 관람은 별도", closures: "야외 연중 개방 안내. 선교사 주택 박물관 공사·관람 여부 재확인",
    shootingTips: ["건물의 외관과 주변 나무를 함께 넣어 공간의 분위기를 담아 보세요.", "인물을 건물에서 조금 떨어뜨려 세우고 전체 비율을 비교해 보세요."],
    visitNotice: "박물관 내부 임시 휴관 안내 이력이 있어 실내 대체 장소로 사용하지 않습니다. 공개 구간에서만 촬영하세요.", indoorPhotoPermission: "not-applicable",
    sources: [kto(57452, ["location", "hours", "features"]), kto(248198, ["access"])],
  },
  {
    ...common, id: "photo:daegu-art-museum", name: "대구미술관", aliases: [],
    address: "대구광역시 수성구 미술관로 40", latitude: 35.8269709240075, longitude: 128.674385944323,
    environment: "indoor", shootingArea: "관람객에게 개방되고 촬영이 허용된 실내 구간", tags: ["건축", "전시", "인물"], suggestedTimes: ["daylight"], estimatedVisitMinutes: 60,
    hours: "4~10월 10:00~19:00 / 11~3월 10:00~18:00, 입장 마감은 종료 1시간 전",
    closures: "월요일·1월 1일·설날·추석 당일 휴관. 월요일이 공휴일이면 다음 평일 휴관",
    shootingTips: ["촬영 허용 구간에서 벽면과 공간의 선을 활용해 여백을 남겨 보세요.", "자연광이 들어오는 구간이 개방되어 있다면 인물을 빛이 들어오는 쪽으로 향하게 해 보세요."],
    visitNotice: "전시별 사진·인물 촬영 허용 여부와 티켓을 먼저 확인하세요. 실내 시설이어도 포토 촬영이 보장되지는 않습니다.", indoorPhotoPermission: "check-on-site",
    sources: [kto(78255, ["location", "features"]), { label: "대구미술관 관람시간 및 요금", url: "https://daeguartmuseum.or.kr/index.do?menu_id=00000743", fields: ["hours", "access"] }],
  },
  {
    ...common, id: "photo:daegu-art-factory", name: "대구예술발전소", aliases: ["대구 예술발전소"],
    address: "대구광역시 중구 달성로22길 31-12", latitude: 35.8754440376733, longitude: 128.584526388293,
    environment: "indoor", shootingArea: "공개 관람 구간 중 촬영이 허용된 로비·전시 공간", tags: ["건축", "전시", "인물"], suggestedTimes: ["daylight"], estimatedVisitMinutes: 50,
    hours: "4~10월 10:00~19:00 / 11~3월 10:00~18:00, 입장 마감은 공식 안내 재확인",
    closures: "월요일·1월 1일·설날·추석 당일 휴관. 월요일이 공휴일이면 다음 평일 휴관",
    shootingTips: ["옛 산업시설을 활용한 공간의 구조와 인물 크기를 대비해 보세요.", "허용된 구간에서 복도나 벽면의 선을 활용해 깊이감을 담아 보세요."],
    visitNotice: "작가 작업실은 일반 촬영 구간으로 간주하지 않습니다. 전시·공간별 촬영 허용 여부를 현장에서 확인하세요.", indoorPhotoPermission: "check-on-site",
    sources: [kto(177434, ["location", "features"]), { label: "대구예술발전소 공식 관람안내", url: "https://www.daeguartfactory.kr/front/", fields: ["hours", "access"] }],
  },
]);
