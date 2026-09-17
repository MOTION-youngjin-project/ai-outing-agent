export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_PHOTO_PIXELS = 40_000_000;
export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";
export type PhotoSelection = { file: File; previewUrl: string; width: number; height: number; mimeType: string };

export function detectPhotoType(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value)) return "image/png";
  if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

export function validatePhotoSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) throw new Error("빈 파일은 선택할 수 없습니다.");
  if (size > MAX_PHOTO_BYTES) throw new Error("사진은 10MB 이하로 선택해 주세요.");
}

export function validatePhotoDimensions(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new Error("사진 크기를 확인하지 못했습니다.");
  if (width > 12000 || height > 12000 || width * height > MAX_PHOTO_PIXELS) throw new Error("사진 해상도가 너무 큽니다. 4,000만 화소 이하, 가로·세로 각각 12,000픽셀 이하로 줄여 주세요.");
}

export async function preparePhoto(file: File): Promise<PhotoSelection> {
  validatePhotoSize(file.size);
  const mimeType = detectPhotoType(new Uint8Array(await file.slice(0, 12).arrayBuffer()));
  if (!mimeType || (file.type && file.type !== mimeType)) throw new Error("JPEG·PNG·WebP 사진만 사용할 수 있습니다. HEIC 사진은 JPEG로 변환해 주세요.");
  const previewUrl = URL.createObjectURL(file);
  try {
    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new window.Image();
      const timer = setTimeout(() => finish(new Error("사진을 읽는 시간이 오래 걸립니다. 다른 사진을 선택해 주세요.")), 10000);
      function finish(error?: Error) {
        clearTimeout(timer); img.onload = null; img.onerror = null;
        if (error) { img.src = ""; reject(error); }
        else resolve({ width: img.naturalWidth, height: img.naturalHeight });
      }
      img.onload = () => finish();
      img.onerror = () => finish(new Error("사진을 읽을 수 없습니다. 손상되지 않은 다른 사진을 선택해 주세요."));
      img.src = previewUrl;
    });
    validatePhotoDimensions(dimensions.width, dimensions.height);
    return { file, previewUrl, ...dimensions, mimeType };
  } catch (error) { URL.revokeObjectURL(previewUrl); throw error; }
}
