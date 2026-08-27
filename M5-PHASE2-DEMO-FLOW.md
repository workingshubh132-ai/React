# RE:ACT M5 Phase 2 - Complete Demo Flow

## Overview

This guide walks through the complete emergency response workflow from SOS signal detection through incident resolution, demonstrating all M5 Phase 2 features:

1. **SOS Signal Detection** (M3) → Incident created (M2) → Event logged (immutable)
2. **Command Center Dashboard** (M5 Phase 2) → Real-time incident list with metrics
3. **Incident Detail & Dispatch** (M5 Phase 2) → Supervisor dispatches responders
4. **Responder Mobile Interface** (M5 Phase 2) → Responder sees assignment, progresses state
5. **Real-time Updates** → All parties see live status with connection state

---

## Prerequisites

### Setup
- Node.js server running (`npm run dev`)
- Supabase instance with migrations applied
- Two test user accounts:
  - `supervisor@test.org` - Role: SUPERVISOR in organization "Test Org"
  - `responder@test.org` - Role: RESPONDER in organization "Test Org"

### Migration
```bash
# Apply M5 Phase 2 schema
supabase migration up
# Or run directly:
# supabase db push  # if using local Supabase CLI
```

---

## Step 1: Supervisor Login & Command Center

### Action
1. Open browser, go to `http://localhost:3000/login`
2. Login as `supervisor@test.org` / `password`
3. You should be redirected to `/command` (Command Center)

### Expected Behavior
- **Header**: "RE:ACT COMMAND CENTER" with logout button
- **Connection Status**: 🟢 LIVE (green circle + text)
- **Metrics Grid** (4 columns):
  - ACTIVE INCIDENTS: 0 (no incidents yet)
  - CRITICAL: 0
  - AVAILABLE RESPONDERS: 1 (the test responder)
  - RESPONDING: 0
- **Incident List**: Empty ("No incidents")

### Real-Time Features Demonstrated
- ✅ Real-time subscription active (`subscribeToActiveIncidents`)
- ✅ Responder availability fetched (`fetchResponderStats`)
- ✅ Connection state displayed

### Technical Notes
```typescript
// Command Center fetches:
- GET /api/incidents/active → returns incidents with org isolation
- GET /api/responders/available → returns AVAILABLE responders for dispatch
- Supabase realtime: subscribeToActiveIncidents + subscribeToResponderStatus
```

---

## Step 2: Trigger SOS Signal → Create Incident

### Action (Manual)
In another terminal, trigger a test signal:
```bash
curl -X POST http://localhost:3000/api/signals \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "test-device-123",
    "signal_type": "MOTION_DETECTED",
    "location": {"latitude": 37.7749, "longitude": -122.4194}
  }'
```

Or use the device endpoint (if implemented):
```bash
curl -X POST http://localhost:3000/api/device/signals \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "test-device-123",
    "signal_strength": 85,
    "motion_detected": true
  }'
```

### Expected Behavior in Command Center
- **Within 1 second**:
  - ACTIVE INCIDENTS counter increments to 1
  - New incident card appears in list
  - Connection state remains 🟢 LIVE (no flicker)
- **Incident Card Shows**:
  - 🚨 Severity icon (color-coded)
  - Title: "Suspicious Motion Detected" (or equivalent)
  - Type: "SECURITY"
  - Severity: "CRITICAL" or "HIGH"
  - "Detected <n>s ago" (elapsed time)
  - Status: Gray badge "DETECTED"
  - Location: "37.7749, -122.4194"
  - Click to view full details

### Real-Time Features Demonstrated
- ✅ Signal correlation (M3) → Incident creation (M2)
- ✅ Realtime subscription triggered incident refresh
- ✅ Counter updated without page reload
- ✅ Incident card rendered with full data

### Database Events
```sql
-- incident_events table should show:
INSERT INTO incident_events (incident_id, organization_id, event_type, actor_id, metadata)
VALUES ('{incident_id}', '{org_id}', 'INCIDENT_CREATED', NULL, '{"type": "SECURITY", "severity": "CRITICAL"}')
```

---

## Step 3: Supervisor Verifies Incident

### Action
1. Click incident card in Command Center
2. You're redirected to `/command/incidents/{id}` (Incident Detail)
3. Review incident information
4. Click "Start Verification" button
5. Status changes to "VERIFYING" → "VERIFIED"

### Expected Behavior
- **Incident Detail Page Loads**:
  - Header: Incident title + description
  - Status: "DETECTED" → "VERIFIED" (after verification)
  - Info grid: Type, Severity, Elapsed time, Location
  - Responders section: Empty (no assignments yet)
  - Timeline section: Shows INCIDENT_CREATED event
  - Dispatch button: Appears once status = VERIFIED
