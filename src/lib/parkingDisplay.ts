// 잔여율 기준 혼잡도 라벨. 실시간 정보가 없으면 null(표시 안 함).
// ParkingScreen(목록)과 ParkingDetailScreen(상세) 둘 다에서 써서 여기 따로 둠.
export function occupancyLabel(spot: {
  remainingSpaces: number | null;
  capacity: number;
}): { label: string; className: string } | null {
  if (spot.remainingSpaces === null || spot.capacity === 0) return null;
  const ratio = spot.remainingSpaces / spot.capacity;
  if (ratio >= 0.3) return { label: "여유", className: "text-emerald-600" };
  if (ratio >= 0.1) return { label: "보통", className: "text-amber-500" };
  return { label: "혼잡", className: "text-rose-500" };
}
