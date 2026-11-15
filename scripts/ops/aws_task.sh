#!/usr/bin/env bash
# Read-only inventory before the Fargate migration.
set -u
echo "== identity"; aws sts get-caller-identity --query Arn --output text
echo "== DNS (public NS)"; dig +short NS muktasabat.com; dig +short A muktasabat.com
echo "== Route 53 zones"; aws route53 list-hosted-zones --query 'HostedZones[].[Name,Config.PrivateZone,ResourceRecordSetCount]' --output text
echo "== Lightsail instances"; aws lightsail get-instances --query 'instances[].[name,bundleId,state.name,hardware.ramSizeInGb,location.availabilityZone]' --output text
echo "== Lightsail static IPs"; aws lightsail get-static-ips --query 'staticIps[].[name,ipAddress,attachedTo]' --output text
echo "== Lightsail DNS zones"; aws lightsail get-domains --region us-east-1 --query 'domains[].name' --output text 2>&1 | head -3
echo "== VPCs"; aws ec2 describe-vpcs --query 'Vpcs[].[VpcId,IsDefault,CidrBlock]' --output text
echo "== Default subnets"; aws ec2 describe-subnets --filters Name=default-for-az,Values=true --query 'Subnets[].[SubnetId,AvailabilityZone]' --output text
echo "== ECR"; aws ecr describe-repositories --query 'repositories[].repositoryName' --output text
echo "== ECS clusters"; aws ecs list-clusters --output text
echo "== RDS"; aws rds describe-db-instances --query 'DBInstances[].[DBInstanceIdentifier,DBInstanceClass,Engine,EngineVersion]' --output text
echo "== S3 buckets"; aws s3api list-buckets --query 'Buckets[].Name' --output text
echo "== ACM (ap-south-1)"; aws acm list-certificates --query 'CertificateSummaryList[].[DomainName,Status]' --output text
echo "== SES identities"; aws sesv2 list-email-identities --query 'EmailIdentities[].[IdentityName,SendingEnabled]' --output text 2>&1 | head
echo "== ECS express mode CLI"; aws --version; aws ecs help 2>/dev/null | grep -i -o "create-express-gateway-service\|express[a-z-]*" | sort -u | head
echo "== Server app config (names only)"
if [ -n "${LIGHTSAIL_SSH_KEY:-}" ]; then
  mkdir -p ~/.ssh; printf '%s\n' "$LIGHTSAIL_SSH_KEY" > ~/.ssh/k; chmod 600 ~/.ssh/k
  ssh-keyscan -T 20 -H 13.232.25.224 >> ~/.ssh/known_hosts 2>/dev/null
  ssh -o ConnectTimeout=30 -i ~/.ssh/k ubuntu@13.232.25.224 'cd /home/ubuntu/muktasabat; echo "-- .env keys:"; cut -d= -f1 .env | grep -v "^#" | grep . | sort | tr "\n" " "; echo; echo "-- compose services:"; grep -E "^  [a-z]+:" docker-compose.yml; grep -E "DATABASE_URL" .env | sed -E "s#://[^@]*@#://***@#"; echo "-- db container:"; docker ps -a --format "{{.Names}} {{.Image}}"; echo "-- uploads size:"; du -sh uploads 2>/dev/null; echo "-- caddy:"; cat /etc/caddy/Caddyfile 2>/dev/null | head -30; ls /home/ubuntu/muktasabat'
fi
