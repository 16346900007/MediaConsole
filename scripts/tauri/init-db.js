#!/usr/bin/env node
// Idempotent DB initialization: applies db/init.sql (all statements use IF NOT EXISTS,
// safe to run repeatedly). Runs before main.js, cwd = resources/dist.
// Skips silently when SUDA_DATABASE_URL is unset (the backend will log its own error).
// Also scaffolds the platform roles used by the datapaas layer:
//   every query runs `SET LOCAL ROLE 'anon_<schema>'` (or authenticated_/service_role_),
//   so those roles must exist locally; <schema> comes from the ?schema= URL param (default empty).
const path = require('path');
const fs = require('fs');

function roleSuffix(conn) {
  try {
    const u = new URL(conn);
    const s = (u.searchParams.get('schema') || '').trim();
    return /^[A-Za-z0-9_]{0,64}$/.test(s) ? s : '';
  } catch {
    return '';
  }
}

async function main() {
  const conn = process.env.SUDA_DATABASE_URL || process.env.DATABASE_URL;
  if (!conn) {
    console.error('[init-db] SUDA_DATABASE_URL is not set; skip DB init');
    return;
  }
  const sqlFile = path.join(process.cwd(), 'db', 'init.sql');
  if (!fs.existsSync(sqlFile)) {
    console.error(`[init-db] missing ${sqlFile}; skip DB init`);
    return;
  }
  // Same driver as the backend (postgres-js, from the pruned node_modules)
  const postgres = require('postgres');
  const sql = postgres(conn, { max: 1, onnotice: () => {} });
  try {
    const text = fs.readFileSync(sqlFile, 'utf8');
    await sql.unsafe(text);
    console.log('[init-db] DB init complete');

    // Platform role scaffolding (idempotent)
    const suffix = roleSuffix(conn);
    const roles = ['anon_', 'authenticated_', 'service_role_'].map((r) => r + suffix);
    const quoted = roles.map((r) => '"' + r + '"').join(', ');
    await sql.unsafe(
      roles
        .map(
          (r) =>
            `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${r}') THEN
    CREATE ROLE "${r}" NOLOGIN;
  END IF;
END $$;`
        )
        .join('\n')
    );
    await sql.unsafe(`GRANT USAGE ON SCHEMA public TO ${quoted};`);
    await sql.unsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${quoted};`);
    await sql.unsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${quoted};`);
    console.log(`[init-db] platform roles ready: ${roles.join(', ')}`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error('[init-db] DB init failed:', e && e.message ? e.message : e);
  process.exit(1);
});
