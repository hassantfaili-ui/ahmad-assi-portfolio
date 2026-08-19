'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode } from 'react';

import { useUnsavedWork } from '@/components/admin/UnsavedWork';

/**
 * A link that asks before throwing away unsaved work.
 *
 * beforeunload cannot see a client side route change, so leaving a half edited
 * project by clicking Media in the top bar would take the work with it and say
 * nothing. This intercepts that one case.
 *
 * The dirty state comes from the shared registry rather than a prop. A prop
 * meant each link had to be handed the flag of whatever happened to be nearby,
 * which is how the project screen ended up guarding its own breadcrumb against
 * the field form's flag alone while twenty rearranged images and their
 * descriptions sat outside it.
 *
 * The confirm is deliberately the safe way round: staying is the default and
 * leaving is the destructive choice. The cost of staying by accident is one
 * more click; the cost of leaving by accident is the work.
 */
export function GuardedLink({
  href,
  children,
  className,
  ...rest
}: {
  href: string;
  children: ReactNode;
  className?: string;
} & Omit<React.ComponentProps<typeof Link>, 'href' | 'className' | 'children'>) {
  const router = useRouter();
  const { isAnyUnsaved, confirmLeave } = useUnsavedWork();

  /* Always a real Link, so prefetching, middle click and the status bar all
     keep working, and the decision is made in the handler instead.
     Branching at render time was subtly wrong: the registry updates through
     React state, so a link could still be rendering its unguarded self for a
     moment after the keystroke that dirtied the screen. Deciding at click time
     from the live value has no such window. */
  return (
    <Link
      href={href}
      className={className}
      {...rest}
      onClick={(event) => {
        /* A modified or middle click opens a new tab and leaves this one where
           it is, so there is nothing to lose and nothing to ask about. */
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
          return;
        }
        if (!isAnyUnsaved()) return;

        event.preventDefault();
        void confirmLeave().then((leave) => {
          if (leave) router.push(href);
        });
      }}
    >
      {children}
    </Link>
  );
}
