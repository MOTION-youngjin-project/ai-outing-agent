import { fetchWalkingRoute } from "./tmapPedestrian";
import { fetchDrivingRoutes } from "./naverDirections";
import { fetchTransitDirections } from "./transit";
import { distanceM } from "../trip-replan";
import type { PhotoCourseDependencies } from "./photo-course";

export const photoCourseProviders: PhotoCourseDependencies = {
  leg: async (from, to, mode) => {
    if (mode === "car") {
      const routes = await fetchDrivingRoutes(from, to);
      const minutes = routes.find((r) => Number.isFinite(r.durationMin) && r.durationMin > 0)?.durationMin;
      return minutes ? { minutes: minutes + 10, estimated: false } : null;
    }
    if (mode === "public_transit") {
      const routes = await fetchTransitDirections(from, to);
      const minutes = routes.find((r) => Number.isFinite(r.durationMin) && r.durationMin > 0)?.durationMin;
      return minutes ? { minutes, estimated: false } : null;
    }
    const route = await fetchWalkingRoute(from, to).catch(() => null);
    if (route && Number.isFinite(route.totalTimeSec) && route.totalTimeSec > 0) return { minutes: Math.ceil(route.totalTimeSec / 60), estimated: false };
    return { minutes: Math.max(1, Math.ceil(distanceM(from, to) * 1.4 / 60)), estimated: true };
  },
};
