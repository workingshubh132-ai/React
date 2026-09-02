import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

async function applyMigrations() {
  console.log('🔄 Applying migrations...\n')

  const migrationsDir = path.join(__dirname, '../supabase/migrations')
  const migrations = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()

  for (const migration of migrations) {
    const migrationPath = path.join(migrationsDir, migration)
    const sql = fs.readFileSync(migrationPath, 'utf-8')

    console.log(`📋 Applying: ${migration}`)

    try {
      const { error } = await supabase.rpc('exec', { sql })

      if (error) {
        // RPC doesn't exist yet, try direct SQL
        const response = await fetch(`${supabaseUrl}/rest/v1/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${serviceRoleKey}`,
            'X-Client-Info': 'supabase-js/2.45.0',
          },
          body: JSON.stringify({ query: sql }),
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${await response.text()}`)
        }

        console.log(`   ✅ ${migration}`)
      } else {
        console.log(`   ✅ ${migration}`)
      }
    } catch (err) {
      console.error(`   ❌ ${migration}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  console.log('\n✨ Migration application complete')
}

applyMigrations().catch(console.error)
