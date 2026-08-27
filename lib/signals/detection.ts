import type { SignalType, DetectionAction, IncidentSeverity, IncidentType } from '@/types/database'
import type { NormalizedSignal } from './validation'

export interface DetectionRule {
  signal_type: SignalType
  action: DetectionAction
  severity: IncidentSeverity
  requires_verification: boolean
  recommended_incident_type: IncidentType | null
  confidence_threshold: number
  description: string
}

export interface DetectionResult {
  action: DetectionAction
  severity: IncidentSeverity
  requires_verification: boolean
  recommended_incident_type: IncidentType | null
  reason: string
  confidence: number
}

// Deterministic detection rules — no ML, no free text decisions
const DETECTION_RULES: Record<SignalType, DetectionRule> = {
  SOS: {
    signal_type: 'SOS',
    action: 'INCIDENT_CANDIDATE',
    severity: 'CRITICAL',
    requires_verification: false,
    recommended_incident_type: 'OTHER',
    confidence_threshold: 0.5,
    description: 'Direct SOS emergency call — immediate incident creation',
  },
  PANIC_BUTTON: {
    signal_type: 'PANIC_BUTTON',
    action: 'INCIDENT_CANDIDATE',
    severity: 'HIGH',
    requires_verification: true,
    recommended_incident_type: 'SECURITY',
    confidence_threshold: 0.5,
    description: 'Panic button press — requires verification before dispatch',
  },
  IMPACT: {
    signal_type: 'IMPACT',
    action: 'INCIDENT_CANDIDATE',
    severity: 'HIGH',
    requires_verification: true,
    recommended_incident_type: 'ACCIDENT',
    confidence_threshold: 0.6,
    description: 'Physical impact detected — requires verification',
  },
  SMOKE: {
    signal_type: 'SMOKE',
    action: 'INCIDENT_CANDIDATE',
    severity: 'HIGH',
    requires_verification: true,
    recommended_incident_type: 'FIRE',
    confidence_threshold: 0.7,
    description: 'Smoke detected — requires verification before full dispatch',
  },
  GAS: {
    signal_type: 'GAS',
    action: 'INCIDENT_CANDIDATE',
    severity: 'CRITICAL',
    requires_verification: true,
    recommended_incident_type: 'GAS_LEAK',
    confidence_threshold: 0.7,
    description: 'Gas detected — high priority with verification',
  },
  TEMPERATURE: {
    signal_type: 'TEMPERATURE',
    action: 'MONITORING',
    severity: 'MEDIUM',
    requires_verification: false,
    recommended_incident_type: 'FIRE',
    confidence_threshold: 0.0,
    description: 'Temperature threshold crossed — monitoring mode',
  },
  MOTION: {
    signal_type: 'MOTION',
    action: 'MONITORING',
    severity: 'LOW',
    requires_verification: false,
    recommended_incident_type: 'SECURITY',
    confidence_threshold: 0.0,
    description: 'Motion detected — logging only',
  },
  MANUAL_REPORT: {
    signal_type: 'MANUAL_REPORT',
    action: 'INCIDENT_CANDIDATE',
    severity: 'MEDIUM',
    requires_verification: true,
    recommended_incident_type: 'OTHER',
    confidence_threshold: 0.5,
    description: 'Manual user report — requires verification',
  },
  UNKNOWN: {
    signal_type: 'UNKNOWN',
    action: 'RECORD_ONLY',
    severity: 'LOW',
    requires_verification: false,
    recommended_incident_type: null,
    confidence_threshold: 0.0,
    description: 'Unknown signal type — record for analysis',
  },
}

/**
 * Apply deterministic detection rules to a normalized signal.
 * Returns a structured detection result with action and reasoning.
 */
export function detectFromSignal(signal: NormalizedSignal): DetectionResult {
  const rule = DETECTION_RULES[signal.signal_type]

  if (!rule) {
    return {
      action: 'RECORD_ONLY',
      severity: 'LOW',
      requires_verification: false,
      recommended_incident_type: null,
      reason: `Unknown signal type: ${signal.signal_type}`,
      confidence: 0,
    }
  }

  // Apply confidence threshold if applicable
  if (
    rule.confidence_threshold > 0 &&
    signal.confidence !== null &&
    signal.confidence < rule.confidence_threshold
  ) {
    return {
      action: 'RECORD_ONLY',
      severity: 'MEDIUM',
      requires_verification: false,
      recommended_incident_type: null,
      reason: `Signal confidence ${signal.confidence} below threshold ${rule.confidence_threshold} for ${signal.signal_type}`,
      confidence: signal.confidence,
    }
  }

  return {
    action: rule.action,
    severity: rule.severity,
    requires_verification: rule.requires_verification,
    recommended_incident_type: rule.recommended_incident_type,
    reason: rule.description,
    confidence: signal.confidence ?? 1.0,
  }
}

export function getDetectionRuleMatrix(): Record<SignalType, DetectionRule> {
  return DETECTION_RULES
}
