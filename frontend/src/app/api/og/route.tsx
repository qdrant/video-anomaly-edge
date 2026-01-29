import { ImageResponse } from 'next/og';
import { readFileSync } from 'fs';
import { join } from 'path';

export const runtime = 'nodejs';

function toBase64(filePath: string, mime: string): string {
  const buf = readFileSync(join(process.cwd(), 'public', filePath));
  return `data:${mime};base64,${buf.toString('base64')}`;
}

export async function GET() {
  let qdrantLogo = '';
  let twelveLogo = '';
  try {
    qdrantLogo = toBase64('qdrant-logo-red-white.png', 'image/png');
    twelveLogo = toBase64('twelvelabs-logo.png', 'image/png');
  } catch {
    // logos not available
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #020617 0%, #0f172a 40%, #1e1b4b 100%)',
          fontFamily: 'system-ui, sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '-100px',
            right: '-50px',
            width: '400px',
            height: '400px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(220,38,38,0.15) 0%, transparent 70%)',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '-100px',
            left: '-50px',
            width: '400px',
            height: '400px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)',
            display: 'flex',
          }}
        />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
            zIndex: 1,
          }}
        >
          <div
            style={{
              fontSize: 72,
              fontWeight: 800,
              color: '#ffffff',
              letterSpacing: '-2px',
              display: 'flex',
            }}
          >
            Sentinel
          </div>
          <div
            style={{
              fontSize: 28,
              color: '#94a3b8',
              fontWeight: 500,
              letterSpacing: '2px',
              display: 'flex',
            }}
          >
            VIDEO ANOMALY DETECTION
          </div>
          <div
            style={{
              fontSize: 18,
              color: '#64748b',
              marginTop: '8px',
              display: 'flex',
            }}
          >
            Real-time surveillance intelligence powered by vector search
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '40px',
            marginTop: '48px',
            zIndex: 1,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: 14,
              color: '#64748b',
            }}
          >
            Powered by
          </div>
          {qdrantLogo && <img src={qdrantLogo} height={48} />}
          <div
            style={{
              width: '1px',
              height: '28px',
              background: '#334155',
              display: 'flex',
            }}
          />
          {twelveLogo && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              background: '#ffffff',
              borderRadius: '10px',
              padding: '8px 16px',
            }}>
              <img src={twelveLogo} height={36} />
            </div>
          )}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
