/**
 * The site's version, from the only file that carries it: `package.json`.
 *
 * Every place a version is published — the `/mcp` `initialize` response, the
 * Server Card, the card endpoints — reads this constant, so none of them can
 * drift from a manual edit of `package.json`.
 */
import pkg from '../../package.json';

export const SITE_VERSION: string = pkg.version;
