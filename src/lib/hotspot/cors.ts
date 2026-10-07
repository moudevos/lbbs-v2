import { NextResponse } from "next/server";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "600",
  Vary: "Origin",
};

export function captiveJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
  return response;
}

export function captiveOptions() {
  return new NextResponse(null, { status: 204, headers });
}
