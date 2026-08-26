# RE:ACT — Emergency Intelligence & Coordination Platform

Emergency intelligence and coordination platform initially designed for industrial workplaces.

**Milestone 1**: Production-quality foundation with authentication, organization structure, and secure database.

## Technology Stack

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Backend**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **SSR**: @supabase/ssr

## Project Structure

```
app/                    # Next.js App Router
├── layout.tsx         # Root layout
├── page.tsx          # Landing page
├── login/            # Authentication
│   └── page.tsx
├── dashboard/        # Protected dashboard
│   └── page.tsx
└── api/
    └── health/       # Health check endpoint
      └── route.ts

lib/
├── supabase/
│   ├── client.ts     # Client-side Supabase
│   ├── server.ts     # Server-side Supabase
│   └── middleware.ts # Session refresh middleware

components/
├── LogoutButton.tsx

types/
├── database.ts       # TypeScript database types

supabase/
└── migrations/
    └── 001_initial_schema.sql
```

## Database Schema

### organizations
- `id` (UUID, primary key)
- `name` (TEXT)
- `slug` (TEXT, unique)
- `created_at` (TIMESTAMPTZ)

### profiles
- `id` (UUID, references auth.users)
- `full_name` (TEXT)
- `role` (TEXT: ADMIN, SUPERVISOR, RESPONDER, WORKER)
- `organization_id` (UUID)
- `created_at` (TIMESTAMPTZ)

### devices
- `id` (UUID, primary key)
- `organization_id` (UUID)
- `device_code` (TEXT, unique)
- `name` (TEXT)
- `status` (TEXT)
- `latitude` (NUMERIC)
- `longitude` (NUMERIC)
- `battery_level` (NUMERIC)
- `last_seen` (TIMESTAMPTZ)
- `created_at` (TIMESTAMPTZ)

### responders
- `id` (UUID, primary key)
- `profile_id` (UUID)
- `organization_id` (UUID)
- `status` (TEXT)
- `latitude` (NUMERIC)
- `longitude` (NUMERIC)
- `specializations` (TEXT[])
- `created_at` (TIMESTAMPTZ)

## Security Model

### Row Level Security (RLS)
All tables use RLS to prevent cross-organization data leakage:

- **organizations**: Users see only their own organization
- **profiles**: Users see profiles within their organization; can only update their own
- **devices**: Users see devices in their organization; ADMIN/SUPERVISOR can create/update
- **responders**: Users see responders in their organization; ADMIN/SUPERVISOR can update

### Service Role Key
`SUPABASE_SERVICE_ROLE_KEY` is **server-only** and never exposed to client code. Use for:
- Admin operations
- Database migrations
- Privileged API endpoints

## Getting Started

### Prerequisites
- Node.js 18+
- npm/yarn/pnpm
- A Supabase project

### 1. Environment Setup

Create `.env.local`:

```bash
cp .env.example .env.local
```

Then fill in your Supabase credentials:
- `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Anon public key
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key (for server-only operations)

### 2. Install Dependencies

```bash
npm install
```

### 3. Database Setup

1. In Supabase, go to **SQL Editor** → **New Query**
2. Copy the contents of `supabase/migrations/001_initial_schema.sql`
3. Paste and run the migration
4. Verify tables are created

Alternatively, if you have the Supabase CLI:

```bash
supabase db push
```

### 4. Test Users

1. In Supabase, go to **Authentication** → **Users**
2. Add test users with the role 'ADMIN' or 'RESPONDER'
3. Create organizations using the Supabase dashboard

### 5. Development

```bash
npm run dev
```

Visit `http://localhost:3000`

## Authentication

### Login Flow
1. User visits `/login`
2. Enters email and password
3. Supabase Auth validates credentials
4. Session is stored in secure HttpOnly cookies via SSR
5. User is redirected to `/dashboard`

### Session Refresh
Middleware (`middleware.ts`) automatically refreshes sessions on each request.

### Logout
Session cookies are cleared, user is redirected to home.

## API Routes

### Health Check
```
GET /api/health
```

Response:
```json
{
  "status": "ok",
  "service": "react",
  "timestamp": "2024-08-26T00:00:00.000Z"
}
```

## Development Verification

### Lint
```bash
npm run lint
```

### Type Check
```bash
npm run type-check
```

### Build
```bash
npm run build
```

### Run
```bash
npm run dev
```

## Current Limitations (M1)

Not implemented (future milestones):
- Incident creation and management
- Emergency classification
- Responder dispatch
- Push notifications
- SMS/LTE communication
- Hardware device integration
- GPS tracking and geofencing
- Computer vision
- Predictive analytics
- Advanced reporting

## Security Checklist

- ✅ No hardcoded secrets in code
- ✅ Service role key server-only
- ✅ Row Level Security enabled on all data tables
- ✅ Cross-organization data access prevented
- ✅ Client-only code uses anon key
- ✅ Environment variables properly configured
- ✅ No fake authentication

## Recommended Next Steps (M2+)

1. **Incident Management**: Create incident workflow
2. **Responder Dispatch**: Implement assignment logic
3. **Real-time Updates**: Add WebSocket/Supabase Realtime
4. **Notifications**: Integrate push and SMS
5. **GPS Tracking**: Track responder locations
6. **Mobile App**: Native iOS/Android clients

## License

Internal use only.

## Support

For issues or questions about this foundation, check the repository for documentation.
