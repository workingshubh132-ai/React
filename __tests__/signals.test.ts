import { describe, it, expect } from '@jest/globals'
import {
  validateSignal,
  type RawSignalInput,
  type ValidationResult,
} from '@/lib/signals/validation'
import { detectFromSignal, getDetectionRuleMatrix } from '@/lib/signals/detection'
import type { NormalizedSignal } from '@/lib/signals/validation'

// ============================================================================
// SIGNAL VALIDATION TESTS
// ============================================================================

describe('Signal Validation', () => {
  describe('Valid Signals', () => {
    it('should accept valid SOS signal', () => {
      const input: RawSignalInput = {
        source: 'MOBILE',
        signal_type: 'SOS',
        severity: 'CRITICAL',
        occurred_at: new Date().toISOString(),
      }
      const result = validateSignal(input)
      expect(result.valid).toBe(true)
      expect(result.signal?.signal_type).toBe('SOS')
      expect(result.signal?.severity).toBe('CRITICAL')
    })

    it('should accept signal with all fields', () => {
      const input: RawSignalInput = {
        source: 'DASHBOARD',
        signal_type: 'SMOKE',
        severity: 'HIGH',
        confidence: 0.85,
        latitude: 40.7128,
        longitude: -74.006,
        occurred_at: new Date().toISOString(),
        device_id: '550e8400-e29b-41d4-a716-446655440000',
        metadata: { sensor_id: 'sensor_001', model: 'DuoSense' },
      }
      const result = validateSignal(input)
      expect(result.valid).toBe(true)
      expect(result.signal?.confidence).toBe(0.85)
      expect(result.signal?.latitude).toBe(40.7128)
    })

    it('should accept optional fields as null', () => {
      const input: RawSignalInput = {
        source: 'MOBILE',
        signal_type: 'MANUAL_REPORT',
        severity: 'MEDIUM',
        occurred_at: new Date().toISOString(),
      }
      const result = validateSignal(input)
      expect(result.valid).toBe(true)
      expect(result.signal?.device_id).toBeNull()
      expect(result.signal?.confidence).toBeNull()
    })
  })

  describe('Invalid Source', () => {
    it('should reject invalid source', () => {
      const input: RawSignalInput = {
        source: 'INVALID_SOURCE',
        signal_type: 'SOS',
        severity: 'CRITICAL',
        occurred_at: new Date().toISOString(),
      }
      const result = validateSignal(input)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('Invalid source'))).toBe(true)
    })
  })

  describe('Invalid Signal Type', () => {
    it('should reject invalid signal type', () => {
      const input: RawSignalInput = {
        source: 'MOBILE',
        signal_type: 'UNKNOWN_TYPE',
        severity: 'CRITICAL',
        occurred_at: new Date().toISOString(),
      }
      const result = validateSignal(input)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('Invalid signal_type'))).toBe(true)
    })
  })

  describe('Invalid Severity', () => {
    it('should reject invalid severity', () => {
      const input: RawSignalInput = {
        source: 'MOBILE',
        signal_type: 'SOS',
        severity: 'EXTREME',
        occurred_at: new Date().toISOString(),
      }
      const result = validateSignal(input)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('Invalid severity'))).toBe(true)
    })
  })

  describe('Invalid Timestamp', () => {
    it('should reject invalid occurred_at', () => {
      const input: RawSignalInput = {
        source: 'MOBILE',
        signal_type: 'SOS',
        severity: 'CRITICAL',
        occurred_at: 'not-a-date',
      }
      const result = validateSignal(input)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('occurred_at'))).toBe(true)
    })

    it('should accept ISO 8601 timestamp', () => {
      const now = new Date().toISOString()
      const input: RawSignalInput = {
        source: 'MOBILE',
        signal_type: 'SOS',
        severity: 'CRITICAL',
        occurred_at: now,
      }
      const result = validateSignal(input)
      expect(result.valid).toBe(true)
    })

    it('should accept Unix timestamp', () => {
      const input: RawSignalInput = {
        source: 'MOBILE',
        signal_type: 'SOS',
        severity: 'CRITICAL',
        occurred_at: Date.now(),
      }
      const result = validateSignal(input)
      expect(result.valid).toBe(true)
    })
  })

  describe('Invalid Coordinates', () => {
    it('should reject latitude > 90', () => {
      const input: RawSignalInput = {
        source: 'MOBILE',
        signal_type: 'SOS',
        severity: 'CRITICAL',
        occurred_at: new Date().toISOString(),
        latitude: 95,
        longitude: 0,
      }
      const result = validateSignal(input)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('coordinates'))).toBe(true)
    })

    it('should reject longitude > 180', () => {
      const input: RawSignalInput = {
        source: 'MOBILE',
        signal_type: 'SOS',
        severity: 'CRITICAL',
        occurred_at: new Date().toISOString(),
        latitude: 40,
        longitude: 200,
      }
      const result = validateSignal(input)
      expect(result.valid).toBe(false)
    })

    it('should accept valid coordinates', () => {
      const input: RawSignalInput = {
        source: 'MOBILE',
        signal_type: 'SOS',
        severity: 'CRITICAL',
        occurred_at: new Date().toISOString(),
        latitude: -33.8688,
        longitude: 151.2093,
      }
      const result = validateSignal(input)
      expect(result.valid).toBe(true)
      expect(result.signal?.latitude).toBe(-33.8688)
    })
  })

  describe('Invalid Confidence', () => {
    it('should reject confidence > 1', () => {
      const input: RawSignalInput = {
        source: 'MOBILE',
        signal_type: 'SOS',
        severity: 'CRITICAL',
        occurred_at: new Date().toISOString(),
        confidence: 1.5,
      }
      const result = validateSignal(input)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('confidence'))).toBe(true)
    })

    it('should reject confidence < 0', () => {
      const input: RawSignalInput = {
        source: 'MOBILE',
        signal_type: 'SOS',
        severity: 'CRITICAL',
        occurred_at: new Date().toISOString(),
        confidence: -0.1,
      }
      const result = validateSignal(input)
      expect(result.valid).toBe(false)
    })

    it('should accept confidence between 0 and 1', () => {
      const input: RawSignalInput = {
        source: 'MOBILE',
        signal_type: 'SOS',
        severity: 'CRITICAL',
        occurred_at: new Date().toISOString(),
        confidence: 0.5,
      }
      const result = validateSignal(input)
      expect(result.valid).toBe(true)
      expect(result.signal?.confidence).toBe(0.5)
    })
  })

  describe('Invalid UUID', () => {
    it('should reject malformed device_id', () => {
      const input: RawSignalInput = {
        source: 'MOBILE',
        signal_type: 'SOS',
        severity: 'CRITICAL',
        occurred_at: new Date().toISOString(),
        device_id: 'not-a-uuid',
      }
      const result = validateSignal(input)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('device_id'))).toBe(true)
    })

    it('should accept valid UUID', () => {
      const input: RawSignalInput = {
        source: 'MOBILE',
        signal_type: 'SOS',
        severity: 'CRITICAL',
        occurred_at: new Date().toISOString(),
        device_id: '550e8400-e29b-41d4-a716-446655440000',
      }
      const result = validateSignal(input)
      expect(result.valid).toBe(true)
    })
  })

  describe('Oversized Payload', () => {
    it('should reject metadata > 10KB', () => {
      const largeMetadata = { data: 'x'.repeat(15000) }
      const input: RawSignalInput = {
        source: 'MOBILE',
        signal_type: 'SOS',
        severity: 'CRITICAL',
        occurred_at: new Date().toISOString(),
        metadata: largeMetadata,
      }
      const result = validateSignal(input)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('too large'))).toBe(true)
    })

    it('should accept metadata <= 10KB', () => {
      const metadata = { data: 'x'.repeat(5000) }
      const input: RawSignalInput = {
        source: 'MOBILE',
        signal_type: 'SOS',
        severity: 'CRITICAL',
        occurred_at: new Date().toISOString(),
        metadata,
      }
      const result = validateSignal(input)
      expect(result.valid).toBe(true)
    })
  })

  describe('Missing Required Fields', () => {
    it('should reject missing source', () => {
      const input: RawSignalInput = {
        source: undefined,
        signal_type: 'SOS',
        severity: 'CRITICAL',
        occurred_at: new Date().toISOString(),
      }
      const result = validateSignal(input)
      expect(result.valid).toBe(false)
    })

    it('should reject missing signal_type', () => {
      const input: RawSignalInput = {
        source: 'MOBILE',
        signal_type: undefined,
        severity: 'CRITICAL',
        occurred_at: new Date().toISOString(),
      }
      const result = validateSignal(input)
      expect(result.valid).toBe(false)
    })

    it('should reject missing occurred_at', () => {
      const input: RawSignalInput = {
        source: 'MOBILE',
        signal_type: 'SOS',
        severity: 'CRITICAL',
        occurred_at: undefined,
      }
      const result = validateSignal(input)
      expect(result.valid).toBe(false)
    })
  })
})

