# Auditoría EEAT — UniverLab (univerlab.org)

**Fecha:** 2026-07-13 (segunda pasada; reemplaza la auditoría anterior del mismo día)
**Alcance:** Sitio completo (EN + ES), todas las páginas públicas, verificado contra el código fuente en `feature/quorum-circadian-style`
**Marco:** Google E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness) + señales GEO (generative engine optimization)

---

## Resumen ejecutivo

UniverLab es un laboratorio computacional independiente que publica herramientas open-source y experimentos científicos. Sitio estático Astro, bilingüe (EN/ES), en Cloudflare Pages. La postura EEAT general es **fuerte para un laboratorio de fundador único**: honestidad inusual (Archive de ideas muertas, IA reconocida como colaboradora), datos estructurados correctos, y paridad EN/ES verificada en build.

La auditoría anterior era en general correcta en sus valoraciones, pero **no detectó tres problemas concretos y accionables** que esta pasada sí encontró (ver §1). También dejó la pregunta de blogs/FAQs como "nice to have"; esta auditoría la trata a fondo en §7 porque es la palanca de mayor impacto disponible.

| Señal | Valoración | Cambio vs. auditoría anterior |
|---|---|---|
| Experience | Fuerte | Sin cambio — las historias "Genesis" en primera persona siguen siendo la mejor señal del sitio |
| Expertise | Moderada | Sin cambio — código abierto sí, credenciales/publicaciones no |
| Authoritativeness | Moderada-baja | Sin cambio — falta validación externa (citas, adopción, menciones) |
| Trustworthiness | Fuerte, con 3 fisuras técnicas | ↓ leve — llms.txt desactualizado y sitemap con filtro roto contradicen la promesa de "todo aquí está para ser leído y citado" |

---

## 1. Hallazgos nuevos (no estaban en la auditoría anterior)

Estos tres son bugs concretos, no recomendaciones abstractas. Los tres erosionan confianza precisamente en los canales que el sitio dice priorizar (crawlers y LLMs).

### 1.1 `llms.txt` desactualizado — la señal GEO estrella está sirviendo información falsa

`public/llms.txt` es un archivo estático que quedó atrás respecto al registro real (`src/lib/experiments.ts`):

- **Falta Quorum (EXP-008)** por completo — un experimento activo con app pública (`quorum.univerlab.org`) es invisible para cualquier LLM que consuma el índice.
- **DemoStage figura como "beta"**; en el registro es `active` (EXP-007).
- **URL incorrecta de DemoStage**: `https://univerlab.org/demo-stage` — la página real es `/demostage`. Un LLM que cite esa URL manda al lector a un 404.
- No menciona el Archive ni la página de investigación.

Esto es lo contrario del espíritu del `robots.txt` ("Everything here is meant to be read, indexed, and cited"): se invita a los motores generativos a citar, y se les da datos erróneos. **Recomendación:** generar `llms.txt` en build desde `experiments.ts` + i18n (igual que ya se hace con el sitemap), no mantenerlo a mano.

### 1.2 Filtro del sitemap roto: `/secret` ya no existe, `/archive` queda en un estado contradictorio

`astro.config.mjs:21` filtra del sitemap las páginas que contienen `/secret`, pero la página se renombró a `/archive` (que hoy lleva `noindex` en `src/pages/archive.astro:10`). Resultado: **el archive está en el sitemap Y marcado noindex a la vez** — señal contradictoria que Google reporta como error de cobertura ("Indexed though blocked" / "Excluded by noindex, submitted in sitemap").

Decisión pendiente del propietario: el Archive es la señal de confianza más singular del sitio (§4). Tenerlo `noindex` significa que Google nunca la ve. O bien (a) se quita el `noindex` y se deja indexar (recomendado: es contenido honesto y único), o bien (b) se actualiza el filtro del sitemap a `/archive` para que la exclusión sea coherente.

### 1.3 Quorum no emite ningún JSON-LD de aplicación

`ExperimentLayout.astro:27` solo genera `SoftwareApplication` cuando `exp.install` existe. Quorum no tiene `install` (es web app con `url`), así que la única experiencia con producto hosteado público **no tiene ningún schema de aplicación**. Debería emitir `WebApplication` con `url: https://quorum.univerlab.org`, `applicationCategory`, `isAccessibleForFree: true`.

### Hallazgos menores nuevos

