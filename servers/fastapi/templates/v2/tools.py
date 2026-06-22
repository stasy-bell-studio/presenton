from __future__ import annotations

import asyncio
import mimetypes

from llmai.shared import ImageContentPart, Tool

from services.export_task_service import EXPORT_TASK_SERVICE
from templates.v2.models.layouts import SlideLayout

SLIDE_PREVIEW_WIDTH = 1280
SLIDE_PREVIEW_HEIGHT = 720
PREVIEW_SLIDE_TOOL_NAME = "previewSlide"


class PreviewSlideTool(Tool):
    """LLM tool definition and executor for rendering a candidate slide layout."""

    def __init__(self) -> None:
        super().__init__(
            name=PREVIEW_SLIDE_TOOL_NAME,
            description=(
                "Render a complete SlideLayout to a 1280x720 image for visual review. "
                "Call this once with the full candidate layout before returning the final layout."
            ),
            schema=SlideLayout,
            strict=False,
        )

    def render(self, layout: SlideLayout) -> ImageContentPart:
        components = [
            component.model_dump(mode="json", exclude_none=True)
            for component in layout.components
        ]
        result = asyncio.run(
            EXPORT_TASK_SERVICE.render_json_to_image(
                components,
                SLIDE_PREVIEW_WIDTH,
                SLIDE_PREVIEW_HEIGHT,
            )
        )
        with open(result.path, "rb") as image_file:
            image_data = image_file.read()
        mime_type = mimetypes.guess_type(result.path)[0] or "image/png"
        return ImageContentPart(data=image_data, mime_type=mime_type)


__all__ = [
    "PREVIEW_SLIDE_TOOL_NAME",
    "PreviewSlideTool",
    "SLIDE_PREVIEW_HEIGHT",
    "SLIDE_PREVIEW_WIDTH",
]
