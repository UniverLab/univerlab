/** Shared lazy map from experiment id to its engraved background module.
 *
 *  The same map feeds the experiment pages (LiveBackground) and the home's
 *  lantern world mode: the module downloads only on the first hover that
 *  needs it, never with the page. */
export const fondoLoaders: Record<string, () => Promise<unknown>> = {
  texforge: () => import('./texforge'),
  canopy: () => import('./canopy'),
  gitkit: () => import('./gitkit'),
  ghscaff: () => import('./ghscaff'),
  demostage: () => import('./demostage'),
  'astro-denoise': () => import('./astro-denoise'),
  quorum: () => import('./quorum'),
};
