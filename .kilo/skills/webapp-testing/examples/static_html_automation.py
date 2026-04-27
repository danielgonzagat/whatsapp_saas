"""Example: drive a static HTML file with Playwright using a file:// URL."""

import os

from playwright.sync_api import sync_playwright

HTML_FILE_PATH = os.path.abspath('path/to/your/file.html')
FILE_URL = f'file://{HTML_FILE_PATH}'

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1920, 'height': 1080})

    # Navigate to local HTML file
    page.goto(FILE_URL)

    # Take screenshot
    page.screenshot(
        path='/mnt/user-data/outputs/static_page.png',
        full_page=True,
    )

    # Interact with elements
    page.click('text=Click Me')
    page.fill('#name', 'John Doe')
    page.fill('#email', 'john@example.com')

    # Submit form
    page.click('button[type="submit"]')
    page.wait_for_timeout(500)

    # Take final screenshot
    page.screenshot(
        path='/mnt/user-data/outputs/after_submit.png',
        full_page=True,
    )

    browser.close()

print("Static HTML automation completed!")
