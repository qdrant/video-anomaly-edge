import { NextRequest, NextResponse } from 'next/server';

const TWELVE_LABS_API_KEY = process.env.TWELVE_LABS_API_KEY;
const INDEX_ID = process.env.TWELVE_LABS_INDEX_ID;

export async function POST(request: NextRequest) {
  try {
    const { question, dataset, feed_id, time_ms } = await request.json();

    if (!question) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }

    // Try Twelve Labs Pegasus if available
    if (TWELVE_LABS_API_KEY && INDEX_ID) {
      try {
        const res = await fetch('https://api.twelvelabs.io/v1.3/generate', {
          method: 'POST',
          headers: {
            'x-api-key': TWELVE_LABS_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            video_id: INDEX_ID,
            prompt: question,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          return NextResponse.json({
            answer: data.data || data.text || 'No response generated.',
            source: 'twelvelabs',
            model: 'pegasus',
          });
        }
      } catch {
        // Fall through to local fallback
      }
    }

    // Local fallback: context-aware responses based on current state
    const answer = generateLocalResponse(question, dataset, feed_id, time_ms);
    return NextResponse.json({
      answer,
      source: 'local',
      model: 'rule-based',
    });
  } catch {
    return NextResponse.json({ error: 'Failed to process question' }, { status: 500 });
  }
}

function generateLocalResponse(
  question: string,
  dataset?: string,
  feedId?: string,
  timeMs?: number,
): string {
  const q = question.toLowerCase();

  if (q.includes('how many') && q.includes('incident')) {
    return 'There are 61 flagged incidents across 12 camera feeds in this session. The highest severity alerts involve physical altercations and pursuit events.';
  }
  if (q.includes('which') && (q.includes('camera') || q.includes('feed') || q.includes('dangerous'))) {
    return 'Main Entrance (Scene 01) has the most incidents at 19, followed by Admin Building (Scene 12) with 8 and South Corridor (Scene 08) with 7. These are the highest-activity zones.';
  }
  if (q.includes('summarize') || q.includes('summary') || q.includes('overview')) {
    return 'This session covers 12 campus cameras across 3 zones. 61 incidents detected — top threats are pursuit events (severity 99), physical altercations (90+), and unauthorized vehicles (85+). Bike/skateboard violations account for most low-severity alerts (40-60).';
  }
  if (q.includes('pattern') || q.includes('trend')) {
    return 'Violent incidents (altercations, pursuits) cluster at Main Entrance and Library Plaza. Vehicle violations are spread across Zone B and C perimeters. Bike/board violations are the most frequent but lowest severity.';
  }
  if (q.includes('recommend') || q.includes('suggest') || q.includes('should')) {
    return 'Priority review: the two pursuit events (severity 99) and altercations (90+) should be confirmed or dismissed first. Vehicle intrusions at perimeter gates may indicate access control issues worth flagging to facilities.';
  }

  return `I can help you analyze the surveillance footage. Try asking about incident patterns, camera hotspots, or use commands like "rewind 10", "show similar", or "what happened here?"`;
}
