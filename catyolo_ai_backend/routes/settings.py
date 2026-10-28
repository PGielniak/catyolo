import logging
from dataclasses import dataclass

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from dependencies.auth import require_api_key
from services.settings_service import SettingsService

router = APIRouter(dependencies=[Depends(require_api_key)])


@dataclass
class SettingsRouteConfig:
    logger: logging.Logger
    settings_service: SettingsService


route_config: SettingsRouteConfig = None


def get_settings_route_config():
    return route_config


class VlmEnabledRequest(BaseModel):
    vlm_enabled: bool


@router.get("/vlm")
def get_vlm_enabled(config: SettingsRouteConfig = Depends(get_settings_route_config)):
    return {"vlm_enabled": config.settings_service.get_vlm_enabled()}


@router.post("/vlm")
def set_vlm_enabled(req: VlmEnabledRequest, config: SettingsRouteConfig = Depends(get_settings_route_config)):
    try:
        enabled = config.settings_service.set_vlm_enabled(req.vlm_enabled)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to set vlm_enabled: {str(e)}")
    return {"vlm_enabled": enabled}
