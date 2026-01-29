import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    recall: {
      level: 'incident-level',
      iou_threshold: 0.1,
      tolerance_ms: 5000,
      definition: 'A true positive is counted when any predicted anomaly window overlaps with a ground-truth incident window by at least 10% IoU within a 5-second tolerance.',
    },
    fp_hr: {
      scope: 'per-camera',
      unit: 'false alarms per camera-hour',
      definition: 'False positives are predicted anomalies with no overlapping ground-truth incident. Rate is normalized by total camera-hours in the test set.',
    },
    ttd: {
      reference: 'incident_start',
      measurement: 'first_detection',
      definition: 'Time-to-detect measures the delay between incident start time and the first anomaly prediction that overlaps the incident.',
    },
    threshold: {
      selection: 'PR-optimal',
      tuning_set: 'validation',
      caveat: 'Threshold was selected to maximize F1 score on a held-out validation set. Production thresholds should be tuned based on operational requirements.',
    },
  });
}
