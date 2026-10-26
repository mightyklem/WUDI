'use client';

import { useEffect, useState } from 'react';

/**
 * One short line under the greeting, picked by the day of the year — so it
 * changes every visit-day without flickering between renders. No counts, no
 * inventory: the hero inspires instead of reporting.
 */
const LINES = [
  'Show up live. Leave certified.',
  'One live hour beats ten saved videos.',
  'Your seat is waiting. Your proof is earned.',
  'Learn it live, prove it anywhere.',
  'Attendance is free. Excellence is earned.',
  'The classroom is live. So are you.',
  'Come curious. Leave certified.',
];

export default function Inspiration() {
  const [line, setLine] = useState<string | null>(null);

  useEffect(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const day = Math.floor((now.getTime() - start.getTime()) / 86400000);
    setLine(LINES[day % LINES.length]);
  }, []);

  return (
    <p className="sub" style={{ maxWidth: 460 }}>
      {line ?? 'Live learning, verifiable proof.'}
    </p>
  );
}
