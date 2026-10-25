// Shared route-handler plumbing: zod validation, error mapping, JSON responses.
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import type { ApiError } from "@/lib/contracts";
import { bump } from "@/lib/live";
import { getCtx, type Ctx } from "@/lib/state/db";
import { TransitionError } from "@/lib/state/service";

export type Params<K extends string> = { params: Promise<Record<K, string>> };

export function errorResponse(e: unknown): NextResponse<ApiError> {
  if (e instanceof ZodError) {
    return NextResponse.json({ error: { code: "invalid_input", message: "Invalid request", issues: e.issues } }, { status: 400 });
  }
  if (e instanceof TransitionError) {
    return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: e.httpStatus });
  }
  if (e instanceof SyntaxError) {
    return NextResponse.json({ error: { code: "invalid_json", message: "Body must be JSON" } }, { status: 400 });
  }
  // Never echo internals or patient content in errors.
  console.error("[api] unexpected error:", e instanceof Error ? e.message : "unknown");
  return NextResponse.json({ error: { code: "server_error", message: "Something went wrong" } }, { status: 500 });
}

/** POST handler: parse the body with `schema`, run `fn`, return its result as JSON. */
export function post<S extends ZodType, K extends string = never>(
  schema: S,
  fn: (ctx: Ctx, body: S["_output"], params: Record<K, string>) => Promise<unknown>,
) {
  return async (req: Request, route?: Params<K>) => {
    try {
      const text = await req.text();
      const body = schema.parse(text ? JSON.parse(text) : {});
      const params = (route ? await route.params : {}) as Record<K, string>;
      const out = await fn(getCtx(), body, params);
      bump();
      return NextResponse.json(out);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

/** GET handler: parse the query string with `schema`. */
export function get<S extends ZodType>(schema: S, fn: (ctx: Ctx, query: S["_output"]) => Promise<unknown> | unknown) {
  return async (req: Request) => {
    try {
      const query = schema.parse(Object.fromEntries(new URL(req.url).searchParams));
      const out = await fn(getCtx(), query);
      return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function notFound(message: string): never {
  throw new TransitionError("not_found", message);
}
