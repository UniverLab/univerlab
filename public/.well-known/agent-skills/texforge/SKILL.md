---
name: texforge
description: >
  CLI tool for compiling LaTeX documents to PDF without TeX Live, MiKTeX, or any external LaTeX distribution.
  Use this skill whenever the user wants to create a LaTeX project, compile .tex files to PDF, format or lint
  LaTeX documents, spell-check prose, inspect the produced PDF, manage templates, or work with the texforge
  CLI. Activate when the user mentions "texforge new", "texforge build", "texforge fmt", "texforge check",
  "texforge init", "texforge template", "texforge outline", "texforge stats", "texforge preview",
  "texforge pdf", "texforge spell", "texforge doctor", creating a thesis or academic document, compiling
  LaTeX without installing TeX Live, using tectonic as a LaTeX engine, spell-checking a LaTeX document,
  project.toml configuration, or any workflow involving .tex files and the texforge tool.
license: MIT
metadata:
  author: jheison.martinez
  version: "1.7"
  framework: OpenCode
  category: cli-tool
  last_updated: "2026-08-12"
---

# texforge CLI

CLI para compilar LaTeX a PDF. Usa [tectonic](https://tectonic-typesetting.github.io/) como motor interno — no requiere TeX Live ni MiKTeX. Tectonic se instala automáticamente en el primer `texforge build`.

## Instalación

```bash
# Linux / macOS
curl -fsSL https://raw.githubusercontent.com/UniverLab/texforge/main/scripts/install.sh | sh
```

```powershell
# Windows (PowerShell)
irm https://raw.githubusercontent.com/UniverLab/texforge/main/scripts/install.ps1 | iex
```

```bash
# Via cargo
cargo install texforge
```

Elegí **una** vía y quedate con ella. El script instala en `~/.local/bin`; cargo instala en `~/.cargo/bin`. Si usás las dos quedan dos binarios y cuál corre depende del orden del `PATH` — el síntoma es que actualizás y nada cambia. `texforge doctor` y `which -a texforge` te dicen cuál estás ejecutando.

Tectonic se descarga e instala automáticamente en `~/.texforge/bin/` la primera vez que se ejecuta `texforge build`. No se requiere ningún paso adicional.

## Mapa de comandos

| Comando | Para qué |
|---|---|
| `new` / `init` | crear o migrar un proyecto |
| `build` | compilar a PDF |
| `clean` | borrar `build/` |
| `check` | linter + corrector ortográfico, sin compilar |
| `fmt` | formatear `.tex` y `.bib` |
| `outline` | árbol de secciones |
| `stats` | conteo de palabras |
| `preview` | rasterizar el PDF a PNG |
| `pdf` | inspeccionar el PDF ya compilado |
| `spell` | diccionario personal |
| `template` | gestionar templates |
| `config` | configuración global |
| `doctor` | diagnosticar el entorno |

## Comandos

### `texforge new <name>`

```bash
texforge new mi-tesis                 # template "general" (embebido, funciona offline)
texforge new mi-tesis -t apa-general  # template específico
```

Estructura generada:
```
mi-tesis/
├── project.toml
├── main.tex
├── sections/body.tex
├── bib/references.bib
└── assets/images/
```

`project.toml`:
```toml
[documento]
titulo = "mi-tesis"
autor = "Author"
template = "general"

[compilacion]
entry = "main.tex"
bibliografia = "bib/references.bib"
```

### `texforge init`

Wizard interactivo. Si detecta un `.tex` con `\documentclass`, ofrece migrar el proyecto existente. Si no, guía la creación de uno nuevo pidiendo nombre y template.

```bash
# En un directorio vacío — crea proyecto nuevo
cd mis-documentos/
texforge init

# En un proyecto LaTeX existente — migra
cd mi-tesis-existente/
texforge init
# Detectado: main.tex, refs.bib
# Pide titulo y autor, genera project.toml
```

Después de `init`, todos los comandos (`build`, `fmt`, `check`) funcionan normalmente.

### `texforge build`

```bash
texforge build
```

Compila `main.tex` → PDF en `build/`. Los errores se muestran con archivo, línea y sugerencia — nunca logs crudos de tectonic.

Antes de compilar, intercepta entornos de diagramas embebidos, los renderiza, y trabaja sobre copias en `build/` — los `.tex` originales nunca se modifican.

#### `texforge build --watch`

```bash
texforge build --watch             # recompila al guardar (debounce 2s por defecto)
texforge build --watch --delay 5   # debounce de 5s
```

Sesión persistente con timer en vivo, contador de builds y solo el último resultado (sin acumular logs). Salida coloreada; `Ctrl+C` para salir.

#### Build reproducible y preview en vivo

```bash
texforge build --reproducible            # fija SOURCE_DATE_EPOCH: mismo fuente = mismo PDF byte a byte
texforge build --reproducible 1700000000 # con epoch propio
texforge build --watch --preview         # escribe un PNG a una ruta fija tras cada build
texforge build --watch --preview --preview-page 2 --preview-out /tmp/live.png
```

`--preview` requiere `--watch`. Cualquier visor de imágenes que recargue al cambiar el archivo se convierte en un preview en vivo.

### `texforge clean`

```bash
texforge clean  # elimina build/ (PDF, logs, diagramas renderizados)
```

### Diagramas embebidos — Mermaid

```latex
% Sin opciones (defaults: width=\linewidth, pos=H, sin caption)
\begin{mermaid}
flowchart LR
  A[Input] --> B[Process] --> C[Output]
\end{mermaid}

% Con opciones
\begin{mermaid}[width=0.6\linewidth, caption=Flujo del sistema, pos=t]
flowchart TD
  X --> Y --> Z
\end{mermaid}
```

Renderizado a PNG en Rust puro — sin browser, sin Node.js, sin Inkscape.

| Opción | Default | Descripción |
|---|---|---|
| `width` | `\linewidth` | Ancho de la imagen |
| `pos` | `H` | Posición del figure (`H`, `t`, `b`, `h`, `p`) |
| `caption` | _(ninguno)_ | Pie de figura |

### Diagramas embebidos — Graphviz / DOT

```latex
\begin{graphviz}[caption=Pipeline, width=0.8\linewidth]
digraph G {
  rankdir=LR
  A -> B -> C
  B -> D
}
\end{graphviz}
```

Mismas opciones que mermaid. Renderizado via `layout-rs` — Rust puro, sin binario `dot` externo.

### Diagramas embebidos — D2

```latex
\begin{d2}[caption=Arquitectura, width=0.7\linewidth]
user -> api: request
api -> db: query
db -> api: rows
api -> user: response
\end{d2}
```

Sintaxis [D2](https://d2lang.com) (contenedores, shapes, `sql_table`, etc.). Mismas opciones que mermaid/graphviz. Renderizado via `d2-little` — Rust puro, sin binario `d2` externo ni Node.js.

### `texforge fmt [--check]`

```bash
texforge fmt           # formatea en lugar
texforge fmt --check   # solo verifica, útil en CI
```

Formateador determinista (estilo `cargo fmt`): re-indenta `.tex` por nivel de
anidamiento — entornos (`\begin`/`\end`) **y** llaves sin cerrar (p.ej.
`\hypersetup{...}` o un `\subsection*{...}` multilínea) — recortando espacios
finales y colapsando líneas en blanco repetidas. No reflowea el texto de
párrafos ni toca el contenido de entornos verbatim/lstlisting/minted.

También formatea archivos `.bib`: un campo por línea, indentación de 2 espacios,
`=` alineados, tipos y nombres de campo en minúscula, y coma final tras cada
campo. Es conservador — si un `.bib` no se puede parsear con seguridad, lo deja
intacto en vez de arriesgar corromper las referencias.

### `texforge check`

Linter estático más corrector ortográfico — valida sin compilar.

```bash
texforge check                   # ERRORS + WARNINGS
texforge check --deny-warnings   # los warnings también hacen fallar (CI)
```

**Referencias rotas** (`ERROR`):
- Archivos `\input` faltantes
- Imágenes `\includegraphics` no encontradas
- Archivos `\lstinputlisting` no encontrados
- Archivos `\inputminted{lang}{file}` no encontrados
- Claves `\cite` no definidas en el `.bib`
- Pares `\ref`/`\label` rotos
- Entornos sin cerrar

**Divergencia silenciosa** — construcciones que compilan sin quejarse y producen algo distinto de lo que el autor quiso:

| Regla | Dispara con | NO dispara con | Severidad |
|---|---|---|---|
| `~` como "aproximadamente" | `~60M`, `~5 años` | `Figura~\ref{}`, `Dr.~Smith` | warning |
| `%` sin escapar | `50%` | `% un comentario real` | warning |
| `...` literal | tres puntos en prosa | `\ldots`, `\dots` | warning |
| comillas rectas | `"texto"` | `` `` `` / `''` | warning |
| guión como rango | `2020-2024` | `well-written` | warning |
| `&`, `#`, `_`, `$` sin escapar | fuera de math y tablas | dentro de math o tablas | **error** |

Solo los `ERROR` cambian el código de salida (a menos que uses `--deny-warnings`).

```
ERROR [main.tex:47]
  \includegraphics{missing.png} — file not found

WARNING [main.tex:12]
  `~60M` — `~` in text mode is a non-breaking space, not "approximately"
  suggestion: Use \textasciitilde{} or spell the word out
```

#### Ortografía

`check` corrige la prosa y reporta `Unknown word` como warning. El idioma se resuelve así, de mayor a menor prioridad:

1. Lo que declare el documento: `\usepackage[spanish]{babel}` o `polyglossia`
2. El default del usuario: `texforge config language`
3. `english`

Si el documento y la config no coinciden, gana el documento y `check` lo avisa nombrando los dos idiomas — el override nunca es silencioso.

Los diccionarios viven en `~/.texforge/dicts/` y se descargan solos la primera vez:

| Idioma | Formato | Archivos |
|---|---|---|
| inglés | lista plana | `english.txt` |
| español | Hunspell | `spanish.dic` + `spanish.aff` |

El par Hunspell expande afijos, así que reconoce `soluciones` a partir de `solución` sin almacenarla. Si no hay diccionario disponible para el idioma resuelto, el corrector se salta con un mensaje que lo nombra — nunca corrige contra el idioma equivocado en silencio.

Para las palabras que el diccionario legítimamente no conoce — nombres propios, siglas, jerga técnica — usá `texforge spell`.

### `texforge spell`

Diccionario personal. Las palabras que agregues se aceptan en `check` sin editar archivos a mano.

```bash
texforge spell add docker cqrs webflux    # al diccionario personal (global, por defecto)
texforge spell add --local nombredetesis  # solo para este proyecto
texforge spell list                       # ver las palabras del alcance
texforge spell remove cqrs
```

**El alcance por defecto es global** (`~/.texforge/spell-words`), porque casi todo lo que uno agrega es cierto de la persona y no de un documento: tu apellido, tu ciudad, las tecnologías con las que trabajás. `--local` es la excepción, para un término propio de ese documento; escribe en `spell-whitelist.txt` o `.texforge/spell-words` — el que ya exista, o `.texforge/spell-words` si no hay ninguno.

`--global` sigue aceptándose como forma explícita del default. `--local` fuera de un proyecto **falla** en vez de caer al global: hacer otra cosa es cómo una palabra acaba donde nunca la vas a encontrar.

Los dos alcances se **suman**: una palabra aceptada en cualquiera de los dos vale.

Los archivos son texto plano, una palabra por línea, con `#` para comentarios. Agregar es siempre *append*: no se reordena ni se reescribe lo que ya estaba.

### `texforge outline`

```bash
texforge outline          # árbol de secciones
texforge outline --json   # para consumir desde un script
```

```
CV Jheison Martinez
    1  Perfil Profesional
    2  Experiencia Laboral
      2.1  AI Engineer en Accenture
    3  UniverLab.org
```

Resuelve los títulos a texto legible: quita el marcado (`\textit`, `\href`, líderes de puntos) y desescapa los especiales, así que `\subsection*{\textit{Fundador \& Lead Engineer}}` sale como `Fundador & Lead Engineer`.

### `texforge stats`

```bash
texforge stats                # palabras por sección
texforge stats --by file      # palabras por archivo .tex
texforge stats --json
```

Cuenta prosa, no marcado — los comandos, los entornos verbatim y los argumentos que no son texto no suman.

### `texforge preview`

```bash
texforge preview                          # todas las páginas a <proyecto>/preview
texforge preview --page 2                 # solo la página 2
texforge preview --scale 1.5 --out /tmp/p # a 1.5 px por punto PDF
```

Rasteriza el PDF ya compilado a PNG, en Rust puro. Útil para revisar el resultado sin abrir un visor, y para que un agente pueda *ver* la página.

### `texforge pdf`

Inspecciona el PDF ya compilado. Cuatro vistas:

```bash
texforge pdf text          # el texto como lo ve un lector o un ATS
texforge pdf text --raw    # sin normalizar las ligaduras
texforge pdf info          # páginas, fuentes (¿embebidas?), metadatos
texforge pdf pages         # qué sección abre cada página (diff-friendly)
texforge pdf check         # las palabras significativas del fuente ¿están en el PDF?
```

`pdf text` es la prueba real de si un ATS puede leer el documento: normaliza ligaduras (`ﬁ` → `fi`) y rejunta las palabras partidas por guión al final de línea.

`pdf pages` da una línea por página, pensado para diffear entre builds:

```
page=1 section=1 title=Perfil Profesional
page=2 section=3 title=UniverLab.org
```

`pdf check` compara fuente contra PDF y avisa de palabras que no sobrevivieron a la compilación — típicamente por una ligadura o una codificación. El truco `Artif{}icial` (grupo vacío para romper la ligadura `fi`) se entiende correctamente, tanto acá como en el corrector ortográfico.

### `texforge doctor`

```bash
texforge doctor
```

Reporta el estado **verificado** del entorno gestionado, no lo que la config afirma: Tectonic (presencia y versión), la caché y su tamaño, las fuentes disponibles, los diccionarios instalados y si el directorio actual es un proyecto texforge.

Es lo primero que hay que correr cuando algo no funciona y no está claro por qué.

### `texforge config`

Gestiona la configuración global (`~/.texforge/`), usada para rellenar placeholders al crear proyectos (autor, institución, etc.) y como default de idioma para el corrector.

```bash
texforge config                      # wizard interactivo
texforge config list                 # muestra toda la configuración actual
texforge config name                 # muestra el valor de una clave
texforge config name "Jane Doe"      # asigna un valor
```

Claves disponibles: `name`, `email`, `institution`, `language`.

`language` es solo el **default**: un documento que declara su idioma con `babel` o `polyglossia` gana sobre esta clave.

### `texforge template`

```bash
texforge template list               # instalados + disponibles en el registry remoto (por defecto)
texforge template list --local       # solo los instalados localmente (sin consultar el registry)
texforge template add apa-general    # descarga desde registry
texforge template remove apa-general
texforge template validate apa-general
```

Para conocer los templates disponibles, **siempre consultá la CLI** — no asumas una
lista fija, el registry remoto se actualiza por separado:

```bash
texforge template list   # fuente de verdad: instalados + registry remoto (por defecto)
```

Cada entrada muestra nombre y descripción. Usá ese nombre con `texforge new -t <nombre>`
o `texforge template add <nombre>`.

## Flujo típico — proyecto nuevo

```bash
texforge new mi-documento
cd mi-documento
texforge check    # detectar errores antes de compilar
texforge fmt      # formatear
texforge build    # compilar a PDF
```

## Flujo típico — proyecto existente

```bash
cd mi-proyecto-latex/
texforge init     # genera project.toml detectando entry y bib
texforge check
texforge build
```

## Flujo típico — revisar el resultado

```bash
texforge build
texforge pdf info     # ¿fuentes embebidas? ¿metadatos correctos?
texforge pdf text     # ¿lo lee un ATS?
texforge pdf pages    # ¿dónde cae cada sección?
texforge preview      # verlo
```

## Si `texforge build` falla

1. Correr `texforge check` primero — resuelve la mayoría de errores sin compilar
2. Si es el primer build, tectonic se está descargando — verificar conexión a internet
3. Para errores de sintaxis LaTeX, el output indica archivo y línea exacta
4. Si nada de eso explica el fallo, `texforge doctor` — dice si el entorno está en pie

## Si `texforge check` reporta ruido

- **Cientos de `Unknown word`**: probablemente el idioma resuelto no es el del documento. La primera línea de la salida dice cuál está usando. Declarálo con `\usepackage[spanish]{babel}` o ajustá `texforge config language`.
- **Nombres propios y jerga**: `texforge spell add <palabras>`, una vez, y valen en todos tus proyectos.
- **Un warning que es correcto y molesto**: no hay silenciado por regla; las reglas de divergencia silenciosa están hechas para no disparar en el uso legítimo. Si una lo hace, es un bug del linter y vale reportarlo.
