---
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
