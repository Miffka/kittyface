import os
import subprocess
import time
from pathlib import Path

import httpx
import pytest

ROOT = Path(__file__).resolve().parents[2]
PORT = 18091
# Own project name, so its own volume; own ports, so a dev stack can keep running.
ENV = os.environ | {"APP_PORT": str(PORT), "DB_PORT": "15433"}


def compose(*args: str) -> None:
    subprocess.run(
        ["docker", "compose", "-p", "kittyface-e2e", *args],
        cwd=ROOT,
        env=ENV,
        check=True,
    )


@pytest.fixture(scope="session")
def base_url():
    """pytest-playwright resolves page.goto("/...") against this."""
    url = f"http://localhost:{PORT}"
    compose("up", "-d", "--build", "--wait")
    try:
        # The app has no healthcheck, so --wait returns before migrations finish.
        deadline = time.monotonic() + 60
        while True:
            try:
                if httpx.get(f"{url}/api/v1/config").is_success:
                    break
            except httpx.TransportError:
                pass
            if time.monotonic() > deadline:
                raise TimeoutError(f"{url} did not come up")
            time.sleep(1)
        yield url
    finally:
        compose("down", "-v")
