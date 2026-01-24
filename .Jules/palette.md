# Palette's Journal

## 2024-05-22 - The Clickable Card Trap
**Learning:** Cards with `onClick` handlers are a common pattern for "clickable tiles", but they often trap keyboard users who cannot tab to or activate them.
**Action:** Always provide a nested, focusable interactive element (like a button on the title) that triggers the same action, ensuring it stops propagation to avoid double-firing.
