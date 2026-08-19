/**
 * The one route the editor needs at runtime.
 *
 * Everything else on this site is a plain file. This is the exception: when
 * Ahmad types in the admin, the bridge posts the unsaved document here and gets
 * back the freshly rendered fragment to drop into the page. It cannot be
 * prerendered, because there is nothing to render until somebody is editing.
 *
 * That is what the Cloudflare adapter in astro.config.mjs is for. A visitor who
 * is not editing never touches this route: it answers only a same-origin POST
 * carrying Tina's own preview content type, and a plain GET gets a 405.
 */
import type { APIRoute } from 'astro';
import { experimental_createIslandRoute } from '@tinacms/astro/experimental';
import { islands } from '../../lib/islands';

export const prerender = false;
export const ALL: APIRoute = experimental_createIslandRoute(islands);
