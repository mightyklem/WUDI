import type { Metadata } from 'next';
import SiteNav from '../../components/SiteNav';
import { UxCard, UxCta, UxRule } from '../../components/ux';
import { GreetingStrip, TrainerTabs, AppearanceChoices, TypeScale } from './preview';

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

/** A row of figures, the way the standing panel shows them. */
function Figures({ items }: { items: [string, string][] }) {
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      {items.map(([n, l]) => (
        <span key={l}>
          <span className="u-num" style={{ fontSize: 'var(--t-lg)' }}>{n}</span>{' '}
          <span className="muted" style={{ fontSize: 'var(--t-sm)' }}>{l}</span>
        </span>
      ))}
    </div>
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
      <Screen title="Dashboard" note="Clarity — the thing you must do comes first">
        <UxCard>
          <p className="eyebrow" style={{ margin: 0 }}>See what&rsquo;s next</p>
          <p className="u-h" style={{ marginTop: 4 }}>Reels — Solar Installation</p>
          <p className="u-sub">Tue 20 Oct, 9am WAT · in 18 hours</p>
          <div style={{ marginTop: 14 }}>
            <UxCta>Open the room</UxCta>
          </div>
        </UxCard>

        <div style={{ marginTop: 12 }}>
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
            <div style={{ marginTop: 10 }}>
              <Figures items={[['2', 'Certificates'], ['3', 'Seats held']]} />
            </div>
          </UxCard>
        </div>
      </Screen>

      <UxRule />

      {/* ---------------- 1b. the greeting ---------------- */}
      <Screen title="The greeting" note="Clarity — the page says hello, and knows the hour">
        <GreetingStrip />
        <p className="u-sub" style={{ marginTop: 12 }}>
          The top of the home page says hello and says the name, and the job the person
          came for sits underneath it in a quieter line. The hour is the one in Lagos,
          because Lagos is where the classes are taught and where the people opening the
          app are — a phone set to UTC should not call it the middle of the night.
        </p>
      </Screen>

      <UxRule />

      {/* ---------------- 1d. the type ---------------- */}
      <Screen title="The type" note="Clarity — writing that can be read">
        <TypeScale />
        <p className="u-sub" style={{ marginTop: 12 }}>
          The scale was written for a desk and read on a phone. Every step is about 8%
          larger than it was, and the smallest is 13 rather than 12, which is the point
          at which text stops being readable without zooming. The muted colour is
          darker too, so a secondary line is quieter than a title without being faint:
          it is 7.4 to 1 on a card in the light theme and 8.5 to 1 in the dark one.
        </p>
      </Screen>

      <UxRule />

      {/* ---------------- 1c. the appearance ---------------- */}
      <Screen title="The appearance" note="Restraint — the same product, in the light you need">
        <AppearanceChoices />
        <p className="u-sub" style={{ marginTop: 12 }}>
          The button that sets this floats above everything, bottom right, clear of the
          navigation, and it is on every page. It is worth putting it there rather than
          inside a settings page: the one time somebody wants the screen dimmer is at
          night, and they should not have to go looking for a page to find it.
          <br /><br />
          The choice is read before the first paint, so the page never flashes white on
          its way to dark. &ldquo;System&rdquo; keeps following the phone, so a screen that
          turns dark at sunset turns the app dark with it.
        </p>
      </Screen>

      <UxRule />

      {/* ---------------- 2. manage your classes ---------------- */}
      <Screen title="Manage your classes" note="Clarity — one class, marked">
        <div style={{ marginBottom: 14 }}>
          <TrainerTabs />
        </div>
        <div style={{ display: 'grid', gap: 12 }}>
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
              <UxCta quiet>Join class →</UxCta>
              <UxCta quiet>Prepare my class</UxCta>
            </div>
          </UxCard>
        </div>
      </Screen>

      <UxRule />

      {/* ---------------- 3. my sessions ---------------- */}
      <Screen title="My sessions" note="Consistency — the same card, the same shape">
        <div style={{ display: 'grid', gap: 12 }}>
          <UxCard best bestLabel="Next up">
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="u-h" style={{ margin: 0 }}>Reels</p>
                <p className="u-sub" style={{ color: 'var(--ink)', fontWeight: 600 }}>
                  Tue 20 Oct, 9am WAT
                </p>
              </div>
              <UxCta>Join</UxCta>
            </div>
          </UxCard>

          <UxCard>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="u-h" style={{ margin: 0 }}>Pricing Your Freelance Work</p>
                <p className="u-sub" style={{ color: 'var(--ink)', fontWeight: 600 }}>
                  Wed 21 Oct, 9am WAT
                </p>
              </div>
              <UxCta quiet>Join</UxCta>
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
              The dashboard opens with the thing you must do: the class you have to turn up
              to, when it is, and one button to get there. Where you stand comes after it,
              not before it — a person opening their dashboard is looking for an action,
              not for a score. Whitespace separates everything else, because a rule or a
              box would only add something to read past.
            </p>
          </UxCard>

          <UxCard>
            <p className="u-h">Consistency</p>
            <p className="u-sub">
              All three screens use the same card shape, the same spacing rhythm and a single
              accent colour. Teal is the accent on these screens, and it is used for the
              same thing on every screen: the thing you should press. The trainer&rsquo;s gold
              is the one exception, and it stays on the gold that means a trainer &mdash;
              it tints the tab strip rather than filling it, so navigation never shouts
              louder than the action.
            </p>
          </UxCard>

          <UxCard>
            <p className="u-h">Wow-factor</p>
            <p className="u-sub">
              The effect comes from restraint. In a list of things, one filled call to
              action — the one you should press — and one clearly marked best option. The
              next class is marked with a coloured edge and a small tag, not a fill that
              would compete with the title, and the buttons on the other cards stay quiet,
              so a list of five classes reads as one thing to do rather than five.
            </p>
          </UxCard>
        </div>
      </Screen>
    </div>
  );
}
