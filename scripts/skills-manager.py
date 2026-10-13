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
    "code-reviewer",
    "web-designer",
    "git-workflow",
    "contribution-triage",
    "test-t3-app",
}

def ensure_skills_dir():
    os.makedirs(SKILLS_DIR, exist_ok=True)
    if not os.path.exists(ACTIVE_FILE):
        with open(ACTIVE_FILE, "w", encoding="utf-8") as f:
            json.dump(["code-reviewer", "web-designer", "git-workflow"], f, indent=2)

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
    
    # Auto-activate newly created skill
    active_set = get_active_list()
    active_set.add(dir_name)
    save_active_list(active_set)

    print(json.dumps({"ok": True, "message": f"Skill {dir_name} saved successfully."}))

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
    elif action == "delete" and len(sys.argv) >= 3:
        delete_skill(sys.argv[2])
    elif action == "toggle" and len(sys.argv) >= 4:
        toggle_skill(sys.argv[2], sys.argv[3])
    else:
        print(json.dumps({"ok": False, "error": f"Invalid arguments for action: {action}"}))
        sys.exit(1)

if __name__ == "__main__":
    main()