- **OG image única global** (`BaseLayout.astro:70`): todas las páginas comparten `/og.png`. Existe `scripts/og/` pero no está cableado por página. Imágenes OG por experimento (con su color de esencia y banner) mejorarían CTR al compartir.
- **`astro-denoise` enlaza al org de GitHub, no a un repo** (`experiments.ts:73`). Para un proyecto "research" que presume reproducibilidad, el enlace debería ir al repo (o explicar que aún no es público).
- **`contributors.ts:78-80`**: la exclusión del fundador del muro está desactivada con un comentario `TEMP`. Decisión pendiente, no bug EEAT, pero el fundador aparece dos veces (tarjeta + muro).
- **No hay `Person` JSON-LD para el fundador** en `/contributors`. Es la página que sustenta Experience/Expertise; un bloque `Person` con `sameAs: [github.com/JheisonMB]` conecta la entidad "Jheison Martinez" en el Knowledge Graph.

---

## 2. EXPERIENCE — Fuerte

### Lo que funciona (verificado en código)

- **Historias "Genesis" en primera persona** en los 8 experimentos (`src/i18n/en.ts`): Canopy ("It started as a folder of skills…"), TexForge ("A master's thesis… Overleaf wanted my money or my patience"), cadSpec ("My wife is an architect…"), DemoStage ("Born building this very page"), Quorum ("what does planning poker look like if you remove the server entirely?"). Auténticas, específicas, no infladas. **Sigue siendo la mejor señal EEAT del sitio.**
- **Bio del fundador** (`people.founder`): ingeniero electrónico, especialista en desarrollo, estudiante de maestría en IA. Concreta y humana (estoicismo, astronomía, familia).
- **El Archive**: 7 ideas abandonadas con la razón honesta de cada muerte. Rarísimo y valiosísimo (pero hoy invisible a buscadores, ver §1.2).
- **Observatorio con fuentes citadas**: cada serie declara fuente y licencia (Wikipedia, esperanza de vida, alfabetización, Living Planet Index).
- **Demos reales grabados con la propia herramienta** (DemoStage graba al resto del lab, incluida la landing) — dogfooding verificable.

### Brechas (persisten de la auditoría anterior)

- **Sin fechas**: las Genesis no dicen cuándo. "Empezó en 2024", "v1.0 en marzo 2025" haría la experiencia verificable. El historial git es público — los datos existen.
- **Sin testimonios ni casos de uso de terceros.**
- **Sin capturas de resultados reales** (benchmarks de astro-denoise, sesiones de terminal) fuera de los demos mp4.

---

## 3. EXPERTISE — Moderada

### Lo que funciona

- Código abierto e inspeccionable en cada experimento; docs construidas desde los repos hermanos en build.
- JSON-LD `SoftwareApplication` correcto para las CLIs con instalador (`ExperimentLayout.astro:27-41`), `WebSite` en Home, `Organization` global.
- Interconexión demostrable: Canopy construye el lab; TexForge nació de la tesis; DemoStage nació de esta landing. Conocimiento de dominio genuino, no catálogo.
- astro-denoise reposicionado honestamente como "research proposal" (commit `c95eb55`), con preguntas abiertas explícitas — madurez epistémica.

### Brechas

- **Sin enlace a la tesis ni a publicaciones.** El PDF de la propuesta de astro-denoise existe como CTA; cuando la tesis/dataset (Hugging Face) se publiquen, enlazarlos es la señal de expertise más barata disponible.
- **Sin escritura técnica pública** (ver §7 — aquí es donde blog/FAQs entran).
- **Colaboración IA reconocida pero sin delimitar**: la página de colaboradores lista los modelos, honesto, pero una línea sobre el rol humano (dirección, revisión, decisión) despejaría la ambigüedad "¿cuánto de esto es generado?".
- **Sin versiones ni changelog visibles en el sitio** (existen en GitHub, pero el visitante no lo sabe sin clicar).

---

## 4. AUTHORITATIVENESS — Moderada-baja

### Lo que funciona

- Organización GitHub real con ~10 repos públicos; muro de contribuidores construido en build desde la API (`contributors.ts`), sin requests cliente.
- Identidad consistente y memorable (paleta circadiana, tema cósmico, IBM Plex Mono, manifiesto filosófico).
- Identidades externas verificables: `github.com/JheisonMB`, `github.com/UniverLab`, email en dominio propio.

### Brechas (sin cambios — esto solo lo cura el tiempo y la difusión)

- Cero menciones externas, citas, charlas, podcasts, awesome-lists.
- Sin métricas de adopción visibles (estrellas, descargas). Nota: el propio Archive documenta que "Download Metrics" se abandonó por costo — coherente, pero un contador de estrellas de GitHub en build es gratis y no contradice esa decisión.
- Sin "used by" ni integraciones de terceros.

