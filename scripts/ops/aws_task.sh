#!/usr/bin/env bash
# Phase C: new images, copy the live database into RDS (test copy), start 1 container
# with background jobs OFF, smoke-test https://new.muktasabat.com. Counts only, no data printed.
set -euo pipefail
R=ap-south-1; ACCT=$(aws sts get-caller-identity --query Account --output text); REG=$ACCT.dkr.ecr.$R.amazonaws.com
TAG=$(git rev-parse --short HEAD)
aws ecr get-login-password | docker login --username AWS --password-stdin $REG >/dev/null 2>&1
echo "== images $TAG"
docker build -q -t $REG/muktasabat-api:$TAG . >/dev/null
docker build -q --build-arg NEXT_PUBLIC_TURNSTILE_SITE_KEY="${TURNSTILE_SITE_KEY:-}" -t $REG/muktasabat-web:$TAG -f web/Dockerfile web/ >/dev/null
docker push -q $REG/muktasabat-api:$TAG >/dev/null; docker push -q $REG/muktasabat-web:$TAG >/dev/null

out() { aws cloudformation describe-stacks --stack-name muktasabat --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
deploy() {
  aws cloudformation deploy --stack-name muktasabat --template-file infra/aws/stack.yml --capabilities CAPABILITY_IAM --no-fail-on-empty-changeset \
    --parameter-overrides ApiImage=$REG/muktasabat-api:$TAG WebImage=$REG/muktasabat-web:$TAG DesiredCount=$1 BackgroundJobs=0 \
      HostedZoneId=UsePreviousValue VpcId=UsePreviousValue SubnetIds=UsePreviousValue AppSecretArn=UsePreviousValue AlarmEmail=UsePreviousValue LightsailCidr=UsePreviousValue 2>/dev/null \
  || aws cloudformation deploy --stack-name muktasabat --template-file infra/aws/stack.yml --capabilities CAPABILITY_IAM --no-fail-on-empty-changeset \
    --parameter-overrides ApiImage=$REG/muktasabat-api:$TAG WebImage=$REG/muktasabat-web:$TAG DesiredCount=$1 BackgroundJobs=0 \
  || { aws cloudformation describe-stack-events --stack-name muktasabat --max-items 30 --query 'StackEvents[?contains(ResourceStatus,`FAILED`)].[LogicalResourceId,ResourceStatusReason]' --output text; exit 1; }
}
echo "== stack (0 tasks, jobs off)"; deploy 0

echo "== database copy (Lightsail -> RDS)"
EXEC=$(out ExecRoleArn); DBSEC=$(out DbSecretArn); SG=$(out TaskSg); DBHOST=$(out DbHost)
APPSEC=$(aws secretsmanager describe-secret --secret-id muktasabat/app --query ARN --output text)
SUBNETS=$(aws ec2 describe-subnets --filters Name=default-for-az,Values=true --query 'Subnets[].SubnetId' --output text | tr '\t' ',')
cat > /tmp/td.json <<JSON
{"family":"muktasabat-dbcopy","requiresCompatibilities":["FARGATE"],"networkMode":"awsvpc","cpu":"512","memory":"1024","executionRoleArn":"$EXEC",
 "containerDefinitions":[{"name":"copy","image":"public.ecr.aws/docker/library/postgres:17-alpine","essential":true,
  "entryPoint":["sh","-c"],
  "command":["set -e; NEW=\"postgresql://\$DB_USER:\$DB_PASS@\$DB_HOST:5432/muktasabat?sslmode=require\"; pg_dump --no-owner --no-privileges -Fc \"\$LEGACY\" -f /tmp/d.dump; echo dump_ok \$(du -h /tmp/d.dump | cut -f1); pg_restore --no-owner --no-privileges --clean --if-exists -d \"\$NEW\" /tmp/d.dump || echo restore_warnings; Q=\"select string_agg(t||'='||n, ' ' order by t) from (select relname t, n_live_tup n from pg_stat_user_tables) x\"; psql \"\$NEW\" -c 'analyze' >/dev/null; psql \"\$LEGACY\" -c 'analyze' >/dev/null 2>&1 || true; for tb in users buildings units contracts payments tenants owners hr_profiles hr_attendance support_tickets; do a=\$(psql -tA \"\$LEGACY\" -c \"select count(*) from \$tb\" 2>/dev/null || echo -); b=\$(psql -tA \"\$NEW\" -c \"select count(*) from \$tb\" 2>/dev/null || echo -); echo \"count \$tb old=\$a new=\$b\"; done; echo tables_old=\$(psql -tA \"\$LEGACY\" -c \"select count(*) from information_schema.tables where table_schema='public'\") tables_new=\$(psql -tA \"\$NEW\" -c \"select count(*) from information_schema.tables where table_schema='public'\"); echo copy_done"],
  "environment":[{"name":"DB_HOST","value":"$DBHOST"}],
  "secrets":[{"name":"LEGACY","valueFrom":"$APPSEC:LEGACY_DATABASE_URL::"},{"name":"DB_USER","valueFrom":"$DBSEC:username::"},{"name":"DB_PASS","valueFrom":"$DBSEC:password::"}],
  "logConfiguration":{"logDriver":"awslogs","options":{"awslogs-group":"/muktasabat/app","awslogs-region":"$R","awslogs-stream-prefix":"dbcopy"}}}]}
JSON
TD=$(aws ecs register-task-definition --cli-input-json file:///tmp/td.json --query taskDefinition.taskDefinitionArn --output text)
T=$(aws ecs run-task --cluster muktasabat --launch-type FARGATE --task-definition $TD \
  --network-configuration "awsvpcConfiguration={subnets=[${SUBNETS}],securityGroups=[$SG],assignPublicIp=ENABLED}" --query 'tasks[0].taskArn' --output text)
aws ecs wait tasks-stopped --cluster muktasabat --tasks $T
aws ecs describe-tasks --cluster muktasabat --tasks $T --query 'tasks[0].[stoppedReason,containers[0].exitCode]' --output text
sleep 5
aws logs filter-log-events --log-group-name /muktasabat/app --log-stream-name-prefix dbcopy/copy/${T##*/} --query 'events[].message' --output text | tr '\t' '\n' | grep -E "dump_ok|restore|count |tables_|copy_done|error|FATAL|could not" | grep -v "^pg_restore: warning" | head -40

echo "== start 1 container (jobs off)"; deploy 1
for i in $(seq 1 20); do c=$(curl -s -o /dev/null -w "%{http_code}" -m 20 https://new.muktasabat.com/ar/login || true); [ "$c" = 200 ] && break; sleep 15; done
for u in /ar/login /en /ar /api/site/settings; do curl -s -o /dev/null -m 30 -w "new.muktasabat.com$u -> %{http_code} %{time_total}s\n" "https://new.muktasabat.com$u"; done
curl -s -m 30 -o /dev/null -w "login (bad creds) -> %{http_code}\n" -X POST -H 'content-type: application/json' -d '{"username":"__check__","password":"x"}' https://new.muktasabat.com/api/auth/login || true
aws ecs describe-services --cluster muktasabat --services muktasabat --query 'services[0].[runningCount,desiredCount,deployments[0].rolloutState]' --output text
aws logs filter-log-events --log-group-name /muktasabat/app --log-stream-name-prefix api --start-time $(( ($(date +%s) - 900) * 1000 )) --query 'events[].message' --output text | tr '\t' '\n' | grep -iE "error|traceback|leader|startup complete" | sed -E 's/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/<email>/g' | tail -15
