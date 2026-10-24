import { describe, it, expect } from "vitest";
import { retargetDump, dataRestoreScript, restoreNotices, SCRATCH_SCHEMA } from "@/lib/dataRestore";

const DUMP = [
  "SELECT pg_catalog.set_config('search_path', '', false);",
  "DROP TABLE IF EXISTS public.\"Group\";",
  "CREATE SCHEMA public;",
  "DROP SCHEMA IF EXISTS public;",
  "COMMENT ON SCHEMA public IS 'standard public schema';",
  "CREATE TYPE public.\"Role\" AS ENUM ('TEACHER');",
  "CREATE TABLE public.\"Group\" (",
  "    id text NOT NULL,",
  "    role public.\"Role\"",
  ");",
  "ALTER TABLE ONLY public.\"Group\" ADD CONSTRAINT \"Group_userId_fkey\" FOREIGN KEY (\"userId\") REFERENCES public.\"User\"(id);",
  "COPY public.\"Group\" (id, name) FROM stdin;",
  "g1\tVisit public.gov and public.\"x\"",
  "g2\trepublic. of things",
  "\\.",
  "SELECT pg_catalog.setval('public.\"Referral_number_seq\"', 42, true);",
  "CREATE INDEX \"Group_idx\" ON public.\"Group\" USING btree (id);",
].join("\n");

describe("retargetDump", () => {
  const out = retargetDump(DUMP).split("\n");

  it("points the structure at the scratch schema", () => {
    expect(out).toContain(`DROP TABLE IF EXISTS ${SCRATCH_SCHEMA}."Group";`);
    expect(out).toContain(`CREATE TYPE ${SCRATCH_SCHEMA}."Role" AS ENUM ('TEACHER');`);
    expect(out).toContain(`CREATE TABLE ${SCRATCH_SCHEMA}."Group" (`);
    expect(out).toContain(`    role ${SCRATCH_SCHEMA}."Role"`);
    expect(out.some((l) => l.includes(`REFERENCES ${SCRATCH_SCHEMA}."User"(id)`))).toBe(true);
    expect(out).toContain(`COPY ${SCRATCH_SCHEMA}."Group" (id, name) FROM stdin;`);
    expect(out).toContain(`SELECT pg_catalog.setval('${SCRATCH_SCHEMA}."Referral_number_seq"', 42, true);`);
    expect(out).toContain(`CREATE INDEX "Group_idx" ON ${SCRATCH_SCHEMA}."Group" USING btree (id);`);
  });

  it("never touches the data rows, even text that looks like a schema name", () => {
    expect(out).toContain("g1\tVisit public.gov and public.\"x\"");
    expect(out).toContain("g2\trepublic. of things");
    expect(out).toContain("\\.");
  });

  it("drops statements about the live public schema itself", () => {
    expect(out.some((l) => /SCHEMA public/.test(l))).toBe(false);
  });

  it("keeps a word that merely ends in 'public.'", () => {
    expect(retargetDump("-- the republic.\"x\" note")).toBe("-- the republic.\"x\" note");
  });
});

describe("dataRestoreScript", () => {
  it("creates the scratch schema first and drops it at the end", () => {
    const script = dataRestoreScript("SELECT 1;").trim();
    expect(script.startsWith(`DROP SCHEMA IF EXISTS ${SCRATCH_SCHEMA} CASCADE;\nCREATE SCHEMA ${SCRATCH_SCHEMA};`)).toBe(true);
    expect(script.endsWith(`DROP SCHEMA ${SCRATCH_SCHEMA} CASCADE;`)).toBe(true);
  });

  it("moves data without ever dropping or creating a live table", () => {
    const script = dataRestoreScript("");
    expect(script).not.toMatch(/DROP TABLE|CREATE TABLE|DROP SCHEMA (IF EXISTS )?public/i);
    expect(script).toContain("TRUNCATE public.%I");
    expect(script).toContain("ADD CONSTRAINT"); // foreign keys go back, checking every row
  });

  it("never uses the block's variable names (t, c, fk) as table aliases — they would shadow them", () => {
    const script = dataRestoreScript("");
    expect(script).not.toMatch(/\b(FROM|JOIN)\s+[\w.]+\s+(t|c|fk)\b/);
  });

  it("never resolves a built name that could hit a system table", () => {
    const script = dataRestoreScript("");
    expect(script).not.toContain("pg_get_serial_sequence");
    expect(script).not.toMatch(/format\('public\.%I', [^)]*\)::regclass/);
  });

  it("leaves the live migration history alone — neither emptied nor copied over", () => {
    const script = dataRestoreScript("");
    expect(script.match(/tablename <> '_prisma_migrations'/g) ?? []).toHaveLength(2);
  });
});

describe("restoreNotices", () => {
  it("keeps only the restore's own notes, untagged", () => {
    const stderr = [
      'psql:<stdin>:1: NOTICE:  schema "sms_restore" does not exist, skipping',
      'psql:<stdin>:8900: NOTICE:  [restore] new column "StaffProfile"."itManager" — not in the backup, filled with its default',
      "psql:<stdin>:8901: some other line",
      'NOTICE:  [restore] left out table "OldThing" — not in this version',
    ].join("\n");
    expect(restoreNotices(stderr)).toEqual([
      'new column "StaffProfile"."itManager" — not in the backup, filled with its default',
      'left out table "OldThing" — not in this version',
    ]);
  });

  it("is empty when nothing differed", () => {
    expect(restoreNotices("")).toEqual([]);
  });
});
