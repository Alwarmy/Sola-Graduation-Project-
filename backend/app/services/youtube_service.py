import requests
from typing import Any

from app.core.exceptions import ConfigurationException, ExternalServiceException
from app.core.config import settings

YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"
YOUTUBE_VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos"
YOUTUBE_PLAYLISTS_URL = "https://www.googleapis.com/youtube/v3/playlists"


def _require_youtube_api_key() -> str:
    api_key = (settings.YOUTUBE_API_KEY or "").strip()
    if not api_key:
        raise ConfigurationException(
            "YouTube provider is not configured.",
            error_code="youtube_provider_not_configured",
        )
    return api_key


def _perform_youtube_search(
    query: str,
    content_type: str,
    max_results: int,
) -> dict[str, Any]:
    params = {
        "part": "snippet",
        "q": query,
        "type": content_type,
        "maxResults": max_results,
        "key": _require_youtube_api_key(),
    }

    try:
        response = requests.get(YOUTUBE_SEARCH_URL, params=params, timeout=30)
        response.raise_for_status()
    except requests.RequestException as exc:
        raise ExternalServiceException(
            "YouTube provider request failed.",
            error_code="youtube_provider_request_failed",
            details={"provider": "youtube", "operation": "search"},
        ) from exc

    return response.json()


def _build_youtube_url(content_type: str, external_id: str) -> str:
    if content_type == "video":
        return f"https://www.youtube.com/watch?v={external_id}"

    if content_type == "playlist":
        return f"https://www.youtube.com/playlist?list={external_id}"

    return ""


def _extract_external_id(item: dict[str, Any], content_type: str) -> str | None:
    item_id = item.get("id", {})

    if content_type == "video":
        return item_id.get("videoId")

    if content_type == "playlist":
        return item_id.get("playlistId")

    return None


def _normalize_youtube_item(
    item: dict[str, Any],
    content_type: str,
) -> dict[str, Any] | None:
    snippet = item.get("snippet", {})
    external_id = _extract_external_id(item, content_type)

    if not external_id:
        return None

    return {
        "source": "youtube",
        "external_id": external_id,
        "content_type": content_type,
        "normalized_title": snippet.get("title"),
        "description": snippet.get("description"),
        "channel_title": snippet.get("channelTitle"),
        "published_at": snippet.get("publishedAt"),
        "thumbnail_url": (
            snippet.get("thumbnails", {}).get("high", {}).get("url")
            or snippet.get("thumbnails", {}).get("medium", {}).get("url")
            or snippet.get("thumbnails", {}).get("default", {}).get("url")
        ),
        "url": _build_youtube_url(content_type, external_id),
        "raw_data": item,
    }


def search_youtube_content(
    query: str,
    max_results_per_type: int = 10,
) -> list[dict[str, Any]]:
    normalized_results: list[dict[str, Any]] = []

    for content_type in ["video", "playlist"]:
        raw_response = _perform_youtube_search(
            query=query,
            content_type=content_type,
            max_results=max_results_per_type,
        )

        for item in raw_response.get("items", []):
            normalized_item = _normalize_youtube_item(item, content_type)

            if normalized_item:
                normalized_results.append(normalized_item)

    return normalized_results


def get_video_details(video_ids: list[str]) -> dict[str, dict[str, Any]]:
    if not video_ids:
        return {}

    params = {
        "part": "contentDetails,snippet,statistics",
        "id": ",".join(video_ids),
        "key": _require_youtube_api_key(),
    }

    try:
        response = requests.get(YOUTUBE_VIDEOS_URL, params=params, timeout=30)
        response.raise_for_status()
    except requests.RequestException as exc:
        raise ExternalServiceException(
            "YouTube provider request failed.",
            error_code="youtube_provider_request_failed",
            details={"provider": "youtube", "operation": "video_details"},
        ) from exc

    items = response.json().get("items", [])
    return {item["id"]: item for item in items}


def get_playlist_details(playlist_ids: list[str]) -> dict[str, dict[str, Any]]:
    if not playlist_ids:
        return {}

    params = {
        "part": "contentDetails,snippet",
        "id": ",".join(playlist_ids),
        "key": _require_youtube_api_key(),
    }

    try:
        response = requests.get(YOUTUBE_PLAYLISTS_URL, params=params, timeout=30)
        response.raise_for_status()
    except requests.RequestException as exc:
        raise ExternalServiceException(
            "YouTube provider request failed.",
            error_code="youtube_provider_request_failed",
            details={"provider": "youtube", "operation": "playlist_details"},
        ) from exc

    items = response.json().get("items", [])
    return {item["id"]: item for item in items}
