#!/bin/bash
# Creates or updates the stack, pushes the app image to its ECR repo, then pulls and restarts it on the instance.
# Needs the AWS CLI configured for the target account and region. STACK names the stack (default kittyface).
set -euo pipefail
STACK=${STACK:-kittyface}
cd "$(dirname "$0")/.."

aws cloudformation deploy --template-file deploy/cloudformation.yaml --stack-name "$STACK" \
  --capabilities CAPABILITY_IAM --no-fail-on-empty-changeset
out() { aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
repo=$(out RepositoryUri)
instance=$(out InstanceId)

aws ecr get-login-password | docker login --username AWS --password-stdin "${repo%%/*}"
docker build --platform linux/amd64 -t "$repo:latest" .
docker push "$repo:latest"

# On a fresh instance the SSM agent takes a minute to register, and first-boot setup has to finish before compose runs.
cmd='cloud-init status --wait >/dev/null; export DOCKER_CONFIG=/root/.docker; cd /opt/kittyface && docker compose pull -q && docker compose up -d && docker image prune -f && docker compose ps'
until id=$(aws ssm send-command --instance-ids "$instance" --document-name AWS-RunShellScript \
  --parameters "{\"commands\": [\"$cmd\"]}" --query Command.CommandId --output text 2>/dev/null); do
  echo "waiting for the instance to register with SSM..."
  sleep 15
done
while status=$(aws ssm get-command-invocation --command-id "$id" --instance-id "$instance" --query Status --output text 2>/dev/null || echo Pending)
  [[ $status =~ Pending|InProgress|Delayed ]]; do
  sleep 10
done
aws ssm get-command-invocation --command-id "$id" --instance-id "$instance" --query '[StandardOutputContent, StandardErrorContent]' --output text
[[ $status == Success ]] || { echo "remote command: $status"; exit 1; }
echo "deployed: $(out Url)"
