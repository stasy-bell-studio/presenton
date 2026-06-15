from typing import List

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from models.ollama_model_status import OllamaModelStatus
from utils.ollama import list_available_ollama_models, pull_ollama_model, get_ollama_library_models

OLLAMA_ROUTER = APIRouter(prefix="/ollama", tags=["Ollama"])


@OLLAMA_ROUTER.get("/models/available", response_model=List[OllamaModelStatus])
async def get_available_models(ollama_url: str | None = None):
    return await list_available_ollama_models(ollama_url)


@OLLAMA_ROUTER.get("/models/library")
async def get_library_models():
    return get_ollama_library_models()


@OLLAMA_ROUTER.post("/models/pull")
async def pull_model(model_name: str, ollama_url: str | None = None):
    return StreamingResponse(
        pull_ollama_model(model_name, ollama_url),
        media_type="text/event-stream",
    )
