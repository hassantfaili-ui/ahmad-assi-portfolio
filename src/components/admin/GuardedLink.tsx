'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';

/**
 * A link that asks before throwing away unsaved work.
 *
 * beforeunload cannot see a client side route change, so leaving a half edited
 * project by clicking Media in the top bar would take the work with it and say
 * nothing. This intercepts that one case.
 *
 * The confirm is deliberately the safe option: the button that stays is the
 * ordinary one, and leaving is the destructive one. That is the opposite of
 * most dialogs and it is the right way round here, because the cost of staying
 * by accident is one more click and the cost of leaving by accident is the
 * work.
 */
export function GuardedLink({
  href,
  dirty,
  children,
  className,
  ...rest
}: {
  href: string;
  dirty: boolean;
  children: ReactNode;
  className?: string;
} & Omit<React.ComponentProps<typeof Link>, 'href' | 'className' | 'children'>) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);

  if (!dirty) {
    return (
      <Link href={href} className={className} {...rest}>
        {children}
      </Link>
    );
  }

  return (
    <>
      <a
        href={href}
        className={className}
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          setAsking(true);
        }}
      >
        {children}
      </a>

      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title="Leave without saving?"
        description="You have changes on this page that have not been saved. If you leave now they are lost."
        confirmLabel="Leave and lose the changes"
        onConfirm={() => {
          setAsking(false);
          router.push(href);
        }}
      />
    </>
  );
}
