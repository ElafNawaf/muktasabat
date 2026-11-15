#!/usr/bin/env bash
# Phase B: create/update the CloudFormation stack (service at DesiredCount=0).
set -euo pipefail
TAG=ede13b5
ACCT=$(aws sts get-caller-identity --query Account --output text); REG=$ACCT.dkr.ecr.ap-south-1.amazonaws.com
VPC=$(aws ec2 describe-vpcs --filters Name=is-default,Values=true --query 'Vpcs[0].VpcId' --output text)
SUBNETS=$(aws ec2 describe-subnets --filters Name=default-for-az,Values=true --query 'Subnets[].SubnetId' --output text | tr '\t' ',')
ZONE=$(aws route53 list-hosted-zones-by-name --dns-name muktasabat.com --query 'HostedZones[0].Id' --output text | sed 's#/hostedzone/##')
APPSEC=$(aws secretsmanager describe-secret --secret-id muktasabat/app --query ARN --output text)
ALARM=$(aws secretsmanager get-secret-value --secret-id muktasabat/app --query SecretString --output text | python3 -c 'import json,sys;print(json.load(sys.stdin).get("SUPPORT_EMAIL","").split(",")[0].strip())')
LSCIDR=$(aws ec2 describe-vpc-peering-connections --filters Name=status-code,Values=active --query 'VpcPeeringConnections[0].[AccepterVpcInfo.CidrBlock,RequesterVpcInfo.CidrBlock]' --output text | tr '\t' '\n' | grep -v '^172\.31\.' | head -1)
echo "peered Lightsail CIDR: ${LSCIDR:-unknown}"
aws cloudformation deploy --stack-name muktasabat --template-file infra/aws/stack.yml --capabilities CAPABILITY_IAM \
  --no-fail-on-empty-changeset \
  --parameter-overrides ApiImage=$REG/muktasabat-api:$TAG WebImage=$REG/muktasabat-web:$TAG DesiredCount=0 \
    HostedZoneId=$ZONE VpcId=$VPC SubnetIds=$SUBNETS AppSecretArn=$APPSEC AlarmEmail="$ALARM" LightsailCidr=${LSCIDR:-172.26.0.0/16} \
  || { aws cloudformation describe-stack-events --stack-name muktasabat --max-items 25 --query 'StackEvents[?contains(ResourceStatus,`FAILED`)].[LogicalResourceId,ResourceStatusReason]' --output text; exit 1; }
aws cloudformation describe-stacks --stack-name muktasabat --query 'Stacks[0].[StackStatus,Outputs[?OutputKey!=`DbHost`].[OutputKey,OutputValue]]' --output text
