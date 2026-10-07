import "server-only";

import { z } from "zod";

import { prisma } from "@/server/db";
import { requirePermission } from "@/server/auth/guard";
import { audit } from "@/server/security/audit";
import {
  SETTING_BY_KEY,
  SETTING_DEFINITIONS,
  type SettingDefinition,
  type SettingKey,
  type SettingValue,
} from "./registry";

/**
 * Operator settings: typed reads with in-code defaults, validated writes.
 *
 * A row in `Setting` only ever *overrides* a default, so a fresh database needs
 * no seeding and a typo'd stored value falls back to the default instead of
 * taking the platform down.
 */

const CACHE_TTL_MS = 5_000;

const globalForSettings = globalThis as typeof globalThis & {
  sportgoSettings?: { at: number; values: Map<string, unknown> };
};

/** Zod schema for one definition — the same rules guard reads and writes. */
function schemaFor(definition: SettingDefinition): z.ZodType<unknown> {
  switch (definition.type) {
    case "boolean":
      return z.boolean();
    case "integer":
      return z.number().int().min(definition.min).max(definition.max);
    case "money":
      return z
        .number()
        .min(definition.min)
        .max(definition.max)
        .refine((value) => Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-6);
    case "multi":
      return z.array(z.enum(definition.options as [string, ...string[]])).min(1);
  }
}

async function loadAll(): Promise<Map<string, unknown>> {
  const cached = globalForSettings.sportgoSettings;
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.values;

  const rows = await prisma.setting.findMany();
  const stored = new Map(rows.map((row) => [row.key, row.value as unknown]));

  const values = new Map<string, unknown>();
  for (const definition of SETTING_DEFINITIONS) {
    const candidate = stored.get(definition.key);
    const parsed = candidate === undefined ? null : schemaFor(definition).safeParse(candidate);
    values.set(definition.key, parsed?.success ? parsed.data : definition.default);
  }

  globalForSettings.sportgoSettings = { at: Date.now(), values };
  return values;
}

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  return (await loadAll()).get(key) as SettingValue<K>;
}

/** Every setting with its effective value, for the admin screen. */
export async function getAllSettings(): Promise<Record<string, unknown>> {
  return Object.fromEntries(await loadAll());
}

export interface SettingsUpdateResult {
  ok: boolean;
  errorKey?: string;
  /** Keys that failed validation. */
  invalid?: string[];
}

/**
 * Applies a patch. Unknown keys are rejected rather than stored: nothing may
 * enter the table that the backend does not honour. The before/after values go
 * into the audit trail in the same transaction as the write.
 */
export async function updateSettings(
  patch: Record<string, unknown>,
): Promise<SettingsUpdateResult> {
  const actor = await requirePermission("settings.update");
  const current = await loadAll();

  const changes: Array<{ key: string; before: unknown; after: unknown }> = [];
  const invalid: string[] = [];

  for (const [key, value] of Object.entries(patch)) {
    const definition = SETTING_BY_KEY.get(key);
    if (!definition) {
      invalid.push(key);
      continue;
    }
    const parsed = schemaFor(definition).safeParse(value);
    if (!parsed.success) {
      invalid.push(key);
      continue;
    }
    const before = current.get(key);
    if (JSON.stringify(before) !== JSON.stringify(parsed.data)) {
      changes.push({ key, before, after: parsed.data });
    }
  }

  if (invalid.length > 0) {
    return { ok: false, errorKey: "admin.settings.error.invalid", invalid };
  }
  if (changes.length === 0) return { ok: true };

  await prisma.$transaction(async (tx) => {
    for (const change of changes) {
      await tx.setting.upsert({
        where: { key: change.key },
        create: { key: change.key, value: change.after as never, updatedById: actor.id },
        update: { value: change.after as never, updatedById: actor.id },
      });
    }
    await audit({
      tx,
      action: "admin.settings.updated",
      actor,
      description: `Updated ${changes.length} setting(s): ${changes.map((c) => c.key).join(", ")}`,
      metadata: { changes },
    });
  });

  globalForSettings.sportgoSettings = undefined;
  return { ok: true };
}

/** Test/maintenance hook: drops the cache so the next read hits the database. */
export function invalidateSettingsCache(): void {
  globalForSettings.sportgoSettings = undefined;
}