- **After Verification**:
  - Status badge changes to orange "VERIFIED"
  - Timeline adds new event: "INCIDENT_VERIFIED"
  - Dispatch button becomes enabled

### Technical Notes
```typescript
// Incident Detail fetches:
- GET /api/incidents/{id} → Full incident with events, assignments, metrics
- Supabase realtime: subscribeToIncidentAssignments (waits for dispatch)

// Verification calls:
- POST /api/incidents/{id}/verify (calls M2 RPC: transition_incident_to_verifying)
```

### Database Events
```sql
INSERT INTO incident_events (..., event_type) VALUES (..., 'INCIDENT_VERIFICATION_STARTED');
-- After verification:
INSERT INTO incident_events (..., event_type) VALUES (..., 'INCIDENT_VERIFIED');
```

---

## Step 4: Supervisor Dispatches Responder

### Action
1. On Incident Detail page, click "+ Dispatch" button
2. Dispatch Modal opens, showing:
   - List of AVAILABLE responders
   - Checkbox: "responder@test.org - AVAILABLE"
3. Check the responder checkbox
4. Click "Dispatch" button
5. Modal closes, responders section updates

### Expected Behavior
- **Modal Content**:
  - Title: "Dispatch Responders"
  - Responder card with name and availability status
  - Multi-select checkboxes
  - Cancel + Dispatch buttons (Dispatch disabled if no responder selected)
- **After Dispatch**:
  - Modal closes automatically
  - Responders section now shows:
    - Name: "responder@test.org"
    - Status badge: "ASSIGNED"
    - Timestamps: "Assigned: <time>"
  - Timeline adds event: "INCIDENT_DISPATCHED"
  - Incident status changes to "DISPATCHED"
  - Real-time: Incident card in Command Center updates

### Real-Time Features
- ✅ Dispatcher sees real-time responder count change
- ✅ Responder receives new assignment via realtime subscription
- ✅ All supervisors in org see updated incident status
- ✅ Connection state stays LIVE (no interruption)

### Technical Notes
```typescript
// Dispatch calls:
- POST /api/incidents/{id}/dispatch with { responder_ids: ['responder-id'] }

// Supabase realtime events:
- incident_responders table gets new row: status='ASSIGNED'
- incidents table updated: status='DISPATCHED'
- incident_events table gets new event: 'INCIDENT_DISPATCHED'
```

### Database State
```sql
-- incident_responders table:
INSERT INTO incident_responders (
  incident_id, responder_id, organization_id, status, assigned_at, created_at, updated_at
) VALUES (
  '{incident_id}', '{responder_id}', '{org_id}', 'ASSIGNED', NOW(), NOW(), NOW()
);

-- incident_events:
INSERT INTO incident_events (..., event_type)
VALUES (..., 'INCIDENT_DISPATCHED');
```

---

## Step 5: Responder Receives Assignment

### Action
1. Open new browser window/tab (or mobile browser)
2. Login as `responder@test.org` / `password`
3. You're redirected to `/responder` (Responder Dashboard - mobile-optimized)
4. Assignment appears immediately (or within 1 second)

### Expected Behavior
- **Responder Dashboard Loads**:
  - Header: "RE:ACT RESPONDER" with logout button
  - Loading spinner briefly, then gone
  - Assignment card appears showing:
    - 🚨 Severity icon
    - Title: Incident title from dispatch
    - Type + Severity + Detection time (elapsed)
    - Location: "37.7749, -122.4194"
    - Assignment status: "ASSIGNED"
    - Blue button: "ACKNOWLEDGE"
- **Mobile Optimization**:
  - Large touch targets (py-3, min 44px height)
  - Full width card
  - Clear hierarchy
  - Readable on mobile (~375px width)

### Real-Time Features
- ✅ Realtime subscription active (`subscribeToResponderAssignments`)
- ✅ Assignment appeared without page refresh
- ✅ Real-time connection established (if connection state visible)

### Technical Notes
```typescript
// Responder Dashboard fetches:
- GET /api/incident-responders?responder_id={id} (or from database subscribe)
- Supabase realtime: subscribeToResponderAssignments(responderId, ...)
// Subscription filters: incident_responders WHERE responder_id=eq.{responderId}
```

---

## Step 6: Responder Acknowledges Assignment

### Action
1. Click "ACKNOWLEDGE" button on responder's assignment card
2. Button goes into loading state: "Processing..."
3. Button text changes to "RESPOND"
4. Assignment status: "ASSIGNED" → "ACCEPTED"

### Expected Behavior
- **On Click**:
  - Button disabled + spinner + "Processing..." text
  - API call: PATCH /api/incident-responders/{id} with { action: 'accept' }
