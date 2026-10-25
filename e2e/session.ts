import { expect, type APIRequestContext } from "@playwright/test";

const nurse = { role: "nurse", id: "N-01" };

/** Opens the shift session (or joins the open one) and returns its code, as a nurse revealing it would. */
export async function sessionCode(request: APIRequestContext): Promise<string> {
  expect((await request.post("/api/shift", { data: { actor: nurse } })).ok()).toBeTruthy();
  const r = await request.post("/api/shift/reveal", { data: { actor: nurse } });
  expect(r.ok()).toBeTruthy();
  return (await r.json()).code as string;
}
