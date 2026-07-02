# Template V2 direct component rendering

This document describes the Template V2 presentation runtime on branch
`dipesh/pre-159-move-new-editor-code-to-main-codebase-for-proper-integration`.

The governing rule is:

> Select a layout → write the complete layout to `slide.ui` → render `slide.ui`
> directly → edit `slide.ui` → persist `slide.ui`.

`slide.ui` is the only frontend source of truth for Template V2 layout and
content. The presentation renderer does not read Template V2 content from
`slide.content` and does not maintain a second canonical `Slide` copy.

## Active flow

```text
selected Template V2 layout
        |
        v
slide.ui = raw 1280 x 720 layout JSON
        |
        v
V1ContentRender
        |
        v
TemplateV2KonvaSlide
        |
        +-- render raw ui.components with react-konva
        +-- edit an immutable, structurally shared raw UI tree
        +-- dispatch updateSlideUi({ index, ui })
        |
        v
Redux presentationData.slides[index].ui
        |
        v
debounced presentation autosave
```

The presentation runtime no longer performs this conversion loop:

```text
raw slide.ui
  -> canonical editor Slide
  -> layout resolver / SlideSurface
  -> reverse serialization
  -> slide.ui plus hidden slide.content state
```

This removes redundant object construction, schema translation, Jotai editor
state, layout resolution, and reverse serialization from the render/edit path.

## Primary implementation files

| File | Responsibility |
| --- | --- |
| [`TemplateV2KonvaSlide.tsx`](../servers/nextjs/app/(presentation-generator)/components/TemplateV2KonvaSlide.tsx) | The preserved Dipesh component, now responsible for raw UI rendering, selection, transforms, existing element toolbars, inline editing, insertions, chart/image integration, history, and UI commits. |
| [`V1ContentRender.tsx`](../servers/nextjs/app/(presentation-generator)/components/V1ContentRender.tsx) | Routes Template V2 presentation slides directly to the raw renderer. |
| [`templateV2Events.ts`](../servers/nextjs/app/(presentation-generator)/components/templateV2Events.ts) | Shared insert, chart, and active-surface event contracts. |
| [`presentationGeneration.ts`](../servers/nextjs/store/slices/presentationGeneration.ts) | Owns `updateSlideUi`, which updates only the selected slide's `ui`. |
| [`NewSlide.tsx`](../servers/nextjs/app/(presentation-generator)/presentation/components/NewSlide.tsx) | Writes a selected Template V2 layout directly into a new slide's `ui`. |
| [`blank-slide.ts`](../servers/nextjs/app/(presentation-generator)/_shared/blank-slide.ts) | Supplies an empty raw UI with `components: []`. |
| [`useAutoSave.tsx`](../servers/nextjs/app/(presentation-generator)/presentation/hooks/useAutoSave.tsx) | Persists the Redux presentation after its debounce. |

There are two `NewSlide.tsx` entry points in the presentation-generator tree.
Both now use the same `slide.ui` behavior.

## Raw UI contract

The renderer consumes the backend Template V2 shape without converting units:

```json
{
  "id": "layout_id",
  "background": "#FFFFFF",
  "components": [
    {
      "id": "hero",
      "position": { "x": 80, "y": 80 },
      "size": { "width": 1120, "height": 560 },
      "elements": [
        {
          "type": "text",
          "name": "title",
          "position": { "x": 0, "y": 0 },
          "size": { "width": 900, "height": 140 },
          "runs": [{ "text": "Title" }]
        }
      ]
    }
  ]
}
```

Geometry is interpreted in the native `1280 x 720` stage coordinate system:

- component positions are slide-relative;
- top-level element positions are component-relative;
- nested element positions are parent-relative;
- positions, sizes, font sizes, gaps, padding, strokes, and radii remain raw
  UI values.

The loose raw boundary is intentional. Alias readers handle known snake-case
and camel-case variants without rewriting the entire tree.

## Rendering and editing

`TemplateV2KonvaSlide` creates one fixed-size Konva Stage and renders
each raw component as a clipped Group. Raw elements are traversed recursively
through `children`, `elements`, `child`, or repeated `item` structures.

Supported visuals include:

- text and text lists;
- images and SVG;
- rectangles, ellipses, lines, groups, containers, flex, and grid;
- tables;
- bar, line, area, and pie-style charts;
- infographic/progress primitives.

Interaction behavior:

- components can be selected, dragged, resized, and rotated;
- a selected element can be dragged, resized, and rotated;
- the first pointer interaction on an unselected child continues to select or
  move its component; a selected child receives its own drag;
- layout-managed children receive `__presenton_manual_position` after a manual
  transform so the layout engine does not immediately overwrite the edit;
- text, text-list, table, and SVG values use inline overlays;
- images use the upload API and save the returned source in the raw element;
- charts use the shared chart-panel event bridge;
- the existing `ElementToolbar` controls are retained as a selected-element
  editor boundary; only that selected element is projected into editor units,
  while rendering and persistence remain raw `slide.ui` operations;
- component-level design-variable controls are retained through the same
  editor boundary and write their changes back into the raw component tree;
- undo and redo store raw UI snapshots, not canonical editor Slides.

## Backend-shape compatibility

The renderer reads and preserves the backend's current data shapes:

- TextList items may be arrays of text runs, direct text records, or legacy
  strings.
- Table cells may contain `runs`, a direct `text`, and either `color` or `fill`.
  Editing preserves the existing cell and first-run style metadata.
- Chart series read `values`, with `data` accepted as a compatibility alias.

