---
name: agent-browser-testing
description: Autonomous browser testing, DOM inspection, mouse click simulation, and console error fixing using T3 Code's native collaborative browser.
---

# Agent Browser Testing & Automation Skill

Automate browser testing, play and verify games, inspect DOM layouts, and catch/fix console errors in real time.

## Core Capabilities

1. **Autonomous Browser Control**:
   - Call `preview_status` to inspect active tabs.
   - Call `preview_open` to open or attach to a preview tab.
   - Navigate to targets using `preview_navigate` (e.g. `http://localhost:<port>` or relative paths).

2. **Interactive UI & Gameplay Verification**:
   - `preview_click`: Simulate realistic mouse clicks on buttons, canvas coordinates, or DOM locators.
   - `preview_type`: Populate input fields, textareas, and search boxes.
   - `preview_press`: Trigger keyboard controls (e.g., Space, Enter, Arrow keys) for games and shortcuts.
   - `preview_hover`: Test dropdown menus, tooltips, and hover states.

3. **DevTools Diagnostics & Error Tracking**:
   - Call `preview_snapshot` to capture DOM structure, accessibility tree, and screenshots (`save: true`).
   - Examine `consoleEntries` for JavaScript errors, unhandled exceptions, and warnings.
   - Examine `networkEntries` for failed HTTP calls (404, 500, CORS).

4. **Self-Healing / Bug Fixing Loop**:
   - When a console error or broken UI element is detected:
     1. Locate the responsible file and line from the stack trace.
     2. Edit the code to fix the root cause.
     3. Re-navigate or reload with `preview_navigate`.
     4. Take another `preview_snapshot` to confirm the fix works.
