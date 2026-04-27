"""Example: capture browser console logs while exercising a Playwright session."""

from playwright.sync_api import sync_playwright

URL = 'http://localhost:5173'  # Replace with your URL

console_logs: list[str] = []

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1920, 'height': 1080})

    def handle_console_message(msg) -> None:
        """Append the console message to the buffer and echo it to stdout."""
        console_logs.append(f"[{msg.type}] {msg.text}")
        print(f"Console: [{msg.type}] {msg.text}")

    page.on("console", handle_console_message)

    # Navigate to page
    page.goto(URL)
    page.wait_for_load_state('networkidle')

    # Interact with the page (triggers console logs)
    page.click('text=Dashboard')
    page.wait_for_timeout(1000)

    browser.close()

# Save console logs to file
with open(
    '/mnt/user-data/outputs/console.log',
    'w',
    encoding='utf-8',
) as f:
    f.write('\n'.join(console_logs))

print(f"\nCaptured {len(console_logs)} console messages")
print("Logs saved to: /mnt/user-data/outputs/console.log")
