/** CRT power-on when arriving from the home's bench.
 *
 *  The home sets `sessionStorage['univerlab-crt'] = '1'` before navigating
 *  (see crt.ts). This runs from BaseLayout on every page: if the handshake is
 *  present it plays `crt-on` on <body> once, then clears the key so a reload
 *  does not replay it.
 */
const CRT_KEY = 'univerlab-crt';

export function restoreCrtOn(): void {
  try {
    if (sessionStorage.getItem(CRT_KEY) !== '1') return;
    sessionStorage.removeItem(CRT_KEY);
  } catch {
    return; // storage disabled: nothing to restore
  }

  const body = document.body;
  body.classList.add('crt-on');

  const clear = () => body.classList.remove('crt-on');
  document.addEventListener(
    'animationend',
    (e) => {
      // The power-on runs on <body> (any destination); the home additionally
      // carries its own .crt-view wrapper, so accept either target.
      if (e.target === body) clear();
      else if (e.target instanceof HTMLElement && e.target.id === 'home-view') clear();
    },
    true,
  );
  window.setTimeout(clear, 1400);
}
