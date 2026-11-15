#!/usr/bin/env bash
# Read-only: SES production-access status in every region we might use.
set -u
echo "== SES_REGION used by the live app"; mkdir -p ~/.ssh; printf '%s\n' "$LIGHTSAIL_SSH_KEY" > ~/.ssh/k; chmod 600 ~/.ssh/k
ssh-keyscan -T 20 -H 13.232.25.224 >> ~/.ssh/known_hosts 2>/dev/null
ssh -i ~/.ssh/k ubuntu@13.232.25.224 'grep -E "^SES_REGION=" /home/ubuntu/muktasabat/.env'
for r in ap-south-1 us-east-1 eu-west-1 me-south-1 me-central-1; do
  echo "== $r"
  aws sesv2 get-account --region $r --query '{prod:ProductionAccessEnabled,sending:SendingEnabled,status:EnforcementStatus,quota:SendQuota.Max24HourSend,sent24h:SendQuota.SentLast24Hours,review:Details.ReviewDetails.Status,case:Details.ReviewDetails.CaseId,mailType:Details.MailType,url:Details.WebsiteURL,usecase:Details.UseCaseDescription}' --output json 2>&1 | head -20
done
echo "== identities ap-south-1"; aws sesv2 list-email-identities --region ap-south-1 --query 'EmailIdentities[].[IdentityType,SendingEnabled,VerificationStatus]' --output text
echo "== domain status"; aws sesv2 get-email-identity --region ap-south-1 --email-identity muktasabat.com --query '{verified:VerifiedForSendingStatus,dkim:DkimAttributes.Status,mailfrom:MailFromAttributes.MailFromDomainStatus}' --output json
