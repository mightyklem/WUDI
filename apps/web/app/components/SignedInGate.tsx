'use client';
import { useEffect, useState } from 'react';
import { getAccess } from '@/lib/client-auth';

/**
 * Whether there is a session, resolved on the client.
 *
 * Class pages are server components so the training, its sessions and its price render in
 * the first paint. That means the server cannot know who is asking, and passing "signedIn"
 * down as a prop would either force the whole page client-side or make every signed-out
 * visitor pay for a session check before the page appears.
 *
 * So the question box waits. It costs a token lookup, it renders nothing for a visitor who
 * is not going to use it, and the class itself never waits on auth.
 */
export default function SignedInGate({
  children,
}: {
  children: (signedIn: boolean) => React.ReactNode;
}) {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    setSignedIn(!!getAccess());
  }, []);

  return <>{children(signedIn)}</>;
}