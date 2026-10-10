# UniverLab auth.md

Everything a machine can read at univerlab.org is public and read-only. There is nothing to
sign up for, nothing to request, and nothing to keep secret. This file says so in the one
place an agent looks before assuming otherwise.

## Audience

Any agent — a crawler, a CLI, a coding assistant, a background worker, or a person with
`curl`. No distinction is drawn and none is needed: nothing here behaves differently
depending on who is asking.

## There is nothing to obtain

There is no registration, no account, no client and no credential. No token can be requested
because none is issued, and no discovery document describes how to ask for one — UniverLab
publishes no authorization metadata of any kind, on this domain or any other.

Every public resource is anonymous and read-only:

- the site itself — the home page, the manifesto, every experiment page and every other HTML
  page;
- the markdown twin of each of those pages, at `<page>/index.md`, served as
  `text/markdown`;
- `llms.txt`, the plain-language index of the whole site;
- the announcements API at `https://announcements.univerlab.org` — every unauthenticated `GET`
  route listed in `https://univerlab.org/.well-known/api-catalog`;
- the WebMCP tools every page of this site exposes to a browser agent;
- the UniverLab MCP server at `https://univerlab.org/mcp` — four read-only tools (roadmap, Mission
  Log, about, mission-date translator) over stateless Streamable HTTP, no session and no credential;
  its Server Card is at `https://univerlab.org/.well-known/mcp/server-card.json`.

## What is not open

Publishing is owner-only. Writing to the Mission Log or to the roadmap at
`https://announcements.univerlab.org` requires a bearer token only the laboratory holds, and
it is not open to registration. Read those routes freely; do not plan on writing to them. A
write without a token is a `401`, never a silent public write.

## Courtesy

Two expectations, neither enforced:

- **Cache.** Nothing here is expensive to serve, but a client that re-reads an unchanged
  document on every request is still wasteful. The Atom feed at `/feed.atom` is served with
  `Cache-Control: public, max-age=300` and answers `304` to a matching `If-None-Match` — send
  the header back and a re-read costs nothing. The JSON routes carry no cache policy of their
  own: hold the answer for a few minutes and fetch again, rather than on every render.
- **Do not poll the event stream.** `/events` is a long-lived `text/event-stream` built for one
  live view at a time. Hold the connection instead of reconnecting in a loop, and close it
  when the view closes. Treating it as a JSON endpoint to poll is the one thing that will earn
  a `503`.

## Contact

Jheison Martinez Bolivar — `jheison.mb@univerlab.org`, the address published on
`/contributors/`. Write for a question, a correction, or an integration this file does not
cover.