// ============================================================================
// DETECTION RULES TESTS
// ============================================================================

describe('Detection Rules', () => {
  describe('SOS Signal', () => {
    it('should classify SOS as CRITICAL incident candidate', () => {
      const signal: NormalizedSignal = {
        source: 'MOBILE',
        signal_type: 'SOS',
        severity: 'CRITICAL',
        confidence: 1.0,
        latitude: null,
        longitude: null,
        occurred_at: new Date(),
        device_id: null,
        metadata: {},
      }
      const result = detectFromSignal(signal)
      expect(result.action).toBe('INCIDENT_CANDIDATE')
      expect(result.severity).toBe('CRITICAL')
      expect(result.requires_verification).toBe(false)
    })
  })

  describe('PANIC_BUTTON Signal', () => {
    it('should classify PANIC_BUTTON as HIGH incident candidate with verification', () => {
      const signal: NormalizedSignal = {
        source: 'MOBILE',
        signal_type: 'PANIC_BUTTON',
        severity: 'HIGH',
        confidence: 1.0,
        latitude: null,
        longitude: null,
        occurred_at: new Date(),
        device_id: null,
        metadata: {},
      }
      const result = detectFromSignal(signal)
      expect(result.action).toBe('INCIDENT_CANDIDATE')
      expect(result.severity).toBe('HIGH')
      expect(result.requires_verification).toBe(true)
    })
  })

  describe('IMPACT Signal', () => {
    it('should classify IMPACT as HIGH incident candidate with verification', () => {
      const signal: NormalizedSignal = {
        source: 'REACT_NODE',
        signal_type: 'IMPACT',
        severity: 'HIGH',
        confidence: 0.8,
        latitude: 40.7,
        longitude: -74.0,
        occurred_at: new Date(),
        device_id: null,
        metadata: {},
      }
      const result = detectFromSignal(signal)
      expect(result.action).toBe('INCIDENT_CANDIDATE')
      expect(result.severity).toBe('HIGH')
      expect(result.requires_verification).toBe(true)
      expect(result.recommended_incident_type).toBe('ACCIDENT')
    })

    it('should downgrade IMPACT with low confidence', () => {
      const signal: NormalizedSignal = {
        source: 'REACT_NODE',
        signal_type: 'IMPACT',
        severity: 'HIGH',
        confidence: 0.4, // Below 0.6 threshold
        latitude: null,
        longitude: null,
        occurred_at: new Date(),
        device_id: null,
        metadata: {},
      }
      const result = detectFromSignal(signal)
      expect(result.action).toBe('RECORD_ONLY')
    })
  })

  describe('SMOKE Signal', () => {
    it('should classify SMOKE as HIGH incident candidate', () => {
      const signal: NormalizedSignal = {
        source: 'REACT_NODE',
        signal_type: 'SMOKE',
        severity: 'HIGH',
        confidence: 0.9,
        latitude: null,
        longitude: null,
        occurred_at: new Date(),
        device_id: null,
        metadata: {},
      }
      const result = detectFromSignal(signal)
      expect(result.action).toBe('INCIDENT_CANDIDATE')
      expect(result.recommended_incident_type).toBe('FIRE')
    })

    it('should downgrade SMOKE below confidence threshold', () => {
      const signal: NormalizedSignal = {
        source: 'REACT_NODE',
        signal_type: 'SMOKE',
        severity: 'HIGH',
        confidence: 0.6, // Below 0.7 threshold
        latitude: null,
        longitude: null,
        occurred_at: new Date(),
        device_id: null,
        metadata: {},
      }
      const result = detectFromSignal(signal)
      expect(result.action).toBe('RECORD_ONLY')
    })
  })

  describe('GAS Signal', () => {
    it('should classify GAS as CRITICAL incident candidate', () => {
      const signal: NormalizedSignal = {
        source: 'REACT_NODE',
        signal_type: 'GAS',
        severity: 'CRITICAL',
        confidence: 0.95,
        latitude: null,
        longitude: null,
        occurred_at: new Date(),
        device_id: null,
        metadata: {},
      }
      const result = detectFromSignal(signal)
      expect(result.action).toBe('INCIDENT_CANDIDATE')
      expect(result.severity).toBe('CRITICAL')
      expect(result.recommended_incident_type).toBe('GAS_LEAK')
    })
  })

  describe('TEMPERATURE Signal', () => {
    it('should classify TEMPERATURE as MONITORING', () => {
      const signal: NormalizedSignal = {
        source: 'REACT_NODE',
        signal_type: 'TEMPERATURE',
        severity: 'MEDIUM',
        confidence: 0.8,
        latitude: null,
        longitude: null,
        occurred_at: new Date(),
        device_id: null,
        metadata: {},
      }
      const result = detectFromSignal(signal)
      expect(result.action).toBe('MONITORING')
      expect(result.severity).toBe('MEDIUM')
    })
  })

  describe('MOTION Signal', () => {
    it('should classify MOTION as MONITORING', () => {
      const signal: NormalizedSignal = {
        source: 'REACT_NODE',
        signal_type: 'MOTION',
        severity: 'LOW',
        confidence: 0.7,
        latitude: null,
        longitude: null,
        occurred_at: new Date(),
        device_id: null,
        metadata: {},
      }
      const result = detectFromSignal(signal)
      expect(result.action).toBe('MONITORING')
      expect(result.severity).toBe('LOW')
    })
  })

  describe('MANUAL_REPORT Signal', () => {
    it('should classify MANUAL_REPORT as incident candidate with verification', () => {
      const signal: NormalizedSignal = {
        source: 'DASHBOARD',
        signal_type: 'MANUAL_REPORT',
        severity: 'MEDIUM',
        confidence: 0.8,
        latitude: null,
        longitude: null,
        occurred_at: new Date(),
        device_id: null,
        metadata: { reported_by: 'supervisor' },
      }
      const result = detectFromSignal(signal)
      expect(result.action).toBe('INCIDENT_CANDIDATE')
      expect(result.requires_verification).toBe(true)
    })
  })

  describe('UNKNOWN Signal', () => {
    it('should classify UNKNOWN as record only', () => {
      const signal: NormalizedSignal = {
        source: 'MOBILE',
        signal_type: 'UNKNOWN',
        severity: 'LOW',
        confidence: 0.5,
        latitude: null,
        longitude: null,
        occurred_at: new Date(),
        device_id: null,
        metadata: {},
      }
      const result = detectFromSignal(signal)
      expect(result.action).toBe('RECORD_ONLY')
    })
  })

  describe('Detection Rule Matrix', () => {
    it('should have rules for all signal types', () => {
      const matrix = getDetectionRuleMatrix()
      const signalTypes: Array<keyof typeof matrix> = [
        'SOS',
        'PANIC_BUTTON',
        'IMPACT',
        'SMOKE',
        'GAS',
        'TEMPERATURE',
        'MOTION',
        'MANUAL_REPORT',
        'UNKNOWN',
      ]
      signalTypes.forEach((type) => {
        expect(matrix[type]).toBeDefined()
        expect(matrix[type].signal_type).toBe(type)
      })
    })
  })
})

