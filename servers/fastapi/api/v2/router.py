from fastapi import APIRouter

from api.v2.chat.router import CHAT_V2_ROUTER
from api.v2.templates.router import TEMPLATES_V2_ROUTER


API_V2_ROUTER = APIRouter(prefix="/api/v2")

API_V2_ROUTER.include_router(CHAT_V2_ROUTER)
API_V2_ROUTER.include_router(TEMPLATES_V2_ROUTER)
