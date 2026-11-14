#!/bin/bash
# Read-only: what is deployed right now.
cat /home/ubuntu/muktasabat/.last_deployed_sha 2>/dev/null; docker ps --format '{{.Names}} {{.Image}} {{.Status}}'
