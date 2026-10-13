---
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
