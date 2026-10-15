# Agent Browser Automation & Interactive UI Testing Rule

## Overview

When building, modifying, or debugging web applications, games, or user interfaces inside T3 Code, agents must not simply write code and finish the turn without real runtime verification. T3 Code provides a native collaborative browser toolkit (`preview_*`) that controls a headless Chromium browser instance with live UI streaming and DevTools error capturing.

## Verification Workflow for Web Apps & Games

### 1. Launch & Navigate

- Before concluding a frontend or game task, verify whether the local dev server is running or start it.
- Inspect open preview tabs with `preview_status`.
- If no active tab exists, open one with `preview_open`.
- Navigate to the application target URL (e.g. `http://localhost:<port>` or relative path) using `preview_navigate`.

### 2. Interactive Testing & Game Play

- Test interactive controls (start buttons, inputs, canvas click regions, gameplay loops) using:
  - `preview_click`: Click buttons, links, or canvas elements.
  - `preview_press`: Send keyboard strokes (e.g., arrow keys, Space, Enter) for game controls.
  - `preview_hover`: Check hover effects and dropdowns.
  - `preview_type`: Populate forms and inputs.
- When the agent performs these actions, the web UI live-renders the agent's pointer so the user can see what the agent is testing.

### 3. Capture Snapshots & DevTools Diagnostics

- Call `preview_snapshot` (with `save: true` if visual verification or screenshot proof is needed).
- **Inspect `consoleEntries`:** Check for `error`, `warn`, and uncaught JavaScript exceptions with stack traces.
- **Inspect `networkEntries`:** Check for failed HTTP requests (404, 500, CORS errors).
- **Inspect Accessibility Tree:** Verify interactive elements, buttons, and text are rendered properly.

### 4. Automatic Bug Fixing Loop

- If any red console error, crash, or broken UI state is found in `preview_snapshot`:
  1. Identify the exact file path and line number from the exception stack trace.
  2. Modify the code to resolve the error.
  3. Re-navigate or reload using `preview_navigate` or `preview_open`.
  4. Take another `preview_snapshot` to confirm the error is cleared and the game/app functions as expected.
