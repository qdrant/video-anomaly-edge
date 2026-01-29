import { NextResponse } from 'next/server';

const DATASETS = [
  {
    id: 'avenue',
    name: 'Avenue',
    description: 'CUHK Avenue Dataset - Campus surveillance',
    available: false,
    video_count: 21,
    anomaly_count: 47,
  },
  {
    id: 'streetscene',
    name: 'Street Scene',
    description: 'Street Scene Dataset - Urban traffic anomalies',
    available: false,
    video_count: 46,
    anomaly_count: 205,
  },
  {
    id: 'ucsd_ped1',
    name: 'UCSD Ped1',
    description: 'UCSD Pedestrian 1 - Walkway anomalies (bikes, vehicles)',
    available: false,
    video_count: 36,
    anomaly_count: 40,
  },
  {
    id: 'ucsd_ped2',
    name: 'UCSD Ped2',
    description: 'UCSD Pedestrian 2 - Cleanest anomalies (bikes, skaters)',
    available: false,
    video_count: 12,
    anomaly_count: 12,
  },
  {
    id: 'umn',
    name: 'UMN Crowd',
    description: 'UMN Unusual Crowd Activity - Panic/escape events',
    available: false,
    video_count: 11,
    anomaly_count: 11,
  },
  {
    id: 'shanghaitech',
    name: 'ShanghaiTech',
    description: 'ShanghaiTech Campus - 13 scenes, diverse anomalies',
    available: true,
    video_count: 107,
    anomaly_count: 107,
  },
  {
    id: 'ucf',
    name: 'UCF-Crime',
    description: 'UCF-Crime Dataset - 13 real-world anomaly types (fighting, robbery, etc.)',
    available: false,
    video_count: 950,
    anomaly_count: 950,
  },
  {
    id: 'ucf_crime',
    name: 'UCF-Crime (Full)',
    description: 'UCF-Crime Full Dataset - Extended anomaly types',
    available: true,
    video_count: 1900,
    anomaly_count: 950,
  },
];

export async function GET() {
  return NextResponse.json(DATASETS);
}
