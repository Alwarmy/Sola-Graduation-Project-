from __future__ import annotations

from fastapi import Request

from app.core.config import get_settings


def resolve_client_ip(request: Request) -> str:
    settings = get_settings()
    trusted_proxy_depth = settings.TRUSTED_PROXY_DEPTH
    client = request.client
    socket_peer = client.host if client and client.host else "unknown"

    if trusted_proxy_depth > 0:
        forwarded_for = request.headers.get("X-Forwarded-For", "")
        forwarded_hops = [value.strip() for value in forwarded_for.split(",") if value.strip()]
        if forwarded_hops:
            if len(forwarded_hops) < trusted_proxy_depth:
                return socket_peer
            if len(forwarded_hops) > trusted_proxy_depth:
                return forwarded_hops[-(trusted_proxy_depth + 1)]
            return forwarded_hops[0]

    return socket_peer
