import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * Unmount whatever a component test rendered.
 *
 * Without this each test leaves its markup in the document, so a query that
 * should match one element matches several and the failure looks like a bug in
 * the component rather than in the suite.
 *
 * Safe in the node environment too: cleanup with nothing mounted does nothing.
 */
afterEach(() => {
  cleanup();
});
