from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from api.deps import CurrentUser
from api.translate import translate

router = APIRouter(prefix="/translate", tags=["translate"])

Lang = Literal["en", "ar", "auto"]


class TranslateRequest(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    source: Lang = "auto"
    target: Lang


class TranslateResponse(BaseModel):
    translated_text: str


@router.post("", response_model=TranslateResponse)
def translate_text(payload: TranslateRequest, _user: CurrentUser):
    out = translate(payload.text, payload.source, payload.target)
    return TranslateResponse(translated_text=out)
