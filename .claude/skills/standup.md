---
name: standup
description: Morning standup — status across all 6 projects
---

# Daily Standup Workflow

1. Read open-items.md for all 6 projects from the vault at ~/obsidian-vault/projects/
2. Run `git log --since="24 hours ago" --all --oneline` to see yesterday's commits
3. Check `.tekton/` for any recent pipeline changes across projects
4. Produce a standup table:

| Project      | Status | Done Yesterday | Today's Focus | Blockers |
|--------------|--------|----------------|---------------|----------|
| ALLM         | ...    | ...            | ...           | ...      |
| Rased        | ...    | ...            | ...           | ...      |
| Nawras       | ...    | ...            | ...           | ...      |
| Roaa         | ...    | ...            | ...           | ...      |
| Three Thirty | ...    | ...            | ...           | ...      |
| Mubtakar     | ...    | ...            | ...           | ...      |

5. Ask: "Which project do you want to focus on first?"
