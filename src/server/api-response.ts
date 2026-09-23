import { NextResponse } from "next/server";
import type { z } from "zod";

import { fieldErrorsOf } from "@/validations/employee";

// Responses that include a temporary password or personal data must never
// be cached by the browser or any proxy.
export const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function readJson(request: Request): Promise<unknown> {
  return request.json().catch(() => null);
}

export function validationError(error: z.ZodError) {
  return NextResponse.json(
    { error: "Please check the highlighted fields.", fieldErrors: fieldErrorsOf(error) },
    { status: 400, headers: NO_STORE },
  );
}

export function serviceError(result: {
  status: number;
  error: string;
  fieldErrors?: Record<string, string>;
  details?: string[];
}) {
  const { status, ...body } = result;
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export function ok<T extends object>(body: T, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}
