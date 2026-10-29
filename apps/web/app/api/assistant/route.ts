import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * Learnovize Assistant — Groq backend.
 *
 * Called by the AIAssistant chat component on the client.
 * The key never reaches the browser; only this route sees it.
 *
 * If GROQ_API_KEY is not set (e.g. local dev without one, or before you add it
 * to Netlify), the route returns { fallback: true } with a 200 so the client
 * can keep working with rule-based replies instead of breaking.
 */

export async function POST(req: Request) {
  const { messages }: { messages: { role: string; content: string }[] } =
    (await req.json().catch(() => ({}))) || { messages: [] };

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ fallback: true }, { status: 200 });
  }

  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        temperature: 0.4,
        max_tokens: 250,
        messages: [
          {
            role: 'system',
            content: `You are Learnovize Assistant, a helpful concierge for Learnovize, a live training platform in Nigeria.

You help people find classes, check certificates, apply to teach, and explore the feed.
Keep answers short (under 3 sentences), friendly, and in plain English.
If the user asks about their own certificate, seats, or registrations, tell them to check /me/certificates or /me/registrations after signing in.
Never invent prices, schedules, or features. If you don't know, say so and point them to the right page.`,
          },
          ...messages,
        ],
      }),
    });

    if (!r.ok) {
      const err = await r.text().catch(() => '');
      return NextResponse.json({ fallback: true }, { status: 200 });
    }

    const j = await r.json();
    const text = j.choices?.[0]?.message?.content;
    if (!text) return NextResponse.json({ fallback: true }, { status: 200 });

    return NextResponse.json({ text, fallback: false });
  } catch {
    return NextResponse.json({ fallback: true }, { status: 200 });
  }
}
