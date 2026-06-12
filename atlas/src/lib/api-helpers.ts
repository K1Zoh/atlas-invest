import { NextResponse } from "next/server";

export function ok<T>(data: T): NextResponse {
  return NextResponse.json(data);
}

export function bad(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export function oops(e: unknown): NextResponse {
  const message = e instanceof Error ? e.message : String(e);
  console.error("[api]", message);
  return NextResponse.json({ error: message }, { status: 500 });
}
