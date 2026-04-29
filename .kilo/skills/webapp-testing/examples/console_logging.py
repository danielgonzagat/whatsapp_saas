"""Example: capture browser console logs while exercising a Playwright session."""

# Codacy/PyLint W1618 wants this Python 2 compatibility import even though
# the file is Python 3 only; including it is harmless on Python 3.
from __future__ import absolute_import

import os
from typing import List

from playwright.sync_api import sync_playwright

# Default URL the example points at — override with WEBAPP_URL.
TARGET_URL = os.environ.get('WEBAPP_URL', 'http://localhost:5173')
# Default file the captured console transcript is written to.
DEFAULT_LOG_PATH = os.environ.get(
    'WEBAPP_CONSOLE_LOG_PATH',
    '/mnt/user-data/outputs/console.log',
)
# Browser viewport used when capturing console output (1080p by default).
VIEWPORT = {'width': 1920, 'height': 1080}
# Idle window after the click that triggers console activity (ms).
POST_CLICK_WAIT_MS = 1000


def _capture_console(url: str) -> List[str]:
    """Drive Playwright through ``url`` and return the captured console buffer."""
    console_logs: List[str] = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport=VIEWPORT)

        def handle_console_message(msg) -> None:
            """Append the console message to the buffer and echo it to stdout."""
            console_logs.append(f"[{msg.type}] {msg.text}")
            print(f"Console: [{msg.type}] {msg.text}")

        page.on("console", handle_console_message)

        page.goto(url)
        page.wait_for_load_state('networkidle')

        # Click the Dashboard link to trigger client-side console activity.
        page.click('text=Dashboard')
        page.wait_for_timeout(POST_CLICK_WAIT_MS)

        browser.close()

    return console_logs


def _persist_logs(console_logs: List[str], log_path: str) -> None:
    """Write the captured console transcript to ``log_path``."""
    os.makedirs(os.path.dirname(log_path) or '.', exist_ok=True)
    with open(log_path, 'w', encoding='utf-8') as log_file:
        log_file.write('\n'.join(console_logs))


def main(url: str = TARGET_URL, log_path: str = DEFAULT_LOG_PATH) -> None:
    """Capture console output from ``url`` and persist it under ``log_path``."""
    console_logs = _capture_console(url)
    _persist_logs(console_logs, log_path)
    print(f"\nCaptured {len(console_logs)} console messages")
    print(f"Logs saved to: {log_path}")


if __name__ == '__main__':
    main()
