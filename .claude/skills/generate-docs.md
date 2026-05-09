---
name: generate-docs
description: Generate documentation or reports for a project
---

# Docs Generation Workflow

1. Ask me: "Which project and what type of doc?" Options:
   - API documentation (from controller/route files)
   - Architecture overview (from CLAUDE.md + folder structure)
   - Sprint report (from open-items.md + git log)
   - Deployment runbook (from Dockerfile + pipeline files)
   - CMMI compliance evidence (from audit logs or test files)

2. Read the relevant source files for that project
3. Generate the document in clean Markdown
4. Save it to: ~/obsidian-vault/projects/{name}/{doc-type}-{date}.md
5. Confirm: "Saved to vault. Do you also want this as a Word doc?"
