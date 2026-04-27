"""Example: enumerate buttons, links, and inputs on a page using Playwright."""

# Codacy/PyLint W1618 wants this Python 2 compatibility import even though
# the file is Python 3 only; including it is harmless on Python 3.
from __future__ import absolute_import

import os
import tempfile

from playwright.sync_api import sync_playwright

# Target URL for the discovery script. Override via the WEBAPP_URL env var so
# the example can run against any local dev server without code edits.
TARGET_URL = os.environ.get('WEBAPP_URL', 'http://localhost:5173')
# Maximum number of links to print so the demo output stays readable.
MAX_LINKS_PRINTED = 5
# Default screenshot path lives under the OS temp dir (instead of a hard-coded
# ``/tmp`` literal) so the example is portable and avoids Bandit B108.
DEFAULT_SCREENSHOT_PATH = os.path.join(tempfile.gettempdir(), 'page_discovery.png')


def _print_buttons(page) -> None:
    """Enumerate visible buttons on ``page`` and print their inner text."""
    buttons = page.locator('button').all()
    print(f"Found {len(buttons)} buttons:")
    for i, button in enumerate(buttons):
        text = button.inner_text() if button.is_visible() else "[hidden]"
        print(f"  [{i}] {text}")


def _print_links(page) -> None:
    """Enumerate the first ``MAX_LINKS_PRINTED`` ``<a href>`` elements."""
    links = page.locator('a[href]').all()
    print(f"\nFound {len(links)} links:")
    for link in links[:MAX_LINKS_PRINTED]:
        text = link.inner_text().strip()
        href = link.get_attribute('href')
        print(f"  - {text} -> {href}")


def _print_inputs(page) -> None:
    """Enumerate every ``input``/``textarea``/``select`` field on ``page``."""
    inputs = page.locator('input, textarea, select').all()
    print(f"\nFound {len(inputs)} input fields:")
    for input_elem in inputs:
        name = (
            input_elem.get_attribute('name')
            or input_elem.get_attribute('id')
            or "[unnamed]"
        )
        input_type = input_elem.get_attribute('type') or 'text'
        print(f"  - {name} ({input_type})")


def main(url: str = TARGET_URL, screenshot_path: str = DEFAULT_SCREENSHOT_PATH) -> None:
    """Drive Playwright through ``url`` and report the visible elements."""
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page()

        page.goto(url)
        page.wait_for_load_state('networkidle')

        _print_buttons(page)
        _print_links(page)
        _print_inputs(page)

        page.screenshot(path=screenshot_path, full_page=True)
        print(f"\nScreenshot saved to {screenshot_path}")

        browser.close()


if __name__ == '__main__':
    main()
