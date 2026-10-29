'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { authFetch, getAccess } from '@/lib/client-auth';
import Icon from '@/components/Icon';

/**
 * AI Assistant — a concierge chat box that helps people move through Learnovize.
 *
 * Controlled by the parent (MoreMenu) via the `open` prop. No standalone FAB —
 * the parent decides when to show it.
 *
 * Signed in: it reads /api/me and greets by firstname. Signed out: "Hello there".
 * Every quick action is a real route on the site, so a tap goes somewhere useful
 * instead of a dead end.
 *
 * The "brain" is rule-based by default (keyword → suggested action). Replace
 * `assistantRespond` with a call to a real AI API when one is wired up — the
 * UI and the greeting stay exactly the same.
 */

type Me = {
  user: {
    id: string;
    email: string;
    fullName: string | null;
    role: 'admin' | 'trainer' | 'participant';
  };
};

type Message = { role: 'user' | 'assistant'; text: string; at: number };

type AIAssistantProps = {
  /** Whether the panel is open. Controlled by the parent. */
  open?: boolean;
  /** Called when the user closes the panel. */
  onClose?: () => void;
};

// One chip = one thing the person can actually do right now.
const QUICK: {
  label: string;
  hint: string;
  icon: string; // emoji fallback; an Icon name is used when one exists
  iconName: 'chat' | 'grid' | 'home' | 'book' | 'badge' | 'calendar' | 'sparkles' | null;
  href: string;
  onlyWhenSignedIn?: boolean;
}[] = [
  {
    label: 'Learn a course',
    hint: 'Browse classes and grab a seat',
    icon: '📘',
    iconName: 'book',
    href: '/classes',
  },
  {
    label: 'Explore',
    hint: 'Upcoming trainings and feed posts',
    icon: '🗓',
    iconName: 'calendar',
    href: '/feed',
  },
  {
    label: 'Search free courses',
    hint: 'Classes that cost nothing to attend',
    icon: '🆓',
    iconName: null,
    href: '/classes?free=1',
  },
  {
    label: 'Apply to teach',
    hint: 'Become a trainer on Learnovize',
    icon: '🎥',
    iconName: 'sparkles',
    href: '/onboarding',
    onlyWhenSignedIn: true,
  },
  {
    label: 'Check my certificate',
    hint: 'View and download your certificates',
    icon: '🏅',
    iconName: 'badge',
    href: '/me/certificates',
    onlyWhenSignedIn: true,
  },
  {
    label: 'My seats',
    hint: 'Classes you are registered for',
    icon: '📚',
    iconName: 'book',
    href: '/me/registrations',
    onlyWhenSignedIn: true,
  },
];

/** Rule-based responses — used when Groq isn't configured or the API is unreachable. */
function ruleBasedRespond(text: string, me: Me | null): string {
  const t = text.toLowerCase();

  if (/\b(cert|certificate|download|verify)\b/.test(t)) {
    if (me) return `You can view and download your certificates at <a href="/me/certificates" className="assistant-link">My certificates</a>. Want me to open that for you?`;
    return 'Certificates are issued after you finish a class. Sign in to see yours.';
  }
  if (/\b(teach|trainer|apply|onboard|host)\b/.test(t)) {
    if (me) return `To teach here, go to <a href="/onboarding" className="assistant-link">Apply to teach</a> and fill in the trainer form.`;
    return 'Anyone can host a free training. Sign up, then apply to teach.';
  }
  if (/\b(class|course|training|learn|free|seat|register)\b/.test(t)) {
    return `Browse upcoming classes at <a href="/classes" className="assistant-link">Classes</a>, or explore the <a href="/feed" className="assistant-link">feed</a> for what is coming up.`;
  }
  if (/\b(explore|discover|browse|upcoming|next)\b/.test(t)) {
    return `The <a href="/feed" className="assistant-link">Explore feed</a> shows upcoming trainings, e-cards and videos.`;
  }
  if (/\b(help|support|ticket|faq)\b/.test(t)) {
    return `You can send a support ticket from the landing page, open to anyone — signed in or not.`;
  }
  if (/\b(hi|hello|hey|start|menu|what can you do)\b/.test(t)) {
    return greeting(me);
  }

  return `I can help you find classes, check certificates, apply to teach, or explore the feed. Just ask — for example "check my certificate" or "apply to teach".`;
}

/**
 * Real AI response via /api/assistant (Groq), with rule-based fallback.
 * Never throws: if the key is missing or the request fails, it falls back to
 * ruleBasedRespond so the chat keeps working.
 */
async function assistantRespond(text: string, me: Me | null): Promise<string> {
  try {
    const r = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: text }] }),
    });
    const j = await r.json();
    if (j.fallback || !j.text) throw new Error('no AI response');
    return j.text;
  } catch {
    return ruleBasedRespond(text, me);
  }
}

function greeting(me: Me | null): string {
  const name = me?.user?.fullName?.trim();
  if (name) return `Hello ${name}! What would you like to do today?`;
  return 'Hello there! What would you like to do today?';
}

