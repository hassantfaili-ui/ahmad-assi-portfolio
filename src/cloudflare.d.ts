/**
 * The Worker's own variables, as a type.
 *
 * `cloudflare:workers` is a virtual module: workerd provides it at runtime and
 * the adapter resolves it at build time, so nothing on disk declares it and
 * `astro check` cannot find it. This says what src/pages/api/film-upload.ts
 * actually uses, which is a bag of strings.
 *
 * `wrangler types` would generate this and a great deal more, 570KB of runtime
 * definitions regenerated every time wrangler.jsonc changes. That is the right
 * answer for a project built around bindings. This one has a single import of a
 * single export, so the narrow declaration is the honest size of the dependency.
 */
declare module 'cloudflare:workers' {
  export const env: Record<string, string | undefined>;
}