---

## 5. TRUSTWORTHINESS — Fuerte, con las fisuras de §1

### Lo que funciona (todo verificado)

- `robots.txt` da la bienvenida explícita a todos los crawlers, incluidos los generativos (GPTBot, ClaudeBot, PerplexityBot, CCBot…), con sitemap declarado.
- Canonical + hreflang (en/es/x-default) correctos en `BaseLayout.astro:99-121`.
- Paridad i18n forzada en build (`scripts/check-i18n.ts` + tests): un visitante hispanohablante recibe exactamente la misma información.
- **Cero tracking**: sin analytics, sin cookies de terceros, sin banners. localStorage solo para tema/idioma/flight-log, todo controlado por el usuario.
- Sin dark patterns: sin capturas de email, sin popups (la idea de newsletter está, literalmente, enterrada en el Archive con su razón).
- Estados honestos: active/beta/research con indicadores visuales; nada se presenta más maduro de lo que es.
- MIT license en el repo del sitio; tokens de ghScaff documentados como cifrados (XSalsa20-Poly1305).

### Brechas

- **Las tres fisuras de §1** (llms.txt falso, sitemap contradictorio, Quorum sin schema) — todas reparables en una tarde.
- **Sin SECURITY.md** en este repo (y a verificar en los repos de las herramientas — especialmente ghScaff, que maneja tokens de GitHub). Para herramientas que la gente instala vía `curl | sh`, una política de divulgación de vulnerabilidades es una señal de confianza importante.
- **`curl | sh` sin nota de verificación**: el instalador vía `get.univerlab.org` es cómodo, pero una línea "inspecciona el script primero: <URL>" en las páginas de instalación cuesta nada y desarma la objeción clásica.
- **Sin declaración de privacidad**: el sitio no rastrea, pero no lo dice. Una línea en el footer ("Sin analytics, sin cookies, sin tracking") formaliza lo que ya es cierto — y es un diferenciador, no un trámite legal.
- **Sin CONTRIBUTING.md** pese a que la página de colaboradores pide PRs con convenciones específicas (conventional commits, tests, docs). Esas reglas deberían vivir en el repo donde el contribuidor las necesita.

---

## 6. Desglose por página

| Página | Exp. | Expertise | Autoridad | Confianza | Nota |
|---|---|---|---|---|---|
| Home | Fuerte | Moderada | Baja-mod. | Fuerte | `WebSite` schema ✓; sin métricas |
| Manifesto | Fuerte | Fuerte | Moderada | Fuerte | Profundidad excepcional; obras "en desarrollo" honestas |
| Experiments | Fuerte | Fuerte | Baja-mod. | Fuerte | Necesita señales de adopción |
| Páginas de experimento | Muy fuerte | Fuerte | Moderada | Fuerte | Las mejores del sitio; Quorum sin schema (§1.3) |
| Contributors | Fuerte | Moderada | Baja | Fuerte | Falta `Person` JSON-LD |
| Archive | Fuerte | — | — | Muy fuerte | `noindex` + presente en sitemap (§1.2) |
| Observatorio | Moderada | Fuerte | Moderada | Fuerte | Fuentes y licencias citadas ✓ |

---

## 7. Blogs y FAQs — recomendación solicitada

Los dos aportan a EEAT, pero no igual ni al mismo costo. **Recomendación: FAQs primero (esta iteración), blog después y solo con un formato sostenible.**

### 7.1 FAQs por experimento — alto impacto, bajo costo, hazlo ya

- **Qué**: 4–6 preguntas reales por experimento, en la propia página del experimento (no una página /faq global, que nadie visita). Ejemplos: Canopy — "¿Funciona con Claude Code / OpenCode / X?", "¿Dónde se guarda la memoria?"; TexForge — "¿Necesito TeX Live instalado?" (¡no!); Quorum — "¿Dónde están mis datos?" (en ningún servidor); cadSpec — "¿Puedo importar DXF existentes?"; instaladores — "¿Es seguro `curl | sh`?".
- **Por qué es la mejor palanca EEAT/GEO disponible**:
  - `FAQPage` JSON-LD → elegible para rich results y, más importante hoy, es **exactamente el formato que los motores generativos citan** (pregunta directa + respuesta directa). El sitio ya invita a esos motores en robots.txt; las FAQs son darles material citable.
  - Responder objeciones reales ("¿por qué confiar en tu instalador?", "¿esto es un producto o un experimento?") es señal directa de Trust.
  - Encaja en la arquitectura existente: un bloque `faq: { items: [[q, a]] }` en el diccionario i18n por experimento, un componente `Faq.astro` en `ExperimentLayout`, y el schema se genera solo. La paridad EN/ES la vigila `check-i18n.ts` gratis.
