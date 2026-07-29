# Publicar un anuncio en la Mission Log

La bitácora de <https://univerlab.org/status> se alimenta de un Worker de Cloudflare
(`univerlab-announcements`). Publicar es un `PUT` autenticado; el anuncio aparece
al instante en las pestañas que ya tengan la página abierta, vía SSE.

- **API**: <https://announcements.univerlab.org>
- **Código**: `univerlab/workers/announcements/`
- **Deploy**: automático al hacer push a `main` si cambia `workers/announcements/**`

---

## Publicar

> **Antes del `PUT`: enseña el borrador y espera el visto bueno.**
>
> No hay endpoint de borrado y la página es pública, así que el único control de
> calidad posible ocurre *antes* de mandar. Si quien redacta es un agente, publica
> solo cuando quien lo encargó haya leído el texto exacto que va a salir — título,
> `type` y cuerpo — y haya dicho que sí.
>
> Un «publica un anuncio» en el encargo inicial autoriza la tarea, no el texto
> final: son dos cosas distintas. Cuando el borrador esté listo, muéstralo y
> espera. El coste de esperar es un minuto; el de equivocarse es permanente.

El token vive en `univerlab/workers/announcements/.auth-token.local` (gitignoreado,
chmod 600). Nunca lo pegues en un chat, un issue ni un commit.

Para textos de un párrafo, en línea:

```bash
cd univerlab/workers/announcements

curl -X PUT https://announcements.univerlab.org/ \
  -H "Authorization: Bearer $(cat .auth-token.local)" \
  -H 'Content-Type: application/json' \
  -d '{"title":"texforge 0.4", "body":"Compilación incremental y watch mode.", "type":"update"}'
```

Para textos con varios párrafos, escribe un archivo y mándalo — evita pelearte con
el escapado del shell:

```bash
cat > /tmp/anuncio.json <<'EOF'
{
  "title": "First light",
  "type": "launch",
  "body": "Primer párrafo.\n\nSegundo párrafo."
}
EOF

curl -X PUT https://announcements.univerlab.org/ \
  -H "Authorization: Bearer $(cat .auth-token.local)" \
  -H 'Content-Type: application/json' \
  --data-binary @/tmp/anuncio.json
```

Respuesta esperada: **201** con el entry creado (incluye `id` y `date` generados
por el servidor).

---

## El contrato

| Campo | Obligatorio | Reglas |
|---|---|---|
| `title` | sí | máx. **200** caracteres |
| `body` | sí | máx. **4000** caracteres |
| `type` | no | uno de `update`, `launch`, `incident`, `note` — por defecto `update` |
| `link` | no | URL externa para el botón "View →" y click en el toast |

`id` y `date` los pone el servidor; no los mandes.

Sobre el formato del `body`: es **texto plano con URLs automáticas**. El frontend
detecta URLs (`https://...`) en el body y las convierte en links clickables
(`target="_blank" rel="noopener noreferrer"`). El resto del texto se escapa para
prevenir inyección HTML — no puedes poner etiquetas HTML directamente. Los saltos
de línea (`\n\n`) sí se respetan y separan párrafos.

El campo `link` es opcional: si se incluye, aparece un botón "View →" al final del
toast y hacer click en cualquier parte del toast (que no sea un link o el botón
cerrar) abre esa URL en una nueva pestaña. Úsalo cuando quieras un CTA claro hacia
un changelog, post, repo, etc. Si el body ya contiene las URLs relevantes, no hace
falta `link`.

El sitio es **solo en inglés** en esta página (`/es/status` redirige a `/status`),
así que escribe los anuncios en inglés.

### Tono

La bitácora es el registro de una misión, no un changelog ni un canal de marketing.
Sobria, sin signos de exclamación ni hype. Un hecho concreto y, si viene al caso,
por qué importa. El primer anuncio (`First light`) sirve de referencia.

El registro es astronómico y de vuelo espacial, pero sin disfraz. Se abre con una
figura real del oficio — *first light*, *dress rehearsal* —, se explica en una
frase lo que significa de verdad, y desde ahí se pasa al hecho concreto. La figura
ilumina el hecho; no lo sustituye. Si el texto funciona igual quitando la metáfora,
la metáfora sobra; si sin ella no queda nada, es que no había hecho que contar.

