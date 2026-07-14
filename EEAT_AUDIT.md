# Auditoría EEAT — UniverLab (univerlab.org)

**Fecha:** 2026-07-14
**Alcance:** Sitio completo (EN + ES), código fuente en `feature/quorum-circadian-style`
**Marco:** Google E-E-A-T + señales GEO (generative engine optimization)

---

## Resumen ejecutivo

UniverLab es un laboratorio computacional independiente que publica herramientas open-source y experimentos científicos. Sitio estático Astro, bilingüe (EN/ES), en Cloudflare Pages. La postura EEAT es **fuerte para un laboratorio de fundador único** con honestidad inusual y datos estructurados correctos.

| Señal | Valoración | Estado |
|---|---|---|
| Experience | Fuerte | Genesis stories en primera persona, bio del fundador, Archive de ideas muertas |
| Expertise | Moderada | Código abierto, docs desde repos hermanos, FAQPage schema. Sin publicaciones ni credenciales externas |
| Authoritativeness | Moderada-baja | GitHub real, identidad consistente. Sin menciones externas ni métricas de adopción |
| Trustworthiness | Fuerte | Sin tracking, robots.txt acogedor, paridad i18n verificada, FAQ implementadas |

---

## 1. Experience — Fuerte

### Lo que funciona

- **Genesis stories en primera persona** en los 8 experimentos (`src/i18n/en.ts:115-328`). Auténticas, específicas.
- **Bio del fundador** (`people.founder`): ingeniero electrónico, maestría en IA.
- **Archive** de 7 ideas abandonadas con razones honestas.
- **FAQPage JSON-LD** emitido para experimentos con FAQs (`ExperimentLayout.astro:56-68`).

### Pendientes

- Sin fechas en Genesis (año de inicio, hitos).
- Sin testimonios ni casos de uso de terceros.
- Sin screenshots de resultados reales fuera de demos mp4.

---

## 2. Expertise — Moderada

### Lo que funciona

- Código abierto inspeccionable; docs construidas desde repos hermanos en build.
- `SoftwareApplication` JSON-LD para CLIs; `WebApplication` para Quorum.
- Loop engine documentada con DAG scroll-driven scene.
- FAQs que explican qué es cada herramienta (SEO + GEO).

### Pendientes

- Sin enlace a tesis ni publicaciones académicas.
- Sin escritura técnica pública (blog/lab log).
- Sin versiones ni changelog visibles en el sitio.

---

## 3. Authoritativeness — Moderada-baja

### Lo que funciona

- Organización GitHub real con ~10 repos.
- Identidad consistente (paleta circadiana, IBM Plex Mono).
- Plataformas soportadas leídas dinámicamente del registry.

### Pendientes

- Cero menciones externas, citas, charlas.
- Sin métricas de adopción visibles (estrellas GitHub).
- Sin "used by" ni integraciones de terceros.

---

## 4. Trustworthiness — Fuerte

### Lo que funciona

- `robots.txt` invita a crawlers generativos (GPTBot, ClaudeBot, PerplexityBot).
- Canonical + hreflang correctos (`BaseLayout.astro:99-121`).
- Paridad i18n forzada en build (`check-i18n.ts`).
- Cero tracking, cero dark patterns.
- `llms.txt` actualizado con todas las plataformas.
- SECURITY.md en ghscaff.

### Pendientes

- Sin SECURITY.md en este repo (solo en ghscaff).
- Sin CONTRIBUTING.md pese a que contributors.astro pide PRs.
- Sin nota de privacidad en footer.

---

## 5. Recomendaciones priorizadas

### Bugs / esta semana

1. **SECURITY.md** en el repo del sitio (ya existe en ghscaff).
2. **CONTRIBUTING.md** con las convenciones que contributors.astro ya enuncia.

### Alto impacto

3. **Person JSON-LD** del fundador en /contributors con `sameAs` a GitHub.
4. **Fechas** en Genesis stories y `datePublished` en schemas.
5. **Star counts de GitHub** en tarjetas de experimento.
6. **Nota de privacidad** de una línea en footer.

### Medio impacto

7. OG images por experimento (cablear `scripts/og/`).
8. Enlazar tesis/propuesta de astro-denoise a medida que se publiquen.
9. Nota "inspecciona el script" junto a `curl | sh`.

### Largo plazo

10. Lab Log (bitácora EN-only) si es sostenible.
11. Difusión externa (Show HN, r/rust, awesome-lists).

---

## 6. Lo que el sitio hace mejor que la mayoría

- Archive de ideas muertas con causa de muerte honesta.
- IA reconocida como colaboradora, sin ocultarla.
- Paridad bilingüe verificada en build.
- robots.txt que invita a crawlers generativos.
- Cero tracking, cero dark patterns.
- FAQPage schema para rich snippets y GEO.

---

*Auditoría realizada sobre código fuente del repositorio.*