- **After Success**:
  - Button text changes to "RESPOND"
  - Assignment status badge: "ACCEPTED"
  - "Acknowledged at <time>" text appears below status
  - Alert if error: "Failed to acknowledge"
- **Supervisor Sees** (in Incident Detail):
  - Responders section updates
  - "Responder" status: "ACCEPTED"
  - New timestamp: "Accepted: <time>"
  - Timeline adds event: "RESPONDER_ACCEPTED"

### Real-Time Flow
- Responder PATCH → updates incident_responders
- Supabase realtime triggers event
- CommandCenter refetches responder stats (RESPONDING count increases)
- IncidentDetail refetches assignments
- All UI updates within 100-500ms

### Technical Notes
```typescript
// Responder Dashboard calls:
- PATCH /api/incident-responders/{assignmentId}
- Body: { action: 'accept' }
- Endpoint maps 'accept' → status 'ACCEPTED', sets accepted_at

// Response:
{
  assignment: {
    id, incident_id, responder_id, organization_id,
    status: 'ACCEPTED',
    assigned_at, accepted_at: '2026-08-27T12:34:56Z', responded_at: null,
    arrived_at: null, created_at, updated_at
  }
}
```

---

## Step 7: Responder Starts Responding

### Action
1. Responder clicks "RESPOND" button
2. Button shows "Processing..."
3. Button text changes to "ARRIVED"
4. Status: "ACCEPTED" → "RESPONDING"

### Expected Behavior
- **Assignment Status**:
  - "RESPONDING" status badge
  - New timestamp appears: "Responding at <time>"
- **Real-Time Updates**:
  - CommandCenter: RESPONDING responder count increments
  - IncidentDetail: Assignment status and timestamp updated
  - Timeline: New event "RESPONDER_RESPONDED" (if tracked)
- **Supervisor Experience**:
  - Knows responder is en route
  - Can see how long responder has been responding
  - Real-time coordination display updated

### Technical Notes
```typescript
// PATCH /api/incident-responders/{id} { action: 'respond' }
// Maps to: status='RESPONDING', sets responded_at=NOW()

// Responder availability may update (if implemented):
// UPDATE responders SET availability='RESPONDING' WHERE id='{responder_id}'
```

---

## Step 8: Responder Arrives on Scene

### Action
1. Responder clicks "ARRIVED" button
2. Button shows "Processing..."
3. Button text changes to "COMPLETE"
4. Status: "RESPONDING" → "ARRIVED"

### Expected Behavior
- **Assignment Status**:
  - "ARRIVED" status badge
  - Timestamp: "Arrived at <time>"
- **Real-Time Updates**:
  - CommandCenter: RESPONDING count decrements (responder no longer en route)
  - IncidentDetail: Updated assignment status
  - Timeline: Event "RESPONDER_ARRIVED"
- **Supervisor Feedback**:
  - Knows responder is on scene
  - Can coordinate with responder
  - Incident is actively being handled

### Technical Notes
```typescript
// PATCH /api/incident-responders/{id} { action: 'arrive' }
// Status='ARRIVED', arrived_at=NOW()
```

---

## Step 9: Responder Completes Incident

### Action
1. Responder clicks "COMPLETE" button
2. Button shows "Processing..."
3. Assignment card disappears or shows "COMPLETED" status
4. Responder Dashboard shows "No active assignments"

### Expected Behavior
- **Assignment Status**:
  - Status: "COMPLETED"
  - No action button (final state)
  - Card may remain or disappear based on UI design
- **Real-Time Updates**:
  - CommandCenter: RESPONDING count updates if still visible
  - IncidentDetail: All responder assignments shown (including COMPLETED)
  - Timeline: Event "RESPONDER_COMPLETED" or similar
- **Incident Resolution** (future enhancement):
  - If all responders completed, incident might auto-resolve
  - Currently: Supervisor must manually mark incident RESOLVED

### Technical Notes
```typescript
// PATCH /api/incident-responders/{id} { action: 'complete' }
// Status='COMPLETED', no special timestamp (already have arrived_at)

// Current behavior: Assignment marked complete, responder sees no active assignments
// Future: Could trigger incident auto-transition if all responders completed
```

---

## Step 10: Supervisor Resolves Incident

### Action
1. Supervisor still has Incident Detail page open
2. Sees all responders completed
3. Clicks "Resolve Incident" button (or "RESOLVED" status marker)
4. Incident status changes to "RESOLVED"

### Expected Behavior
- **Incident Status**:
  - Status badge: Green "RESOLVED"
  - Resolved timestamp: "Resolved at <time>"
