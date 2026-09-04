import { NextResponse } from "next/server";

export function apiError(
  status: number,
  code: string,
  message: string,
  details?: Record<string, string>,
) {
  return NextResponse.json(
    { error: { code, message, ...(details ? { details } : {}) } },
    { status },
  );
}

export function parsePositiveBigInt(value: string): bigint | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}