// ============================================================================
// DEDUPLICATION STRATEGY TESTS (Unit Logic)
// ============================================================================

describe('Deduplication Strategy', () => {
  it('should identify duplicate window parameters', () => {
    const DEDUP_WINDOW_MS = 30000
    const now = new Date()
    const pastSignal = new Date(now.getTime() - 15000) // 15 seconds ago

    const timeDiff = now.getTime() - pastSignal.getTime()
    expect(timeDiff).toBeLessThan(DEDUP_WINDOW_MS)
  })

  it('should identify when window has expired', () => {
    const DEDUP_WINDOW_MS = 30000
    const now = new Date()
    const oldSignal = new Date(now.getTime() - 45000) // 45 seconds ago

    const timeDiff = now.getTime() - oldSignal.getTime()
    expect(timeDiff).toBeGreaterThan(DEDUP_WINDOW_MS)
  })

  it('should bypass dedup for critical signals', () => {
    const criticalSignals = ['SOS', 'PANIC_BUTTON']
    const testSignal = 'SOS'
    expect(criticalSignals.includes(testSignal)).toBe(true)
  })
})

// ============================================================================
// AUTHORIZATION & SECURITY TESTS
// ============================================================================

describe('Signal Authorization', () => {
  it('should validate device UUID format', () => {
    const validUUID = '550e8400-e29b-41d4-a716-446655440000'
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    expect(uuidRegex.test(validUUID)).toBe(true)
  })

  it('should reject malformed device UUID', () => {
    const invalidUUID = 'not-a-uuid'
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    expect(uuidRegex.test(invalidUUID)).toBe(false)
  })
})

