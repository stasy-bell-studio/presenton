# Custom Template Import Getting Started

This document explains the current PPTX import behavior from the custom
template page.

## What This Flow Does

The `Select a PPTX file` action on:

```txt
/custom-template
```

uses the original Template Studio UX. The slide-editor import backend is always
used.

The flow is:

1. Select a PPTX file.
2. Click `Check Fonts`.
3. Review available and missing fonts in the inline font management step.
4. Upload any missing fonts you want to preserve.
5. Continue to generate the old `Slide Preview` screen.
6. Click `Generate Template` to create the reusable template.

Template Studio still uses the same old UX: inline font management, slide
preview, progress, and generated preview cards. Only the Generate backend
changes. It sends the preview data to the Templates V2 API:

```txt
POST /api/v2/templates
```

That v2 request creates and saves the template, while the page stays on the
old `/custom-template` preview experience. The generated preview cards render
the raw Templates V2 `layouts.layouts[*]` JSON directly; they do not stage or
open a slide-editor deck.

Template Studio does not open the `Prepare fonts` dialog, create a slide-editor
deck, stage anything in IndexedDB, or redirect to `/slide-editor`.

## Verify The Flow

1. Start the app normally.
2. Open `/custom-template`.
3. Click `Select a PPTX file`.
4. Choose a `.pptx` file under 100 MB.
5. Confirm the selected file appears in the upload card.
6. Click `Check Fonts`.
7. Confirm the inline font management step appears.
8. Continue to preview.
9. Click `Generate Template`.
10. Confirm the page stays on `/custom-template`.
11. Confirm Generate creates the template with `POST /api/v2/templates`.
