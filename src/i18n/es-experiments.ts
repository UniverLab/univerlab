import type { Dict } from './en.ts';

// Copy de los experimentos (español) — separada de es.ts para que los
// diccionarios sigan legibles. Se integra en `es` sin cambios.
export const experiments: Dict['experiments'] = {
    canopy: {
      need: 'Un agente en un solo harness no carga un proyecto. Un grafo de ellos sí — implementa, verifica, revisa, commitea, y esquiva cada fallo.',
      tagline:
        'Un motor de grafos para agentes de IA — todos los harness, un solo flujo.',
      etymology: '(Del ingl. <em>canopy</em>, ‘dosel del bosque’.)',
      machineAlt: 'Torre colmena de madera grabada, con panales y abejas, movida por una manivela en su base',
      figure: 'Colmena de madera donde muchos agentes trabajan bajo un mismo techo, cada uno en su celda y todos en un solo flujo. Como el dosel del bosque, no hace crecer los árboles: los cubre y los ordena para que la luz llegue a todos.',
      thread: {
        problem: 'agentes de IA',
        method: 'un motor de grafos sobre cada harness',
        artifact: 'specs llevados hasta el commit',
      },
      title:
        'Motor de grafos multi-agente para agentes de IA — Canopy',
      description:
        'Motor de grafos de código abierto para agentes de IA: los specs recorren nodos de agente, chequeo y gate, los ensembles votan y los fallos vuelven solos.',
      koan: 'En un bosque, el dosel es donde las copas se tocan — árboles separados, una sola capa viva.',
      lede:
        'Los agentes de IA escriben código sin que nadie los vigile. <strong>Canopy</strong> pasa cada cambio por tus propias pruebas y revisores antes de commitearlo.',
      how:
        'Un daemon en Rust y una interfaz de terminal con un <strong>motor de grafos</strong> en el centro. El trabajo entra como spec y recorre un grafo que tú diseñas: nodos de <strong>agente</strong> en cualquier harness, nodos de <strong>chequeo</strong> que corren tus comandos reales, <strong>ensembles</strong> que reparten un paso entre varios modelos y exigen quórum, <strong>routers</strong> que eligen la rama, y un nodo de <strong>resiliencia</strong> que convierte una cuota agotada en un despertar programado. Por debajo: memoria, scheduling y sync para todos tus agentes.',
      morph: [
        ['Implementación con gates', 'los chequeos corren tus comandos reales — el rojo devuelve el trabajo, nunca a ti'],
        ['Ensemble · quórum', 'un spec, tres modelos en tres harness, dos de tres deben coincidir'],
        ['Cascada — corre uno, los demás esperan', 'el primer miembro toma el spec; si falla, el siguiente lo toma en frío — el primero que pasa sale, el resto nunca corre'],
        ['Router', 'un nodo de decisión manda cada spec por la rama que le corresponde'],
        ['Pipeline completo', 'diseño, implementación, gates, dos revisiones, commit — y una rama de resiliencia para cuando se acaba la cuota'],
      ] as [string, string][],
      genesis: {
        kicker: 'Génesis',
        title: 'El que empezó todo.',
        body:
          'Empezó como una carpeta de <strong>skills</strong> para el trabajo. Entonces noté lo que nadie mencionaba: los harness de agentes traían un modo <strong>headless</strong>, ahí, sin que nadie lo usara. Conecté tareas con cron para dispararlas por ese modo — demasiado para un skill, y los modelos de entonces se atragantaban con las instrucciones. Así que se volvió un <strong>MCP</strong>: <em>task-trigger</em>. Funcionaba, pero corría a ciegas en segundo plano; solo el agente veía lo que pasaba. No bastaba. Lo maté y construí una <strong>TUI</strong> — luego scheduling, memoria, sync, identidades, y un nombre nuevo. <strong>Canopy</strong>. Para entonces el giro estaba completo: Canopy construía a Canopy, y a todo lo demás en este laboratorio.',
      },
      layer: {
        kicker: 'El motor de grafos',
        cols: [
          ['Grafos, no prompts', 'Nodos de agente, chequeo, gate y router unidos por aristas de pass, fail y always. Un spec recorre el grafo de la entrada al commit; el enrutamiento depende de códigos de salida y veredictos reales, no de lo que un modelo dice haber hecho.'],
          ['Ensembles entre harness', 'Reparte un paso entre varios modelos — en paralelo con quórum, en cascada al siguiente si falla, o en round-robin por un equipo — cada miembro en el harness y modelo que elijas.'],
          ['El fallo es una ruta', 'Un gate en rojo devuelve el trabajo con la salida adjunta. Un nodo de resiliencia lee los errores de cuota y programa el grafo para despertar justo al reinicio. Solo un veredicto real llega a ti.'],
        ],
      },
      platforms: {
        kicker: 'Plataformas soportadas',
      },
      graphs: {
        kicker: 'El runtime por debajo',
        cols: [
          ['Memoria que persiste', 'Cada ejecución escribe hechos, patrones y decisiones en un grafo de conocimiento por proyecto. La siguiente sesión — en cualquier harness — los lee en vez de redescubrir el código.'],
          ['Colas y scheduling', 'Los specs viven en colas ordenadas que un grafo recorre en segundo plano; grafos y agentes también se disparan por cron o por cambios de archivo, y los hooks encadenan un grafo con el siguiente.'],
          ['Sincronización multiagente', 'Los agentes declaran su misión, reportan su estado y se mandan mensajes, para que varias sesiones compartan un espacio de trabajo sin pisarse.'],
        ],
      },
      cta: { catalogue: 'Catálogo' },
      remote: {
        kicker: 'Remote',
        title: 'Tus sesiones y tus grafos desde el teléfono',
        cols: [
          ['Cifrado de extremo a extremo',
            'Tus sesiones viajan por WebRTC con cifrado de extremo a extremo: el relay solo lleva la señalización y tu pantalla nunca pasa por él.'],
          ['Emparejamiento en un comando',
            'Corre el comando de abajo: imprime un código de un solo uso con su enlace y un QR en la terminal. Escanéalo y el navegador queda como un dispositivo revocable de tu host.'],
          ['Grafos en vivo, compartidos',
            'Mira los specs recorrer el grafo en tiempo real desde tu teléfono y reparte códigos de invitación de un solo uso entre invitados de confianza.'],
        ] as [string, string][],
        button: 'Abrir remote →',
      },
      catalogue: {
        kicker: 'Catálogo de grafos',
        caption: 'Patrón: Implementación con gates — una lámina del catálogo en vivo',
        explore: 'Explora el catálogo →',
        patterns: 'Patrones →',
        transparency: 'Transparencia →',
      },
      builder: {
        kicker: 'Grafo autónomo',
        pattern: 'Patrón: Ensemble · quórum + Implementación con gates',
        title: 'Falló. No se detuvo.',
        stat: ['0', 'veces que se detuvo'] as [string, string],
        outro: 'Cada nodo corre en el harness que elijas, y el loop que acabas de ver es el motor real haciendo su trabajo real.',
        steps: [
          ['Un spec, tres borradores',
            'El trabajo entra como spec — rol, qué, cómo. Se reparte entre tres modelos en tres harnesses y un quorum se queda con el consenso.'],
          ['Implementar desde el consenso',
            'Un nodo implementador toma el plan acordado en tu harness y empieza a escribir.'],
          ['Falló: cargo test, 2 rojos',
            'El nodo de chequeo corre tus comandos reales. El rojo devuelve el token directo al implementador — nunca llega a ti.'],
          ['Verde — y una segunda opinión',
            'El reintento pasa las puertas. Un harness distinto revisa el diff contra el spec antes de que algo avance.'],
          ['Commiteado. Pusheado. Otra vez.',
            'La rama se pushea y la corrida queda en memoria — el próximo spec ya está recorriendo el mismo grafo.'],
        ] as [string, string][],
      },
      faq: [
        ['¿Qué hace Canopy exactamente?',
          'Canopy corre el trabajo de programación con IA como grafos. Entra un spec, los nodos de agente hacen el trabajo en los harness que elijas — Claude, Codex, Gemini, OpenCode o cualquier agente de terminal —, los nodos de chequeo corren tus tests reales, los ensembles ponen de acuerdo a varios modelos, y los fallos vuelven solos hasta que el spec queda commiteado. Un daemon, todos tus agentes, todos tus free tiers.'],
        ['¿Cómo comparto trabajo entre Claude y Codex?',
          'Canopy le da a cada agente un grafo de conocimiento compartido y un protocolo de sincronización. Cuando Claude termina una tarea, los hechos y patrones que descubrió están disponibles para Codex en la siguiente sesión. Sin copia manual de contexto.'],
        ['¿Puedo ejecutar agentes de IA en un horario?',
          'Sí. Canopy dispara agentes por cron o por eventos de cambio de archivo a través de un daemon en segundo plano. Configuras el horario una vez; el daemon vigila el workspace y ejecuta tareas automáticamente.'],
        ['¿En qué se diferencia Canopy de usar Claude Code o Codex directamente?',
          'Esos son harnesses individuales. Canopy es la capa que los conecta — memoria compartida, programación en segundo plano y coordinación multi-agente. Tú conservas tus agentes; Canopy añade la infraestructura.'],
      ] as [string, string][],
    },
    texforge: {
      need: 'Escribir LaTeX no debería exigir instalar cuatro gigabytes de toolchain.',
      tagline:
        'Un espacio de trabajo LaTeX unificado — escritura, diagramas y PDFs en una sola herramienta autocontenida.',
      etymology: '(De <em>TeX</em> y el ingl. <em>forge</em>, ‘forja’.)',
      machineAlt: 'Prensa de imprenta de madera grabada, con volante, rodillo de tinta y palanca',
      figure: 'Prensa de tipos para la época de las máquinas: entra el manuscrito, sale el pliego. Con ella LaTeX deja de ser un oficio de instaladores y vuelve a ser lo que siempre fue, el arte de componer bien una página.',
      thread: {
        problem: 'LaTeX',
        method: 'una sola cadena de herramientas autocontenida',
        artifact: 'documentos reproducibles',
      },
      title:
        'LaTeX con diagramas Mermaid, Graphviz y D2 — TeXForge',
      description:
        'Un solo binario, sin distribución de LaTeX que instalar. Mermaid, Graphviz y D2 se renderizan desde tu .tex, y los errores están escritos para un agente.',
      koan: 'Los tipos móviles antes requerían un taller. Ahora requieren un solo binario.',
      figures: ['flujo de compilación', 'grafo del documento', 'mapa de build', 'listado de código'],
      lede:
        'Un único binario en Rust que arma, revisa, formatea, corrige y compila tu documento, y después te deja inspeccionar lo que salió — el texto que ve un lector, las fuentes, los metadatos y qué sección abre cada página. El motor LaTeX llega solo en la primera compilación, y los diagramas Mermaid, Graphviz o D2 se renderizan dentro de tus archivos <code>.tex</code> sin navegador ni Node.js. Los bloques de código salen resaltados de la misma forma: el resaltador viene compilado en el binario, sin Pygments ni shell-escape.',
      genesis: {
        kicker: 'Génesis',
        title: 'Nació de una tesis.',
        body:
          'Una tesis de maestría, escrita con IA en el flujo. Overleaf cobraba, TeXstudio pesaba demasiado, VSCode pedía una extensión por cada cosa. Solo quería diagramas Mermaid en mi LaTeX — lo que por supuesto significaba Node y una pila de archivos <code>.mmd</code>. Pegué con cinta un latexmake para renderizar los que faltaban. Aguantaba como aguanta la cinta. Y cada error mandaba al modelo a recorrer un log de compilación de mil líneas para hallar una sola línea mala. TeXForge condensa todo eso en un binario y un skill.',
      },
      press: {
        kicker: 'Toda la imprenta',
        items: [
          ['Componer', 'plantillas con placeholders que ya saben tu nombre.'],
          ['Corregir', 'un linter que detecta referencias rotas, archivos faltantes y entornos sin cerrar antes de imprimir.'],
          ['Revisar', 'ortografía y estilo que leen el idioma del documento — Babel, polyglossia o tu configuración por defecto — y revisan el texto contra el diccionario correcto.'],
          ['Ajustar', 'un formato canónico, como rustfmt para .tex. Diffs limpios para siempre.'],
          ['Ilustrar', 'los bloques Mermaid, Graphviz y D2 se vuelven figuras en compilación, renderizados en Rust puro.'],
          ['Resaltar', 'los bloques de código se vuelven listados con marco, números de línea y leyenda, coloreados en compilación — claro, oscuro o mono para imprimir.'],
          ['Inspeccionar', 'el PDF compilado — texto, fuentes, metadatos, diffs de página y si cada palabra del fuente sobrevivió.'],
          ['Imprimir', 'Tectonic compila de forma determinista; el modo watch reimprime mientras escribes.'],
        ],
      },
      // El listado impreso: un recorte del ejemplo de capacidades tal como lo
      // compiló texforge, no una maqueta.
      listing: {
        caption: 'listado impreso · python',
        alt: 'Un bloque de código Python compuesto por texforge: marco claro, números de línea al margen, palabras clave, cadenas y números en color.',
      },
      subproject: {
        kicker: 'Subproyecto',
        name: 'texforge-templates',
        body:
          'La plantilla <code>general</code> va embebida en el binario, así que crear un documento funciona incluso sin conexión.',
        link: 'https://github.com/UniverLab/texforge-templates',
      },
      templates: {
        kicker: 'Plantillas',
        title: '{n} plantillas en el registro abierto',
        cols: { name: 'nombre', description: 'descripción', version: 'versión' },
        use: 'Cada fila copia el comando; my-doc es el nombre de tu proyecto:',
        copy: 'Copiar',
        copied: 'Copiado',
        copyLabel: 'Copiar el comando que empieza un documento con {name}',
      },
      faq: [
        ['¿Qué problema resuelve TeXForge?',
          'Compilar LaTeX normalmente requiere instalar TeX Live (4+ GB), luego herramientas separadas para Mermaid, Graphviz y D2 — cada una con su propia configuración. TeXForge es un solo binario de ~15 MB que hace todo: scaffolding, linting, formateo, diagramas y compilación.'],
        ['¿Pueden los agentes de IA usar TeXForge para trabajar con LaTeX?',
          'Sí. Un agente puede ejecutar texforge build sin instalar nada — el motor de LaTeX se descarga en el primer uso. Los errores son concisos (no logs de 1000 líneas), y los diagramas se renderizan dentro de archivos .tex sin Node.js ni herramientas externas.'],
        ['¿TeXForge soporta diagramas Mermaid y D2 en LaTeX?',
          'Sí. Escribe un bloque de Mermaid, Graphviz o D2 directamente en tu archivo .tex. TeXForge lo renderiza como figura en el build, en Rust puro, sin navegador ni Node.js.'],
        ['¿Cómo funciona la corrección ortográfica en idiomas distintos del inglés?',
          'El idioma sale del propio documento — \\usepackage[spanish]{babel} o polyglossia — y recurre a tu configuración por defecto cuando no se declara ninguno. El español se revisa con un diccionario Hunspell y reglas de afijos, de modo que soluciones se reconoce a partir de la raíz solución sin necesidad de almacenarlo como entrada propia. Los diccionarios se descargan en el primer uso en ~/.texforge/dicts/.'],
      ] as [string, string][],
    },
    gitkit: {
      need: 'Cada repositorio nuevo arranca con el mismo ritual de configuración — a mano, cada vez.',
      tagline:
        'Configuración guiada de repositorios git — hooks, ignores, attributes y config en un solo flujo.',
      etymology: '(De <em>git</em> y el ingl. <em>kit</em>, ‘estuche de herramientas’.)',
      machineAlt: 'Torno de madera grabado con manivela, enrollando hilo rosa en un cuenco',
      figure: 'Trapiche que exprime la caña hasta la última gota: así le saca GitKit a git todo el jugo, con los ganchos que nadie configura y las reglas que todos olvidan puestos igual en cada repositorio.',
      thread: {
        problem: 'configuración de repos',
        method: 'builds guardados e idempotentes',
        artifact: 'el mismo ritual en todas partes',
      },
      title:
        'Setup de git hooks: commits y secretos — GitKit',
      description:
        'Setup de git hooks guiado e idempotente: commits convencionales, detección de secretos, .gitignore, .gitattributes y config. Un binario, sin Node ni Python.',
      koan: '// el ritual, automatizado',
      hero: {
        wizard: {
          kicker: 'gitkit init',
          steps: [
            'Perfil del repositorio',
            'Hooks',
            'Ignore & attributes',
            'Presets de config',
            'Guardar como build',
          ],
        },
        hooks: {
          kicker: 'pila de hooks',
          items: [
            ['conventional-commits', 'commit-msg'],
            ['no-secrets', 'pre-commit'],
            ['branch-naming', 'pre-push'],
          ] as [string, string][],
        },
      },
      lede:
        'Un flujo guiado para hooks, <code>.gitignore</code>, <code>.gitattributes</code> y configuración de git — y luego guardado como un <strong>build</strong> que puedes reaplicar a cualquier proyecto con un solo comando.',
      genesis: {
        kicker: 'Génesis',
        title: 'Un salto de línea que no se portaba bien.',
        body:
          'Empezó con un commit que no cambiaba nada — solo los saltos de línea, reescritos en silencio entre mi Mac del trabajo, mi Windows y los agentes en WSL. Perseguirlo me llevó a <code>.gitattributes</code>. Eso me llevó a los git hooks: integrados en git, de verdad potentes, e ignorados por casi todos — porque configurarlos en cada repo es trabajo manual que se repite una y otra vez. Así que lo resolví de raíz. Eso es gitkit.',
      },
      features: {
        kicker: 'Un solo flujo',
        items: [
          'Hooks integrados: conventional commits, detección de secretos, nomenclatura de ramas — embebidos, sin conexión.',
          'Todas las plantillas de gitignore.io más presets curados de configuración, aplicados de forma idempotente.',
          '<code>gitkit clone</code> arranca un repo en el instante en que toca el disco.',
          'Builds: guarda una configuración una vez, aplícala a todo proyecto futuro.',
          'Lock: bloquea commits y pushes a través de los hooks ya instalados — <code>--json</code> para estado legible por máquinas.',
        ],
      },
      faq: [
        ['¿Cómo evito que los agentes de IA hagan commits feos?',
          'GitKit configura git hooks en un solo flujo — conventional commits, detección de secretos, nomenclatura de ramas. Los hooks corren offline, embebidos en el repo. Los agentes no pueden pushear código que no compila o contiene secretos.'],
        ['¿Qué son los "builds" de GitKit?',
          'Un build guarda tu configuración de git (hooks, ignore, attributes, config) como una plantilla reutilizable. Aplícala a cualquier proyecto futuro con un solo comando — sin reconfigurar hooks en cada repo.'],
        ['¿Cómo pauso la escritura en un repositorio?',
          'Ejecuta gitkit lock para bloquear commits y pushes a través de los hooks que gitkit ya instaló. El repositorio se puede leer, pero no escribir, hasta que ejecutes gitkit unlock. Útil cuando un agente autónomo tiene que dejar de escribir mientras haces un rebase, reinstalas o inspeccionas el árbol.'],
      ] as [string, string][],
    },
    ghscaff: {
      need: 'Crear un repositorio de GitHub como se debe son una docena de pasos que se olvidan.',
      tagline:
        'Un asistente interactivo que arma y hace cumplir convenciones en repositorios de GitHub.',
      etymology: '(De <em>GitHub</em> y el ingl. <em>scaffold</em>, ‘andamio’.)',
      machineAlt: 'Torre de andamio de madera grabada, con cuerdas, polea y escalera',
      figure: 'Andamio que se levanta antes que la obra: protege las ramas, alza los chequeos y deja cada repositorio en pie desde el primer día, para que lo que se construya encima no haya que apuntalarlo después.',
      thread: {
        problem: 'repositorios de GitHub',
        method: 'un asistente idempotente',
        artifact: 'convenciones aplicadas',
      },
      title:
        'Repos de GitHub con convenciones aplicadas — ghScaff',
      description:
        'Un wizard interactivo que arma el repositorio y aplica labels, branch protection y status checks desde el primer commit — idempotente y seguro de reaplicar.',
      koan: 'Un edificio es tan recto como su andamio.',
      lede:
        'Crear un repositorio como se debe son una docena de pasos olvidables. ghScaff levanta toda la estructura en un <strong>wizard interactivo</strong> — y como cada operación es <strong>idempotente</strong>, puede renivelar cualquier repositorio existente sin derribarlo.',
      genesis: {
        kicker: 'Génesis',
        title: 'La misma configuración, una y otra vez.',
        body:
          'Proyecto nuevo en Rust. Las mismas etiquetas, la misma protección de ramas, el mismo CI, los mismos secretos. Otra vez. Y otra. El trabajo replicable hecho a mano no es oficio — es desgaste. ghScaff corre el ritual entero en un asistente, de forma idempotente, para que tus convenciones se sostengan en vez de desviarse.',
      },
      lifts: {
        kicker: '7 niveles',
        items: [
          'Datos del repositorio',
          'Visibilidad y propiedad',
          'Acceso de equipos',
          'Plantilla de lenguaje',
          'Ramas',
          'Características y licencia',
          'Revisar y confirmar',
        ],
      },
      details: {
        kicker: 'Detalles estructurales',
        items: [
          'Los tokens viven en una bóveda <strong>cifrada</strong> (XSalsa20-Poly1305), ligada a tu usuario, host y binario — nunca en variables de entorno ni en texto plano.',
          'Un único commit atómico <code>chore: init repository</code> lleva todo el boilerplate — sin historial ruidoso archivo por archivo.',
          'Siete etiquetas estándar forzadas en cada ejecución; la desviación se corrige, no se acumula.',
          '<code>--dry-run</code> previsualiza cada cambio sin una sola llamada a la API.',
          'La protección de ramas lee los workflows que ghscaff acaba de commitear y deriva de ellos los checks requeridos — un nombre mal escrito produce una regla que no protege nada, y no avisa; esto elimina esa clase de error de configuración. <code>ghscaff doctor</code> verifica cómo quedó.',
        ],
      },
      subproject: {
        kicker: 'Subproyecto',
        name: 'ghscaff-boilerplate',
        link: 'https://github.com/UniverLab/ghscaff-boilerplate',
      },
      boilerplates: {
        kicker: 'Boilerplates',
        title: '{n} boilerplates que el asistente puede crear',
        cols: { name: 'nombre', language: 'lenguaje', description: 'descripción', version: 'versión' },
        use: 'Elige uno en el paso de lenguaje del asistente:',
      },
      faq: [
        ['¿Cómo configura ghScaff un repositorio de GitHub?',
          'Ejecuta ghscaff — un asistente interactivo que crea el repo, commitea el boilerplate (CI, README, licencia), configura branch protection y aplica etiquetas estándar. Un commit atómico, sin pasos manuales.'],
        ['¿Por qué ghScaff usa una bóveda encriptada para tokens?',
          'Las variables de entorno con tokens son fácilmente explotables — cualquier proceso en tu máquina puede leerlas. ghScaff encripta tokens con XSalsa20-Poly1305, ligado a tu usuario de OS y hostname. La bóveda evita que ghScaff se convierta en un vector de ataque.'],
        ['¿Cómo sabe ghScaff qué checks son requeridos para la protección de ramas?',
          'ghScaff lee los workflows que acaba de commitear y deriva los checks requeridos de los nombres de los jobs. Un nombre mal escrito crea una regla de protección que no protege nada y no lo dice — ghScaff elimina esa clase de error silencioso.'],
      ] as [string, string][],
    },
    cadspec: {
      need: 'Los dibujos CAD no tienen semántica — solo líneas en un lienzo, imposibles de versionar, revisar o automatizar.',
      tagline:
        'CAD como código: geometría declarativa compilada de forma determinista a DXF.',
      etymology: '(De <em>CAD</em> y el ingl. <em>spec</em>, ‘especificación’.)',
      machineAlt: 'Mesa de dibujo grabada cubierta con un paño, con una regla encima',
      figure: 'Mesa de dibujo que declaraba las piezas en lugar de trazarlas. Se archivó cuando el laboratorio prefirió envolver las mejores herramientas antes que reinventarlas; su idea sigue en las que la reemplazaron.',
      thread: {
        problem: 'CAD',
        method: 'geometría declarativa',
        artifact: 'planos que un agente puede verificar',
      },
      title:
        'CAD as code: de la declaración al modelo — cadSpec',
      description:
        'Geometría declarativa en TOML que puedes revisar en un diff, con preview en el navegador. Compilación determinista: el mismo fuente siempre da el mismo modelo.',
    },
    'astro-denoise': {
      need: 'Aplicar una reducción de ruido a una imagen astronómica puede recuperar una galaxia tenue — o inventar una que nunca estuvo ahí. No hay forma estándar y reproducible de saber cuál de las dos.',
      tagline:
        'Una propuesta de investigación para benchmarking de reducción de ruido astronómico — evaluada por la ciencia que recupera, no por lo limpia que se vea.',
      etymology: '(Del gr. <em>ástron</em>, ‘astro’, y el ingl. <em>denoise</em>, ‘quitar el ruido’.)',
      machineAlt: 'Telescopio de latón grabado sobre un trípode, con la lente en luz violeta',
      figure: 'Telescopio que separa la luz del ruido: entre el grano que deja el sensor y la estrella que de verdad está ahí, una investigación que mide antes de afirmar.',
      thread: {
        problem: 'reducción de ruido',
        method: 'un benchmark puntuado por la ciencia',
        artifact: 'métodos comparables',
      },
      title: 'Astro Denoise — benchmark de reducción de ruido en DC2',
      description:
        'Benchmark reproducible de métodos de reducción de ruido en imágenes DC2 del Vera Rubin Observatory, por recuperación de fuentes débiles, calidad y coste.',
      koan: 'El conocimiento de frontera se oculta tras el ruido…',
      lede:
        'astro-denoise es una <strong>propuesta de investigación</strong> para un benchmark modular y reproducible de métodos de reducción de ruido sobre imágenes simuladas del Vera <strong>Rubin</strong> Observatory (LSST DC2). La idea es directa: cualquier método — un filtro clásico, una red entrenada — se enchufa al mismo protocolo y corre sobre los mismos parches, y se evalúa no por una imagen más limpia sino por <em>lo que le hace a la ciencia</em>: la <strong>completitud</strong> y la <strong>pureza</strong> del catálogo de fuentes débiles, contrastadas con el truth catalog de DC2. <strong>BM3D</strong> y una <strong>U-Net</strong> son las dos primeras referencias que se están explorando — la plataforma está diseñada para crecer a medida que se añadan más métodos.',
      genesis: {
        kicker: 'Génesis',
        title: 'Una tesis de maestría en curso.',
        body:
          'Esto empezó como tesis de maestría y aún está tomando forma. El ecosistema funciona desde julio de 2026: un orquestador con un protocolo común de línea de comandos (imagen FITS de entrada y de salida, metadatos en JSON), una condición de control sin procesamiento y dos métodos empaquetados por separado, BM3D como representante de los métodos clásicos y una U-Net como representante del aprendizaje profundo. Los experimentos corren en abierto, aquí mismo, pero queda trabajo antes de que esto sea un benchmark terminado.',
      },
      objectives: {
        kicker: 'Objetivos',
        thesisTitle:
          'Benchmarking de métodos de reducción de ruido en imágenes simuladas DC2 del Vera Rubin Observatory',
        general:
          'Desarrollar una plataforma de benchmarking reproducible que compare métodos de reducción de ruido en imágenes simuladas DC2 del Vera Rubin Observatory, evaluando en cada método la recuperación de fuentes débiles, la calidad de imagen resultante y su coste computacional.',
        items: [
          {
            state: 'completo',
            text: 'Diseñar una plataforma modular y reproducible que permita integrar, ejecutar y comparar métodos de reducción de ruido en imágenes simuladas del Vera C. Rubin Observatory, de modo que nuevas técnicas puedan incorporarse sin modificar su estructura.',
          },
          {
            state: 'en curso',
            text: 'Definir un conjunto de métricas de evaluación, sustentadas en la literatura, que permita analizar la capacidad de los métodos para recuperar fuentes astronómicas débiles, conservar la calidad de la imagen y mantener la precisión de las mediciones científicas, así como su coste computacional bajo condiciones comparables.',
          },
          {
            state: 'en curso',
            text: 'Integrar a la plataforma dos métodos representativos de reducción de ruido, uno basado en técnicas clásicas de procesamiento de imágenes y otro en aprendizaje profundo.',
          },
          {
            state: 'pendiente',
            text: 'Evaluar los métodos integrados sobre un conjunto de datos documentado y versionado, construido a partir de las imágenes y los catálogos de referencia de la simulación DC2, que permita repetir los experimentos y comparar los resultados bajo las mismas condiciones.',
          },
        ],
      },
      repos: {
        kicker: 'Repositorios',
        items: [
          {
            name: 'UniverLab/astro-denoise',
            description: 'El banco: orquestador, métricas científicas y la condición de control.',
            url: 'https://github.com/UniverLab/astro-denoise',
          },
          {
            name: 'UniverLab/astro-denoise-bm3d',
            description: 'BM3D, la referencia clásica.',
            url: 'https://github.com/UniverLab/astro-denoise-bm3d',
          },
          {
            name: 'UniverLab/astro-denoise-unet',
            description: 'La U-Net, la referencia de aprendizaje profundo.',
            url: 'https://github.com/UniverLab/astro-denoise-unet',
          },
        ],
      },
      proposalCta: 'Leer la propuesta (PDF) ↗',
      questions: {
        kicker: 'Preguntas abiertas',
        items: [
          '¿Puede un denoiser subir la completitud sin dañar la pureza — o inventa fuentes que nunca estuvieron ahí?',
          '¿Qué familia de métodos — filtros clásicos o modelos aprendidos — tiene más probabilidad de ayudar a la profundidad de LSST DC2, y cuánto?',
          '¿Puede el benchmark completo repetirse con los mismos resultados científicos sobre la misma versión de datos y de código?',
        ],
      },
      faq: [
        ['¿Qué es astro-denoise?',
          'Un proyecto de investigación que evalúa métodos de reducción de ruido en imágenes simuladas del Observatorio Vera Rubin (LSST DC2). Compara tres condiciones: un control sin procesamiento, BM3D como referencia clásica y una U-Net como referencia de aprendizaje profundo. El objetivo es recuperar galaxias tenues sin inventar las que nunca estuvieron — evaluado por recuperación científica (completitud + pureza), no por calidad visual.'],
        ['¿Qué es la reducción de ruido en astronomía?',
          'Las imágenes astronómicas tienen ruido inevitable del detector y del cielo. La reducción de ruido busca bajar ese ruido preservando las fuentes reales. El riesgo: un método puede suavizar galaxias tenues reales o inventar falsas que nunca existieron.'],
        ['¿Qué es LSST?',
          'El Legacy Survey of Space and Time — un relevamiento astronómico de 10 años que realizará el Observatorio Vera Rubin en Chile. Fotografiará todo el cielo visible repetidamente, produciendo el catálogo profundo de campo amplio más grande jamás hecho.'],
        ['¿Qué es DC2?',
          'Data Challenge 2 — un conjunto de datos simulados que imita lo que LSST producirá, creado por la Dark Energy Science Collaboration (DESC). Incluye ruido realista, PSF y efectos atmosféricos, con un catálogo de verdad que dice exactamente qué fuentes son reales.'],
      ] as [string, string][],
      bgCredit: 'Carta celeste: Yale Bright Star Catalogue (CDS V/50); líneas de constelaciones de d3-celestial, de Olaf Frohn (BSD-3-Clause).',
    },
    'quorum': {
      need: 'El planning poker casi siempre implica un servidor en medio — una cuenta que crear, una sala que hospedar, una herramienta más entre tú y un número.',
      tagline: 'Planning poker sin servidor — comparte un enlace, estima juntos, sin registro.',
      etymology: '(Del lat. <em>quorum</em>, ‘de los cuales’.)',
      machineAlt: 'Aparato de sifón de latón grabado, con un matraz de líquido oscuro, tubos y volante',
      figure: 'Cafetera de balanza: el agua sube, se junta con el café y, cuando el peso se equilibra, la llama se apaga sola; nadie tiene que servirla. Así estima Quorum: cada quien pone su número a la vez y el acuerdo sale solo, sin un servidor en medio.',
      thread: {
        problem: 'estimación',
        method: 'una sala peer-to-peer',
        artifact: 'desacuerdo visible',
      },
      title:
        'Planning poker online gratis, sin registro — Quorum',
      description:
        'Planning poker gratis por WebRTC — los peers hablan directamente, no se guarda nada, no hay cuenta que crear. Comparte el link de la sala y estimen juntos.',
      koan: '// la estimación ya está en la sala',
      bench: 'abre la mesa → quorum.univerlab.org',
      lede:
        'Quorum es <strong>planning poker</strong> sin servidor: cada quien juega una carta, los votos se revelan con una animación cuando todos votan, y el desacuerdo es donde arranca la conversación útil. Corre <strong>punto a punto</strong> sobre WebRTC — un enlace de sala es toda la app, sin nube, sin cuenta.',
      genesis: {
        kicker: 'Génesis',
        title: 'Un enlace, sin servidor.',
        body:
          'Llevaba tiempo con la idea de construir cómputo colaborativo peer-to-peer en el navegador, sin servidores de intermediarios. Antes de escalar la arquitectura, necesitaba validar lo básico — ¿puede una conexión P2P en el browser ser fluida y robusta? Para comprobarlo, construí algo con propósito: planning poker. No porque no existieran herramientas — hay excelentes opciones — sino porque este ritual refleja la esencia del trabajo en equipo: cada participante aporta su estimación en privado, de forma descentralizada y segura. El resultado es Quorum: cero datos saliendo del navegador, sin servidores, sin fricción. Libre, abierto, seguro.',
      },
      how: {
        kicker: 'Sesión P2P',
        items: [
          'Comparte la URL de la sala — sin registro, sin flujo de invitación.',
          'Elige una carta del mazo Fibonacci (0, 1, 2, 3, 5, 8, 13, 21, ?).',
          'Las cartas se revelan con una animación multi-fase en cuanto todos votan — partículas, slide y flip sincronizados.',
          'Carga historias desde un CSV o agrégalas una a una, avanza por ellas en orden — desconéctate y vuelve a conectar: el estado se sincroniza desde cualquier par que siga en la sala.',
        ],
      },
      faq: [
        ['¿Es Quorum gratis?',
          'Completamente gratis. Sin cuentas, sin límites de usuarios, sin tier premium. Es un experimento P2P en el navegador — conexiones WebRTC, sin servidor. Abre la URL y empieza a estimar.'],
        ['¿Cómo funciona planning poker sin servidor?',
          'Quorum usa conexiones peer-to-peer WebRTC. Tu navegador se conecta directamente a los de tus compañeros — sin nube, sin base de datos. Un tracker de BitTorrent maneja el handshake inicial; después, los datos fluyen directamente entre pares.'],
        ['¿Puedo usar Quorum para sprint planning remoto?',
          'Sí. Comparte la URL de la sala con tu equipo. Cada uno elige una carta Fibonacci (0, 1, 2, 3, 5, 8, 13, 21, ?). Las cartas se revelan simultáneamente cuando todos votan — una cuenta regresiva de 3 segundos previene revelaciones prematuras.'],
        ['¿Quorum soporta historias de usuario?',
          'Sí. Pega una lista de historias o carga un CSV. Avanza por ellas en orden, estimando cada una. La sesión se mantiene viva si alguien se desconecta — reconéctate y el estado se sincroniza desde cualquier par que siga en la sala.'],
        ['¿Qué hace diferente Quorum de planningpokeronline.com?',
          'Sin cuentas, sin límites de usuarios, sin datos almacenados en un servidor. Quorum es open-source y corre completamente en el navegador vía WebRTC. Tus datos de estimación nunca salen de los dispositivos de tu equipo.'],
      ] as [string, string][],
    },
    'facetmedia': {
      need: 'Un agente puede pedir una voz, un modelo o una imagen, pero no puede oír, ver ni medir lo que recibió. La herramienta tiene que decirle si el resultado pasó.',
      tagline: 'Herramientas de creación para agentes, cada una en su propio entorno fijado y con cada resultado verificado.',
      etymology: '(Del fr. <em>facette</em>, ‘cara pequeña de una piedra tallada’, y el lat. <em>media</em>.)',
      machineAlt: 'Máquina de tallar gemas grabada con una piedra amarilla, con calibre de ángulos y manivela',
      figure: 'Una faceteadora de gemas: la piedra en bruto entra y sale tallada cara por cara, y cada cara se mide antes de pulir la siguiente.',
      thread: {
        problem: 'agentes que crean a ciegas',
        method: 'un contrato --json verificable sobre cada herramienta',
        artifact: 'activos que llevan su propio registro',
      },
      title: 'facetMedia — herramientas de creación para agentes, verificadas',
      description: 'Herramientas de voz, audio, imagen y CAD para agentes de IA, cada una en su entorno fijado y ejecutada por un contrato --json que verifica cada activo.',
      koan: 'Una piedra no se talla de una vez: una cara, una medida, y luego la siguiente.',
      lede: 'facet instala cada herramienta de creación en su propio entorno fijado, la ejecuta por un solo contrato <strong>--json</strong> y deja junto a cada archivo su <strong>registro</strong>: qué lo hizo, bajo qué licencia y si <strong>pasó</strong>.',
      genesis: {
        kicker: 'Génesis',
        title: 'Un laboratorio que cabe en un comando.',
        body: 'facet nació de una GPU de 8 GB comprada con la idea ingenua de correr modelos de lenguaje. Para eso se queda corta de memoria, pero para imagen, voz, audio y CAD rinde muy bien. Para escoger las herramientas hicimos una evaluación cualitativa: revisamos las herramientas gratuitas disponibles y les preguntamos a muchos modelos cuáles daban menos fricción. Quedaron las que entregan calidad decente con poca fricción, y con ellas un laboratorio de más de 100 GB entre modelos y herramientas. Replicarlo en otra máquina era difícil: había que saber qué herramienta servía para qué, y no todos los días hacen falta todas. facet empaqueta esa selección: cada herramienta se instala en su propio entorno uv, con sus dependencias contenidas, y se borra o se reinstala con un comando. Y para no llenar el contexto del agente con decenas de skills que no usa a diario, el mismo binario sirve el skill de cada paquete cuando hace falta, siempre alineado con la versión instalada. Es media as code: las herramientas de creación audiovisual se vuelven portables.',
      },
      headline: '— Herramientas de creación para agentes, cada una con su resultado verificado',
      release: 'En desarrollo · llega con la 0.1.0b1',
      capabilities: {
        columns: ['N.º', 'Capacidad', 'Herramienta', 'Salida', 'Qué hace', 'Probar'] as string[],
        all: 'Todas',
        tabsAria: 'Capacidades por faceta',
        copy: 'Copiar comando',
        copied: 'Copiado',
      },
      subproject: {
        kicker: 'Subproyecto',
        name: 'facetmedia-registry',
        body: 'La tabla de arriba lee este registro abierto en compilación, una fila por capacidad. Cuando falta el checkout, la página muestra esta nota en vez de una tabla vacía.',
        link: 'https://github.com/UniverLab/facetmedia-registry',
      },
      installNote: 'Funciona en Linux y dentro de WSL en Windows.',
      record: {
        title: '— Cada activo deja su registro',
        body: 'Junto a cada archivo queda un .facet.json con la capacidad, el paquete, los modelos, los parámetros, la verificación y las licencias: lo necesario para repetirlo o saber de dónde salió.',
        caption: 'Fig. 1 / el registro de la lámina de esta página',
      },
      verbs: {
        title: '— Seis verbos, nada instalado en el agente',
        items: [['skill', 'aprende cada herramienta de su skill, servida al momento'], ['list', 've las capacidades por faceta, con su peso'], ['doctor', 'revisa la herramienta y la máquina; cada falla trae su arreglo'], ['run', 'fabrica desde una pieza y verifica cada activo'], ['preview', 'lee los datos de lo que falló y lo corrige sin oídos ni ojos'], ['check', 'vuelve a juzgar un activo contra su registro']] as [string, string][],
      },
      faq: {
        title: '— Preguntas',
        items: [
          ['¿Qué hace facet, en concreto?', 'Instala cada herramienta de creación (Whisper, Blender, ComfyUI, FFmpeg, CadQuery…) en su propio entorno fijado, sin Docker, y le da a tu agente un solo comando para usarlas todas. Cada ejecución produce los archivos que pediste, con un registro de cómo se hicieron.'],
          ['¿Ya se puede usar?', 'Está en beta interna (0.1.0b1) y todavía no está en PyPI. Cuando salga se instalará con <code>uv tool install facetmedia</code>. Por ahora funciona solo en Linux y en WSL.'],
          ['¿Qué es una faceta?', 'Un grupo de herramientas según lo que producen: imagen, video, audio, voz, texto, presentación y CAD. Hoy son 7 facetas, con 23 paquetes y 43 capacidades, como blender.scene o whisper.transcribe.'],
          ['¿Cómo lo usa un agente?', 'Cada comando acepta <code>--json</code>, responde siempre con el mismo formato y tiene códigos de salida documentados. <code>facet skill</code> le da al agente las instrucciones del paquete que va a usar en el momento en que las necesita, en vez de cargarle todo de entrada.'],
          ['¿Cómo sé que lo que salió está bien?', 'Junto a cada archivo queda un registro (<code>.facet.json</code>) con los parámetros, la semilla, las versiones exactas de la herramienta y del modelo, y las licencias. La ejecución verifica el resultado (duración, volumen, resolución o transcripción, según la herramienta), y <code>facet check</code> lo vuelve a verificar cuando quieras.'],
          ['¿Quién decide cómo se ve o cómo suena?', 'Tú o tu agente. En Blender traes tu propio script, en ComfyUI tu propio flujo y en HyperFrames tu propia composición. facet se encarga de la salida, de los modelos y de la verificación; sus valores por defecto son solo un punto de partida.'],
          ['¿Necesita GPU? ¿Y quién acepta las licencias?', 'Solo 6 de los 23 paquetes usan GPU: Blender, los dos de ComfyUI, ACE-Step, MOSS y VoiceStudio, probados en una tarjeta de 8 GB; el resto corre en CPU. Si un modelo exige aceptar sus términos, la ejecución se detiene y muestra el comando exacto: <code>facet license accept</code> lo corre una persona, nunca facet por su cuenta.'],
        ] as [string, string][],
      },
    },
    'demostage': {
      need: 'Grabar demos a mano es tedioso: errores, ritmo desigual, tiempos muertos y un terminal que expone tu hostname.',
      tagline:
        'Demos como Código — captura, graba y exporta demos de terminal reproducibles.',
      etymology: '(Del ingl. <em>demo</em> y <em>stage</em>, ‘escenario’.)',
      machineAlt: 'Cámara de fuelle grabada, con montura de latón y ojo de vidrio rojo',
      figure: 'Cámara de fuelle: lo que pasa frente al lente queda fijado tal cual y se puede revelar idéntico cuantas veces haga falta. Así graba DemoStage las demostraciones de terminal: escritas como una partitura, se reproducen iguales cuadro a cuadro.',
      thread: {
        problem: 'demos de terminal',
        method: 'una partitura de eventos',
        artifact: 'demos que se vuelven a correr',
      },
      title:
        'Demos de terminal reproducibles, como código — DemoStage',
      description:
        'Una alternativa a asciinema donde el demo es un archivo, no una toma. Regrábalo tras cada cambio; exporta gif, mp4 o svg — versionado y comparable.',
      koan: '// el demo es el código fuente',
      lede:
        'DemoStage graba una sesión como <strong>eventos</strong>, corrige las imperfecciones humanas en un <code>demo.toml</code> limpio — una <strong>partitura</strong> — y lo compila a gif, mp4 o un svg animado: versionado, re-ejecutable y comparable.',
      genesis: {
        kicker: 'Génesis',
        title: 'Nació construyendo esta misma página.',
        body:
          'Al construir esta landing, cada experimento necesitaba un demo — y cada herramienta (asciinema, vhs, OBS, grabar a mano) dejaba algo por fuera: el ritmo, el encuadre, la legibilidad. Entonces el demo dejó de ser un video y pasó a ser un archivo: eventos que puedes podar, ritmar y reproducir. DemoStage graba el resto del laboratorio — incluida la página que estás leyendo.',
      },
      pipeline: {
        kicker: '5 comandos',
        items: [
          '<code>capture</code> — captura en vivo: graba la sesión, la normaliza en una partitura limpia y un <code>.rec</code> fiel.',
          '<code>focus</code> — cambia la vista en vivo a una o dos fuentes (terminal, repo, docs, localhost): pantalla completa, dividida o apilada, compuesta en el demo.',
          '<code>record</code> — re-ejecuta <code>demo.toml</code> de forma limpia, produciendo una grabación humanizada.',
          '<code>export</code> — reproducción pura: renderiza a gif, mp4 o svg animado sin re-ejecución, con ffmpeg y chromium autoprovisionados.',
          '<code>edit</code> — edita la línea de tiempo de forma interactiva: marca varios pasos y aplica cambios en bloque.',
        ],
      },
      demos: {
        first: 'El tour — un score grabado en un PTY real, exportado a gif y svg desde una sola toma',
        svg: 'La misma toma, exportada a svg — 83 KB, fuente incrustada, sin reproductor de video',
        svgAlt: 'El tour de DemoStage como SVG animado: un banner impreso en la terminal, el score que lo demuestra, record, export y doctor.',
      },
      faq: [
        ['¿Qué es DemoStage?',
          'Una herramienta para planificar y grabar demos multi-fuente — terminal, navegador y archivos en una sola escena. No es solo grabación de pantalla: configuras tipografía, aspect ratio, fps y estilo de terminal. El resultado está optimizado para web.'],
        ['¿Puedo re-grabar una demo si algo cambia?',
          'Sí. demostage capture graba eventos, no video. Si la UX cambia, vuelves a capturar y la demo se actualiza de forma determinista — sin necesidad de re-grabar todo manualmente.'],
        ['¿En qué se diferencia DemoStage de asciinema?',
          'asciinema graba la salida cruda del terminal. DemoStage graba eventos, soporta múltiples fuentes (terminal + navegador + archivos), normaliza imperfecciones y compila a gif, mp4 o svg animado. El fuente es un archivo TOML versionable.'],
      ] as [string, string][],
      bgCredit: 'Fondo: Eadweard Muybridge, The Horse in Motion, 1878 (dominio público).',
    },
};
