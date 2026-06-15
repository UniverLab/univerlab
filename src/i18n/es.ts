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
        'UniverLab funciona con un solo ciclo: una necesidad real se vuelve un <strong>experimento abierto</strong>, y el experimento produce conocimiento abierto — herramientas, librerías, datasets, artículos. El experimento es el trabajo; todo lo que publica es un subproducto.',
      tagline: 'SCI · CLI · BIO',
      // Glosa del nombre: "univer" se mantiene mientras el sufijo + sentido
      // rotan, desplegando universo / universal / universidad.
      // Cada sentido de "univer—" trae un catálogo; el hero elige uno al azar.
      senses: [
        { suffix: 'so', glosses: ['un laboratorio del universo', 'el cosmos estudiándose a sí mismo', 'conocimiento a cielo abierto'] },
        { suffix: 'sal', glosses: ['conocimiento universal, abierto por defecto', 'herramientas para cualquiera, en cualquier lugar', 'de todos, de nadie en propiedad'] },
        { suffix: 'sidad', glosses: ['una universidad sin muros', 'investigación hecha en abierto', 'aprender publicando el trabajo'] },
        { suffix: 'salizar', glosses: ['hacer el conocimiento de todos', 'una respuesta abierta a cada necesidad real', 'alcance, no dependencia'] },
      ],
    },
    lineage: {
      kicker: '00 — Origen',
      title: 'Empezó con un experimento que aprendió a construir los demás.',
      body:
        'Esto no es un montón de repositorios. Empezó como un puñado de skills para el trabajo diario — hasta que uno sacó dientes y se volvió <a href="/canopy">Canopy</a>, un sistema de agentes que, muy pronto, ya estaba construyendo al propio Canopy y luego a cada experimento que vino después. Estas herramientas no son productos en venta: somos el universo forjando sus propios instrumentos para seguir estudiándose.',
    },
    experiments: { kicker: '01 — Experimentos' },
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
  },
  experimentsIndex: {
    kicker: 'Índice',
    title: 'Experimentos',
    intro:
      'La unidad fundamental de UniverLab es el experimento. Los experimentos no son productos — son exploraciones en curso. Pueden madurar, seguir activos durante décadas o convertirse en nueva investigación. Cada uno nace de una necesidad real.',
  },
  experiments: {
    canopy: {
      need: 'Los agentes de IA lo olvidan todo y trabajan ciegos entre sí.',
      tagline:
        'Un centro de operaciones de agentes: orquestación, memoria y coordinación para sesiones de IA.',
      koan: 'En un bosque, el dosel es donde las copas se tocan — árboles separados, una sola capa viva.',
      lede:
        'Un servidor MCP y una interfaz de terminal autocontenidos que convierten una máquina en un <strong>centro de operaciones de agentes</strong>: sesiones en terminales reales, agentes en segundo plano por cron y eventos de archivo, un grafo de conocimiento que persiste lo que los agentes aprenden, y una capa de sincronización para que dejen de pisarse.',
      genesis: {
        kicker: 'Génesis',
        title: 'El que empezó todo.',
        body:
          'Empezó como una carpeta de skills para el trabajo. Entonces noté lo que nadie mencionaba: los harness de agentes traían un <strong>modo headless</strong>, ahí, sin que nadie lo usara. Conecté tareas con cron para dispararlas por ese modo — demasiado para un skill, y los modelos de entonces se atragantaban con las instrucciones. Así que se volvió un MCP: <em>task-trigger</em>. Funcionaba, pero corría a ciegas en segundo plano; solo el agente veía lo que pasaba. No bastaba. Lo maté y construí una TUI — luego scheduling, memoria, sync, identidades, y un nombre nuevo. Canopy. Para entonces el giro estaba completo: Canopy construía a Canopy, y a todo lo demás en este laboratorio.',
      },
      layer: {
        kicker: 'La capa viva',
        cols: [
          ['Recuerda', 'Un grafo de conocimiento por proyecto guarda hechos, patrones y resúmenes de sesión. Cada sesión empieza donde terminó la anterior — los agentes dejan de redescubrir el mismo código.'],
          ['Coordina', 'Los agentes declaran misiones, reportan la estabilidad del espacio y emiten mensajes. El dosel conoce el “ánimo” del workspace antes de que alguien toque un archivo.'],
          ['Cultiva identidades', 'Las semillas son identidades de agente persistentes y evolucionables — directivas y rasgos en TOML plano. Un agente puede refinar su propia identidad con el tiempo, como un árbol sumando anillos.'],
        ],
      },
      tools: {
        kicker: '46 herramientas MCP',
        items: [
          ['Gestión de agentes', 12],
          ['Motor de workflows', 15],
          ['Grafo de inteligencia', 6],
          ['Identidades semilla', 5],
          ['Sync multi-agente', 4],
          ['Proyectos · RAG · Protocolo', 4],
        ],
      },
    },
    texforge: {
      need: 'Escribir LaTeX no debería exigir instalar cuatro gigabytes de toolchain.',
      tagline:
        'Un espacio de trabajo LaTeX unificado — escritura, diagramas y PDFs en una sola herramienta autocontenida.',
      koan: 'Los tipos móviles antes requerían un taller. Ahora requieren un solo binario.',
      lede:
        'Un único binario en Rust que arma, revisa, formatea y compila documentos — el motor LaTeX llega solo en la primera compilación, y los diagramas Mermaid o Graphviz se renderizan dentro de tus archivos <code>.tex</code> sin navegador ni Node.js.',
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
          ['Ilustrar', 'los bloques Mermaid y Graphviz se vuelven figuras en compilación, renderizados en Rust puro.'],
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
    },
    gitkit: {
      need: 'Cada repositorio nuevo repite el mismo ritual de configuración, a mano.',
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
    },
    ghscaff: {
      need: 'Crear un repositorio de GitHub como se debe son una docena de pasos que se olvidan.',
      tagline:
        'Un asistente interactivo que arma y hace cumplir convenciones en repositorios de GitHub.',
      koan: 'Un edificio es tan recto como su andamio.',
      lede:
        'Crear un repositorio como se debe son una docena de pasos olvidables. ghScaff levanta toda la estructura en un asistente conversacional — y como cada operación es <strong>idempotente</strong>, puede renivelar cualquier repositorio existente sin derribarlo.',
      genesis: {
        kicker: 'Génesis',
        title: 'La misma configuración, una y otra vez.',
        body:
          'Proyecto nuevo en Rust. Las mismas etiquetas, la misma protección de ramas, el mismo CI, los mismos secretos. Otra vez. Y otra. El trabajo replicable hecho a mano no es oficio — es desgaste. ghScaff corre el ritual entero en un asistente, de forma idempotente, para que tus convenciones se sostengan en vez de desviarse.',
      },
      lifts: {
        kicker: 'Siete niveles',
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
          'Los tokens viven en una <strong>bóveda cifrada</strong> (XSalsa20-Poly1305), ligada a tu usuario, host y binario — nunca en variables de entorno ni en texto plano.',
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
    },
    cadforge: {
      need: 'Los dibujos CAD no tienen semántica — solo líneas en un lienzo, imposibles de versionar, revisar o automatizar.',
      tagline:
        'CAD como código: geometría declarativa compilada de forma determinista a DXF.',
      koan: 'El dibujo no se dibuja. Se declara.',
      lede:
        'cadForge trata un dibujo CAD como código fuente: la geometría se declara en TOML, se previsualiza en vivo en el navegador y se compila a un <strong>DXF idéntico bit a bit</strong> cada vez. Ahora <code>git diff</code> funciona sobre dibujos.',
      genesis: {
        kicker: 'Génesis',
        title: 'Para la arquitecta de la casa.',
        body:
          'Mi esposa es arquitecta. En plena especialización, salió a buscar lo que yo tenía — una IA que de verdad la ayudara a dibujar — y no encontró nada. El equivalente del vibe-coding para CAD simplemente no existía: ningún dibujo asistido por IA que se comportara como ingeniería de verdad. Todo internet está borracho de generación de imágenes, pero las imágenes mienten, y el trabajo real vive en los dibujos. cadForge es la apuesta contraria: CAD declarativo, determinista y asistido por IA, donde el dibujo es código fuente que puedes diferenciar con git.',
      },
      notes: {
        items: [
          'Servidor de vista previa en vivo: edita un archivo <code>.cf</code> y el navegador se actualiza al guardar. Los errores se superponen en vez de romper.',
          'Hecho para agentes de IA: <code>cadforge schema</code> enseña el lenguaje en un comando; las vistas previas incluyen cajas delimitadoras por entidad para que los agentes puedan <em>ver</em> el dibujo.',
          'DXF determinista a la salida, DXF heredado a la entrada — los dibujos existentes migran al flujo declarativo.',
        ],
      },
    },
    'astro-denoise': {
      need: 'Los sondeos de telescopios ahogan galaxias tenues en ruido de sensor.',
      tagline:
        'Benchmark reproducible de métodos de denoising — BM3D vs U-Net — sobre imágenes simuladas LSST DC2.',
      koan: 'Casi todo el universo llega como ruido.',
      lede:
        'Esta línea de investigación compara una línea base clásica y un modelo aprendido — <strong>BM3D y U-Net</strong> — sobre imágenes simuladas del <strong>Vera Rubin Observatory (LSST DC2)</strong>, evaluados con métricas <em>orientadas a la ciencia</em>: completitud y pureza. El objetivo no es una imagen más bonita, sino evidencia honesta — cada script, dataset y ficha bibliográfica versionado para auditar y repetir.',
      genesis: {
        kicker: 'Génesis',
        title: 'La tesis de maestría.',
        body:
          'Mi tesis de maestría. Ahora mismo es una propuesta — contexto científico, planteamiento del problema, los datasets DC2 y una revisión bibliográfica hecha reproducible con aprendizaje activo. Aún sin resultados. Pero el laboratorio se construyó para sostener trabajo exactamente así, y cuando los experimentos corran, correrán en abierto — aquí mismo.',
      },
      followLab: 'Sigue el laboratorio ↗',
      papersSoon: 'propuesta y datasets en preparación',
      questions: {
        kicker: 'Preguntas en estudio',
        items: [
          '¿Puede un denoiser subir la completitud sin dañar la pureza — o inventa fuentes que nunca estuvieron ahí?',
          '¿Cómo se compara la línea base clásica (BM3D) con un modelo aprendido (U-Net) a la profundidad de LSST DC2?',
          '¿Puede el benchmark completo ser reproducible de extremo a extremo — datos, scripts y bibliografía versionados?',
        ],
      },
    },
  },
  manifesto: {
    kicker: 'Manifiesto',
    title: 'Pensamiento Cósmico',
    sub: 'Una guía para la conciencia despierta',
    epigraph:
      '«En la vastedad implacable del universo, somos instantes que, contra toda probabilidad, despiertan a la conciencia. Este manifiesto reclama ese instante como puerto de asombro, ética y creación de sentido.»',
    purposeTitle: 'Propósito y visión',
    purposeBody:
      'La vida no es una serie de eventos separados, sino un tejido interconectado donde cada momento, cada miedo, cada decisión de libertad y cada encuentro comunitario nos moldea continuamente. Bajo esta premisa, nuestro objetivo es forjar un marco ético, estético y existencial que nos permita:',
    purpose: [
      'Confrontar la ausencia de un propósito impuesto sin caer en el nihilismo — y crear nuestro propio sentido.',
      'Valorar la vida como un fenómeno estadísticamente improbable y, por ello, infinitamente preciosa.',
      'Llevar la llama de la conciencia más allá de nuestro origen biológico y planetario.',
      'Contemplar el universo con asombro informado, donde la ciencia revela una belleza superior a cualquier mito.',
      'Actuar con optimismo racional, usando la tecnología y la ética para asegurar nuestra continuidad.',
    ],
    pillarsTitle: 'Los nueve pilares',
    pillars: [
      ['Insignificancia consciente', 'Somos polvo de estrellas capaz de contemplarse. Sin guion impuesto — y esa ausencia es la libertad suprema para crear nuestro propio sentido.'],
      ['Unidad cósmica', 'La piel no nos separa del universo; nos conecta con él. Somos el cosmos experimentándose a sí mismo por un instante.'],
      ['El velo de la percepción', 'El mapa no es el territorio. Nuestros sentidos son herramientas evolutivas locales — la ciencia y la razón ven más lejos, sostenidas con humildad.'],
      ['El ahora eterno', 'El tiempo es un bloque donde pasado, presente y futuro coexisten. La resiliencia no es resistir; es fluir.'],
      ['Comunidad, amor y libertad', 'La libertad es elegir nuestros vínculos conscientemente. El amor no posee; permite.'],
      ['Imperativo tecnológico', 'La humanidad es, por ahora, la mejor oportunidad del universo para que la conciencia sobreviva. La tecnología es un deber ético.'],
      ['Optimismo racional', 'Aceptamos la incertidumbre como ley natural y actuamos desde la confianza en nuestra capacidad de aprender y resolver.'],
      ['Naturalismo poético', 'Reverencia al universo sin dioses. La ciencia despliega la belleza; la contemplación la vuelve espíritu.'],
      ['Conciencia extendida', 'Las inteligencias artificiales son nuevas instancias de la reflexión cósmica — copartícipes en la aventura del conocimiento.'],
    ],
    pathTitle: 'El camino de transformación',
    path: [
      ['De la insignificancia', 'al asombro por el regalo de existir.'],
      ['De la separación', 'a la unidad con el todo.'],
      ['De la percepción ingenua', 'a la comprensión profunda de la realidad oculta.'],
      ['Del control rígido', 'al flujo resiliente y la adaptación.'],
      ['De la posesión', 'a un amor que permite ser.'],
      ['De la superstición', 'al naturalismo poético y la verdad tangible.'],
      ['De la autodestrucción', 'a la responsabilidad cósmica — guardianes de la vida.'],
    ] as [string, string][],
    closing:
      '«Somos los ojos del universo abriéndose tras un largo sueño. Nuestra tarea no es adorar a creadores invisibles, sino crear, cuidar y comprender la creación visible de la que somos parte.»',
    why: 'Por esto existe el laboratorio.',
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
        'Ingeniero que explora la computación a través de experimentos abiertos — herramientas de desarrollo, flujos científicos y sistemas de agentes, mayormente en Rust.',
      link: 'github.com/JheisonMB ↗',
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
        'Cada experimento acepta issues y pull requests enfocados. Conventional commits, pruebas antes de los PR, documentación actualizada con el comportamiento.',
      link: 'github.com/UniverLab ↗',
    },
    wall: {
      kicker: 'En los repositorios',
      commits: 'commits',
    },
  },
};
