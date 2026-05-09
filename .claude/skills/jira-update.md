---
name: jira-update
description: Create or update Jira tasks from current work context
---

# Jira Update Workflow

1. Ask me: "Which project and what did you work on or complete?"
2. Read the project's open-items.md from the Obsidian vault at ~/obsidian-vault/projects/{name}/open-items.md
3. Based on what I describe, draft:
   - Jira ticket title (concise, action-oriented)
   - Description (what, why, acceptance criteria)
   - Suggested type: Bug / Task / Story
   - Suggested priority: High / Medium / Low
4. Show me the draft and ask: "Should I create this in Jira?"
5. If yes, use the Jira MCP tool to create it
6. Update open-items.md to reflect the new status
