import type { Metadata } from 'next';
import SiteNav from '../../components/SiteNav';
import { UxCard, UxCta, UxRule, UxStat, UxStats } from '../../components/ux';

export const metadata: Metadata = { title: 'Learnovize — UI/UX review' };

/**
 * A visual board of the three design rules, applied to the three screens a person actually
 * uses. It exists so the design can be looked at, rather than argued about in words.
 *
 * Everything here is the real component vocabulary, so what is on this page is what lands
 * on the real screens.
 */

function Screen({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 34 }}>
      <p className="eyebrow">{note}</p>
      <h2 className="sec" style={{ marginTop: 0 }}>{title}</h2>
      {children}
    </section>
  );
}

export default function UxReview() {
  return (
    <div className="wrap">
      <SiteNav />
      <h1>UI / UX review</h1>
      <p className="sub">
        Clarity, consistency and restraint — applied to the three screens a person actually
        uses.
      </p>

      <UxRule />

      {/* ---------------- 1. the dashboard ---------------- */}
      <Screen title="Dashboard" note="Clarity — the key numbers come first">
        <UxStats>
          <UxStat value="620" label="Points" lead />
          <UxStat value="3" label="Seats held" />
          <UxStat value="2" label="Certificates" />
          <UxStat value="1" label="Class today" />
        </UxStats>

        <div style={{ marginTop: 16 }}>
          <UxCard>
            <p className="u-h">Reels — Solar Installation</p>
            <p className="u-sub">Tue 20 Oct, 9am WAT · in 18 hours</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <UxCta>Join the room</UxCta>
              <UxCta quiet>View details</UxCta>
            </div>
          </UxCard>
        </div>

        <div style={{ marginTop: 16 }}>
          <UxCard>
            <p className="u-h">Check your points</p>
            <p className="u-sub">620 points · 380 to Gold</p>
            <div
              style={{
                marginTop: 10, height: 8, borderRadius: 999,
                background: 'var(--line)', overflow: 'hidden', maxWidth: 320,
              }}
            >
              <div style={{ width: '62%', height: '100%', background: 'var(--gold)' }} />
            </div>
          </UxCard>
        </div>
      </Screen>

      <UxRule />

      {/* ---------------- 2. manage your classes ---------------- */}
      <Screen title="Manage your classes" note="Clarity and one best option">
        <UxStats>
          <UxStat value="2" label="Upcoming" lead />
          <UxStat value="5" label="Past" />
          <UxStat value="14" label="Learners" />
        </UxStats>

        <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
          <UxCard best bestLabel="Next up">
            <p className="u-h">Reels — Solar Installation</p>
            <p className="u-sub">Tue 20 Oct, 9am WAT · 12 of 50 seats</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <UxCta>Join class →</UxCta>
              <UxCta quiet>Prepare my class</UxCta>
            </div>
          </UxCard>

          <UxCard>
            <p className="u-h">Pricing Your Freelance Work</p>
            <p className="u-sub">Wed 21 Oct, 9am WAT · 3 of 50 seats</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <UxCta>Join class →</UxCta>
              <UxCta quiet>Prepare my class</UxCta>
            </div>
          </UxCard>
        </div>
      </Screen>

      <UxRule />

      {/* ---------------- 3. my sessions ---------------- */}
      <Screen title="My sessions" note="Consistency — the same card, the same shape">
        <div style={{ display: 'grid', gap: 12 }}>
          <UxCard>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="u-h" style={{ margin: 0 }}>Reels</p>
                <p className="u-sub" style={{ color: 'var(--ink)', fontWeight: 600 }}>
                  Tue 20 Oct · 9am WAT
                </p>
              </div>
              <span className="ux-best-tag" style={{ background: 'var(--accent)' }}>
                Upcoming
              </span>
              <UxCta>Join</UxCta>
            </div>
          </UxCard>

          <UxCard>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="u-h" style={{ margin: 0 }}>Solar Basics</p>
                <p className="u-sub" style={{ color: 'var(--ink)', fontWeight: 600 }}>
                  Wed 14 Oct · 9am WAT
                </p>
              </div>
              <span
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 22, height: 22, borderRadius: 6,
                  background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 800,
                }}
                aria-label="Attended"
              >
                ✓
              </span>
            </div>
          </UxCard>
        </div>
      </Screen>

      <UxRule />

      {/* ---------------- the rules, stated ---------------- */}
      <Screen title="The rules" note="What this page is showing">
        <div style={{ display: 'grid', gap: 12 }}>
          <UxCard>
            <p className="u-h">Clarity</p>
            <p className="u-sub">
              The dashboard puts the key numbers first, and whitespace separates everything
              else. The numbers sit in a row at the top because that is what the reader came
              for; the labels sit underneath them because a label above a number is read
              before the number.
            </p>
          </UxCard>

          <UxCard>
            <p className="u-h">Consistency</p>
            <p className="u-sub">
              All three screens use the same card shape, the same spacing rhythm and a single
              accent colour. Teal is the only accent on this page, and it is used for the
              same thing on every screen: the thing you should press.
            </p>
          </UxCard>

          <UxCard>
            <p className="u-h">Wow-factor</p>
            <p className="u-sub">
              The effect comes from restraint. One call to action per screen, one clearly
              marked best option, and clean lines. Nothing is decorated for the sake of it —
              the highlight on &ldquo;Next up&rdquo; is a coloured edge and a small tag, not a
              fill that would compete with the title.
            </p>
          </UxCard>
        </div>
      </Screen>
    </div>
  );
}
