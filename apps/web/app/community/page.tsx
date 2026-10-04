import Link from 'next/link';

export const dynamic = 'force-static';

const rules = [
  ['Be a real teacher', 'Only list trainings you will actually hold live. No-show trainings are refunded in full and count against your account.'],
  ['No scams, ever', 'No get-rich-quick, guaranteed-forex, giveaway, or pay-to-earn schemes. These are removed on sight and the account is suspended.'],
  ['Respect learners', 'No harassment, hate, or explicit content in classes, chats, polls, or feed posts. Trainers and moderators must remove disruptors.'],
  ['Honest certificates', 'Certificates confirm attendance and completion only — never government accreditation. Do not certify anyone below the minimum attendance.'],
  ['Your data', 'ID documents are used only for paid-certification approval and stored securely under the Nigeria Data Protection Act 2023.'],
  ['Reporting', 'Report any post, trainer, or class. Reports are reviewed around the clock; auto-flagged content is hidden while investigated.'],
];

export default function Community() {
  return (
    <div className="wrap">
      <div className="topbar"><span className="logo">Learnovize</span>
        <nav><Link className="btn link" href="/">Home</Link><Link className="btn link" href="/terms">Terms</Link><Link className="btn link" href="/privacy">Privacy</Link></nav>
      </div>
      <h1>Community rules.</h1>
      <p className="sub">Short version: teach for real, keep it clean, keep certificates honest.</p>
      <div className="card" style={{ marginTop: 18 }}>
        {rules.map(([t, d]) => (
          <div key={t} style={{ padding: '10px 0', borderTop: '1px solid var(--pill)' }}>
            <b>{t}</b><p className="muted" style={{ margin: '4px 0 0' }}>{d}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
