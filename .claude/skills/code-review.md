---
name: code-review
description: Review code changes in a project before committing
---

# Code Review Workflow

1. Ask me: "Which project and which files or feature should I review?"
2. Read the project's CLAUDE.md for stack-specific rules
3. Run: `git diff HEAD` or read the files I specify
4. Review for:
   - Security issues (SQL injection, exposed secrets, auth gaps)
   - Performance (query efficiency, unnecessary loops, memory leaks)
   - OpenShift compatibility (resource limits, env var usage, health probes)
   - Code style consistency with existing patterns
5. Output a review table:

| File | Line | Severity | Issue | Suggested Fix |
|------|------|----------|-------|---------------|

6. Ask: "Should I apply any of these fixes directly?"