Reglas que se han ido asentando:

- **Estructura**: la figura y su explicación, luego qué pasó en concreto, luego un
  cierre corto. Tres o cuatro párrafos bastan.
- **Cuenta también lo que falló.** Un ensayo que encuentra un fallo es mejor
  entrada que un anuncio triunfal, y es lo coherente con registrar «en el orden en
  que pasó, sin retoques».
- **No prometas fechas.** «Cuando la cuenta atrás llegue a cero» envejece bien;
  «la semana que viene» no.
- **Elige el `type` con honestidad.** `launch` solo si algo lanzó de verdad; si
  sigue en la plataforma, es `note`. El tipo es una afirmación, no una etiqueta.
- Nada de emoji, ni mayúsculas enfáticas, ni signos de exclamación.
- Escribe para alguien que llega dentro de un año sin contexto: los nombres
  internos (specs, ramas, ids) no significan nada fuera de casa.

---

## Verificar

```bash
curl -s https://announcements.univerlab.org/ | jq .        # todos los anuncios
curl -sN https://announcements.univerlab.org/events        # escuchar el stream en vivo
```

Para comprobar el push en tiempo real de punta a punta: deja `curl -sN .../events`
corriendo en una terminal y publica desde otra. El evento debe aparecer solo.

---

## Cuando algo sale mal

| Código | Qué pasó |
|---|---|
| **401** | Token mal, ausente, o el secret aún no propagó |
| **400** | Falta `title`/`body`, JSON inválido, o `type` fuera de la lista |
| **413** | `title` > 200 o `body` > 4000 caracteres |
| **503** | Más de 200 oyentes SSE simultáneos |

**El 401 más común no es un token malo.** Después de rotar el secret, Cloudflare
tarda unos **30 segundos** en propagarlo. Un 401 inmediatamente después de un
`wrangler secret put` es un falso negativo: espera y reintenta antes de investigar.

---

## Borrar un anuncio

**No se puede.** No hay endpoint de borrado: lo que publicas queda publicado y la
página es pública. Revisa el texto antes de mandar el `PUT` — no hay deshacer.

Si de verdad hace falta quitar algo, hay que editar a mano tanto el espejo en KV
como la tabla SQLite del Durable Object. Es engorroso y a propósito.

---

## Rotar el token

```bash
cd univerlab/workers/announcements

TOKEN=$(openssl rand -hex 32)
umask 077 && printf '%s\n' "$TOKEN" > .auth-token.local && chmod 600 .auth-token.local
printf '%s' "$TOKEN" | npx wrangler secret put AUTH_TOKEN
unset TOKEN
```

Espera ~30 s y comprueba que el token viejo devuelve 401 y el nuevo no.

Rota si el token aparece en un historial de shell, un log de CI, una captura o el
contexto de un agente. Un token que se vio una vez se considera quemado.

---

## Cómo funciona por dentro

Solo lo justo para no romperlo por accidente:

- Un único **Durable Object** (`LogHub`, SQLite) es dueño de las escrituras y del
  fan-out SSE. Un solo DO global es lo correcto aquí: hay una sola bitácora, así
  que la bitácora *es* el átomo de coordinación.
- Como el DO serializa las escrituras por construcción, **no hay lock**: no hace
  falta.
- Las lecturas **no tocan el DO**. Cada escritura espeja las últimas 100 entradas
  a la key `entries` de KV, y `GET /` lee de ahí. Esto mantiene el camino común
  como una lectura de edge barata, que es lo que hace viable el plan gratuito.
- SQLite en el DO guarda el histórico completo; KV solo las 100 más recientes.

### El límite que hay que vigilar

SSE **no puede hibernar**, así que se factura duración mientras cada conexión esté
abierta. El plan gratuito da 13.000 GB-s/día y un DO ocupa 0,125 GB → unas
**29 horas-conexión al día en total**, sumando a todos los visitantes.

De sobra para el tráfico actual. Si algún día se acerca al techo, la salida es
migrar de SSE a WebSocket con la Hibernation API, que no cobra mientras está idle.
Volver a polling **no** es la salida: consumiría muchísimo más.