export default function AIAssistant({ open: openProp = false, onClose }: AIAssistantProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(openProp);
  const [me, setMe] = useState<Me | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep internal open in sync with the controlled prop.
  useEffect(() => {
    setOpen(openProp);
  }, [openProp]);

  // Load the profile so we can greet by firstname. Silent failure — a guest just
  // gets "Hello there" and every quick action that needs an account routes to login.
  useEffect(() => {
    if (!getAccess()) {
      setMe(null);
      return;
    }
    authFetch('/api/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Me | null) => setMe(j))
      .catch(() => setMe(null));
  }, [getAccess()]);

  // Auto-open once on the landing page for first-time visitors (only when not
  // controlled by a parent menu).
  useEffect(() => {
    if (!openProp && pathname === '/' && !getAccess() && !sessionStorage.getItem('learnovize_assistant_seen')) {
      sessionStorage.setItem('learnovize_assistant_seen', '1');
      setOpen(true);
    }
  }, [pathname, getAccess(), openProp]);

  const scrollToBottom = () => {
    void scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  };

  const addAssistant = useCallback((text: string) => {
    const msg: Message = { role: 'assistant', text, at: Date.now() };
    setMessages((m) => [...m, msg]);
    setTimeout(scrollToBottom, 60);
  }, []);

  const handleQuick = async (label: string, href: string) => {
    setMessages((m) => [...m, { role: 'user', text: label, at: Date.now() }]);
    setInput('');
    setTimeout(scrollToBottom, 40);
    setSending(true);
    const reply = await assistantRespond(label, me);
    addAssistant(reply);
    setSending(false);
    setTimeout(scrollToBottom, 60);
    // Navigate after a breath so the reply is readable first.
    setTimeout(() => router.push(href), 900);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setMessages((m) => [...m, { role: 'user', text, at: Date.now() }]);
    setInput('');
    setSending(true);
    setTimeout(scrollToBottom, 40);
    const reply = await assistantRespond(text, me);
    addAssistant(reply);
    setSending(false);
    setTimeout(scrollToBottom, 60);
  };

  const signedIn = !!getAccess();
  const isOpen = openProp !== undefined ? openProp : open;

  return (
    <>
      {/* Chat panel — slides up from the bottom right. */}
      {isOpen && (
        <>
          <div className="assistant-overlay" onClick={() => onClose?.()}></div>
          <div
            className="assistant-panel open"
            style={{
              bottom: 'calc(56px + env(safe-area-inset-bottom, 0px))',
              right: '16px',
            }}
          >
            <div className="assistant-header" onClick={(e) => e.stopPropagation()}>
              <div className="assistant-avatar" aria-hidden>
                <Icon name="sparkles" size={20} strokeWidth={2} />
              </div>
              <div>
                <div className="assistant-title">Learnovize Assistant</div>
                <div className="assistant-sub">
                  {signedIn ? 'Signed in' : 'Not signed in'} · Quick help
                </div>
              </div>
              <button
                className="assistant-close"
                aria-label="Close assistant"
                onClick={() => onClose?.()}
              >
                <Icon name="close" size={18} strokeWidth={2} />
              </button>
            </div>

            <div className="assistant-greeting" role="status" aria-live="polite">
              {greeting(me)}
            </div>

            <div className="assistant-quick">
              {QUICK.filter((q) => !(q.onlyWhenSignedIn && !signedIn)).map((q) => (
                <button
                  key={q.href}
                  className="assistant-chip"
                  onClick={(e) => { e.stopPropagation(); handleQuick(q.label, q.href); }}
                >
                  <span className="assistant-chip-icon">
                    {q.iconName ? <Icon name={q.iconName} size={16} strokeWidth={1.8} /> : q.icon}
                  </span>
                  <span className="assistant-chip-text">
                    <span className="assistant-chip-label">{q.label}</span>
                    <span className="assistant-chip-hint">{q.hint}</span>
                  </span>
                  <span className="assistant-chip-arrow">→</span>
                </button>
              ))}
            </div>

            <div className="assistant-messages" ref={scrollRef}>
              {messages.length === 0 && (
                <div className="assistant-empty">
                  Pick something above, or type your own question.
                </div>
              )}
              {messages.map((m) => (
                <div
                  key={m.at}
                  className={`assistant-bubble ${m.role}`}
                >
                  {m.role === 'user' ? 'You' : 'Assistant'}
                  <span className="assistant-bubble-text" dangerouslySetInnerHTML={{ __html: m.text }} />
                </div>
              ))}
              {sending && (
                <div className="assistant-bubble assistant">
                  Assistant
                  <span className="assistant-bubble-text assistant-typing">typing<span className="dot">.</span><span className="dot">.</span><span className="dot">.</span></span>
                </div>
              )}
            </div>

            <form className="assistant-form" onSubmit={handleSend}>
              <input
                className="assistant-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask me something…"
                disabled={sending}
              />
              <button
                type="submit"
                className="assistant-send"
                disabled={!input.trim() || sending}
                aria-label="Send"
              >
                <Icon name="arrow-right" size={16} strokeWidth={2} />
              </button>
            </form>

            {!signedIn && (
              <div className="assistant-signin">
                Sign in to get a personal greeting and see your own certificates and seats.
                <Link href="/login" className="assistant-signin-link">Sign in →</Link>
                {'  or  '}
                <Link href="/signup" className="assistant-signin-link">Sign up →</Link>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
