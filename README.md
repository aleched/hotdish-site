# Hotdish

A static site for browsing, searching and editing notes and documents that live as markdown files in a git
repository. There are no accounts and no server-side state: you point it at a repository, it
reads the files directly from the forge's API in your browser, and renders them.

- **Forges:** GitHub, GitLab and Gitea / Forgejo (including self-hosted).
- **Storage:** plain markdown with YAML frontmatter, in whatever folder layout you like.
- **Hosting:** Cloudflare Pages via `adapter-cloudflare` (a thin worker serves the client-rendered
  app; no data passes through it).
- **Editing:** a Milkdown/Crepe WYSIWYG, a markdown source view, and an optional template-driven
  form — all writing idiomatic markdown back to your repository.
- **Managing documents:** create, delete, and move or rename documents between folders (new folders are
  created as needed). Every change is a commit with an editable message.

## Getting started

```bash
pnpm install
pnpm dev
```

Other scripts:

| Command | What it does |
| --- | --- |
| `pnpm check` | Type-checks Svelte and TypeScript |
| `pnpm test` | Runs the Vitest unit tests |
| `pnpm build` | Produces the deployable output |
| `pnpm preview` | Serves the built output locally |

## Deploying to Cloudflare Pages

1. Push this repository to your git host and create a Pages project from it.
2. Build command: `pnpm build`
3. Build output directory: `.svelte-kit/cloudflare`
4. Set the environment variable `NODE_VERSION` to `20` (or newer) if Pages defaults to an older
   release.

The project uses `@sveltejs/adapter-cloudflare`. Rendering is client-side only
(`export const ssr = false` in `src/routes/+layout.ts`), so no requests are proxied through
Cloudflare and no secrets ever reach the edge.

## How a repository is read

- The whole file tree is fetched in as few API calls as the forge allows (one recursive call on
  GitHub and Gitea; paginated on GitLab).
- Every `.md` / `.markdown` file outside dotted folders becomes a document. The folder structure
  is mirrored exactly, so the repository stays useful without this site.
- File content is cached in IndexedDB keyed by its **git blob id**. Because a blob id changes if
  and only if the content changes, the cache never goes stale and never needs a TTL.
- Frontmatter `tags` populate the tag filter; `title` (or the first `#` heading, or the file
  name)   becomes the document title.

  A minimal document:

```markdown
---
title: Tater Tot Hotdish
tags: [dinner, make-ahead]
servings: 8
---

## Ingredients

- 1 lb ground beef
- 1 can cream of mushroom soup

## Instructions

1. Brown the beef.
2. Bake at 350°F for 45 minutes.
```

## Access tokens

A token is only needed for private repositories or for making changes.

- If you create, edit, move or delete a document without a token, the site asks for one, checks it
  against the forge, saves it to that repository's profile and then continues with the action.
- Tokens are stored in `localStorage` under a named profile and sent only to the forge they
  belong to.
- A token is **never** put in a URL. URLs leak through history, `Referer` headers, link previews
  and server logs, so there is no safe way to share one.
- Therefore private repositories can be browsed on your own device but cannot be shared. A share
  link contains only the repository identity and path.
- Anyone with access to your browser profile can read a stored token. On a shared machine, leave
  it blank and paste it per session, or remove it from Settings when you are done.

Recommended scopes:

| Forge | Token |
| --- | --- |
| GitHub | Fine-grained PAT scoped to the one repository, **Contents: Read** (or Read and write) |
| GitLab | Project access token with `read_repository` (or `write_repository`) |
| Gitea | Token limited to repository read (or write) |

Moving a document is a single commit. On Gitea / Forgejo this needs version 1.20 or newer.

Repository URLs are used to determine the host and known forge. For self-hosted instances, the
site probes public forge version APIs; if a probe is blocked or inconclusive, select the forge
type manually. The host still comes from the repository URL.

### Self-hosted Gitea

Gitea ships with API CORS **disabled**. A self-hosted instance must enable it before a browser
can talk to it:

```ini
[cors]
ENABLED = true
ALLOW_DOMAIN = https://your-hotdish-site.pages.dev
METHODS = GET,POST,PUT,PATCH,DELETE,OPTIONS
HEADERS = Content-Type,Authorization
```

## Share links

A share link looks like `/r/<encoded>/<path>`, where `<encoded>` is a base64url blob describing
the repository (forge, host, owner, repo, optional branch and sub-folder). It is an encoding, not
encryption — it exists to keep URLs tidy, not to hide anything.

## Templates

Add `.hotdish/template.yml` to your repository to get a structured editing form and a
fixed vocabulary of tags. See `static/template/recipe.yml` for a complete example.

In the form, `multi-enum` fields show their options as chips in alphabetical order; tap a chip to
select it, or use the green plus chip to type a new value. The `tags` field also offers every tag
already used elsewhere in the repository.

More example templates to copy from (each is a ready-to-use `.hotdish/template.yml`), also linked from the
About section of the settings page:

