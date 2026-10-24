// Restoring a backup INTO THE CURRENT SCHEMA — data only. The live tables keep
// this version's structure whatever the backup's age: the backup is loaded into
// a scratch schema, then its rows are copied into the live tables column by
// column (by name). What the current version no longer has is left out and
// reported; new columns take their defaults. A row that cannot fit (e.g. a new
// required column with no default) stops the restore and nothing changes — then
// the backup has to be edited. Pure text work, unit-tested; run by
// src/server/dbAdmin.ts (runDataRestore) inside one psql transaction.

export const SCRATCH_SCHEMA = "sms_restore";

/** Lines that would act on the live `public` schema itself — never wanted here. */
const SCHEMA_STATEMENT = /^(CREATE SCHEMA|DROP SCHEMA|ALTER SCHEMA|COMMENT ON SCHEMA)\s+(IF\s+EXISTS\s+)?public\b/i;

/** `public.` as a schema qualifier (public."Group", public.foo, 'public."X_seq"'), not inside a word. */
const PUBLIC_QUALIFIER = /(?<![\w"$])public\.(?=["A-Za-z_])/g;

/**
 * Point a plain pg_dump script at the scratch schema instead of `public`.
 * COPY data rows are copied untouched — student names or notes that happen to
 * contain "public." must never be rewritten.
 */
export function retargetDump(sql: string, schema = SCRATCH_SCHEMA): string {
  const out: string[] = [];
  let inData = false;
  for (const line of sql.split("\n")) {
    if (inData) {
      out.push(line);
      if (line === "\\.") inData = false;
      continue;
    }
    if (SCHEMA_STATEMENT.test(line.trim())) continue;
    const rewritten = line.replace(PUBLIC_QUALIFIER, `${schema}.`);
    out.push(rewritten);
    if (/^COPY\s.+\sFROM stdin;\s*$/.test(line)) inData = true;
  }
  return out.join("\n");
}

/**
 * After the backup sits in the scratch schema: move its data into the live
 * tables. Foreign keys are dropped for the copy and put back after it, which
 * checks every row — a backup whose rows no longer hold together fails here,
 * inside the transaction, so nothing is changed. Sequences continue after the
 * restored rows. Every difference is reported as a NOTICE tagged "[restore]".
 */
export const MOVE_DATA_SQL = `
SET client_min_messages = notice;
DO $restore$
DECLARE
  t record; c record; fk record;
  cols text; sel text;
BEGIN
  CREATE TEMP TABLE _restore_fk ON COMMIT DROP AS
    SELECT conrelid::regclass::text AS tbl, conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint
     WHERE contype = 'f' AND connamespace = 'public'::regnamespace;
  FOR fk IN SELECT * FROM _restore_fk LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', fk.tbl, fk.conname);
  END LOOP;

  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' LOOP
    EXECUTE format('TRUNCATE public.%I', t.tablename);
  END LOOP;

  -- _prisma_migrations is the live schema's own history, not school data: it is
  -- neither emptied (above) nor copied from the backup.
  FOR t IN SELECT tablename FROM pg_tables
            WHERE schemaname = '${SCRATCH_SCHEMA}' AND tablename <> '_prisma_migrations'
            ORDER BY tablename LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t.tablename) THEN
      RAISE NOTICE '[restore] left out table "%" — not in this version', t.tablename;
      CONTINUE;
    END IF;
    FOR c IN
      SELECT s.column_name FROM information_schema.columns s
       WHERE s.table_schema = '${SCRATCH_SCHEMA}' AND s.table_name = t.tablename
         AND NOT EXISTS (SELECT 1 FROM information_schema.columns l
                          WHERE l.table_schema = 'public' AND l.table_name = t.tablename AND l.column_name = s.column_name)
    LOOP
      RAISE NOTICE '[restore] left out column "%"."%" — not in this version', t.tablename, c.column_name;
    END LOOP;
    FOR c IN
      SELECT l.column_name FROM information_schema.columns l
       WHERE l.table_schema = 'public' AND l.table_name = t.tablename
         AND NOT EXISTS (SELECT 1 FROM information_schema.columns s
                          WHERE s.table_schema = '${SCRATCH_SCHEMA}' AND s.table_name = t.tablename AND s.column_name = l.column_name)
    LOOP
      RAISE NOTICE '[restore] new column "%"."%" — not in the backup, filled with its default', t.tablename, c.column_name;
    END LOOP;

    SELECT string_agg(format('%I', l.column_name), ', ' ORDER BY l.ordinal_position),
           string_agg(format('%I::text::%s', l.column_name, format_type(a.atttypid, a.atttypmod)), ', ' ORDER BY l.ordinal_position)
      INTO cols, sel
      FROM information_schema.columns l
      JOIN information_schema.columns s
        ON s.table_schema = '${SCRATCH_SCHEMA}' AND s.table_name = l.table_name AND s.column_name = l.column_name
      JOIN pg_attribute a
        ON a.attrelid = to_regclass(format('public.%I', l.table_name)) AND a.attname = l.column_name
     WHERE l.table_schema = 'public' AND l.table_name = t.tablename;
    IF cols IS NOT NULL THEN
      EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM ${SCRATCH_SCHEMA}.%I', t.tablename, cols, sel, t.tablename);
    END IF;
  END LOOP;

  -- Sequences owned by live columns, straight from the catalog (building a name
  -- per column and resolving it could hit system tables and fail).
  FOR c IN
    -- (aliases differ from the block's variables t / c / fk, which would shadow them)
    SELECT sq.oid::regclass::text AS seq, tb.relname AS table_name, at.attname AS column_name
      FROM pg_class sq
      JOIN pg_depend dp     ON dp.classid = 'pg_class'::regclass AND dp.objid = sq.oid
                           AND dp.refclassid = 'pg_class'::regclass AND dp.deptype IN ('a', 'i')
      JOIN pg_class tb      ON tb.oid = dp.refobjid
      JOIN pg_attribute at  ON at.attrelid = tb.oid AND at.attnum = dp.refobjsubid
     WHERE sq.relkind = 'S' AND tb.relnamespace = 'public'::regnamespace
  LOOP
    EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM public.%I), 0) + 1, false)', c.seq, c.column_name, c.table_name);
  END LOOP;

  FOR fk IN SELECT * FROM _restore_fk LOOP
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', fk.tbl, fk.conname, fk.def);
  END LOOP;
END
$restore$;
DROP SCHEMA ${SCRATCH_SCHEMA} CASCADE;
`;

/** The whole script for one psql --single-transaction run. */
export function dataRestoreScript(dumpSql: string): string {
  return [
    `DROP SCHEMA IF EXISTS ${SCRATCH_SCHEMA} CASCADE;`,
    `CREATE SCHEMA ${SCRATCH_SCHEMA};`,
    retargetDump(dumpSql),
    MOVE_DATA_SQL,
  ].join("\n");
}

/** The restore's own NOTICE lines ("[restore] …"), untagged; Postgres's own notices are ignored. */
export function restoreNotices(stderr: string): string[] {
  return stderr
    .split("\n")
    .map((l) => l.match(/NOTICE:\s+\[restore\]\s+(.*)$/)?.[1]?.trim())
    .filter((l): l is string => !!l);
}
