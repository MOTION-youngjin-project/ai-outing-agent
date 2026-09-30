import { handleScenePhoto } from "@/lib/services/scene-photo-request";

export const runtime = "nodejs";
export async function POST(request: Request) { return handleScenePhoto(request); }
