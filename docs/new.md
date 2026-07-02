## 2. Remove the runtime adapter path

From the Template V2 presentation flow, remove calls to:

- adaptTemplateV2LayoutToSlide
- normalizeTemplateV2Slide
- serializeTemplateV2LayoutFromSlide
- serializeTemplateV2ContentFromSlide
- applyGeneratedSlideContentToLayout
- old normalized slide layout resolver

Changes in editor, to adpot the slide.ui /components/elements.
