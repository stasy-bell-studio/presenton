# Experimental Slide Editor Getting Started

This document explains how to try the new slide-editor PPTX import path from
the custom template page.

The existing custom template import flow remains the default. The experimental
flow is enabled only when `USE_SLIDE_EDITOR_IMPORT` is explicitly set to a true
value.

## What This Feature Does

When the feature flag is enabled, the `Select a PPTX file` action on:

```txt
/custom-template
```

opens the uploaded PPTX in the new slide editor import path instead of starting
the old custom-template font-check flow.

The browser stages the selected PPTX in IndexedDB, redirects to:

```txt
/slide-editor?pptxImportId=active-pptx-import
```

and the slide editor imports the staged file into an editable deck.

Each new upload replaces the previous staged PPTX import record, so repeated
imports do not accumulate old PPTX files in IndexedDB.

## Enable With Docker

The Docker default is the old import flow:

```bash
docker compose up production
```

Enable the experimental import path by passing the flag at startup:

```bash
USE_SLIDE_EDITOR_IMPORT=true docker compose up production
```

For the development service:

```bash
USE_SLIDE_EDITOR_IMPORT=true docker compose up development
```

Accepted true values are:

```txt
1
true
yes
on
```

Any other value, including an unset value, keeps the old import flow.

## Enable In Local Next.js Development

From `servers/nextjs`, start the dev server with the flag:

```bash
USE_SLIDE_EDITOR_IMPORT=true npm run dev
```

You can also put the flag in `servers/nextjs/.env.local`:

```txt
USE_SLIDE_EDITOR_IMPORT=true
```

Restart the Next.js server after changing the flag.

## Verify The Flow

1. Start the app with `USE_SLIDE_EDITOR_IMPORT=true`.
2. Open `/custom-template`.
3. Click `Select a PPTX file`.
4. Choose a `.pptx` file under 100 MB.
5. Confirm the browser redirects to `/slide-editor?pptxImportId=...`.
6. Confirm the imported deck appears in the slide editor.

With the flag disabled, the same upload action should stay on the original
custom-template flow and continue to `Check Fonts`.

## Troubleshooting

If the upload still uses the old flow, confirm the container received the flag:

```bash
docker compose exec production printenv USE_SLIDE_EDITOR_IMPORT
```

If you changed the flag after a container was already running, recreate the
container:

```bash
USE_SLIDE_EDITOR_IMPORT=true docker compose up production --force-recreate
```

If `/slide-editor` opens but cannot find the import, upload the PPTX again from
the same browser tab. The staged file lives in browser IndexedDB, not on the
server.

If import quality looks incomplete, check the browser console. The experimental
import path currently logs PPTX import warnings instead of expanding the old
template-import feature surface.
