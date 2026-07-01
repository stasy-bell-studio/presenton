from __future__ import annotations

import json
import uuid
from typing import Any

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from models.sql.template_v2 import TemplateV2
from templates.v2.models.layouts import MergedComponents, SlideLayout, SlideLayouts


class TemplateV2ContextStore:
    def __init__(self, sql_session: AsyncSession, template_id: uuid.UUID):
        self._sql_session = sql_session
        self._template_id = template_id
        self._template_cache: TemplateV2 | None = None

    @property
    def template_id(self) -> uuid.UUID:
        return self._template_id

    async def get_template(self) -> TemplateV2:
        if self._template_cache is None:
            template = await self._sql_session.get(TemplateV2, self._template_id)
            if not template:
                raise HTTPException(status_code=404, detail="Template not found")
            self._template_cache = template
        return self._template_cache

    async def get_slide_layouts(self) -> SlideLayouts:
        template = await self.get_template()
        try:
            return self._coerce_slide_layouts(template.layouts)
        except ValidationError as exc:
            raise HTTPException(
                status_code=500,
                detail="Template layouts are invalid",
            ) from exc

    async def get_slide_layout(self, slide_index: int) -> SlideLayout:
        layouts = await self.get_slide_layouts()
        if slide_index < 0 or slide_index >= len(layouts.layouts):
            raise ValueError(f"Invalid slide index: {slide_index}")
        return layouts.layouts[slide_index]

    async def save_slide_layout(
        self,
        *,
        slide_index: int,
        layout: SlideLayout,
    ) -> SlideLayouts:
        template = await self.get_template()
        layouts = await self.get_slide_layouts()
        if slide_index < 0 or slide_index >= len(layouts.layouts):
            raise ValueError(f"Invalid slide index: {slide_index}")

        patched = list(layouts.layouts)
        patched[slide_index] = layout
        updated_layouts = SlideLayouts(layouts=patched)

        template.layouts = updated_layouts.model_dump(mode="json", exclude_none=True)
        self._sql_session.add(template)
        await self._sql_session.commit()
        await self._sql_session.refresh(template)
        self._template_cache = template
        return updated_layouts

    async def get_merged_components(self) -> MergedComponents | None:
        template = await self.get_template()
        if not isinstance(template.merged_components, dict):
            return None
        try:
            return MergedComponents.model_validate(template.merged_components)
        except ValidationError:
            return None

    async def retrieve_context(self, query: str) -> str:
        layouts = await self.get_slide_layouts()
        query_terms = {
            token.strip().lower()
            for token in query.replace("\n", " ").split(" ")
            if len(token.strip()) >= 3
        }
        lines = [f"Template has {len(layouts.layouts)} slide layout(s)."]
        matches: list[str] = []
        for slide_index, layout in enumerate(layouts.layouts):
            haystack = json.dumps(
                layout.model_dump(mode="json", exclude_none=True),
                ensure_ascii=False,
            ).lower()
            title = f"Slide {slide_index + 1}: {layout.id} - {layout.description}"
            if not query_terms or any(term in haystack for term in query_terms):
                matches.append(title)
            if len(matches) >= 6:
                break
        lines.extend(matches)
        return "\n".join(lines)

    @staticmethod
    def _coerce_slide_layouts(layouts_json: Any) -> SlideLayouts:
        if isinstance(layouts_json, SlideLayouts):
            return layouts_json
        if isinstance(layouts_json, list):
            return SlideLayouts.model_validate({"layouts": layouts_json})
        return SlideLayouts.model_validate(layouts_json)
