/**
 * Applies `db/schema.sql`.
 *
 *   node db/migrate.ts        (or: npm run db:migrate)
 *
 * The compose file also mounts the schema as an init script, but that only
 * runs when the volume is empty — this is how an existing database catches up.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { closeDb, isDbEnabled, migrate } from './index.ts'

if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile('.env')
  } catch {
    // No .env — the check below reports it.
  }
}

if (!isDbEnabled()) {
  console.error('Немає DATABASE_URL — додай його в .env (див. docker-compose.yml)')
  process.exit(1)
}

// __dirname does not exist in ES modules; derive it from the module URL.
const here = dirname(fileURLToPath(import.meta.url))
const sql = readFileSync(join(here, 'schema.sql'), 'utf8')

await migrate(sql)
await closeDb()
console.log('Схему застосовано.')
