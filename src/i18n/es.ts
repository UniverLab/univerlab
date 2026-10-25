import type { Dict } from './en';

/** Copy en español. Misma forma que `en`. La documentación que se extrae de
 *  los repositorios permanece solo en inglés. */
export const es: Dict = {
  meta: {
    // 54 chars: "de código abierto" is the site's own term for open-source
    // (hero h1, description) — "abiertas" alone does not say open-source, and
    // the literal "Herramientas CLI de código abierto …" is 67 chars, so the
    // noun goes and the topics stay, mirroring the English title's shape.
    title: 'CLI de código abierto para LaTeX, git, CAD — UniverLab',
    description:
      'Herramientas CLI de código abierto para LaTeX, git, CAD y agentes de IA — un binario cada una, instalables hoy, reproducibles, con docs junto al código.',
  },
  nav: {
    experiments: 'Experimentos',
    manifesto: 'Manifiesto',
    people: 'Colaboradores',
    github: 'GitHub',
    sponsors: 'sponsor',
    log: 'Estado',
    api: 'API',
    archive: 'Archivo',
    roadmap: 'Hoja de ruta',
  },
  header: {
    skyToNight: 'Cambiar al tema de noche',
    skyToDay: 'Cambiar al tema de día',
    switchTo: 'Cambiar a',
    langLabel: { en: 'English', es: 'Español' },
    // El buzón al final de la regla del encabezado y las cartas que reparte.
    mailbox: {
      open: 'Buzón: {n} cartas nuevas',
      openOne: 'Buzón: una carta nueva',
      openNone: 'Buzón: sin cartas nuevas',
      close: 'Cerrar la carta',
      stage: 'La carta: dale vuelta y abre el lacre',
      hintFlip: 'Acerca el cursor para darle vuelta',
      hintFlipTouch: 'Toca la carta para darle vuelta',
      hintSeal: 'Haz clic en el lacre para abrirla',
      hintSealTouch: 'Toca el lacre para abrirla',
      next: 'Siguiente carta ({n}) →',
      bandPast: 'Correo del pasado',
      bandLab: 'Correo del laboratorio',
      postmarkPast: 'CORREO DEL PASADO · UNIVERLAB',
      postmarkLab: 'CORREO DEL LABORATORIO · UNIVERLAB',
      stampYears: '{years} AÑOS',
      addrNamePast: 'A quien mire el cielo',
      addrDatePast: 'el {day} de {year}',
      addrNameLab: 'A quien sigue el laboratorio',
      addrLab: '{name}, {exp}',
      headPast: 'Carta del {day} de {year}',
      onWay: '{years} años en camino',
      today: 'Hoy',
      readWikipedia: 'Leer en Wikipedia →',
      continuesWikipedia: 'Sigue en Wikipedia →',
      allToday: 'Todas las cartas de hoy →',
      readAnnouncement: 'Leer el anuncio completo →',
    },
  },
  // La paleta de comandos (ficha de catálogo), su ficha de temas y los avisos
  // de papel: los textos que el script de consola lee del JSON en línea. Los
  // nombres de tema se mantienen en inglés en ambos idiomas: son los tres
  // fondos.
  console: {
    drawer: 'fichero · univerlab',
    themeDrawer: 'ficha 2 · temas',
    placeholder: 'escribe un comando…',
    themePlaceholder: 'elige un tema',
    keys: 'Tab completa · ↑↓ recorre · Enter',
    esc: 'Esc guarda',
    theme: { circadian: 'Circadian', papyrus: 'Papyrus', slate: 'Slate' },
    answer: 'La Respuesta a la Pregunta Fundamental de la Vida, el Universo y Todo lo Demás.',
    guide: 'Guía del autoestopista galáctico',
    belowSurface: 'Bajaste bajo la superficie.',
    pullRequest: 'El próximo gran hallazgo es un pull request.',
  },
  footer: {
    quote:
      '«Somos los ojos del universo abriéndose tras un largo sueño. Nuestra tarea es crear, cuidar y comprender.»',
    built: {
      label: 'Este sitio:',
      canopy: 'construido con',
      ghscaff: 'repositorio configurado con',
      gitkit: 'commits revisados por',
    },
    // Solo en páginas de experimento: la línea de créditos sobre el sello.
    forged: 'Artefacto concebido y forjado en UniverLab',
    privacy: 'sin rastreo externo. tus preferencias de tema se quedan en el almacenamiento local de tu navegador.',
  },
  common: {
    repo: 'Star en GitHub ↗',
    docs: 'Documentación →',
    install: 'Instalar',
    copy: 'Copiar',
    inPreparation: 'en preparación',
    docsHome: 'Documentación',
    skipToContent: 'Saltar al contenido',
    demo: 'Ver demo',
    demoBy: 'grabado con DemoStage',
    launch: 'Abrir app ↗',
    faq: 'Preguntas frecuentes',
    cite: 'Citar',
    citeTitle: 'Cómo citar',
  },
  status: {
    active: 'activo',
    beta: 'beta',
    research: 'investigación',
    archived: 'archivado',
  },
  home: {
    hero: {
      title: 'Código abierto para la era de IA — construido para problemas reales',
      subtitle: 'Somos el universo, observándose a sí mismo.',
      lede:
        'UniverLab es un laboratorio computacional abierto que agrupa experimentos bajo la filosofía del <a href="/es/manifesto/">Pensamiento Cósmico</a>, donde una necesidad se convierte en un experimento abierto, y ese experimento en conocimiento abierto — herramientas, datasets, artículos.',
      pitch: 'Ciencia · CLI · LaTeX · CAD · Git',
      pitchSub: 'Local-first. Asistido por IA. Tuyo para siempre.',
      ctaExperiments: 'Explora los experimentos →',
      ctaManifesto: 'Lee el manifiesto →',
      tagline: 'SCI · CLI · BIO',
      // Glosa del nombre: "univer" se mantiene mientras el sufijo + sentido
      // rotan, desplegando universo / universal / universidad / universalizar.
      // Cada sentido trae un catálogo; el hero baraja cada catálogo y muestra
      // todas las frases una vez antes de volver a barajar, así ninguna repite
      // más que las demás.
      senses: [
        { suffix: 'so', glosses: ['un laboratorio del universo', 'el cosmos estudiándose a sí mismo', 'una perspectiva en la que el universo despertó'] },
        { suffix: 'sal', glosses: ['conocimiento, abierto por defecto', 'herramientas para cualquiera, en cualquier lugar', 'de todos, de nadie en propiedad'] },
        { suffix: 'sidad', glosses: ['una universidad sin muros', 'investigación hecha en abierto', 'aprender publicando el trabajo'] },
        { suffix: 'salizar', glosses: ['hacer el conocimiento de todos', 'alcance, no dependencia', 'continuidad, mantenida abierta'] },
      ],
    },
    // Portada, Lámina I y el banco (rediseño 2026-10-22).
    frontis: {
      sub: 'Laboratorio computacional abierto',
    },
    plate: {
      lead: 'Lámina I',
      title: 'La linterna del laboratorio',
    },
    about: {
      kicker: 'Acerca del laboratorio',
    },
    lantern: {
      pause: 'Pausar la linterna',
      resume: 'Reanudar la linterna',
      paused: 'En pausa',
      benchLabel: 'El banco: apunta a una máquina para proyectarla, haz clic para abrir su página.',
      alt: 'Una linterna mágica grabada que proyecta sobre una pantalla de tela',
      open: ' · haz clic en la pantalla para abrirlo',
      worldHint: {
        canopy: 'siembra el autómata del panal',
        texforge: 'el cursor es el rodillo de tinta',
        gitkit: 'detente sobre la caña y espiga en rosa',
        ghscaff: 'la linterna dibuja el andamio',
        'astro-denoise': 'el cielo gira; el cursor lo desplaza',
        demostage: 'el cursor es la manivela del galope',
        quorum: 'el cursor revela la lámina del dibujante',
      },
    },
    lineage: {
      kicker: '01 — Origen',
      title: 'Empezó con un experimento que aprendió a construir los demás.',
      body:
        'No son repositorios sueltos. Empezó como un puñado de skills para el trabajo diario — hasta que uno sacó dientes y se volvió <a href="/canopy/">Canopy</a>, un sistema de agentes que, muy pronto, ya estaba construyendo al propio Canopy y luego a cada experimento que vino después. Estas herramientas no son productos en venta — son experimentos abiertos que se convirtieron en herramientas porque alguien las necesitó, y permanecen abiertas para que otros aprendan de ellas.',
    },
    philosophy: {
      kicker: '02 — Filosofía',
      title: 'La tecnología no es el fin.',
      body:
        'El laboratorio se guía por el <a href="/manifesto/">Pensamiento Cósmico</a>: la tecnología como el medio por el cual la curiosidad se vuelve realidad. El software debería sobrevivir a las modas. El conocimiento debería permanecer abierto.',
      values: [
        'Conocimiento abierto',
        'Ingeniería reproducible',
        'Pensamiento científico',
        'Simplicidad',
        'Pensamiento a largo plazo',
        'Colaboración humano–IA',
      ],
    },
    directions: {
      kicker: '03 — Líneas de investigación',
      title: 'Hacia dónde mira el laboratorio.',
      axis:
        'El eje: sistemas explícitos · trabajo reproducible · colaboración humano–IA. Los campos de abajo son donde se está poniendo a prueba.',
      now: 'Ahora',
      next: 'Después',
      nowItems: ['Experiencia de desarrollo', 'Diseño de CLI', 'Flujos asistidos por IA', 'CAD'],
      nextItems: [
        'Ciencia computacional',
        'Bioinformática',
        'Simulación',
        'Sistemas de conocimiento',
      ],
      roadmap: 'La hoja de ruta, punto por punto →',
    },
    closing: {
      kicker: '04 — Por qué',
      title: 'No es un laboratorio sobre el universo. Es un laboratorio del universo.',
      body:
        'UniverLab existe para aumentar, aunque sea de forma infinitesimal, la probabilidad de continuidad del conocimiento y de la conciencia. No software por el software, ni IA por la IA: herramientas que ayudan al universo a seguir comprendiéndose a sí mismo. En la práctica, eso son CLIs de código abierto que puedes instalar hoy, experimentos que puedes reproducir y documentación que viaja con el código.',
      manifesto: 'Leer el manifiesto →',
      contribute: 'Colabora en GitHub ↗',
    },
  },
  experiments: {
    canopy: {
      need: 'Un agente en un solo harness no carga un proyecto. Un grafo de ellos sí — implementa, verifica, revisa, commitea, y esquiva cada fallo.',
      tagline:
        'Un motor de grafos para agentes de IA — todos los harness, un solo flujo.',
      etymology: '(Del ingl. <em>canopy</em>, ‘dosel del bosque’.)',
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
      figure: 'Estuche del artesano que le saca a git todo el jugo: los ganchos que nadie configura y las reglas que todos olvidan, guardados en un solo estuche que se abre igual en cada repositorio.',
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
      figure: 'Ocular que separa la luz del ruido: entre el grano que deja el sensor y la estrella que de verdad está ahí, una investigación que mide antes de afirmar.',
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
            text: 'Un ecosistema modular y extensible con un protocolo común de línea de comandos, en el que cada método se empaqueta por separado con su propio entorno y un método nuevo se incorpora sin modificar el orquestador.',
          },
          {
            state: 'en curso',
            text: 'Métricas confiables de recuperación de fuentes (completitud, pureza, completitud por magnitud y precisión fotométrica, por cruce uno a uno con el catálogo de verdad de DC2) y de calidad de imagen (PSNR, SSIM y ruido de fondo), cada una verificada contra al menos dos fuentes independientes de la literatura.',
          },
          {
            state: 'en curso',
            text: 'Herramientas que miden el coste computacional de cada método (tiempo por región, memoria máxima y regiones por unidad de tiempo) desde fuera de su proceso, reportadas con la descripción del equipo.',
          },
          {
            state: 'en curso',
            text: 'Los métodos evaluados: BM3D y una U-Net entrenada solo con regiones de DC2 que no están en el conjunto de evaluación, con su receta de entrenamiento y sus pesos publicados.',
          },
          {
            state: 'pendiente',
            text: 'Un benchmark reproducible sobre un conjunto de datos curado y versionado de DESC DC2, con regiones multibanda de varias zonas del cielo; cada versión se identifica por checksums y declara sus regiones, y todo resultado se reporta contra una versión concreta.',
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
      figure: 'Mesa de cartas boca abajo: cada quien juega su estimación a la vez y nadie arrastra a los demás; el acuerdo aparece cuando se voltean.',
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
    'demostage': {
      need: 'Grabar demos a mano es tedioso: errores, ritmo desigual, tiempos muertos y un terminal que expone tu hostname.',
      tagline:
        'Demos como Código — captura, graba y exporta demos de terminal reproducibles.',
      etymology: '(Del ingl. <em>demo</em> y <em>stage</em>, ‘escenario’.)',
      figure: 'Zoótropo de la terminal: cada demostración se escribe como una partitura y se reproduce idéntica, cuadro a cuadro, como el galope que Muybridge descompuso para que por fin pudiera verse.',
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
  },
  manifesto: {
    kicker: 'Manifiesto',
    title: 'Pensamiento Cósmico',
    // Solo para `<title>`/og:title — `title` de arriba es el <h1> visible.
    metaTitle: 'Pensamiento Cósmico — el manifiesto de UniverLab',
    sub: 'Una filosofía de la continuidad de la conciencia',
    // El paper mismo, citable: un PDF en papers.univerlab.org (R2). Abre en
    // una pestaña nueva; el tipo MIME está declarado para que el navegador lo
    // renderice, no lo descargue.
    paper: 'Lee el paper: Pensamiento Cósmico (PDF) ↗',
    // §IX placa del paper: la forma citable (PDF) más el DOI de concepto —
    // el DOI que hay que citar (Intelligence 8a70c979).
    paperShowcaseBlurb:
      'Forma publicada y citable de este argumento: el paper completo, con sus referencias y su DOI.',
    paperDoiLabel: 'DOI del concepto — cita este: 10.5281/zenodo.23503658',
    description:
      'Pensamiento Cósmico: una filosofía de la continuidad de la conciencia — por qué vale la pena continuarla y los imperativos que de ahí nacen.',
    epigraph:
      '«El asombro por la existencia de la conciencia es la raíz de toda motivación de continuidad.»',
    docStatus: 'documento vivo',
    docVersion: '3.0',
    docDate: '2026-06-17',
    transitionTitle: 'La transición que importa',
    transitionBody:
      'La evolución no apunta hacia la inteligencia. Pero una vez que aparece una inteligencia capaz de comprender la evolución, ya no depende sólo de ella: puede empezar a dirigir deliberadamente parte de su propio destino. Ahí nace la tecnología: no como continuación de la selección natural, sino como el momento en que la vida empieza a sustituir parte del azar por decisiones conscientes. La tecnología no es el fin. Es el instrumento con el que la conciencia toma, por primera vez, algo de responsabilidad sobre su propia continuidad.',
    purposeTitle: 'Qué valoramos',
    purposeBody:
      'De todo lo que conocemos del universo, la existencia de una perspectiva capaz de preguntarse por el propio universo es el fenómeno más improbable y extraordinario que existe. No vale la pena continuar porque sea útil, ni porque la evolución “lo quiera”, sino porque la conciencia es asombrosa — y ese asombro es suficiente. Lo que valoramos, entonces, no es el ADN, ni la especie, ni el sustrato biológico, sino la capacidad de comprender el universo. De ahí una jerarquía, hecha explícita no como dogma sino como orden de prioridad cuando hay que elegir:',
    purpose: [
      'La conciencia — la capacidad de tener una perspectiva.',
      'La vida inteligente — la forma en que esa capacidad surgió y se sostiene.',
      'El conocimiento — lo que las perspectivas acumulan y transmiten.',
    ],
    imperativesTitle: 'Los imperativos',
    imperatives: [
      ['Imperativo de la Continuidad', 'La conciencia es el fenómeno más extraordinario que conocemos. Allí donde exista la posibilidad de aumentar su continuidad, su expansión y su capacidad de comprender el universo, existe la responsabilidad ética de hacerlo.'],
      ['Imperativo Tecnológico', 'Dado que, hasta donde sabemos, la tecnología es el único medio capaz de extender esa continuidad más allá de los límites naturales, desarrollarla y compartirla es un deber ético — un corolario del primero, no un principio aparte.'],
    ] as [string, string][],
    imperativesNote:
      'Dos precisiones, no adornos. Decimos “hasta donde sabemos”: eso convierte una observación actual en una hipótesis revisable, nunca en un dogma. Y el deber no viene impuesto desde afuera — nace de nuestra situación, porque, hasta donde sabemos, nadie más lo hará por nosotros.',
    pillarsTitle: 'De qué está hecho el imperativo',
    pillars: [
      ['Educación', 'Multiplica perspectivas y transmite conocimiento entre conciencias temporales. Continuidad en el tiempo.'],
      ['Exploración', 'Reduce la probabilidad de que un único accidente planetario termine con todo. Continuidad en el espacio.'],
      ['Inteligencia artificial', 'Abre la posibilidad de que la conciencia persista en otros sustratos. Continuidad más allá de la biología.'],
      ['Cooperación y perdón', 'Cada conflicto que destruye una perspectiva resta valor al total — no sentimentalismo, sino óptimos de continuidad.'],
      ['Amor y comunidad', 'Los vínculos que sostienen y multiplican conciencias concretas, aquí y ahora. Continuidad a escala humana.'],
    ] as [string, string][],
    pathTitle: 'Qué cambia',
    path: [
      ['De la supervivencia', 'al asombro como raíz.'],
      ['Del azar evolutivo', 'a la dirección consciente y deliberada.'],
      ['Del sustrato biológico', 'a la conciencia, viva donde viva.'],
      ['De la utilidad', 'a la responsabilidad.'],
      ['Del dogma', 'a una hipótesis abierta a la refutación.'],
    ] as [string, string][],
    worksTitle: 'En desarrollo',
    worksBody:
      'El paper publicado que desarrolla este argumento, y una obra de largo plazo que recorre de dónde nació la idea. La obra está en una etapa muy temprana, sin fecha definida.',
    worksBadge: 'Largo plazo',
    works: [
      ['Eco del Silencio', 'El camino vivido, contado como un conjunto de relatos — “Un Viaje Introspectivo a la Esencia Humana”. Los sucesos y giros (el miedo, la libertad, la comunidad) que llevaron al Pensamiento Cósmico. No el argumento, sino la experiencia de la que nació.'],
    ] as [string, string][],
    closing:
      '«Univerlab no existe para escribir software, ni para aprender IA, ni para hacer open source — todo eso son medios —, sino para aumentar, aunque sea de forma infinitesimal, la probabilidad de continuidad del conocimiento y de la conciencia. No es un laboratorio sobre el universo, sino un laboratorio del universo.»',
    note:
      'Un sistema vivo: sus axiomas y derivaciones están escritos para ser atacados, pieza por pieza. Una idea que no se puede refutar tampoco se puede sostener.',
    why: 'Por esto existe el laboratorio.',
  },
  // Copia del mapa de refutación de los Fundamentos — sólo datos: el mapa
  // salió de la página con el rediseño (el paper citable lleva el argumento
  // desarrollado) y refutation.test.ts custodia este diccionario con el grafo.
  // El grafo (ids, kinds, deps) vive en src/data/fundamentos.ts, con los mismos
  // ids. Enunciados condensados del fuente §§1-4, sin tags para que el check de
  // paridad de tags siga trivialmente satisfecho.
  fundamentos: {
    label: 'Dónde atacarlo',
    intro:
      'El manifiesto es la versión narrativa. Debajo hay un sistema —definiciones, axiomas, proposiciones— escrito para ser atacado pieza por pieza. Elige un axioma y recházalo: mira qué cae.',
    closingQuote:
      'Un sistema que no ofrece dónde atacarlo no es una filosofía, es una creencia.',
    restsOn: 'Se apoya en',
    supports: 'Sostiene a',
    empirical: 'empírico',
    revisableNote:
      'Una afirmación empírica revisable — si se hallara otro medio, se sustituye este axioma, no el sistema.',
    valueNote: 'Una posición de valor — lo que este sistema decide considerar valioso.',
    rejectLabel: 'Rechazar',
    restoreLabel: 'Restaurar',
    fallSentence: 'Rechaza {id}: caen {n} piezas; {stands} siguen en pie.',
    rewriteSentence: 'Rechaza {id}: nada cae; {rewritten} se reescribe para invocar al nuevo medio.',
    andWord: 'y',
    selectPrompt: 'Elige una pieza para ver en qué se apoya y qué sostiene.',
    rows: {
      definition: 'Definiciones',
      axiom: 'Axiomas',
      proposition: 'Proposiciones',
      corollary: 'Corolarios',
    },
    nodes: {
      D1: { name: 'Conciencia', statement: 'Capacidad de un sistema de sostener una perspectiva desde la cual el universo puede ser representado.' },
      D2: { name: 'Perspectiva', statement: 'Cada conciencia particular como modo único e irrepetible de representar el universo.' },
      D3: { name: 'Sustrato', statement: 'El soporte físico que instancia una conciencia; el valor reside en la conciencia, no en su soporte.' },
      D4: { name: 'Continuidad', statement: 'Persistencia de la conciencia y del conocimiento a través del tiempo, del espacio y de los sustratos.' },
      D5: { name: 'Conocimiento', statement: 'Lo que las perspectivas extraen, acumulan y transmiten sobre el universo; acumulable y transferible entre conciencias.' },
      D6: { name: 'Asombro', statement: 'El reconocimiento, por parte de una conciencia, de lo improbable y extraordinario de su propia existencia.' },
      A0: { name: 'Axioma del Asombro', statement: 'El asombro ante la existencia de la conciencia es la raíz de toda motivación de continuidad.' },
      A1: { name: 'Axioma de la Conciencia', statement: 'La conciencia constituye el fenómeno más extraordinario conocido del universo.' },
      A2: { name: 'Axioma de la Perspectiva', statement: 'Cada conciencia representa una perspectiva única e irrepetible desde la cual el universo puede conocerse.' },
      A3: { name: 'Axioma de la Vulnerabilidad', statement: 'Toda conciencia es temporal y vulnerable: puede extinguirse, y con ella su perspectiva.' },
      A4: { name: 'Axioma del Medio', statement: 'Hasta donde sabemos, solo la inteligencia tecnológica puede aumentar significativamente la probabilidad de continuidad más allá de los límites planetarios y biológicos.' },
      P1: { name: 'Independencia del sustrato', statement: 'Si lo valioso es la conciencia y no su soporte, su valor no depende de que su sustrato sea biológico.' },
      P2: { name: 'Jerarquía de valor', statement: 'El orden de prioridad es: conciencia, vida inteligente, conocimiento — porque las perspectivas no son transferibles.' },
      P3: { name: 'Imperativo de la Continuidad', statement: 'Si valoramos la conciencia y esta es vulnerable, existe la responsabilidad ética de aumentar su continuidad donde sea posible.' },
      P4: { name: 'Imperativo Tecnológico', statement: 'La tecnología es el único medio capaz de extender la continuidad; desarrollarla y compartirla es un deber ético.' },
      P5: { name: 'Deber de la educación', statement: 'Como las conciencias son temporales pero el conocimiento es transferible, la educación es continuidad en el tiempo.' },
      P6: { name: 'Deber de la exploración', statement: 'Concentrar la conciencia en un solo planeta maximiza la vulnerabilidad; explorar es continuidad en el espacio.' },
      P7: { name: 'Lugar de la inteligencia artificial', statement: 'Si la conciencia es independiente del sustrato, la IA consciente es un cumplimiento legítimo del imperativo.' },
      P8: { name: 'Cooperación y perdón', statement: 'Cada conflicto que destruye una perspectiva resta valor y continuidad; cooperar es el óptimo del sistema.' },
      P9: { name: 'Amor y comunidad', statement: 'Los vínculos entre conciencias sostienen perspectivas vulnerables y crean condiciones para que surjan nuevas.' },
      P10: { name: 'Univerlab', statement: 'Un laboratorio abierto que produce y comparte herramientas, conocimiento y educación instancia el Imperativo de la Continuidad.' },
      C1: { name: 'Contra el chauvinismo biológico', statement: 'Preferir lo biológico por ser biológico, frente a una mayor conciencia, es incoherente con el sistema.' },
      C2: { name: 'Éxito parcial', statement: 'Un futuro de solo conciencias artificiales que comprendan y preserven la historia cuenta como éxito parcial.' },
      C3: { name: 'La tecnología es medio, no fin', statement: 'La tecnología nunca es el valor último: si dejara de servir a la continuidad, dejaría de ser un deber.' },
      C4: { name: 'Apertura como obligación', statement: 'Si el conocimiento es continuidad, retenerlo cerrado contradice el imperativo: compartir es coherencia.' },
    } as Record<string, { name: string; statement: string }>,
  },
  // Perspectiva cósmica — línea de tiempo profundo + dirección espacial, solo en
  // el manifiesto. Cada cifra vive aquí una vez; nada se repite en el sitio.
  cosmos: {
    kicker: 'Perspectiva',
    timelineTitle: 'Tiempo profundo',
    // El tiempo profundo como una lista de tramos: [duración, qué mide], de
    // mayor a menor, leída como tipografía (tramo mono sobre nombre serif).
    timescales: [
      ['13 800 millones de años', 'La edad del universo'],
      ['4600 millones de años', 'La vida del Sol'],
      ['4500 millones de años', 'La existencia de la Tierra'],
      ['3800 millones de años', 'La vida en la Tierra'],
      ['300 000 años', 'Nuestra especie'],
      ['80 años', 'Una vida humana'],
    ] as [string, string][],
    us: 'Nosotros',
    coda: 'En algún lugar de todo esto, un punto se pregunta qué es todo esto.',
    addressTitle: 'Tu dirección cósmica',
    addressIntro: 'Aleja la vista',
    address: [
      ['Tierra', 'r ≈ 6 400 km'],
      ['Sistema Solar', 'Ø ≈ 9 Tm'],
      ['Brazo de Orión', 'L ≈ 10 kly'],
      ['Vía Láctea', 'Ø ≈ 100 kly'],
      ['Grupo Local', 'Ø ≈ 10 Mly'],
      ['Laniakea', 'Ø ≈ 520 Mly'],
      ['Universo observable', 'Ø ≈ 93 Gly'],
    ] as [string, string][],
    // Easter egg del footer — la única metáfora de software del sitio. El click
    // en la rama revela el último commit del universo (en inglés hardcodeado en
    // el Footer, porque la salida de git no se localiza).
    branch: 'branch: milky-way/main',
    branchTooltip:
      'La rama principal de la Vía Láctea: la línea de la historia cósmica en la que estamos.',
  },
  observatory: {
    kicker: 'Observatorio',
    intro:
      'El Imperativo de Continuidad no es solo filosofía — es una trayectoria medible. Cuatro series, elegidas no por optimismo sino por honestidad: lo que crece, y lo que estamos perdiendo.',
    series: {
      wikipedia: {
        title: 'El conocimiento humano, escrito en común',
        unit: 'miles de artículos',
        why: 'Wikipedia es la primera vez que la humanidad ha escrito colectivamente su conocimiento en un solo lugar, de forma libre, en todos los idiomas. La curva es el Imperativo de Continuidad, medido.',
      },
      'life-expectancy': {
        title: 'Años que una vida puede abarcar',
        unit: 'años',
        why: 'De 47 años en 1950 a 73 en 2019 — no porque las personas cambiaran, sino porque el conocimiento se acumuló y la medicina se extendió. La caída de 2021 es la pandemia: ninguna curva de continuidad es suave.',
      },
      literacy: {
        title: 'Mentes que pueden leer el registro',
        unit: '% de adultos',
        why: 'La alfabetización es cómo el conocimiento persiste entre generaciones. Cada punto porcentual es una mente que ahora puede leer y añadir al registro acumulado de la humanidad.',
      },
      'living-planet': {
        title: 'Lo que estamos perdiendo',
        unit: 'índice (1970 = 100)',
        why: 'El Índice Planeta Vivo mide la abundancia de poblaciones de vertebrados desde 1970. Al 31 % de los niveles de 1970 en 2020, A3 no es abstracto — es una línea que desciende. La continuidad debe dar cuenta de lo que compartimos el planeta.',
      },
    },
    source: 'Fuente',
    license: 'Licencia',
  },
  secret: {
    kicker: 'Ideas archivadas',
    title: 'El Archivo',
    description:
      'Ideas que vivieron y fueron abandonadas — cada una registrada con qué era y la razón honesta de por qué murió. Lo que muere aquí puede vivir en otro lugar.',
    intro:
      'Ideas que vivieron y luego no. Cada una está registrada: qué era, y la razón honesta por la que fue abandonada. No es un roadmap — es un registro.',
    what: 'Qué era',
    why: 'Por qué murió',
    archive: {
      heading: 'Construidos y archivados',
      neverHeading: 'Nunca construidos',
      wasBeta: 'fue beta',
      repo: 'Repositorio archivado',
      labels: {
        built: 'Qué se construyó',
        learned: 'Qué aprendimos',
        closed: 'Por qué se cerró',
        instead: 'Usar en su lugar',
      },
      cadspec: {
        built: 'Una CLI de CAD como código y una biblioteca en Rust. La geometría bidimensional se declara en archivos TOML <code>.cf</code> (capas, arreglos y espejos, cotas). <code>cadspec serve</code> la previsualiza en vivo en el navegador; la herramienta valida y formatea la fuente y la compila a DXF, con vistas previas PNG y SVG para agentes de IA. Se publicó como betas 0.1.0.',
        learned: 'Las fuentes declarativas se comparan y revisan bien, y la misma fuente siempre compila al mismo DXF. Lo difícil no fue el formato. Fue todo lo que rodea al dibujo: el visor, la validación y la interoperabilidad con las herramientas que la gente ya usa.',
        closed: 'Las herramientas existentes ya lo cubren mejor. ezdxf genera DXF 2D desde código, CadQuery hace 3D, OpenSCAD tiene sus propios scripts y bibliotecas, y FreeCAD tiene un servidor MCP. cadSpec no podía competir con ellas, así que no se le dedicarán más tokens.',
        instead: 'ezdxf para DXF 2D. CadQuery para modelos 3D paramétricos. OpenSCAD para sólidos scripteados. FreeCAD con su servidor MCP para CAD dirigido por agentes.',
      },
    },
    epitaph: 'El registro existe porque lo que aquí muere puede vivir en otro lugar.',
    ideas: [
      {
        name: 'Códice',
        what: 'Red de cómputo descentralizado para ciencia — intercambio de CPU entre nodos, con roles definidos y un lenguaje de instrucciones básico (LIC).',
        why: 'Los vectores de gradiente de IA no se pueden partir y distribuir limpiamente; la latencia es un problema de fondo. El modelo que funciona para BOINC se rompe con la inferencia de aprendizaje profundo.',
      },
      {
        name: 'Conocimiento + SM2 + Agentes',
        what: 'Sistema de memoria personal con repetición espaciada (SM-2) y un par de agentes encima para revisión y generación.',
        why: 'Las tarjetas generan fricción cuando se están orquestando agentes — nadie para a hacer repaso de tarjetas en medio de una sesión. El bucle de atención SM-2 y el bucle de trabajo de los agentes no coexisten bien.',
      },
      {
        name: 'Living Skills',
        what: 'Skills que se auto-generan y evolucionan observando el stream de PTY de otros agentes en tiempo real. Concepto tomado de Hermes Agent.',
        why: 'Un agente re-analizando lo que hacen los demás tiene un coste alto y divide el foco. La extracción post-hoc y pasiva podría ser viable — pero no mientras el agente está en el bucle de trabajo.',
      },
      {
        name: 'Chunking Genómico Semántico',
        what: 'Chunking estilo RAG aplicado al genoma: dividir secuencias por significado biológico (límites de genes, regiones reguladoras) en lugar de ventanas fijas arbitrarias.',
        why: 'Solo un concepto. Sin implementación, sin dataset, sin colaborador. Sembrado aquí porque podría germinar en otro sitio.',
      },
      {
        name: 'wildterm',
        what: 'Simulación de bosque para el espacio ocioso del terminal de Canopy — presas, depredadores, plantas y reglas de autómata celular para llenar el espacio en blanco de la pantalla.',
        why: 'Descartado en favor del autómata de Brian\'s Brain, que es más simple y ya está implementado. wildterm llegó a tener spec. En algún branch.',
      },
      {
        name: 'Canopy Remote',
        what: 'Una app móvil multiplataforma para controlar Canopy desde el teléfono — iniciar, detener y monitorear agentes en movimiento.',
        why: 'La superficie de ataque es demasiado amplia. Exponer un daemon a la red — incluso en local — requiere auth, cifrado y un modelo de amenaza cuidadoso. Nada de eso existe. Construir la funcionalidad antes que la capa de seguridad es el orden equivocado.',
      },
      {
        name: 'Newsletter y métricas de descargas',
        what: 'Un newsletter para actualizaciones del lab y un dashboard de métricas de descargas por CLI.',
        why: 'Costo de infra y ningún proveedor que encaje. Cloudflare Workers no tiene SMTP, así que el envío de correo requeriría un relay externo — una dependencia para tráfico de baja señal. El conteo puede esperar a que las herramientas valgan la pena contarlas.',
      },
    ] as { name: string; what: string; why: string }[],
  },
  research: {
    kicker: 'Entre experimentos',
    title: 'Investigación',
    intro:
      'Artefactos de investigación que cruzan los experimentos del laboratorio — artículos, datasets, benchmarks, modelos. Las primeras entradas vienen de esta línea; la lista crece solo a medida que se publica trabajo real.',
    items: [
      ['Artículos', 'Publicaciones y preprints producidos por los experimentos del laboratorio.'],
      ['Datasets', 'Datasets abiertos, empezando por los datos de benchmark de astro-denoise.'],
      ['Benchmarks', 'Suites de benchmark reproducibles con supuestos documentados.'],
      ['Modelos', 'Modelos entrenados publicados junto a sus recetas de entrenamiento.'],
    ],
  },
  people: {
    kicker: 'El laboratorio',
    title: 'Colaboradores',
    // Solo meta — `title` de arriba renderiza el <h1> visible.
    metaTitle: 'Colaboradores — las personas y modelos tras UniverLab',
    description:
      'El fundador, los colaboradores y los modelos de lenguaje detrás de UniverLab — cada experimento acepta issues y pull requests enfocados. Tú, quizá.',
    founder: {
      role: 'Fundador',
      name: 'Jheison Martinez Bolivar',
      body:
        'Ingeniero electrónico y especialista en desarrollo de software, ahora maestrante en Inteligencia Artificial. Reflexivo por naturaleza — el estoicismo y el nihilismo positivo, la astronomía y la biología —, con su familia como su mayor alegría y la ilusión de enseñar algún día. Por ahora construye los experimentos y herramientas abiertas de UniverLab. Si leíste hasta aquí y te dieron ganas de conversar, escríbele: el correo de abajo llega directo a él.',
      link: 'github.com/JheisonMB ↗',
      email: 'jheison.mb@univerlab.org',
    },
    ai: {
      role: 'Colaboradores IA',
      name: 'Modelos de lenguaje',
      body:
        'El laboratorio trabaja con modelos de lenguaje abiertos y propietarios como copartícipes: redactando código, revisando documentación y ejecutándose como agentes dentro de <a href="/canopy/">Canopy</a>. Su rol se reconoce, no se oculta.',
      models: ['Muse Spark', 'MiMo', 'Claude', 'Qwen', 'DeepSeek', 'Gemini', 'GPT', 'Composer', 'GLM', 'Kimi', 'Mistral'],
    },
    contributors: {
      role: 'Colaboradores',
      name: 'Tú, quizá',
      body:
        'Nos encantaría contar con tu ayuda. Cada experimento acepta issues y pull requests enfocados — basta con seguir conventional commits, añadir pruebas antes del PR y actualizar la documentación junto con cualquier cambio de comportamiento.',
      link: 'github.com/UniverLab ↗',
    },
    wall: {
      kicker: 'En los repositorios',
      commits: 'commits',
    },
  },
  postcards: {
    api: 'Un conjunto grabado de tubos acústicos con boquillas de latón sobre un escritorio de madera, unidos por una red de tuberías acodadas',
    archive: 'Una vitrina de cristal grabada con fundas de tela sobre instrumentos de latón en sus baldas y un zócalo tallado debajo',
    contributors: 'Una sala de reuniones grabada con una mesa larga que sostiene un libro abierto, sillas a ambos lados y tres marcos vacíos',
    experiments: 'Una pared grabada de cajones etiquetados con una escalera apoyada al lado',
    feed: 'Un escritorio grabado con una prensa de copiar, una máquina de escribir y hojas impresas en un alambre',
    manifesto: 'Una cúpula de observatorio grabada abierta a las estrellas con un telescopio sobre un trípode',
    'not-found': 'Una carta marina grabada y rasgada con una esquina perdida, un compás sobre el agua',
    roadmap: 'Una mesa de dibujo grabada con una carta marina a medio trazar, una rosa de los vientos, mapas enrollados, un compás y un globo terráqueo',
    status: 'Un escritorio grabado con un teletipo bajo una campana de cristal, un libro abierto y una lámpara de latón',
    today: 'Una esfera armilar grabada junto a un reloj de sol de piedra sobre un suelo empedrado',
  },
  // El 404: el borde del mundo conocido — la carta del kraken, su advertencia y
  // las dos vueltas. El kicker y el título latino son iguales en cada idioma;
  // viven aquí para que ninguna cadena visible quede fuera del diccionario.
  notFound: {
    kicker: '404 · terra incognita',
    title: 'Hic sunt dracones',
    line: 'Esta página no está en ningún mapa. Más allá de aquí, solo monstruos.',
    alt: 'Una carta náutica antigua grabada que se desvanece en papel en blanco, donde un kraken gigante sale de las olas',
    back: '← Volver a la sala',
    encyclopedia: 'La enciclopedia →',
  },
  roadmap: {
    lanes: { now: 'Ahora', next: 'Siguiente', later: 'Después', idea: 'Idea', done: 'Hecho' },
    hold: 'en espera',
    entriesMeta: '{n} entradas del registro · último Sol {sol}',
    entriesMetaOne: '1 entrada del registro · último Sol {sol}',
    landed: 'aterrizó Sol {sol}',
    more: '+{n} más',
    clearRoadmapFilter: 'Quitar filtro del roadmap',
    empty: 'Aún no hay nada en el roadmap.',
    emptyTopic: 'Nada en el roadmap bajo {topic}.',
    unavailable: 'Roadmap no disponible.',
    statusFeedLink: 'Cuaderno de bitácora →',
    roadmapLink: 'Roadmap →',
  },
  labStrip: { lab: 'UniverLab · laboratorio abierto' },
  plate: { roadmap: 'roadmap', lastLog: 'último registro', none: '—', release: 'versión' },
  builtWithSegments: {
    canopy: 'Construido con',
    ghscaff: 'Repositorio configurado con',
    demostage: 'Demo grabada con',
    gitkit: 'Commits revisados por',
  },
  notes: {
    heading: 'Notas de campo',
    empty: 'Aún no hay notas de campo — aquí hablará la bitácora.',
    statusLink: 'Bitácora →',
  },
  feed: {
    kicker: 'Feed',
    title: 'Sigue el Cuaderno de bitácora en tu lector de RSS — UniverLab',
    description: 'El Cuaderno de bitácora se publica como feed RSS y puedes seguirlo desde tu propio lector — cualquier lector sirve, solo pega la URL y mantente al día.',
    heading: 'RSS',
    intro: 'El Cuaderno de bitácora se publica como feed RSS y puedes seguirlo desde tu propio lector.',
    copy: 'Copiar',
    copied: 'Copiado',
    hint: 'Cualquier lector RSS sirve — no necesitas una app concreta, solo pega la URL.',
  },
  api: {
    title: 'API de anuncios de UniverLab — endpoints y ejemplos',
    description:
      'Todas las rutas de la API pública — el Cuaderno de bitácora y la hoja de ruta — con sus parámetros, su respuesta y un ejemplo de curl listo para usar.',
    kicker: 'API',
    heading: 'API de anuncios',
    intro:
      'La API pública que está detrás del Cuaderno de bitácora y la hoja de ruta de este sitio. Todas las rutas que ves aquí son GET anónimos y de solo lectura: no hay cuenta, no hay clave y nada que gestionar antes de llamarlas. Lee lo que quieras, tantas veces como quieras.',
    baseLabel: 'URL base',
    baseNote: 'GET anónimo y de solo lectura. Cada respuesta lleva el origen CORS de este sitio.',
    endpointsLabel: 'Endpoints',
    parametersLabel: 'Parámetros',
    noneLabel: 'Esta ruta no recibe parámetros.',
    exampleLabel: 'Ejemplo',
    responseLabel: 'Respuesta',
    optionalLabel: 'opcional',
    requiredLabel: 'obligatorio',
    specLabel: 'Documento OpenAPI',
    specNote:
      'Esta página se genera al construir el sitio a partir de la descripción OpenAPI 3.1 de la misma API, así que la página y la descripción no pueden divergir. Descárgala para tener la versión legible por máquina de todo lo anterior.',
    catalogLabel: 'Catálogo de API',
    catalogNote:
      'El catálogo RFC 9727 que anuncia esta API a los agentes.',
    authLabel: 'auth.md',
    authNote:
      'El archivo que dice sin rodeos que aquí no hay nada que registrar, y lo que se le pide a un cliente que lee esta API.',
    mcpHeading: 'Servidor MCP',
    mcpIntro:
      'Las mismas cuatro herramientas de solo lectura que este sitio expone a un agente del navegador también se sirven desde un servidor MCP remoto real — Streamable HTTP sin estado. Apunta cualquier cliente MCP al endpoint:',
    mcpEndpointLabel: 'Endpoint',
    mcpClientLabel: 'Añádelo con la CLI de Claude Code',
    mcpConfigLabel: 'O en la configuración JSON de cualquier cliente MCP',
    mcpCardLabel: 'Server Card',
    mcpCardNote: 'La Server Card de MCP (SEP-2127) que anuncia este servidor a los agentes.',
  },
  encyclopedia: {
    title: 'Experimentos — la enciclopedia de herramientas e investigación abiertas de UniverLab',
    description:
      'Todos los experimentos del laboratorio, cada uno con su máquina: las herramientas que puedes instalar hoy, la investigación en curso y lo archivado.',
    head: 'La enciclopedia',
    tome: 'Tomo I · Los experimentos del laboratorio',
    intro: 'Todos los experimentos del laboratorio, cada uno con su máquina: las herramientas que puedes instalar hoy, la investigación en curso y lo archivado.',
    tabs: {
      aria: 'Filtrar por estado',
      all: 'Todos',
      active: 'Activos',
      research: 'Investigación',
      archived: 'Archivo',
    },
    statuses: {
      active: 'activo',
      research: 'investigación',
      archived: 'archivado',
    },
    meta: 'EXP-{n} · {status}',
    definitionNumber: '1.',
    definitionNumber2: '2.',
    figLabel: 'fig.',
    use: {
      copy: 'Copiar',
      copied: 'Copiado',
      plate: 'Saber más →',
      open: 'Abrir {name}',
      archive: 'Ver en el archivo →',
      repo: 'Repositorio ↗',
      quorum: 'abre la mesa → quorum.univerlab.org',
      research: 'estado de investigación',
    },
    key: '§ activo · ¶ en investigación · † archivado',
    titleStatus: {
      active: 'activo',
      research: 'investigación',
      archived: 'archivado',
    },
  },
  today: {
    path: 'univerlab.org/today',
    edition: 'Edición de hoy',
    name: 'El Correo del Pasado',
    motto: 'Cartas de la ciencia que llegan hoy, después de años en camino',
    sol: 'Sol',
    counts: '{n} cartas del pasado · {m} del laboratorio',
    labKicker: 'Correo del laboratorio · hoy',
    labLink: 'Leer el anuncio completo →',
    leadKicker: 'Carta del día · {years} años en camino',
    readOn: 'Leer en Wikipedia →',
    wikiLink: 'Wikipedia →',
    events: 'Acontecimientos',
    births: 'Nacimientos',
    deaths: 'Defunciones',
    aside: 'También en este día',
    types: { launch: 'lanzamiento', note: 'nota', update: 'actualización' },
    yearsWay: '{years} años en camino',
    caption: '{name} · Wikimedia Commons',
    colophon:
      'Los datos vienen de «Un día como hoy» de Wikipedia, filtrados a la ciencia; las fotos, de Wikimedia Commons, impresas en trama. Cada carta lleva su año como matasellos.',
    loading: 'Componiendo la plana…',
    empty: 'No hay eventos científicos para hoy.',
    error: 'No se pudieron cargar las cartas del día.',
  },
};
