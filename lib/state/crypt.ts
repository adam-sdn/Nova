// Field encryption for stored rows. Context binds each ciphertext to its table, row and field.
import { decryptField, encryptField, type EncryptedField } from "@/lib/privacy/crypto";
import type { Ctx } from "./db";

export const fieldContext = (table: string, id: string, field: string) => `${table}:${id}:${field}`;

export function enc(ctx: Ctx, table: string, id: string, field: string, plaintext: string): string {
  return JSON.stringify(encryptField(plaintext, ctx.masterKey, fieldContext(table, id, field)));
}

export function dec(ctx: Ctx, table: string, id: string, field: string, stored: string): string {
  return decryptField(JSON.parse(stored) as EncryptedField, ctx.masterKey, fieldContext(table, id, field));
}

export function decOrNull(ctx: Ctx, table: string, id: string, field: string, stored: string | null): string | null {
  return stored == null ? null : dec(ctx, table, id, field, stored);
}
