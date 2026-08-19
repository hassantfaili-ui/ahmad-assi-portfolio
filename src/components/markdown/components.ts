import type { CustomComponentsMap } from '@tinacms/astro/types';
import Heading2 from './Heading2.astro';
import Table from './Table.astro';

/**
 * How a project brief is rendered.
 *
 * Tina hands back rich text as a tree rather than a string of markdown, and
 * <TinaMarkdown> draws it with plain tags. These two overrides exist because the
 * plain tags lost something the site already had: heading anchors, so an address
 * pointing into the middle of a brief still lands where it did, and a table with
 * a header row and no inline styles, so the stylesheet keeps drawing it.
 *
 * Everything else is left to the defaults deliberately. The briefs are prose,
 * headings and one table, and an override that only reproduces the tag it
 * replaced is a thing to maintain for nothing.
 */
export const markdownComponents: CustomComponentsMap = {
  h2: Heading2,
  table: Table,
};