- [Recipe](static/template/recipe.yml) and [Note](static/template/note.yml), the two built-in defaults
- [Project](static/template/project.yml)
- [Journal](static/template/journal.yml)
- [Travel](static/template/travel.yml)
- [Fitness](static/template/fitness.yml)

```yaml
version: 1
name: Recipe

fields:
  - key: tags
    label: Tags
    type: multi-enum      # text | number | boolean | enum | multi-enum | url | date
    allowCustom: false    # false restricts values to `options`
    options: [breakfast, dinner, dessert]

  - key: source
    label: Source
    type: url             # shown as a link in the viewer when the value is an http(s) URL
    icon: link            # optional icon shown next to the field (browse names under About in settings)

  - group:                # fields in a group share one line of the form
      - key: prep_time
        label: Prep time
        type: text
      - key: cook_time
        label: Cook time
        type: text

sections:
  - id: ingredients
    heading: Ingredients
    type: list            # list | ordered | text
    repeatable: true      # allows `###` sub-headings, e.g. "Cake batter" / "Frosting"
    subheadingLabel: Component
```

Important properties of templates:

- **A template is a lens, never a storage format.** Files are ordinary markdown; `list` sections
  are `-` bullets and `ordered` sections are `1.` lists.
- **Nothing is ever dropped.** Sections the template does not describe are kept verbatim and
  shown as unmatched. Unknown frontmatter keys survive a round trip.
- **Violations are warnings, not errors.** A document that breaks the template still renders and
  still saves.
- **A repository without a template uses the built-in default.** Settings choose between Recipe
  (`static/template/recipe.yml`, the default), Note (`static/template/note.yml`) and None. To opt
  out for a single repository and edit plain markdown only, commit an empty
  `.hotdish/template.yml`. A repository template replaces the default entirely.
- **Dates are plain strings.** A `date` field is a date picker that stores `YYYY-MM-DD` text, so
  frontmatter is read without YAML's timestamp type and dates are never rewritten as timestamps.
- **A broken template degrades gracefully.** Invalid YAML disables the form, not the site: the
  editor falls back to plain markdown with no template.

Section order in the file is canonical — the template lists which sections exist, not the order
they must appear in, so a document can place its own boxes.

## Offline and installing on a phone

Hotdish is a progressive web app. Open it in the phone's browser and choose **Add to Home
Screen** (Safari) or **Install app** (Chrome) to run it full screen like a native app.

- The app itself is cached by a service worker (`src/service-worker.ts`), so it starts with no
  connection at all.
- Each repository's file listing is saved on the device. A repository opens instantly from that
  copy while a fresh listing loads in the background; if the forge can't be reached, the saved
  copy stays on screen.
- A few seconds after the site opens, every saved repository is downloaded in the background
  (listing and markdown, at most once an hour each), so all of them can be read offline.
- The cloud icon in the header shows whether what you see is live. Tap it to refresh. A crossed-out
  cloud means you're looking at the saved copy; its tooltip shows when it was last synced.
- Editing, creating, renaming and deleting need a connection and are disabled while offline.
  Work in an open editor is saved on the device as you type, so losing the connection, reloading
  or closing the app never loses it; the editor restores it next time and warns if the file
  changed in the meantime.
- New versions are applied quietly on the next page change, never while an editor is open.

The service worker only runs in a production build (`pnpm build && pnpm preview`, or the
deployed site), not under `pnpm dev`. Clearing the cache in Settings removes saved listings and
documents but keeps unsaved editor drafts.

## Safety
The site rewrites files you own, so content loss is treated as the worst possible bug:

- Every save shows a line diff and a commit message before anything is written. Create, move and
  delete also open a commit message prompt, and nothing is committed until you submit it.
- Writes use the forge's precondition (blob SHA, or `last_commit_id` on GitLab), so a file that
  changed underneath you produces a conflict rather than an overwrite. Moves and deletes are
  guarded the same way.
- A file whose frontmatter cannot be parsed is editable only as raw text, because any structured
  edit would silently drop the unparseable block.
- Raw HTML in markdown is dropped during rendering (and the result is sanitized with DOMPurify).
  Repository content is untrusted, and tokens live in `localStorage`, so an XSS here would be a
  token disclosure.

## Project layout

```
src/lib/forge/      GitHub / GitLab / Gitea providers behind one interface
src/lib/markdown/   frontmatter, rendering, document parsing
src/lib/template/   template schema, document structuring, serialization
src/lib/store/      repository state and saved profiles (Svelte 5 runes)
src/lib/cache/      blob cache, saved repository listings, offline prefetch, editor drafts
src/lib/pwa/        safe service worker updates
src/lib/editor/     lazily loaded Milkdown/Crepe editor; new / move / delete dialogs
src/lib/ui/         presentation components
src/routes/         home (saved repos), /settings (theme, cache, about), /r/[src]/[...path] browser
```
