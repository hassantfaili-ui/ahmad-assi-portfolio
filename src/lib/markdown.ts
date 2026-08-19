import MarkdownIt from 'markdown-it';

/**
 * The project body, rendered.
 *
 * This exists because the port shipped without it and the failure was loud:
 * splitting the body on blank lines and wrapping each part in a paragraph
 * published the markdown source. The cabinets page printed a literal ## and an
 * entire pipe table as body text, and Renewal Square printed **Garden Heights**
 * with the asterisks. Seven of the eighteen project pages were affected, and so
 * was the portfolio PDF, which renders from the same content.
 *
 * typographer is on to match what Astro did. The Astro build ran SmartyPants,
 * so the published pages have curly quotes and real apostrophes in Tunney's,
 * River's and the group's. Leaving it off would have quietly straightened every
 * one of them.
 *
 * html is off. Nothing in the eighteen project files contains raw HTML, and the
 * body is now editable in a browser rather than only in a reviewed commit, so
 * there is no reason to leave a path open for markup that has not been through
 * a diff.
 */
const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: false,
});

export function renderMarkdown(source: string): string {
  return md.render(source ?? '');
}
