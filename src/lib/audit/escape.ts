// HTML escaping shared by the edge renderer and the browser client. Kept in
// its own module so client.ts does not pull marked.js into the page bundle.
export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
