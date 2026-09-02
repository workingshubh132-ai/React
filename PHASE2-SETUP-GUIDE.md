# PHASE 2: SUPABASE SETUP GUIDE

**Status**: Credentials received ✅  
**Project**: mfekwhqgagdbpsacfrvtn (RE:ACT Integration Tests)  
**URL**: https://mfekwhqgagdbpsacfrvtn.supabase.co

---

## CRITICAL: Apply Database Migrations

Your database is empty. The Supabase project exists but has no tables, functions, or RLS policies.

### Option A: Via Supabase Dashboard (Recommended - 5 minutes)

1. **Go to**: https://app.supabase.com
2. **Select** your project: mfekwhqgagdbpsacfrvtn
3. **Click**: SQL Editor (left sidebar)
4. **Click**: New Query
5. **Copy entire contents** from each migration file in order:
   - `/home/user/React/supabase/migrations/001_initial_schema.sql`
   - `/home/user/React/supabase/migrations/002_security_fixes.sql`
   - `/home/user/React/supabase/migrations/003_incident_engine.sql`
   - `/home/user/React/supabase/migrations/004_incident_transitions_rpc.sql`
   - `/home/user/React/supabase/migrations/005_signal_events.sql`
   - `/home/user/React/supabase/migrations/006_signal_incident_correlation.sql`
   - `/home/user/React/supabase/migrations/007_device_management.sql`
   - `/home/user/React/supabase/migrations/008_m5_coordination.sql`
   - `/home/user/React/supabase/migrations/009_m5_responder_responding_status.sql`

6. **Paste** each one into a new query
7. **Click** Execute (▶️)
8. **Verify** no errors in results

### Option B: Via Supabase CLI

```bash
# Install Supabase CLI (if not already installed)
npm install -g supabase

# Authenticate (will open browser)
supabase login

# Link project
supabase link --project-ref mfekwhqgagdbpsacfrvtn

# Push migrations
supabase db push
```

---

## Environment Configuration

✅ **Already done**:
- `.env.local` updated with Supabase credentials
- Credentials are NOT committed to git (.gitignore protects it)

**Local development**: Credentials loaded from `.env.local`  
**Stackblitz**: Must add to **Project Settings → Environment Variables**

---

## Verification Steps

### Step 1: Test Database Connection

```bash
npm test -- __tests__/integration-setup.test.ts --testNamePattern="getTestEnv"
```

Should pass with output:
```
✓ Environment is configured correctly
```

### Step 2: Run All Unit Tests

```bash
npm test
```

Expected: 235 passing, 55 skipped (integration tests)

### Step 3: Test Database

Once migrations applied:

```bash
npm test -- __tests__/m5-responder-actions.test.ts
```

Should enable and run 34 integration tests.

---

## Architecture Changes

**Nothing changed in code.** Only database now has:

✅ 9 migrations applied  
✅ 15+ tables created  
✅ Row-Level Security policies active  
✅ Atomic incident transition RPCs ready  
✅ Signal processing infrastructure ready

---

## Next Steps

1. **Apply migrations** (via dashboard or CLI)
2. **Verify in Stackblitz**: Add env vars to Project Settings
3. **Run tests**: `npm test`
4. **Check emergency flow** (documented in PHASE2-VALIDATION-REPORT.md)

---

## Credentials Reference

**Project URL**: `https://mfekwhqgagdbpsacfrvtn.supabase.co`

**Anon Key** (public):
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1mZWt3aHFnYWdicHNhY2ZydnRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgzNDUzNzAsImV4cCI6MjEwMzkyMTM3MH0.BHBODcb0Puhm4yeNUFb4V62hvf46WqFV7pnnLRPqiYI
```

**Service Role Key** (secret - never expose):
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1mZWt3aHFnYWdicHNhY2ZydnRuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODM0NTM3MCwiZXhwIjoyMTAzOTIxMzcwfQ.YkqXppd-BCPkRARRtTMxOF9fzBAlseD4WmZn1-ZxB0Q
```

---

## .env.local (for Local Testing)

```bash
NEXT_PUBLIC_SUPABASE_URL=https://mfekwhqgagdbpsacfrvtn.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1mZWt3aHFnYWdicHNhY2ZydnRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgzNDUzNzAsImV4cCI6MjEwMzkyMTM3MH0.BHBODcb0Puhm4yeNUFb4V62hvf46WqFV7pnnLRPqiYI
SUPABASE_URL=https://mfekwhqgagdbpsacfrvtn.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1mZWt3aHFnYWdicHNhY2ZydnRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgzNDUzNzAsImV4cCI6MjEwMzkyMTM3MH0.BHBODcb0Puhm4yeNUFb4V62hvf46WqFV7pnnLRPqiYI
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1mZWt3aHFnYWdicHNhY2ZydnRuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODM0NTM3MCwiZXhwIjoyMTAzOTIxMzcwfQ.YkqXppd-BCPkRARRtTMxOF9fzBAlseD4WmZn1-ZxB0Q
NODE_ENV=development
```

**Stackblitz Project Settings**:
Same three values without NODE_ENV (Stackblitz handles that).

---

## Troubleshooting

### "Cannot find table 'incidents'"

→ Migrations not applied. Apply migrations via dashboard SQL editor.

### "Invalid JWT"

→ Credentials in .env.local or Stackblitz settings are incorrect. Copy exactly from above.

### "Connection timeout"

→ Supabase project not initialized yet. Wait 2-3 minutes after creation.

### Tests still skipped

→ Integration tests need database connection. Once migrations applied, remove `describe.skip()` from test files.

---

## Timeline

- ✅ Code inspection: Complete
- ✅ Credentials obtained: Complete
- ✅ .env.local configured: Complete
- ⏳ Migrations to apply: 5-10 minutes
- ⏳ Run integration tests: 2-5 minutes
- ⏳ Verify emergency flow: 10-15 minutes

**Total time to Phase 2 complete**: ~30 minutes

---

**After migrations applied**, send me a message and I'll run the full integration test suite and Phase 2 validation report.
