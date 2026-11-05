/**
 * What makes a project visible to a visitor, in one place.
 *
 * Two things must both hold: it is published, and it has not been put away in
 * the admin Archives folder (`shelved`). Every public query and every lead
 * count filters with this, so a shelved project can never leak onto a page,
 * the sitemap or the print sheet through a query that only checked
 * `published`.
 *
 * The website's own Archive list is a different thing: that is the `index`
 * tier, and those projects ARE on the site. This filter never looks at tier.
 */
export const ON_THE_SITE = { published: true, shelved: false } as const;
