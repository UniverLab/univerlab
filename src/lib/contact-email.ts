/**
 * The lab's contact address (Cloudflare Email Routing to the founder's inbox,
 * sent through SMTP2GO): the single source the legal pages render. The
 * founder card publishes the same address (`en.people.founder.email`).
 *
 * This module is dependency-free on purpose: the WhatsApp worker's knowledge
 * imports the address from here, and that worker typechecks without node
 * builtins, so the address cannot live in `site-about` (which reads from
 * disk at build time). `site-about` re-exports it, so existing importers keep
 * working and the address is still defined exactly once.
 */
export const contactEmail: string = 'hola@univerlab.org';
