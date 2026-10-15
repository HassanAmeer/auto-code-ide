#!/usr/bin/env python3
import os
import sys
import json
import re
import shutil
import base64

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SKILLS_DIR = os.path.join(ROOT_DIR, ".agents", "skills")
ACTIVE_FILE = os.path.join(SKILLS_DIR, "active.json")

BUILTIN_NAMES = {
    "agent-browser-testing",
    "web-ui-design",
    "web-designer",
    "code-reviewer",
    "git-workflow",
    "contribution-triage",
    "test-t3-app",
}

BUILTIN_TEMPLATES = {
    "agent-browser-testing": """---
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
""",
    "web-ui-design": """---
name: web-ui-design
description: Premium frontend UI/UX design, modern dark mode aesthetics, glassmorphism, responsive typography, and micro-animations.
---

# Web UI Design & Aesthetics Skill

Create stunning, state-of-the-art web interfaces that immediately captivate users with high visual polish, fluid responsiveness, and modern interactive aesthetics.

## Design Principles

1. **Rich & Modern Aesthetics**:
   - Curated, harmonious color palettes (HSL tailored, sleek dark themes, refined accent contrasts).
   - Glassmorphism, subtle backdrops (`backdrop-blur`), and fine border highlights (`border-white/10`).
   - Clean typography using Google Fonts (Inter, Roboto, Outfit, JetBrains Mono) instead of browser defaults.

2. **Responsive Layouts**:
   - Fluid multi-device compatibility (mobile, tablet, desktop viewports).
   - Flexbox and CSS Grid structures that dynamically adapt to screen constraints.

3. **Micro-Interactions & Polish**:
   - Smooth hover states, active transitions, and focus rings.
   - Elegant skeleton loaders, spinners, and informative empty states.
   - Avoid generic, plain HTML buttons or unstyled forms.
""",
    "web-designer": """---
name: web-designer
description: Expert frontend UI/UX designer for modern layouts, responsive design, dark mode aesthetics, and micro-interactions.
---

# Web Designer Skill

Design and refine modern web interfaces that feel premium, interactive, and responsive across devices.

## Design Guidelines

1. **Visual Excellence**: Use cohesive color palettes, subtle borders, polished dark modes, and modern typography.
2. **Responsiveness**: Ensure interfaces look pristine on both mobile viewports and large desktop screens.
3. **Interactive Polish**: Add smooth hover states, micro-animations, loading indicators, and informative tooltips.
4. **Accessibility & Contrast**: Maintain legible text contrast and clear focus indicators for keyboard navigation.
""",
    "code-reviewer": """---
name: code-reviewer
description: Performs rigorous code reviews focusing on code quality, performance, security, and project architecture patterns.
---

# Code Reviewer Skill

Review code systematically before submitting or committing changes.

## Review Principles

1. **Performance & Memory**: Look for unnecessary re-renders, un-memoized heavy calculations, resource leaks, or large loops.
2. **Type Safety**: Strictly avoid `any` and unhandled error cases. Ensure strict TypeScript types.
3. **Simplicity & Cleanliness**: Follow minimal and obvious design patterns. Avoid over-engineering or premature abstraction.
4. **Security**: Validate inputs, sanitize data, avoid arbitrary evaluation, and never expose sensitive keys or credentials.
""",
    "git-workflow": """---
name: git-workflow
description: Enforces clean git commit conventions, conventional commit messages, branch isolation, and safe diff inspections.
---

# Git Workflow Skill

Standard git management practices for pair programming and agent development.

## Commit Conventions

- Use conventional commit formats:
  - `feat(...)`: New features
  - `fix(...)`: Bug fixes
  - `refactor(...)`: Code adjustments without feature changes
  - `perf(...)`: Performance enhancements
  - `test(...)`: Unit tests and fixtures
- Keep commits focused and atomic.
- Inspect `git diff` and `git status` thoroughly before staging or committing.
""",
    "test-t3-app": """---
name: test-t3-app
description: Test T3 Code's web and desktop UI through its built-in Browser panel against isolated development state. Use for browser verification, browser pairing recovery, and test fixtures. Use test-t3-mobile for native mobile verification.
---

# Test T3 web and desktop

Use T3's built-in Browser panel for verification. If its tools are absent or
the panel reports unavailable, explain the blocker and stop verification.
Do not install or switch to another automation system.
"""
}

def ensure_skills_dir():
    os.makedirs(SKILLS_DIR, exist_ok=True)
    if not os.path.exists(ACTIVE_FILE):
        with open(ACTIVE_FILE, "w", encoding="utf-8") as f:
            json.dump(["agent-browser-testing", "web-ui-design", "code-reviewer", "web-designer", "git-workflow"], f, indent=2)

def get_active_list():
    ensure_skills_dir()
    try:
        with open(ACTIVE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, list):
                return set(data)
    except Exception:
        pass
    return set()

def save_active_list(active_set):
    ensure_skills_dir()
    with open(ACTIVE_FILE, "w", encoding="utf-8") as f:
        json.dump(sorted(list(active_set)), f, indent=2)

