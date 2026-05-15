from __future__ import annotations

import argparse
import os
from pathlib import Path
from typing import Sequence

from scripts.demo_cli import DEFAULT_BASE_URL, DEFAULT_NAMESPACE, DEFAULT_TIMEOUT_SECONDS
from scripts.demo_cli import render
from scripts.demo_cli.api_client import ApiError
from scripts.demo_cli.journey import DemoJourney, JourneyAborted
from scripts.demo_cli.state import DemoConfig


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m scripts.demo_cli",
        description="Run the SOLA interactive terminal demo against a live backend.",
    )
    parser.add_argument(
        "--base-url",
        default=os.getenv("SOLA_BASE_URL", DEFAULT_BASE_URL),
        help="Base URL for the running SOLA backend.",
    )
    parser.add_argument(
        "--namespace",
        default=os.getenv("SOLA_DEMO_NAMESPACE", DEFAULT_NAMESPACE),
        help="Deterministic namespace used by explicit demo bootstrap helpers.",
    )
    parser.add_argument(
        "--timeout-seconds",
        type=int,
        default=int(os.getenv("SOLA_DEMO_TIMEOUT_SECONDS", str(DEFAULT_TIMEOUT_SECONDS))),
        help="HTTP timeout for each backend request.",
    )
    parser.add_argument(
        "--transcript-file",
        default=None,
        help="Optional plain-text transcript file for the guided demo session.",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(list(argv) if argv is not None else None)

    config = DemoConfig(
        base_url=args.base_url,
        namespace=args.namespace,
        timeout_seconds=args.timeout_seconds,
        transcript_file=Path(args.transcript_file).resolve() if args.transcript_file else None,
    )

    try:
        DemoJourney(config).run()
        return 0
    except JourneyAborted as error:
        render.section("Demo Stopped")
        render.warning(str(error))
        return 1
    except ApiError as error:
        render.section("Backend Error")
        render.warning(str(error))
        if error.details:
            render.compact_json(
                "Backend Error Details",
                {
                    "status_code": error.status_code,
                    "error_code": error.error_code,
                    "detail": error.detail,
                    "request_id": error.request_id,
                    "details": error.details,
                },
            )
        return 1
    except KeyboardInterrupt:
        render.section("Demo Cancelled")
        render.warning("The interactive demo was cancelled by the operator.")
        return 130
    except Exception as error:  # pragma: no cover - safety net for live demos
        render.section("Unexpected Demo Failure")
        render.warning(str(error))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
