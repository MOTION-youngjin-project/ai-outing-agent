type RegionRow = {
  id: bigint;
  parentId: bigint | null;
  regionCode: string;
  name: string;
  level: string;
  latitude: { toString(): string } | null;
  longitude: { toString(): string } | null;
  createdAt: Date;
};

export function serializeRegion(region: RegionRow) {
  return {
    ...region,
    id: region.id.toString(),
    parentId: region.parentId?.toString() ?? null,
    latitude: region.latitude?.toString() ?? null,
    longitude: region.longitude?.toString() ?? null,
  };
}