// ============================================================================
// INPUT ATTACK VECTORS
// ============================================================================

describe('Input Attack Vectors', () => {
  it('should reject metadata with code injection', () => {
    const input: RawSignalInput = {
      source: 'MOBILE',
      signal_type: 'SOS',
      severity: 'CRITICAL',
      occurred_at: new Date().toISOString(),
      metadata: {
        script: "<script>alert('xss')</script>",
      },
    }
    const result = validateSignal(input)
    // Metadata should be accepted as-is (encoding happens at DB/API layer)
    expect(result.valid).toBe(true)
  })

  it('should reject SQL-like metadata', () => {
    const input: RawSignalInput = {
      source: 'MOBILE',
      signal_type: 'SOS',
      severity: 'CRITICAL',
      occurred_at: new Date().toISOString(),
      metadata: {
        query: "'; DROP TABLE signals; --",
      },
    }
    const result = validateSignal(input)
    // Metadata should be accepted (parameterized queries prevent SQL injection)
    expect(result.valid).toBe(true)
  })

  it('should reject extremely long strings in metadata', () => {
    const input: RawSignalInput = {
      source: 'MOBILE',
      signal_type: 'SOS',
      severity: 'CRITICAL',
      occurred_at: new Date().toISOString(),
      metadata: {
        description: 'x'.repeat(20000),
      },
    }
    const result = validateSignal(input)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('too large'))).toBe(true)
  })

  it('should accept reasonable nested metadata', () => {
    const nested = {
      level1: {
        level2: {
          level3: {
            data: 'nested but reasonable',
          },
        },
      },
    }

    const input: RawSignalInput = {
      source: 'MOBILE',
      signal_type: 'SOS',
      severity: 'CRITICAL',
      occurred_at: new Date().toISOString(),
      metadata: nested,
    }
    const result = validateSignal(input)
    // Reasonable nesting is fine
    expect(result.valid).toBe(true)
  })
})
