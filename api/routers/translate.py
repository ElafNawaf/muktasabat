from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from api.deps import CurrentUser
from api.translate import is_configured, translate

router = APIRouter(prefix="/translate", tags=["translate"])

Lang = Literal["en", "ar", "auto"]


class TranslateRequest(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    source: Lang = "auto"
    target: Lang


class TranslateResponse(BaseModel):
    translated_text: str
    # When false, the backend has no Translate region configured and the
    # `translated_text` is just the original input echoed back. The frontend
    # uses this to avoid silently copying English into the Arabic field.
    configured: bool


@router.post("", response_model=TranslateResponse)
def translate_text(payload: TranslateRequest, _user: CurrentUser):
    configured = is_configured()
    out = translate(payload.text, payload.source, payload.target)
    return TranslateResponse(translated_text=out, configured=configured)


@router.get("/status")
def translate_status(_user: CurrentUser):
    """Cheap health check for the Translate integration."""
    return {"configured": is_configured()}