- **Real-Time Updates**:
  - CommandCenter: ACTIVE INCIDENTS count decrements
  - Timeline: Event "INCIDENT_RESOLVED"
  - Incident card disappears from command center
- **Responder Experience**:
  - Responsive dashboard shows "No active assignments"
  - Assignment may still be visible in history (optional)

### Technical Notes
```typescript
// Supervisor calls:
- POST /api/incidents/{id}/resolve (or similar endpoint)
// Incident status='RESOLVED', resolved_at=NOW()
// Creates event: INCIDENT_RESOLVED
```

---

## Complete Timeline View

The IncidentDetail page should show chronological timeline:

```
12:01:15 - Incident created
12:01:20 - Verification started
12:01:30 - Incident verified
12:02:00 - Responders dispatched
12:02:05 - Responder accepted
12:02:15 - Responder responding
12:02:45 - Responder arrived
12:05:30 - Incident resolved
```

Each event shows:
- Timestamp (formatted: HH:MM:SS)
- Event type (human-readable)
- Connected by vertical timeline line
- Blue circle markers

---

## Real-Time Connection State Transitions

### Scenario 1: Normal Operation (🟢 LIVE)
- Connection established
- Events flow immediately
- No UI disruption
- Maintains 🟢 LIVE state

### Scenario 2: Network Interruption (🟡 RECONNECTING)
1. Network drops
2. Connection state changes to 🟡 RECONNECTING
3. UI shows warning but remains functional
4. After reconnect: 🟢 LIVE

### Scenario 3: Offline (🔴 OFFLINE)
1. Extended network outage
2. State changes to 🔴 OFFLINE
3. UI shows offline message
4. User can still perform actions (local state)
5. On reconnect: syncs with server and updates

---

## Verification Checklist

### M5 Phase 2 Features
- [ ] Command Center dashboard loads with correct incidents
- [ ] Real-time incident counter updates without page refresh
- [ ] Incident detail page shows timeline with immutable events
- [ ] Dispatch modal allows multi-select responder selection
- [ ] Responder dashboard shows mobile-optimized assignment cards
- [ ] Large touch targets (44px minimum height) on mobile
- [ ] State progression buttons work (ASSIGNED→ACCEPTED→RESPONDING→ARRIVED→COMPLETED)
- [ ] Real-time updates flow to all parties
- [ ] Connection state displayed correctly (LIVE/RECONNECTING/OFFLINE)
- [ ] Timestamps set correctly for each action

### Security
- [ ] Responder cannot see other responder's assignments
- [ ] RESPONDER cannot dispatch
- [ ] Cross-org access blocked
- [ ] Invalid transitions rejected with 400 error
- [ ] 404 on missing/unauthorized resources (no info leakage)

### Performance
- [ ] Real-time updates < 500ms
- [ ] No page reloads needed
- [ ] Smooth state transitions
- [ ] Mobile UI responsive (tested on 375px width)

### Edge Cases
- [ ] Concurrent responder actions handled gracefully
- [ ] Connection reconnection syncs state
- [ ] Completed assignments don't show action buttons
- [ ] Empty states show helpful messages

---

## Troubleshooting

### Incident doesn't appear in Command Center
- Check: Is signal being detected? (M3)
- Check: Is incident status 'DETECTED' or active? (not RESOLVED/FALSE_ALARM)
- Check: Is organization_id correct?
- Check: Realtime subscription active? (browser console logs)

### Responder doesn't receive assignment
- Check: Is responder.availability = 'AVAILABLE'?
- Check: Responder logged in to `/responder` route?
- Check: Supabase subscription active? (network tab)
- Try: Hard refresh (Cmd+Shift+R)

### Real-time not updating
- Check: Browser console for errors
- Check: Supabase client initialized correctly
- Check: RLS policies enabled on tables
- Check: Organization filter in subscription matches user's org

### State transition fails
- Check: Current assignment status (DB query)
- Check: Is next action valid for current status?
- Check: Is responder_id correct (user owns assignment)?
- Check: Is organization_id correct?

---

## Performance Benchmarks

Expected metrics:
- Incident creation to Command Center display: < 1 second
- Responder dispatch to assignment card visible: < 1 second
- Responder action (accept/respond/arrive) to UI update: < 500ms
- Timeline render: < 200ms (10 events)
- Mobile page load: < 2 seconds
- API response time: < 100ms (median)

---

## Conclusion

This demo flow showcases the complete M5 Phase 2 implementation:
- ✅ Real-time emergency coordination
- ✅ Supervisor command & control
- ✅ Responder mobile interface
- ✅ Live status updates
- ✅ Immutable audit trail
- ✅ Multi-org isolation

**Next Phase (M6)**: AI-powered dispatch optimization, SMS notifications, LTE fallback, computer vision analysis.