- **Costo**: una sesión de escritura + un componente. Mantenimiento casi nulo.

### 7.2 Blog — impacto alto a largo plazo, pero solo si es sostenible

- **A favor**: es la única forma de construir Expertise "pensando en público" (la brecha de §3) y la materia prima de Authoritativeness (posts son lo que otros enlazan y citan). Temas ya disponibles que nadie más puede escribir: "por qué maté task-trigger y nació Canopy", "benchmarking de denoisers: cuando limpiar la imagen inventa galaxias", "CAD como código: por qué las imágenes mienten", cada entrada del Archive expandida.
- **En contra / riesgos**:
  - Un blog con 2 posts del 2026 y nada después es señal EEAT **negativa** (sitio abandonado). Peor que no tenerlo.
  - La paridad EN/ES que hoy es fortaleza se vuelve impuesto: cada post × 2 idiomas. Duplica el costo de escribir.
- **Formato recomendado si se hace**: un **"Lab Log"** (bitácora), no un "blog". Entradas cortas, fechadas, sin pretensión de artículo — "qué cambió en el lab este mes". Encaja con la estética (flight log, sols, telemetría), baja la vara de publicación, y las fechas resuelven de paso la brecha de "sin timeline" de §2. Implementación natural: content collection de Astro (`src/content/log/`), con `BlogPosting` o `Article` schema y fecha visible. Decisión pragmática: puede ser EN-only como las docs (precedente ya existente: "Documentation pulled from repositories stays English-only"), lo que elimina el impuesto de traducción.
- **Regla de decisión**: si no hay confianza en publicar al menos una entrada por mes durante 6 meses, hacer solo FAQs ahora y dejar el log para cuando astro-denoise tenga resultados que contar.

---

## 8. Recomendaciones priorizadas

### Arreglos (esta semana — son bugs, no mejoras)

1. **Regenerar `llms.txt` en build** desde `experiments.ts` (§1.1): añade Quorum, corrige estado y URL de DemoStage.
2. **Resolver la contradicción del Archive** (§1.2): quitar `noindex` (recomendado) o corregir el filtro del sitemap a `/archive`.
3. **Emitir `WebApplication` JSON-LD para Quorum** (§1.3).

### Alto impacto (este mes)

4. **FAQs por experimento con `FAQPage` schema** (§7.1).
5. **Fechas**: año de inicio en cada Genesis; `datePublished`/`dateModified` en los schemas.
6. **`Person` JSON-LD del fundador** en /contributors con `sameAs` a GitHub.
7. **SECURITY.md** (sitio + repos de herramientas, ghScaff primero) y **CONTRIBUTING.md** con las convenciones que la página de colaboradores ya enuncia.
8. **Estrellas de GitHub en build** en las tarjetas de experimento (misma infraestructura que el muro de contribuidores; no contradice la decisión del Archive sobre métricas de descargas).

### Medio impacto

9. Nota de privacidad de una línea en el footer ("sin analytics, sin cookies, sin tracking").
10. Nota "inspecciona el script" junto a los comandos `curl | sh`.
11. OG images por experimento (cablear `scripts/og/` a `BaseLayout`).
12. Enlazar tesis/propuesta/dataset de astro-denoise a medida que se publiquen; repo real en vez del org.

### Largo plazo

13. **Lab Log** si y solo si es sostenible (§7.2).
14. Difusión externa (Show HN, r/rust, listas awesome) — la única cura para Authoritativeness.

---

## 9. Lo que el sitio hace mejor que la mayoría (sin cambios, y vale repetirlo)

- El Archive de ideas muertas con causa de muerte honesta — genuinamente único.
- IA reconocida como colaboradora, sin ocultarla.
- Paridad bilingüe verificada en build, no prometida.
- robots.txt que invita a los crawlers generativos en vez de bloquearlos.
- Cero tracking, cero dark patterns, cero muros de email — y la newsletter descartada con razones públicas.
- Datos estructurados correctos donde existen; contenido funcional sin JS.

---

*Auditoría realizada leyendo el código fuente (layouts, registro de experimentos, diccionarios i18n, configuración, workers y assets públicos) y contrastando cada afirmación de la auditoría anterior contra el estado actual del repositorio.*
