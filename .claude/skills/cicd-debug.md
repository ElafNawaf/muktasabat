---
name: cicd-debug
description: Debug a failing Tekton pipeline or OpenShift deployment
---

# CI/CD Debug Workflow

1. Ask me: "Which project and what is the error or symptom?"
2. Read the relevant `.tekton/` pipeline files for that project
3. Check the Dockerfile for that project
4. Look for these common failure patterns:
   - Image pull errors → check registry credentials and image tags
   - Resource quota exceeded → check OpenShift namespace limits
   - Failed health checks → check readiness/liveness probe paths
   - Build failures → check base image compatibility
5. Provide: root cause, exact fix with file path, and prevention tip
6. Ask: "Should I apply the fix directly?"