def list_skills():
    ensure_skills_dir()
    active_set = get_active_list()
    skills = []

    for entry in sorted(os.listdir(SKILLS_DIR)):
        if entry.startswith("."):
            continue
        sub = os.path.join(SKILLS_DIR, entry)
        if not os.path.isdir(sub):
            continue
        skill_file = os.path.join(sub, "SKILL.md")
        if not os.path.exists(skill_file):
            continue

        try:
            with open(skill_file, "r", encoding="utf-8") as f:
                content = f.read()
        except Exception:
            content = ""

        name = entry
        description = ""
        match = re.search(r"^---\s*\n(.*?)\n---", content, re.DOTALL)
        if match:
            fm = match.group(1)
            for line in fm.splitlines():
                if line.startswith("name:"):
                    name = line.split("name:", 1)[1].strip().strip("\"'")
                elif line.startswith("description:"):
                    description = line.split("description:", 1)[1].strip().strip("\"'")

        is_builtin = entry in BUILTIN_NAMES or name in BUILTIN_NAMES

        skills.append({
            "dirName": entry,
            "name": name,
            "description": description or "No description provided.",
            "path": f".agents/skills/{entry}/SKILL.md",
            "fullPath": skill_file,
            "isBuiltin": is_builtin,
            "isActive": entry in active_set,
            "content": content,
        })

    print(json.dumps({"ok": True, "skills": skills}))

def get_skill(dir_name):
    skill_file = os.path.join(SKILLS_DIR, dir_name, "SKILL.md")
    if not os.path.exists(skill_file):
        print(json.dumps({"ok": False, "error": f"Skill not found: {dir_name}"}))
        sys.exit(1)
    with open(skill_file, "r", encoding="utf-8") as f:
        content = f.read()
    print(json.dumps({"ok": True, "content": content}))

def save_skill(dir_name, content_b64):
    ensure_skills_dir()
    raw_content = base64.b64decode(content_b64).decode("utf-8")
    target_dir = os.path.join(SKILLS_DIR, dir_name)
    os.makedirs(target_dir, exist_ok=True)
    skill_file = os.path.join(target_dir, "SKILL.md")
    with open(skill_file, "w", encoding="utf-8") as f:
        f.write(raw_content)
    
    active_set = get_active_list()
    active_set.add(dir_name)
    save_active_list(active_set)

    print(json.dumps({"ok": True, "message": f"Skill {dir_name} saved successfully."}))

def reset_skill(dir_name):
    ensure_skills_dir()
    if dir_name not in BUILTIN_TEMPLATES:
        print(json.dumps({"ok": False, "error": f"No default template for skill: {dir_name}"}))
        sys.exit(1)
    
    target_dir = os.path.join(SKILLS_DIR, dir_name)
    os.makedirs(target_dir, exist_ok=True)
    skill_file = os.path.join(target_dir, "SKILL.md")
    with open(skill_file, "w", encoding="utf-8") as f:
        f.write(BUILTIN_TEMPLATES[dir_name])
    
    print(json.dumps({"ok": True, "message": f"Skill {dir_name} reset to default."}))

def delete_skill(dir_name):
    if dir_name in BUILTIN_NAMES:
        print(json.dumps({"ok": False, "error": f"Cannot delete built-in skill: {dir_name}"}))
        sys.exit(1)

    target_dir = os.path.join(SKILLS_DIR, dir_name)
    if not os.path.exists(target_dir):
        print(json.dumps({"ok": False, "error": f"Skill {dir_name} not found"}))
        sys.exit(1)

    shutil.rmtree(target_dir, ignore_errors=True)
    active_set = get_active_list()
    active_set.discard(dir_name)
    save_active_list(active_set)
    print(json.dumps({"ok": True, "message": f"Skill {dir_name} deleted."}))

def toggle_skill(dir_name, state_str):
    ensure_skills_dir()
    active_set = get_active_list()
    is_active = state_str.lower() in ("1", "true", "yes", "on")
    if is_active:
        active_set.add(dir_name)
    else:
        active_set.discard(dir_name)
    save_active_list(active_set)
    print(json.dumps({"ok": True, "dirName": dir_name, "isActive": is_active}))

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "Missing command"}))
        sys.exit(1)
    
    action = sys.argv[1]
    if action == "list":
        list_skills()
    elif action == "get" and len(sys.argv) >= 3:
        get_skill(sys.argv[2])
    elif action == "save" and len(sys.argv) >= 4:
        save_skill(sys.argv[2], sys.argv[3])
    elif action == "reset" and len(sys.argv) >= 3:
        reset_skill(sys.argv[2])
    elif action == "delete" and len(sys.argv) >= 3:
        delete_skill(sys.argv[2])
    elif action == "toggle" and len(sys.argv) >= 4:
        toggle_skill(sys.argv[2], sys.argv[3])
    else:
        print(json.dumps({"ok": False, "error": f"Invalid arguments for action: {action}"}))
        sys.exit(1)

if __name__ == "__main__":
    main()
