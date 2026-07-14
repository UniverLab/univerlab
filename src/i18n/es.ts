import type { Dict } from './en';

/** Copy en español. Misma forma que `en`. La documentación que se extrae de
 *  los repositorios permanece solo en inglés. */
export const es: Dict = {
  meta: {
    description:
      'UniverLab — un laboratorio computacional independiente que publica experimentos abiertos.',
  },
  nav: {
    experiments: 'Experimentos',
    research: 'Investigación',
    manifesto: 'Manifiesto',
    people: 'Colaboradores',
    github: 'GitHub',
  },
  footer: {
    quote:
      '«Somos los ojos del universo abriéndose tras un largo sueño. Nuestra tarea es crear, cuidar y comprender.»',
  },
  common: {
    repo: 'GitHub ↗',
    docs: 'Documentación →',
    install: 'Instalar',
    copy: 'Copiar',
    copied: 'Copiado',
    allExperiments: 'Todos los experimentos →',
    inPreparation: 'en preparación',
    docsHome: 'Documentación',
    onThisExperiment: 'Experimento',
    skipToContent: 'Saltar al contenido',
    demo: 'Ver demo',
    demoBy: 'grabado con DemoStage',
    launch: 'Abrir app ↗',
    faq: 'Preguntas frecuentes',
  },
  status: {
    active: 'activo',
    beta: 'beta',
    research: 'investigación',
  },
  home: {
    hero: {
      title: 'Somos el universo, observándose a sí mismo.',
      lede:
        'UniverLab sigue un ciclo sencillo: una <strong>necesidad</strong> real se vuelve un <strong>experimento</strong> abierto, y ese experimento devuelve <strong>conocimiento</strong> abierto — herramientas, librerías, datasets, artículos. El experimento es el trabajo; todo lo que publica es un <strong>subproducto</strong>.',
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
    lineage: {
      kicker: '01 — Origen',
      title: 'Empezó con un experimento que aprendió a construir los demás.',
      body:
        'Esto no es un montón de repositorios. Empezó como un puñado de skills para el trabajo diario — hasta que uno sacó dientes y se volvió <a href="/canopy">Canopy</a>, un sistema de agentes que, muy pronto, ya estaba construyendo al propio Canopy y luego a cada experimento que vino después. Estas herramientas no son productos en venta: somos el universo forjando sus propios instrumentos para seguir estudiándose.',
    },
    experiments: { kicker: '00 — Experimentos' },
    philosophy: {
      kicker: '02 — Filosofía',
      title: 'La tecnología no es el fin.',
      body:
        'El laboratorio se guía por el <a href="/manifesto">Pensamiento Cósmico</a>: la tecnología como el medio por el cual la curiosidad se vuelve realidad. El software debería sobrevivir a las modas. El conocimiento debería permanecer abierto.',
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
      now: 'Ahora',
      next: 'Después',
      nowItems: ['Experiencia de desarrollo', 'Diseño de CLI', 'Flujos asistidos por IA', 'CAD'],
      nextItems: [
        'Ciencia computacional',
        'Bioinformática',
        'Simulación',
        'Sistemas de conocimiento',
      ],
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
  experimentsIndex: {
    kicker: 'Índice',
    title: 'Experimentos',
    intro:
      'La unidad fundamental de UniverLab es el experimento. Los experimentos no son productos — son exploraciones en curso. Pueden madurar, seguir activos durante décadas o convertirse en nueva investigación. Cada uno nace de una necesidad real — casi siempre una que vivimos nosotros mismos.',
  },
  experiments: {
    canopy: {
      need: 'Tus agentes de IA olvidan todo entre sesiones — y no pueden ver lo que hacen los demás.',
      tagline:
        'La capa de runtime para agentes de IA que necesitan memoria, scheduling y compañeros.',
      koan: 'En un bosque, el dosel es donde las copas se tocan — árboles separados, una sola capa viva.',
      lede:
        'Un daemon en Rust y una interfaz de terminal que corre junto a tus agentes de IA. Les da <strong>memoria persistente</strong> entre sesiones, <strong>programación en segundo plano</strong> por cron y eventos de archivo, un <strong>grafo de conocimiento</strong> que aprende de cada ejecución, y un <strong>protocolo de sincronización</strong> para que múltiples agentes dejen de colisionar en el mismo espacio de trabajo.',
      genesis: {
        kicker: 'Génesis',
        title: 'El que empezó todo.',
        body:
          'Empezó como una carpeta de <strong>skills</strong> para el trabajo. Entonces noté lo que nadie mencionaba: los harness de agentes traían un modo <strong>headless</strong>, ahí, sin que nadie lo usara. Conecté tareas con cron para dispararlas por ese modo — demasiado para un skill, y los modelos de entonces se atragantaban con las instrucciones. Así que se volvió un <strong>MCP</strong>: <em>task-trigger</em>. Funcionaba, pero corría a ciegas en segundo plano; solo el agente veía lo que pasaba. No bastaba. Lo maté y construí una <strong>TUI</strong> — luego scheduling, memoria, sync, identidades, y un nombre nuevo. <strong>Canopy</strong>. Para entonces el giro estaba completo: Canopy construía a Canopy, y a todo lo demás en este laboratorio.',
      },
      layer: {
        kicker: 'Qué hace',
        cols: [
          ['Memoria que persiste', 'Cada sesión escribe hechos y patrones en un grafo de conocimiento por proyecto. La siguiente sesión los lee. Los agentes dejan de volver a explicar el mismo código.'],
          ['Programación en segundo plano', 'Los agentes corren por cron o por eventos de cambio de archivo — no solo bajo demanda. Un daemon vigila el espacio de trabajo para que no tengas que hacerlo tú.'],
          ['Sincronización multi-agente', 'Cada agente declara su misión, reporta estabilidad y emite mensajes. El "ánimo" del workspace se ve antes de que nadie toque un archivo. Se acabaron las colisiones silenciosas.'],
        ],
      },
      platforms: {
        kicker: 'Plataformas soportadas',
        items: [
          'Claude',
          'Codex',
          'Cursor',
          'Copilot',
          'Gemini',
          'Cline',
          'OpenCode',
          'Kiro',
          'Mistral',
          'Qwen',
          'MiMo',
          'Blackbox',
          'Kilo',
          'CN',
          'Antigravity',
        ],
      },
      loops: {
        kicker: 'Motor de loops',
        title: 'Flujos de trabajo que se ejecutan solos',
        body: 'Define un DAG — los specs fluyen a través de nodos de agente, chequeo y gate. El loop corre autónomamente: implementar, verificar, revisar, commitear. Cuando se traba, pausa y te consulta.',
        cols: [
          ['Automatización basada en DAG', 'Define flujos de trabajo como grafos acíclicos dirigidos: los specs fluyen a través de nodos de agente, chequeo y gate con enrutamiento pass/fail. Automatiza corrección de bugs, revisión de código y tareas de múltiples pasos.'],
          ['Ejecución en segundo plano', 'Los loops corren autónomamente en segundo plano — implementar, verificar, revisar, commitear. Cada nodo tiene timeouts, reintentos y un agente de resiliencia que diagnostica fallos.'],
          ['Humano en el loop', 'Cuando la automatización se traba, el agente de resiliencia reporta un blocker y pausa. Tú decides; el loop reanuda cuando estés listo.'],
        ],
      },
      builder: {
        kicker: 'Motor de loops',
        title: 'Mira un loop ensamblarse solo',
        outro: 'Cada nodo corre en el harness que elijas. Mezcla proveedores libremente — el grafo es tuyo para editarlo.',
        steps: [
          ['Un spec encuentra a un agente',
            'El trabajo entra como spec — rol, qué, cómo. Un nodo implementador lo toma en el harness que elijas.'],
          ['Puertas deterministas',
            'Un nodo de chequeo ejecuta tus comandos reales — build, lint, tests. El rojo regresa al implementador; solo el verde avanza.'],
          ['Revisión con un segundo cerebro',
            'Un harness distinto revisa el diff contra el spec y commitea. Los puntos ciegos de un mismo proveedor no llegan a tu rama.'],
          ['El fallo se enruta, no se pierde',
            'Si el implementador muere a mitad de la corrida, un nodo de resiliencia lo triagea: los glitches reintentan ya; una muerte por cuota programa el loop para despertarse a la hora exacta del reset.'],
          ['Modo fusión',
            'Reparte el spec a varios modelos en paralelo, espera todas las propuestas, y deja que un árbitro destile el consenso antes de implementar una sola línea.'],
        ] as [string, string][],
      },
      faq: [
        ['¿Qué hace Canopy exactamente?',
          'Canopy orquesta trabajo entre diferentes harnesses de IA — Claude, Codex, o cualquier agente que corra en una terminal. Te permite aprovechar todos tus free tiers sin aprender los comandos, la configuración o el parsing MCP de cada plataforma. Un daemon, todos los agentes.'],
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
      koan: 'Los tipos móviles antes requerían un taller. Ahora requieren un solo binario.',
      figures: ['flujo de compilación', 'grafo del documento', 'mapa de build'],
      lede:
        'Un único binario en Rust que arma, revisa, formatea y compila documentos — el motor LaTeX llega solo en la primera compilación, y los diagramas Mermaid, Graphviz o D2 se renderizan dentro de tus archivos <code>.tex</code> sin navegador ni Node.js.',
      genesis: {
        kicker: 'Génesis',
        title: 'Nació de una tesis.',
        body:
          'Una tesis de maestría, escrita con IA en el flujo. Overleaf quería mi dinero o mi paciencia; TeXstudio arrastraba MiKTeX; VSCode quería una extensión para cada cosa. Solo quería diagramas Mermaid en mi LaTeX — lo que por supuesto significaba Node y una pila de archivos <code>.mmd</code>. Pegué con cinta un latexmake para renderizar los que faltaban. Aguantaba como aguanta la cinta. Y cada error mandaba al modelo a recorrer un log de compilación de mil líneas para hallar una sola línea mala. TexForge es la herramienta que debí tener desde el principio: un binario, un skill, cero ceremonia.',
      },
      press: {
        kicker: 'Toda la imprenta',
        items: [
          ['Componer', 'plantillas con placeholders que ya saben tu nombre.'],
          ['Corregir', 'un linter que detecta referencias rotas, archivos faltantes y entornos sin cerrar antes de imprimir.'],
          ['Ajustar', 'un formato canónico, como rustfmt para .tex. Diffs limpios para siempre.'],
          ['Ilustrar', 'los bloques Mermaid, Graphviz y D2 se vuelven figuras en compilación, renderizados en Rust puro.'],
          ['Imprimir', 'Tectonic compila de forma determinista; el modo watch reimprime mientras escribes.'],
        ],
      },
      subproject: {
        kicker: 'Subproyecto',
        name: 'texforge-templates',
        body:
          'Un registro abierto de plantillas LaTeX con placeholders — APA, IEEE, informes, cartas y más. La plantilla <code>general</code> va embebida en el binario, así que crear un documento funciona incluso sin conexión.',
        link: 'https://github.com/UniverLab/texforge-templates',
      },
      faq: [
        ['¿Qué problema resuelve TexForge?',
          'Compilar LaTeX normalmente requiere instalar TeX Live (4+ GB), luego herramientas separadas para Mermaid, Graphviz y D2 — cada una con su propia configuración. TexForge es un solo binario de ~15 MB que hace todo: scaffolding, linting, formateo, diagramas y compilación.'],
        ['¿Pueden los agentes de IA usar TexForge para trabajar con LaTeX?',
          'Sí. Un agente puede ejecutar `texforge build` sin instalar nada — el motor de LaTeX se descarga en el primer uso. Los errores son concisos (no logs de 1000 líneas), y los diagramas se renderizan dentro de archivos `.tex` sin Node.js ni herramientas externas.'],
        ['¿TexForge soporta diagramas Mermaid y D2 en LaTeX?',
          'Sí. Escribe un bloque de Mermaid, Graphviz o D2 directamente en tu archivo `.tex`. TexForge lo renderiza como figura en el build, en Rust puro, sin navegador ni Node.js.'],
      ] as [string, string][],
    },
    gitkit: {
      need: 'Cada repositorio nuevo arranca con el mismo ritual de configuración — a mano, cada vez.',
      tagline:
        'Configuración guiada de repositorios git — hooks, ignores, attributes y config en un solo flujo.',
      koan: '// el ritual, automatizado',
      lede:
        'Un flujo guiado para hooks, <code>.gitignore</code>, <code>.gitattributes</code> y configuración de git — y luego guardado como un <strong>build</strong> que puedes reaplicar a cualquier proyecto con un solo comando.',
      genesis: {
        kicker: 'Génesis',
        title: 'Un salto de línea que no se portaba bien.',
        body:
          'Empezó con un commit que no cambiaba nada — solo los saltos de línea, reescritos en silencio entre mi Mac del trabajo, mi Windows y los agentes en WSL. Perseguirlo me llevó a <code>.gitattributes</code>. Eso me llevó a los git hooks: integrados en git, de verdad potentes, e ignorados por casi todos — porque montarlos en cada repo es un fastidio. Así que borré el fastidio. Eso es gitkit.',
      },
      features: {
        kicker: 'Un solo flujo',
        items: [
          'Hooks integrados: conventional commits, detección de secretos, nomenclatura de ramas — embebidos, sin conexión.',
          'Todas las plantillas de gitignore.io más presets curados de configuración, aplicados de forma idempotente.',
          '<code>gitkit clone</code> arranca un repo en el instante en que toca el disco.',
          'Builds: guarda una configuración una vez, aplícala a todo proyecto futuro.',
        ],
      },
      faq: [
        ['¿Cómo evito que los agentes de IA hagan commits feos?',
          'GitKit configura git hooks en un solo flujo — conventional commits, detección de secretos, nomenclatura de ramas. Los hooks corren offline, embebidos en el repo. Los agentes no pueden pushear código que no compila o contiene secretos.'],
        ['¿Qué son los "builds" de GitKit?',
          'Un build guarda tu configuración de git (hooks, ignore, attributes, config) como una plantilla reutilizable. Aplícala a cualquier proyecto futuro con un solo comando — sin reconfigurar hooks en cada repo.'],
      ] as [string, string][],
    },
    ghscaff: {
      need: 'Crear un repositorio de GitHub como se debe son una docena de pasos que se olvidan.',
      tagline:
        'Un asistente interactivo que arma y hace cumplir convenciones en repositorios de GitHub.',
      koan: 'Un edificio es tan recto como su andamio.',
      lede:
        'Crear un repositorio como se debe son una docena de pasos olvidables. ghScaff levanta toda la estructura en un <strong>asistente</strong> conversacional — y como cada operación es <strong>idempotente</strong>, puede renivelar cualquier repositorio existente sin derribarlo.',
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
        ],
      },
      subproject: {
        kicker: 'Subproyecto',
        name: 'ghscaff-boilerplate',
        body:
          'Los boilerplates por lenguaje que ghscaff deposita — manifiestos, puntos de entrada, workflows de CI/release. Rust hoy; Python y más en camino.',
        link: 'https://github.com/UniverLab/ghscaff-boilerplate',
      },
      faq: [
        ['¿Cómo configura ghScaff un repositorio de GitHub?',
          'Ejecuta `ghscaff` — un asistente interactivo que crea el repo, commitea el boilerplate (CI, README, licencia), configura branch protection y aplica etiquetas estándar. Un commit atómico, sin pasos manuales.'],
        ['¿Por qué ghScaff usa una bóveda encriptada para tokens?',
          'Las variables de entorno con tokens son fácilmente explotables — cualquier proceso en tu máquina puede leerlas. ghScaff encripta tokens con XSalsa20-Poly1305, ligado a tu usuario de OS y hostname. La bóveda evita que ghScaff se convierta en un vector de ataque.'],
      ] as [string, string][],
    },
    cadspec: {
      need: 'Los dibujos CAD no tienen semántica — solo líneas en un lienzo, imposibles de versionar, revisar o automatizar.',
      tagline:
        'CAD como código: geometría declarativa compilada de forma determinista a DXF.',
      koan: 'El dibujo no se dibuja. Se declara.',
      lede:
        'cadSpec trata un dibujo CAD como código fuente: la geometría se declara en <strong>TOML</strong>, se previsualiza en vivo en el navegador y se compila a un DXF <strong>idéntico</strong> bit a bit cada vez. Ahora <code>git diff</code> funciona sobre dibujos.',
      genesis: {
        kicker: 'Génesis',
        title: 'Para la arquitecta de la casa.',
        body:
          'Mi esposa es arquitecta. En plena especialización, salió a buscar lo que yo tenía — una IA que de verdad la ayudara a dibujar — y no encontró nada. El equivalente del vibe-coding para CAD simplemente no existía: ningún dibujo asistido por IA que se comportara como ingeniería de verdad. Todo internet está borracho de generación de imágenes, pero las imágenes mienten, y el trabajo real vive en los dibujos. cadSpec es la apuesta contraria: CAD declarativo, determinista y asistido por IA, donde el dibujo es código fuente que puedes diferenciar con git.',
      },
      notes: {
        items: [
          'Servidor de vista previa en vivo: edita un archivo <code>.cf</code> y el navegador se actualiza al guardar. Los errores se superponen en vez de romper.',
          'Hecho para agentes de IA: <code>cadspec schema</code> enseña el lenguaje en un comando; las vistas previas incluyen cajas delimitadoras por entidad para que los agentes puedan <em>ver</em> el dibujo.',
          'DXF determinista a la salida, DXF heredado a la entrada — los dibujos existentes migran al flujo declarativo.',
        ],
      },
      faq: [
        ['¿Para qué sirve cadSpec?',
          'cadSpec es CAD como código para arquitectos que necesitan IA que les ayude a dibujar. Declara geometría en archivos TOML, previsualiza en vivo en el navegador, compila a DXF idéntico cada vez. `git diff` funciona en dibujos porque el fuente es texto.'],
        ['¿Pueden los agentes de IA leer y generar dibujos CAD con cadSpec?',
          'Sí. El formato TOML de cadSpec es texto plano que cualquier LLM puede leer. Ejecuta `cadspec schema` para enseñar el lenguaje; las vistas previas incluyen cajas delimitadoras para que los agentes puedan ver el dibujo.'],
      ] as [string, string][],
    },
    'astro-denoise': {
      need: 'Hacer denoising a una imagen astronómica puede recuperar una galaxia tenue — o inventar una que nunca estuvo ahí. No hay forma estándar y reproducible de saber cuál de las dos.',
      tagline:
        'Una propuesta de investigación para benchmarking de denoising astronómico — evaluada por la ciencia que recupera, no por lo limpia que se vea.',
      koan: 'El conocimiento de frontera se oculta tras el ruido…',
      lede:
        'astro-denoise es una <strong>propuesta de investigación</strong> para un benchmark modular y reproducible de métodos de denoising sobre imágenes simuladas del Vera <strong>Rubin</strong> Observatory (LSST DC2). La idea es directa: cualquier método — un filtro clásico, una red entrenada — se enchufa al mismo protocolo y corre sobre los mismos parches, y se evalúa no por una imagen más limpia sino por <em>lo que le hace a la ciencia</em>: la <strong>completitud</strong> y la <strong>pureza</strong> del catálogo de fuentes débiles, contrastadas con el truth catalog de DC2. <strong>BM3D</strong> y una <strong>U-Net</strong> son las dos primeras referencias que se están explorando — la plataforma está diseñada para crecer a medida que se añadan más métodos.',
      genesis: {
        kicker: 'Génesis',
        title: 'Una tesis de maestría en curso.',
        body:
          'Esto empezó como tesis de maestría y aún está tomando forma. La primera versión funcional está en su lugar: cuatro módulos abiertos (motor de métricas, baselines BM3D y U-Net, y un orquestador con dashboard de terminal), un bloque curado multibanda de regiones de cielo preparado para distribuirse en Hugging Face, un scaffold de un comando para que cualquier investigador enchufe un método nuevo, y comparaciones iniciales BM3D vs U-Net con separación limpia de entrenamiento y evaluación. Los experimentos están corriendo — en abierto, aquí mismo — pero queda trabajo por delante antes de que esto sea un benchmark terminado.',
      },
      followLab: 'Sigue el laboratorio ↗',
      papersSoon: 'propuesta publicada · dataset curado y primeros resultados en curso',
      proposalCta: 'Leer la propuesta (PDF) ↗',
      questions: {
        kicker: 'Preguntas abiertas',
        items: [
          '¿Puede un denoiser subir la completitud sin dañar la pureza — o inventa fuentes que nunca estuvieron ahí?',
          '¿Qué familia de métodos — filtros clásicos o modelos aprendidos — tiene más probabilidad de ayudar a la profundidad de LSST DC2, y cuánto?',
          '¿Puede el benchmark completo correr reproducible de extremo a extremo — datos, métodos, métricas y bibliografía versionados?',
        ],
      },
      faq: [
        ['¿Qué es astro-denoise?',
          'Un proyecto de investigación que evalúa métodos de denoising en imágenes simuladas del Observatorio Vera Rubin (LSST DC2). El objetivo es recuperar galaxias tenues sin inventar las que nunca estuvieron — evaluado por recuperación científica (completitud + pureza), no por calidad visual.'],
      ] as [string, string][],
    },
    'quorum': {
      need: 'El planning poker casi siempre implica un servidor en medio — una cuenta que crear, una sala que hospedar, una herramienta más entre tú y un número.',
      tagline: 'Planning poker sin servidor — comparte un enlace, estima juntos, sin registro.',
      koan: '// la estimación ya está en la sala',
      lede:
        'Quorum es <strong>planning poker</strong> — el ritual de estimación que los equipos ágiles usan para dimensionar el backlog: cada quien juega una carta, los votos se revelan a la vez, y el desacuerdo es donde arranca la conversación útil. Corre <strong>punto a punto</strong> sobre WebRTC, así que un enlace de sala compartido es toda la app — sin nube, sin cuenta. El mazo se <strong>revela solo</strong> cuando todos han votado; si te caes la sesión sigue viva — te reconectas y el estado se sincroniza desde cualquier peer que siga en la sala.',
      genesis: {
        kicker: 'Génesis',
        title: 'Un enlace, sin servidor.',
        body:
          'Cada ronda de estimación significaba pasar al equipo por un servidor en alguna parte: crear una sala, compartir una invitación, esperar que siguiera funcionando. La pregunta era simple — ¿cómo sería el planning poker si se elimina el servidor por completo? La respuesta fue una sola URL. Al abrirla, los navegadores se comunican directamente entre sí, enrutando la señal por el tracker de BitTorrent en lugar de un centro de datos. Sin host, sin nada en el medio. Se llama Quorum por la regla que lo rige: un quórum es la cantidad que una decisión necesita para valer — así las cartas quedan ocultas hasta que todos han jugado, y entonces se revelan a la vez.',
      },
      how: {
        kicker: 'Sesión P2P',
        items: [
          'Comparte la URL de la sala — sin registro, sin flujo de invitación.',
          'Elige una carta del mazo Fibonacci (0, 1, 2, 3, 5, 8, 13, 21, ?).',
          'Las cartas se revelan solas en cuanto todos votan — cuenta regresiva de 3 s para que nada sorprenda.',
          'Carga una lista de historias (pega o CSV) y avanza por ellas en orden.',
          'Desconéctate y vuelve a conectar — el estado se sincroniza desde cualquier par que siga en la sala.',
        ],
      },
      faq: [
        ['¿Es Quorum gratis?',
          'Completamente gratis. Sin cuentas, sin límites de usuarios, sin tier premium. Es un experimento P2P en el navegador — conexiones WebRTC, sin servidor. Abre la URL y empieza a estimar.'],
      ] as [string, string][],
    },
    'demostage': {
      need: 'Grabar demos a mano es tedioso — erratas, ritmo desigual, tiempos muertos y un prompt que expone tu host.',
      tagline:
        'Demos as Code — captura, graba y exporta demos de terminal reproducibles.',
      koan: '// el demo es el código fuente',
      lede:
        'DemoStage graba una sesión como <strong>eventos</strong>, normaliza las imperfecciones humanas en un <code>demo.toml</code> limpio (la <strong>partitura</strong>) y lo compila a gif o mp4 — versionado, reejecutable y diffable.',
      genesis: {
        kicker: 'Génesis',
        title: 'Nació construyendo esta misma página.',
        body:
          'Construyendo esta landing, cada experimento necesitaba un demo — y toda herramienta (asciinema, vhs, OBS, grabar a mano) salía frágil o fea, con una regrabación por cada errata. Así que el demo dejó de ser un video y pasó a ser un archivo: eventos que puedes podar, ritmar y reproducir. DemoStage graba el resto del laboratorio — incluida la página que estás leyendo.',
      },
      pipeline: {
        kicker: '5 comandos',
        items: [
          '<code>capture</code> — captura en vivo: graba la sesión, auto-normaliza a una partitura limpia y un <code>.rec</code> fiel.',
          '<code>focus</code> — cambia la vista en vivo a una o dos fuentes (terminal, repo, docs, localhost) — pantalla completa, dividida o apilada, compuesta en el demo.',
          '<code>record</code> — re-ejecuta <code>demo.toml</code> de forma limpia, produciendo una grabación humanizada.',
          '<code>export</code> — reproducción pura: renderiza a gif o mp4 (sin re-ejecución, ffmpeg/chromium autoprovisionados).',
          '<code>edit</code> — edita la línea de tiempo interactivamente; marca varios pasos y aplica cambios en bloque.',
        ],
      },
      faq: [
        ['¿Qué es DemoStage?',
          'Una herramienta para planear y grabar demos multi-fuente — terminal, navegador y archivos en una sola escena. No solo grabación de pantalla: configuras tipografía, aspect ratio, fps y estilo de terminal. El resultado está optimizado para web.'],
        ['¿Puedo re-grabar una demo si algo cambia?',
          'Sí. `demostage capture` graba eventos, no video. Si la UX cambia, re-capturas y la demo se actualiza de forma determinista — sin necesidad de re-grabar todo manualmente.'],
        ['¿En qué se diferencia DemoStage de asciinema?',
          'asciinema graba salida de terminal cruda. DemoStage graba eventos, soporta múltiples fuentes (terminal + navegador + archivos), normaliza imperfecciones y compila a gif/mp4. El fuente es un archivo TOML versionable.'],
      ] as [string, string][],
    },
  },
  manifesto: {
    kicker: 'Manifiesto',
    title: 'Pensamiento Cósmico',
    sub: 'Una filosofía de la continuidad de la conciencia',
    epigraph:
      '«El asombro por la existencia de la conciencia es la raíz de toda motivación de continuidad.»',
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
      'Dos obras de largo plazo que extienden este manifiesto: una recorre de dónde nació la idea, la otra la convierte en un sistema riguroso. Ambas están en una etapa muy temprana, sin fecha definida.',
    worksBadge: 'Largo plazo',
    works: [
      ['Eco del Silencio', 'El camino vivido, contado como un conjunto de relatos — “Un Viaje Introspectivo a la Esencia Humana”. Los sucesos y giros (el miedo, la libertad, la comunidad) que llevaron al Pensamiento Cósmico. No el argumento, sino la experiencia de la que nació.'],
      ['Fundamentos del Pensamiento Cósmico', 'La formalización. Las mismas ideas enunciadas como un sistema riguroso — definiciones, axiomas, proposiciones y corolarios — para que cada paso pueda examinarse y refutarse por separado. Donde el manifiesto narra, los Fundamentos demuestran.'],
    ] as [string, string][],
    closing:
      '«Univerlab no existe para escribir software, ni para aprender IA, ni para hacer open source — todo eso son medios —, sino para aumentar, aunque sea de forma infinitesimal, la probabilidad de continuidad del conocimiento y de la conciencia. No es un laboratorio sobre el universo, sino un laboratorio del universo.»',
    note:
      'Un sistema vivo: sus axiomas y derivaciones están escritos para ser atacados, pieza por pieza. Una idea que no se puede refutar tampoco se puede sostener.',
    why: 'Por esto existe el laboratorio.',
  },
  // Perspectiva cósmica — línea de tiempo profundo + dirección espacial, solo en
  // el manifiesto. Cada cifra vive aquí una vez; nada se repite en el sitio.
  cosmos: {
    kicker: 'Perspectiva',
    timelineTitle: 'Tiempo profundo',
    // El tiempo profundo como una barra de escalas que se descomprime desde el
    // mayor lapso hasta una vida humana (y luego "Tú"): [duración, qué mide].
    timescales: [
      ['13 800 millones de años', 'La edad del universo'],
      ['4600 millones de años', 'La vida del Sol'],
      ['4500 millones de años', 'La existencia de la Tierra'],
      ['3800 millones de años', 'La vida en la Tierra'],
      ['300 000 años', 'Nuestra especie'],
      ['80 años', 'Una vida humana'],
    ] as [string, string][],
    you: 'Tú',
    us: 'Nosotros',
    youDetail: 'el universo, observándose',
    addressTitle: 'Tu dirección cósmica',
    addressIntro: 'Aleja la vista',
    // Beat final de la escena de apertura — nombra el asombro que venía
    // construyendo y entrega a la filosofía ("Qué valoramos…").
    wonder: 'Y una parte de él se asombra de existir.',
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
    rising: 'En ascenso',
    falling: 'En descenso',
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
    intro:
      'Ideas que vivieron y luego no. Cada una está registrada: qué era, y la razón honesta por la que fue abandonada. No es un roadmap — es un registro.',
    what: 'Qué era',
    why: 'Por qué murió',
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
    founder: {
      role: 'Fundador',
      name: 'Jheison Martinez',
      body:
        'Ingeniero electrónico y especialista en desarrollo de software, ahora maestrante en Inteligencia Artificial. Reflexivo por naturaleza — el estoicismo y el nihilismo positivo, la astronomía y la biología —, con su familia como su mayor alegría y la ilusión de enseñar algún día. Por ahora construye los experimentos y herramientas abiertas de UniverLab.',
      link: 'github.com/JheisonMB ↗',
      email: 'jheison.mb@univerlab.org',
    },
    ai: {
      role: 'Colaboradores IA',
      name: 'Modelos de lenguaje',
      body:
        'El laboratorio trabaja con modelos de lenguaje abiertos y propietarios como copartícipes: redactando código, revisando documentación y ejecutándose como agentes dentro de <a href="/canopy">Canopy</a>. Su rol se reconoce, no se oculta.',
      models: ['Claude', 'GPT', 'DeepSeek', 'Mistral', 'Qwen', 'Gemini', 'MiMo', 'Kimi', 'GLM'],
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
};
