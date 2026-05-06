"""Example: drive a static HTML file with Playwright using a file:// URL."""

# Codacy/PyLint W1618 wants this Python 2 compatibility import even though
# the file is Python 3 only; including it is harmless on Python 3.
from __future__ import absolute_import

import os

from playwright.sync_api import sync_playwright

# Default location of the static HTML file the example drives. Override via
# the ``WEBAPP_STATIC_HTML`` env var so the demo can target any local file.
DEFAULT_HTML_FILE = os.environ.get('WEBAPP_STATIC_HTML', 'path/to/your/file.html')
# Default screenshot output directory.
DEFAULT_OUTPUT_DIR = os.environ.get('WEBAPP_OUTPUT_DIR', '/mnt/user-data/outputs')
# Browser viewport used for the screenshots (1080p by default).
VIEWPORT = {'width': 1920, 'height': 1080}
# Idle window after submitting the form, in milliseconds.
POST_SUBMIT_WAIT_MS = 500


def main(html_file: str = DEFAULT_HTML_FILE, output_dir: str = DEFAULT_OUTPUT_DIR) -> None:
    """Open ``html_file`` in Playwright, fill the demo form, and screenshot."""
    html_file_path = os.path.abspath(html_file)
    file_url = f'file://{html_file_path}'
    os.makedirs(output_dir, exist_ok=True)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport=VIEWPORT)

        page.goto(file_url)

        page.screenshot(path=os.path.join(output_dir, 'static_page.png'), full_page=True)

        page.click('text=Click Me')
        page.fill('#name', 'John Doe')
        page.fill('#email', 'john@example.com')

        page.click('button[type="submit"]')
        page.wait_for_timeout(POST_SUBMIT_WAIT_MS)

        page.screenshot(path=os.path.join(output_dir, 'after_submit.png'), full_page=True)

        browser.close()

    print("Static HTML automation completed!")


if __name__ == '__main__':
    main()
