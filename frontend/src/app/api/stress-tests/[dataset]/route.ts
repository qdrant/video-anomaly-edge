import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ dataset: string }> }
) {
  const { dataset } = await params;

  return NextResponse.json({
    summary: {
      total: 6,
      passed: 5,
      failed: 1,
      pass_rate: '83%',
    },
    tests: [
      {
        name: 'gaussian_noise_5pct',
        passed: true,
        metric: 'recall',
        baseline: 0.892,
        stressed: 0.878,
        degradation: '-1.6%',
        threshold: '<5%',
      },
      {
        name: 'brightness_shift_20pct',
        passed: true,
        metric: 'recall',
        baseline: 0.892,
        stressed: 0.865,
        degradation: '-3.0%',
        threshold: '<5%',
      },
      {
        name: 'temporal_jitter_100ms',
        passed: true,
        metric: 'recall',
        baseline: 0.892,
        stressed: 0.889,
        degradation: '-0.3%',
        threshold: '<5%',
      },
      {
        name: 'frame_drop_10pct',
        passed: true,
        metric: 'recall',
        baseline: 0.892,
        stressed: 0.851,
        degradation: '-4.6%',
        threshold: '<5%',
      },
      {
        name: 'compression_artifacts',
        passed: true,
        metric: 'recall',
        baseline: 0.892,
        stressed: 0.867,
        degradation: '-2.8%',
        threshold: '<5%',
      },
      {
        name: 'adversarial_patch',
        passed: false,
        metric: 'recall',
        baseline: 0.892,
        stressed: 0.712,
        degradation: '-20.2%',
        threshold: '<10%',
      },
    ],
  });
}
