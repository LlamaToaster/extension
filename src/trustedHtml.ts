// The one door markup goes through on its way into the DOM.
//
// The popup and side panel run under `require-trusted-types-for 'script'`
// (manifest.json), so a plain `el.innerHTML = string` throws there. Everything
// that writes markup calls setHtml(), which wraps the string with the "lt-html"
// policy. The policy does not sanitize: callers only pass markup built from this
// extension's own constants, with any outside text run through escapeHtml().
// Keeping a single policy makes that rule easy to audit (grep setHtml) and makes
// a stray innerHTML fail loudly instead of becoming an XSS hole.
//
// Where Trusted Types is missing (the web build in another browser, tests) the
// string is written as is.

interface HtmlPolicy {
  createHTML(input: string): unknown;
}
interface TrustedTypesFactory {
  createPolicy(name: string, rules: { createHTML(input: string): string }): HtmlPolicy;
}

const factory = (globalThis as { trustedTypes?: TrustedTypesFactory }).trustedTypes;
const policy: HtmlPolicy | null = factory ? factory.createPolicy("lt-html", { createHTML: (s) => s }) : null;

/** Replaces el's children with trusted, extension-built markup. */
export function setHtml(el: Element, html: string): void {
  el.innerHTML = (policy ? policy.createHTML(html) : html) as string;
}

/** Escapes text for use inside markup handed to setHtml(). */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
