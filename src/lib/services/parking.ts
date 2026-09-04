import { prisma } from "@/lib/prisma";
import {
  fetchParkingByDistrict,
  formatFee,
  rankParkingSpots,
  type ParkingItem,
  type ParkingOption,
  type ParkingSpot,
} from "@/lib/tools/parking";

type PersistableParking = ParkingSpot & {
  sourceParkingKey: string;
  latitude: number;
  longitude: number;
  operatingHours: Record<string, string | null>;
};

function toPersistableParking(item: ParkingItem): PersistableParking | null {
  const latitude = Number(item.prkFcltInfo.lat);
  const longitude = Number(item.prkFcltInfo.lot);
  if (!item.prkInfo.pkltId || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return {
    sourceParkingKey: item.prkInfo.pkltId,
    name: item.prkInfo.pkltNm,
    address: item.prkFcltInfo.roadNmAddr || item.prkFcltInfo.lotnoAddr,
    latitude,
    longitude,
    capacity: item.prkFcltInfo.prkNocmprt,
    fee: formatFee(item.prkOperInfo.crgLevySeNm, item.prkOperInfo.gnrlOneHrCrg),
    hasRealtime: item.prkInfo.sysgrpyYn === "Y",
    operatingHours: {
      weekdayStart: item.prkOperInfo.wkdayOperBgngHr,
      weekdayEnd: item.prkOperInfo.wkdayOperEndHr,
      saturdayStart: item.prkOperInfo.satOperBgngHr,
      saturdayEnd: item.prkOperInfo.satOperEndHr,
      holidayStart: item.prkOperInfo.lhldyOperBgngHr,
      holidayEnd: item.prkOperInfo.lhldyOperEndHr,
    },
  };
}

export async function getAndStoreParkingOptions(district: string): Promise<ParkingOption[]> {
  const items = await fetchParkingByDistrict(district);
  const candidates = items
    .filter((item) => item.prkInfo.useYn !== "N")
    .map(toPersistableParking)
    .filter((item): item is PersistableParking => item !== null);
  const selected = rankParkingSpots(candidates, 3) as PersistableParking[];

  const [source, region] = await Promise.all([
    prisma.dataSource.findUnique({ where: { code: "DAEGU_PARKING" } }),
    prisma.region.findFirst({ where: { name: district, level: "sigungu" } }),
  ]);
  if (!source) throw new Error("DAEGU_PARKING 데이터 제공처 초기 데이터가 없습니다.");

  await prisma.$transaction(
    selected.map((spot) =>
      prisma.parkingLot.upsert({
        where: {
          sourceId_sourceParkingKey: {
            sourceId: source.id,
            sourceParkingKey: spot.sourceParkingKey,
          },
        },
        update: {
          regionId: region?.id,
          name: spot.name,
          address: spot.address,
          latitude: spot.latitude,
          longitude: spot.longitude,
          totalSpaces: spot.capacity,
          feeInfo: spot.fee,
          operatingHoursJson: spot.operatingHours,
          realtimeSupported: spot.hasRealtime,
          observedAt: new Date(),
          syncedAt: new Date(),
        },
        create: {
          sourceId: source.id,
          sourceParkingKey: spot.sourceParkingKey,
          regionId: region?.id,
          name: spot.name,
          address: spot.address,
          latitude: spot.latitude,
          longitude: spot.longitude,
          totalSpaces: spot.capacity,
          feeInfo: spot.fee,
          operatingHoursJson: spot.operatingHours,
          realtimeSupported: spot.hasRealtime,
          observedAt: new Date(),
        },
      }),
    ),
  );

  return selected.map(({ name, address, capacity, fee, hasRealtime }) => ({
    name,
    address,
    capacity,
    fee,
    hasRealtime,
    distanceM: null,
    walkingMinutes: null,
    selectionBasis: "same_district_score",
  }));
}
