# Changelog - texforge Skill

## Version 1.6 (2026-06-12)

### Changed
- `texforge fmt` reescrito — ahora indenta por anidamiento real (entornos **y** llaves sin cerrar), arreglando entornos anidados que quedaban a la izquierda con su contenido flotando. Idempotente y verificado: el PDF resultante es byte-idéntico al original (cambios solo cosméticos)

### Added
- `texforge fmt` ahora también formatea archivos `.bib` (un campo por línea, `=` alineados, tipos/campos en minúscula, coma final). Conservador: deja intactos los `.bib` que no puede parsear con seguridad
- `texforge template list` ahora lista **por defecto** instalados + registry remoto; nuevo flag `--local` para ver solo los instalados (reemplaza al antiguo `--all`)

## Version 1.5 (2026-06-11)

### Added
- Diagramas D2 embebidos en `.tex` con `\begin{d2}...\end{d2}` — mismas opciones que mermaid/graphviz, renderizado en Rust puro (`d2-little`)
- `texforge config` — documentado por primera vez (wizard, `list`, get/set; claves `name`, `email`, `institution`, `language`)
- `texforge build --watch` — documentado en el cuerpo del skill con el flag correcto `--delay`

### Fixed
- URLs de instalación rotas — apuntaban a `JheisonMB/texforge/main/install.{sh,ps1}` (404); ahora `UniverLab/texforge/main/scripts/install.{sh,ps1}`
- Referencias de repos en README actualizadas de `JheisonMB` a `UniverLab`

### Changed
- La lista de templates ya no se hardcodea — el skill instruye consultar `texforge template list --all` como fuente de verdad

## Version 1.4 (2026-04-03)

### Changed
- `texforge init` — now auto-detects mode: migrates if `.tex` with `\documentclass` found at root, otherwise launches new project wizard
- `texforge build --watch` — live session timer, build counter, last result only (no log accumulation), colored output, default debounce reduced to 2s

---

## Version 1.3 (2026-04-01)
### Added
- `texforge clean` — eliminar build/
- Assets mirrored via symlinks (Unix) / copy (Windows) — no file duplication
- Linter detecta `\begin{mermaid}` sin cerrar y `pos` inválido
- Tests unitarios para formatter, linter, diagrams y new command

---

## Version 1.2 (2026-04-01)

### Added
- Diagramas Mermaid embebidos en `.tex` con `\begin{mermaid}...\end{mermaid}`
- Opciones por diagrama: `width`, `pos`, `caption`
- Renderizado a PNG en Rust puro (mermaid-rs-renderer + resvg) — sin browser ni Node.js
- Los `.tex` originales nunca se modifican — se trabaja sobre copias en `build/`
- `texforge init` — migrar proyectos LaTeX existentes
- `texforge template list --all` — lista instalados + disponibles en registry remoto
- Linter detecta `\lstinputlisting` e `\inputminted` con archivos faltantes
- Auto-instalación de tectonic en primer build
- `install.ps1` para Windows (PowerShell)

---

## Version 1.0 (2026-03-31)

### Added
- `texforge init` command — migrar proyectos LaTeX existentes
- `texforge template list --all` — lista instalados + disponibles en registry remoto
- Linter detecta `\lstinputlisting` e `\inputminted` con archivos faltantes
- Auto-instalación de tectonic en primer build (sin pasos manuales)
- `install.ps1` para Windows (PowerShell)
- `install.sh` simplificado — ya no instala tectonic (lo maneja texforge)

### Changed
- Instalación: tectonic ya no es un paso separado
- Flujo de troubleshooting actualizado (sin `tectonic --version`)

---

## Version 1.0 (2026-03-31)

### Initial Release

First version of the texforge skill, created from the texforge v0.1.0 CLI project.
