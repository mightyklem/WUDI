'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { authFetch, getAccess } from '@/lib/client-auth';

/**
 * Show trainer tools only to whoever runs the class.
 *
 * The class page is a Server Component and the session is a Bearer token on the client, so
 * the server genuinely cannot know who is reading. Which is how pricing, moderators,
 * certificate issuing and the curriculum editor all rendered for every visitor: a learner
 * saw the whole back office of somebody else's class and could not use any of it.
 *
 * Renders NOTHING until the answer arrives, deliberately. The alternative -- rendering the
 * children first and hiding them after -- means every learner gets a flash of controls they
 * may not have, and a screenshot of that is a screenshot of your pricing. A blank strip for
 * a moment is the cheaper mistake.
 *
 * One request covers every trainer section, so this is one call rather than one per section.
 */
export default function TrainerOnly({
  trainingId,
  children,
}: {
  trainingId: string;
  children: ReactNode;
}) {
  const [allowed, setAllowed] = useState(false);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    let live = true;
    if (!getAccess()) {
      // Not signed in: certainly not the trainer, and no reason to ask.
      setAllowed(false);
      setSettled(true);
      return;
    }
    authFetch(`/api/trainings/${trainingId}/access`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!live) return;
        setAllowed(Boolean(j?.isOwner));
        setSettled(true);
      })
      .catch(() => { if (live) setSettled(true); });
    return () => { live = false; };
  }, [trainingId]);

  if (!settled || !allowed) return null;
  return <>{children}</>;
}