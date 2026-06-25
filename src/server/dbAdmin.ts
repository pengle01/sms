// Server-only helpers for the SUPER_ADMIN database tools (export / import /
// truncate). Shells out to pg_dump / psql and uses a raw pg client for the
// wipe. NEVER import this from client code — it pulls in child_process.

import { spawn } from "node:child_process";
import { Client } from "pg";

function dbUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

export interface CmdResult {
  code: number;
  stdout: Buffer;
  stderr: string;
}

function run(cmd: string, args: string[], input?: Buffer): Promise<CmdResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    const out: Buffer[] = [];
    let err = "";
    proc.stdout.on("data", (d: Buffer) => out.push(d));
    proc.stderr.on("data", (d: Buffer) => { err += d.toString(); });
    proc.on("error", reject);
    proc.on("close", (code) => resolve({ code: code ?? -1, stdout: Buffer.concat(out), stderr: err }));
    if (input) proc.stdin.write(input);
    proc.stdin.end();
  });
}

/** Full plain-SQL dump with DROP/CREATE so it restores onto a populated DB. */
export function runPgDump(): Promise<CmdResult> {
  return run("pg_dump", [dbUrl(), "--clean", "--if-exists", "--no-owner", "--no-privileges"]);
}

/** Apply an uploaded .sql dump. ON_ERROR_STOP so a broken file fails loudly. */
export function runPsqlRestore(sql: Buffer): Promise<CmdResult> {
  return run("psql", [dbUrl(), "-v", "ON_ERROR_STOP=1"], sql);
}

/**
 * Wipe ALL application data while keeping the acting admin's User row (so they
 * stay signed in and can then import). Truncates every public table except
 * `_prisma_migrations` and `User`, then deletes all other users.
 */
export async function truncateAllExceptAdmin(adminUserId: string): Promise<number> {
  const client = new Client({ connectionString: dbUrl() });
  await client.connect();
  try {
    const { rows } = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename NOT IN ('_prisma_migrations', 'User')`,
    );
    const tables = rows.map((r) => `"${r.tablename}"`);
    if (tables.length > 0) {
      await client.query(`TRUNCATE TABLE ${tables.join(", ")} RESTART IDENTITY CASCADE`);
    }
    await client.query(`DELETE FROM "User" WHERE id <> $1`, [adminUserId]);
    return tables.length;
  } finally {
    await client.end();
  }
}

/** Lightweight state summary for the page. */
export async function databaseStats(): Promise<{ tables: number }> {
  const client = new Client({ connectionString: dbUrl() });
  await client.connect();
  try {
    const { rows } = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public'`,
    );
    return { tables: rows[0]?.n ?? 0 };
  } finally {
    await client.end();
  }
}