This matters because a direct renderer must not silently depend on the canonical
editor adapter to normalize these values first.

## Commit and persistence behavior

Every edit ends at one mutation boundary:

```ts
updateSlideUi({
  index: slideIndex,
  ui: nextUi,
})
```

The reducer changes only:

```text
presentationData.slides[slideIndex].ui
```

It does not replace the whole slide and does not write an editor snapshot into
`slide.content`. The existing autosave observes the Redux presentation object
and persists the updated `ui` after its debounce.

New Template V2 slides are initialized as follows:

```text
layout selection -> newSlide.ui = selected raw layout
empty selection  -> newSlide.ui = { background: "#FFFFFF", components: [] }
```

`content: {}` is currently retained on newly created slides for the shared API
shape, but it is not a Template V2 rendering or editing source.

## Adapter cleanup status

The active Template V2 presentation runtime has no calls to:

- `adaptTemplateV2LayoutToSlide`;
- `normalizeTemplateV2Slide`;
- `serializeTemplateV2LayoutFromSlide`;
- `serializeTemplateV2ContentFromSlide`;
- `applyGeneratedSlideContentToLayout`;
- the old normalized slide layout resolver.

`TemplateV2KonvaSlide` was preserved and changed in place. Its old whole-slide
adapter, Jotai deck hydration, `SlideSurface` route, reverse serializers, and
hidden `__template_v2_konva_slide__` content fallback were removed.

Some similarly named utilities remain for separate consumers:

- `TemplateV2LayoutPreview` still uses `adaptTemplateV2LayoutToSlide` to feed
  the shared preview surface.
- The reusable slide editor still uses `normalizeTemplateV2Slide` for canonical
  `Slide` model conversion where needed.
- The Blocks/palette boundary can still convert a selected library component
  into an insertion payload. This conversion occurs only on insertion, not on
  every render or edit.

Deleting these shared utilities globally would break template previews and the
standalone canonical editor without improving presentation-render performance.
They are not mounted in the direct presentation path.

## Backend generation boundary

The FastAPI generator currently creates semantic `slide.content` and then calls
`_apply_template_v2_content_to_ui()` during generation/streaming. The result is
a hydrated `slide.ui`, which is what the frontend renders and persists.

That server operation is generation-time work, not a browser render adapter.
The stricter final architecture should generate named element values directly
into a copied UI tree and keep `slide.content` empty for Template V2. Removing
the server hydrator before replacing the generator output would produce blank
template values, so it is intentionally outside this frontend runtime cleanup.

## Performance analysis

The direct path is structurally cheaper than the old presentation path because
it removes full-tree model conversion and reverse conversion from mounts and
edits. It also avoids initializing the standalone slide editor's state graph for
each presentation surface.

The editor hot path is optimized as follows:

- the incoming immutable UI becomes the initial draft by reference; no
  full-tree startup clone is performed;
- edits use structural sharing and copy only the UI/component/element path that
  changed;
- unchanged components, nested elements, and visual nodes are memoized;
- undo/redo stores immutable UI references in a bounded 50-entry history
  instead of deep-cloning the complete UI for every edit;
- inline typing keeps its draft inside the textarea component, so keystrokes do
  not rerender the Stage;
- repeated `item` rendering reuses the immutable source object rather than
  cloning it per occurrence and render;
- view-only Layers disable Konva hit testing;
- global deck history runs at the debounced autosave boundary and stores
  immutable structurally shared snapshots instead of cloning/stringifying the
  complete deck on every editor commit;
- autosave change detection uses Redux object identity rather than serializing
  the complete presentation merely to compare it.

Costs that remain include redraw of the affected Konva Layer,
selected-element toolbar projection, and request serialization performed by the
API client when autosave executes.

The next performance work should be evidence-driven:

1. Profile initial render, drag-end commit, inline-edit commit, and autosave on a
   large real deck.
2. Split unusually large slides across carefully measured Konva Layers if canvas
   redraw is still a bottleneck after React subtree memoization.
3. Move autosave comparison/persistence to slide-level patches if full-deck
   JSON serialization is measurable.
4. Add browser performance tests before claiming a specific speedup.

The architecture eliminates known redundant work, but “blazing fast” still
requires measurements on representative decks.

## Verification checklist

For a Template V2 slide:

1. Confirm selecting a normal or blank layout immediately creates `slide.ui`.
2. Confirm `V1ContentRender` passes only `slide.ui` plus slide identity to the
   direct renderer.
3. Render text, TextList, table, image, chart, flex, grid, and nested elements.
4. Drag, resize, and rotate both a component and a selected element.
5. Edit text/list/table values and verify their raw source shape is preserved.
6. Insert a palette element and a reusable block.
7. Replace an image and update a chart.
8. Undo/redo, reload, and confirm the saved values remain in `slide.ui`.
9. Confirm the presentation runtime does not create
   `__template_v2_konva_slide__` in `slide.content`.
10. Confirm template previews and the standalone slide editor still work,
    because their adapters were deliberately retained.

## Rules to preserve

1. Treat `slide.ui` as the only Template V2 frontend source of truth.
2. Do not add a renderer-side merge from `slide.content`.
3. Do not convert the whole UI to a canonical `Slide` for presentation display.
4. Preserve unknown raw fields while editing known fields.
5. Keep raw geometry in one coordinate system.
6. Keep preview/editor compatibility code outside the presentation runtime.
7. Persist through `updateSlideUi` and the existing autosave boundary.
8. Benchmark before adding caching complexity.
