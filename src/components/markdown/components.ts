import type { CustomComponentsMap } from '@tinacms/astro/types';
import Heading2 from './Heading2.astro';

/**
 * How a project brief is rendered.
 *
 * Tina hands back rich text as a tree rather than a string of markdown, and
 * <TinaMarkdown> draws it with plain tags. This map is where that is overridden.
 * There is one entry, and it exists to keep the heading anchors Astro's markdown
 * pipeline used to generate, so an address pointing into the middle of a brief
 * still lands where it did.
 *
 * The briefs are prose, headings and one table, so everything else is left to
 * the defaults deliberately: an override that only reproduces the tag it
 * replaced is a thing to maintain for nothing.
 */
export const markdownComponents: CustomComponentsMap = {
  h2: Heading2,
};
