// sunSVG(id): the engraved sun approved 2026-10-21 (sepia line, cream wash, hatched shade, straight and wavy rays).
function sunSVG(id = "s") {
    const c = 60, R = 31, ink = "#3b2a1a", wash = "#f1e4c4", rays = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 - Math.PI / 2, P = (r, d) => [c + Math.cos(a + d) * r, c + Math.sin(a + d) * r];
      if (i % 2 === 0) {                                   // straight tapered ray
        const [x1, y1] = P(R + 3, -0.13), [x2, y2] = P(R + 24, 0), [x3, y3] = P(R + 3, 0.13);
        rays.push(`<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)} L${x3.toFixed(1)} ${y3.toFixed(1)} Z"/>`);
      } else {                                             // wavy flame ray, a little shorter
        const L = [], Rt = [], n = 7;
        for (let k = 0; k <= n; k++) {
          const t = k / n, r = R + 3 + t * 15, w = 0.12 * (1 - t) + 0.02, wob = Math.sin(t * Math.PI * 2) * 0.06;
          L.push(P(r, -w + wob)); Rt.push(P(r, w + wob));
        }
        const pts = L.concat(Rt.reverse()).map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L");
        rays.push(`<path d="M${pts} Z"/>`);
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" stroke-linejoin="round" aria-hidden="true">
  <defs>
    <pattern id="${id}-h" width="3.2" height="3.2" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)"><path d="M0 1.6 H3.2" stroke="${ink}" stroke-width=".9"/></pattern>
    <pattern id="${id}-d" width="4.5" height="4.5" patternUnits="userSpaceOnUse"><circle cx="2.2" cy="2.2" r=".55" fill="${ink}" opacity=".55"/></pattern>
    <mask id="${id}-m"><circle cx="${c}" cy="${c}" r="${R}" fill="white"/><circle cx="${c - 8}" cy="${c - 8}" r="${R - 2}" fill="black"/></mask>
  </defs>
  <g fill="${wash}" stroke="${ink}" stroke-width="1.5">${rays.join("")}</g>
  <circle cx="${c}" cy="${c}" r="${R}" fill="${wash}"/>
  <circle cx="${c}" cy="${c}" r="${R}" fill="url(#${id}-d)"/>
  <circle cx="${c}" cy="${c}" r="${R}" fill="url(#${id}-h)" mask="url(#${id}-m)" opacity=".85"/>
  <circle cx="${c}" cy="${c}" r="${R - 6}" fill="none" stroke="${ink}" stroke-width=".6" opacity=".45"/>
  <circle cx="${c}" cy="${c}" r="${R}" fill="none" stroke="${ink}" stroke-width="2.8"/>
</svg>`;
  }
