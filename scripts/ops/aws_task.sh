#!/usr/bin/env bash
# SES: enable account-level suppression and resubmit the production-access request (ap-south-1).
set -euo pipefail
R=ap-south-1
aws sesv2 put-account-suppression-attributes --region $R --suppressed-reasons BOUNCE COMPLAINT
aws sesv2 put-account-details --region $R --mail-type TRANSACTIONAL --website-url https://muktasabat.com \
  --use-case-description file://scripts/ops/ses_usecase.txt --contact-language EN --production-access-enabled
aws sesv2 get-account --region $R --query '{prod:ProductionAccessEnabled,review:Details.ReviewDetails.Status,case:Details.ReviewDetails.CaseId,suppression:SuppressionAttributes.SuppressedReasons}' --output json
