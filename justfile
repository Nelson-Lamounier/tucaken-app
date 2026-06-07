# tucaken-app — task runner
# Usage: just <recipe>  (install just: brew install just)

set dotenv-load := true

# ── Dev RDS connection (overridable) ──────────────────────────────────────────
aws_profile  := "dev-account"
aws_region   := "eu-west-1"
rds_instance := "k8s-dev-platform-rds"
rds_secret   := "k8s-development/platform-rds/credentials"
rds_db       := "tucaken"
rds_port     := "15432"

# ── Default ───────────────────────────────────────────────────────────────────

[private]
default:
    @just --list --unsorted

# ── Development ───────────────────────────────────────────────────────────────

# Start Vite dev server on :5001
dev:
    yarn dev

# Dev server with fake auth + mocked admin-api (no Cognito/RDS) — for /onboarding UI work
dev-mock:
    MOCK_AUTH=true VITE_MOCK_AUTH=true yarn dev

# Type-check without emitting
typecheck:
    yarn typecheck

# Run ESLint
lint:
    yarn lint

# Run test suite
test:
    yarn test

# Run tests in watch mode
test-watch:
    npx vitest

# ── Build ─────────────────────────────────────────────────────────────────────

# Production build (Vite + esbuild server bundle)
build:
    yarn build

# Preview production build locally
preview:
    yarn preview

# ── Local Docker ──────────────────────────────────────────────────────────────

# Build image and start tucaken-app container (requires admin-api running)
local:
    npx tsx scripts/local-dev.ts

# Start container using cached image — skip Docker build
local-fast:
    npx tsx scripts/local-dev.ts --no-rebuild

# Start container and tail logs
local-logs:
    npx tsx scripts/local-dev.ts --logs

# Stop and remove the local container
local-stop:
    npx tsx scripts/local-dev.ts --stop

# Build image and start container wired to the dev cluster via kubectl port-forward
local-cluster:
    npx tsx scripts/local-dev.ts --cluster

# Same but skip Docker build (use cached image)
local-cluster-fast:
    npx tsx scripts/local-dev.ts --cluster --no-rebuild

# Cluster mode + tail logs
local-cluster-logs:
    npx tsx scripts/local-dev.ts --cluster --logs

# Stop container and kill the port-forward
local-cluster-stop:
    npx tsx scripts/local-dev.ts --cluster --stop

# ── CI Smoke Test ─────────────────────────────────────────────────────────────

# Build image and run the Docker smoke test (mirrors ci.yml docker-build job)
smoke-test:
    #!/usr/bin/env bash
    set -euo pipefail
    TAG="tucaken-app:ci-test"
    CONTAINER="test-container"

    fail() {
        echo "==> Container logs:"
        docker logs "$CONTAINER" 2>&1 || true
        docker rm -f "$CONTAINER" 2>/dev/null || true
        exit 1
    }
    trap 'docker rm -f "$CONTAINER" 2>/dev/null || true' EXIT

    echo "==> Building $TAG …"
    docker build -t "$TAG" .

    echo "==> Starting container …"
    docker run -d --name "$CONTAINER" -p 5001:5001 "$TAG"

    echo "==> Waiting for server …"
    for i in $(seq 1 30); do
        if curl -sf --max-time 2 http://localhost:5001/sign-in > /dev/null 2>&1; then
            echo "Server ready (attempt $i)"
            break
        fi
        if [ "$i" -eq 30 ]; then
            echo "ERROR: server did not start within 30s"
            fail
        fi
        sleep 1
    done

    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:5001/sign-in || echo "curl_error_$?")
    if [[ "$HTTP_CODE" =~ ^[0-9]+$ ]] && [ "$HTTP_CODE" -lt 500 ]; then
        echo "PASS — /sign-in returned $HTTP_CODE"
    else
        echo "FAIL — /sign-in returned '$HTTP_CODE' (expected HTTP < 500)"
        fail
    fi

# Same but skip the Docker build (use cached image)
smoke-test-fast:
    #!/usr/bin/env bash
    set -euo pipefail
    CONTAINER="test-container"

    fail() {
        echo "==> Container logs:"
        docker logs "$CONTAINER" 2>&1 || true
        docker rm -f "$CONTAINER" 2>/dev/null || true
        exit 1
    }
    trap 'docker rm -f "$CONTAINER" 2>/dev/null || true' EXIT

    echo "==> Starting container (cached image) …"
    docker run -d --name "$CONTAINER" -p 5001:5001 tucaken-app:ci-test

    echo "==> Waiting for server …"
    for i in $(seq 1 30); do
        if curl -sf --max-time 2 http://localhost:5001/sign-in > /dev/null 2>&1; then
            echo "Server ready (attempt $i)"
            break
        fi
        if [ "$i" -eq 30 ]; then
            echo "ERROR: server did not start within 30s"
            fail
        fi
        sleep 1
    done

    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:5001/sign-in || echo "curl_error_$?")
    if [[ "$HTTP_CODE" =~ ^[0-9]+$ ]] && [ "$HTTP_CODE" -lt 500 ]; then
        echo "PASS — /sign-in returned $HTTP_CODE"
    else
        echo "FAIL — /sign-in returned '$HTTP_CODE' (expected HTTP < 500)"
        fail
    fi

# ── Test User ─────────────────────────────────────────────────────────────────

# Create a role=user test account in Cognito (run once; credentials saved to .env.local)
create-test-user:
    npx tsx scripts/create-test-user.ts

# Interactively pick a test user (from RDS + Cognito) and wipe them from both
# Pass flags through: just reset-test-user --email=foo@bar.com --yes
reset-test-user *ARGS:
    npx tsx scripts/reset-test-user.ts {{ARGS}}

# ── Dev RDS / Coaching content ────────────────────────────────────────────────
# Private RDS reached via an SSM port-forward through any Online cluster node.
# The node + RDS endpoint are discovered at run time (node ids recycle), so no
# instance id is hard-coded. Requires: aws cli, session-manager-plugin, psql.

# Open an SSM tunnel to RDS on localhost:{{rds_port}} (foreground — Ctrl-C to stop)
rds-tunnel:
    #!/usr/bin/env bash
    set -euo pipefail
    export AWS_PROFILE={{aws_profile}} AWS_REGION={{aws_region}}
    host=$(aws rds describe-db-instances --db-instance-identifier {{rds_instance}} \
        --query 'DBInstances[0].Endpoint.Address' --output text)
    target=$(aws ssm describe-instance-information \
        --query 'InstanceInformationList[?PingStatus==`Online`]|[0].InstanceId' --output text)
    [ -n "$target" ] && [ "$target" != "None" ] || { echo "No Online SSM node found" >&2; exit 1; }
    params=$(printf '{"host":["%s"],"portNumber":["5432"],"localPortNumber":["%s"]}' "$host" "{{rds_port}}")
    echo "==> Tunnel localhost:{{rds_port}} -> $host:5432 via $target  (Ctrl-C to stop)"
    exec aws ssm start-session --target "$target" \
        --document-name AWS-StartPortForwardingSessionToRemoteHost --parameters "$params"

# Print the RDS master password from Secrets Manager (used by the recipes below)
rds-password:
    @AWS_PROFILE={{aws_profile}} AWS_REGION={{aws_region}} aws secretsmanager get-secret-value \
        --secret-id {{rds_secret}} --query SecretString --output text \
        | python3 -c "import sys,json;print(json.load(sys.stdin)['password'])"

# Interactive psql against an already-open tunnel. Pass args: just rds-psql -c "select 1"
rds-psql *ARGS:
    #!/usr/bin/env bash
    set -euo pipefail
    export PGPASSWORD=$(just rds-password)
    exec psql -h 127.0.0.1 -p {{rds_port}} -U postgres -d {{rds_db}} {{ARGS}}

# List coaching rows (stage + when generated). Self-contained tunnel.
coaching-list:
    @just _rds-query "select stage_type, generated_at from coaching_content order by generated_at desc nulls last;"

# Pretty-print the full coach response for a stage to stdout. Self-contained tunnel.
# Stages: technical|phone-screen|behavioural|system-design|bar-raiser|final
coaching-show stage="technical":
    @just _rds-query "select jsonb_pretty(topics_to_study) from coaching_content where stage_type='{{stage}}';"

# Export every coaching row for a stage into the repo, versioned per user:
#   coaching-exports/<stage>/<userId>/<applicationId>/vNNN.json (+ latest.json)
# A new version is written only when the row's data changed since the last export.
# Stages: technical|phone-screen|behavioural|system-design|bar-raiser|final
coaching stage="technical":
    #!/usr/bin/env bash
    set -uo pipefail
    read -r -d '' SQL <<'EOF' || true
    select jsonb_build_object(
        'userId', ja.user_id,
        'applicationId', cc.job_application_id,
        'stageType', cc.stage_type,
        'generatedAt', cc.generated_at,
        'sourceChunkIds', to_jsonb(cc.source_chunk_ids),
        'topicsToStudy', cc.topics_to_study,
        'expectedQuestions', cc.expected_questions,
        'personalHighlights', cc.personal_highlights)
    from coaching_content cc
    join job_applications ja on ja.id = cc.job_application_id
    where cc.stage_type = '{{stage}}';
    EOF
    rows="$(just _rds-query "$SQL")" || { echo "query failed" >&2; exit 1; }
    [ -n "$rows" ] || { echo "No coaching rows for stage '{{stage}}'"; exit 0; }
    printf '%s\n' "$rows" | STAGE="{{stage}}" BASE="{{justfile_directory()}}/coaching-exports" \
        python3 {{justfile_directory()}}/scripts/export-coaching.py

# Export the Research Agent output (pipeline_runs.metadata.research) into the repo,
# versioned per user — this feeds the UI's "Topics likely to come up" section:
#   research-exports/<userId>/<applicationId>/vNNN.json (+ latest.json)
# Exports the latest complete strategist run per application. Pass an application
# id to scope to one app; omit to export all. New version only on changed data.
research appid="":
    #!/usr/bin/env bash
    set -uo pipefail
    read -r -d '' SQL <<'EOF' || true
    select jsonb_build_object(
        'userId', ja.user_id,
        'applicationId', ja.id,
        'runId', pr.id,
        'pipelineType', pr.pipeline_type,
        'generatedAt', pr.created_at,
        'research', pr.metadata->'research')
    from job_applications ja
    join lateral (
        select id, created_at, metadata, pipeline_type
        from pipeline_runs
        where reference_id = ja.id::text and pipeline_type = 'strategist'
          and status = 'complete' and metadata ? 'research'
        order by created_at desc
        limit 1
    ) pr on true
    where ('{{appid}}' = '' or ja.id::text = '{{appid}}');
    EOF
    rows="$(just _rds-query "$SQL")" || { echo "query failed" >&2; exit 1; }
    [ -n "$rows" ] || { echo "No research runs found${appid:+ for app '{{appid}}'}"; exit 0; }
    printf '%s\n' "$rows" | BASE="{{justfile_directory()}}/research-exports" \
        python3 {{justfile_directory()}}/scripts/export-coaching.py

# Dump the entire row (all jsonb columns) for a stage to a JSON file; prints the path.
coaching-dump stage="technical":
    #!/usr/bin/env bash
    set -euo pipefail
    out="/tmp/coaching_{{stage}}_row.json"
    just _rds-query "select jsonb_pretty(jsonb_build_object('id',id,'job_application_id',job_application_id,'stage_type',stage_type,'generated_at',generated_at,'source_chunk_ids',to_jsonb(source_chunk_ids),'topics_to_study',topics_to_study,'expected_questions',expected_questions,'personal_highlights',personal_highlights)) from coaching_content where stage_type='{{stage}}';" > "$out"
    echo "==> Wrote $(wc -c < "$out" | tr -d ' ') bytes to $out"

# Inspect ingested chunks (document_embeddings): content + metadata + embedding.
# This is the RAW data the Research Agent retrieves over. Filter by repo substring.
#   just kb-chunks            (latest 5, all repos)
#   just kb-chunks cdk 10     (latest 10 from repos matching "cdk")
kb-chunks repo="" limit="5":
    @just _rds-query "select jsonb_pretty(jsonb_build_object('repo',repo_full_name,'file',file_path,'heading',heading,'chunk',chunk_index||'/'||total_chunks,'fileType',file_type,'tags',to_jsonb(tags),'skills',to_jsonb(skills),'technologies',to_jsonb(technologies),'enrichment',metadata->>'enrichment_status','chars',length(content),'embeddingDims',vector_dims(embedding),'preview',left(content,400))) from document_embeddings where ('{{repo}}' = '' or repo_full_name ilike '%{{repo}}%') order by last_synced_at desc limit {{limit}};"

# KB composition by file type — what kinds of data are embedded.
kb-types:
    @just _rds-query "select file_type, count(*) as chunks, count(distinct file_path) as files, count(*) filter (where metadata->>'enrichment_status' = 'ok') as enriched from document_embeddings group by file_type order by chunks desc;"

# Dump full ingested chunks for a repo to a JSON file (content + metadata, embedding dims only).
kb-chunks-export repo="":
    #!/usr/bin/env bash
    set -uo pipefail
    out="/tmp/kb_chunks${repo:+_{{repo}}}.json"
    just _rds-query "select jsonb_pretty(jsonb_agg(jsonb_build_object('repo',repo_full_name,'file',file_path,'heading',heading,'chunkIndex',chunk_index,'totalChunks',total_chunks,'fileType',file_type,'tags',to_jsonb(tags),'skills',to_jsonb(skills),'technologies',to_jsonb(technologies),'metadata',metadata,'contentHash',content_hash,'embeddingDims',vector_dims(embedding),'content',content) order by repo_full_name, file_path, chunk_index)) from document_embeddings where ('{{repo}}' = '' or repo_full_name ilike '%{{repo}}%');" > "$out"
    echo "==> Wrote $(wc -c < "$out" | tr -d ' ') bytes to $out"

# Open a tunnel, run one SQL statement (-X -t -A), then close the tunnel. Internal.
[private]
_rds-query SQL:
    #!/usr/bin/env bash
    set -uo pipefail
    export AWS_PROFILE={{aws_profile}} AWS_REGION={{aws_region}}
    host=$(aws rds describe-db-instances --db-instance-identifier {{rds_instance}} \
        --query 'DBInstances[0].Endpoint.Address' --output text) || { echo "rds describe failed" >&2; exit 1; }
    target=$(aws ssm describe-instance-information \
        --query 'InstanceInformationList[?PingStatus==`Online`]|[0].InstanceId' --output text) || { echo "ssm describe failed" >&2; exit 1; }
    [ -n "$target" ] && [ "$target" != "None" ] || { echo "No Online SSM node found" >&2; exit 1; }
    params=$(printf '{"host":["%s"],"portNumber":["5432"],"localPortNumber":["%s"]}' "$host" "{{rds_port}}")
    aws ssm start-session --target "$target" \
        --document-name AWS-StartPortForwardingSessionToRemoteHost --parameters "$params" >/dev/null 2>&1 &
    tunnel=$!
    # Tear down the aws process AND its session-manager-plugin child. The plugin
    # reparents away from $tunnel, so also match it by our unique local port.
    cleanup() { kill "$tunnel" 2>/dev/null; pkill -P "$tunnel" 2>/dev/null; pkill -f "localPortNumber.*{{rds_port}}" 2>/dev/null; return 0; }
    trap cleanup EXIT
    ready=0
    for _ in $(seq 1 40); do
        if nc -z 127.0.0.1 {{rds_port}} 2>/dev/null; then ready=1; break; fi
        sleep 0.5
    done
    [ "$ready" = 1 ] || { echo "tunnel did not open on {{rds_port}} within 20s" >&2; exit 1; }
    export PGPASSWORD=$(aws secretsmanager get-secret-value --secret-id {{rds_secret}} \
        --query SecretString --output text | python3 -c "import sys,json;print(json.load(sys.stdin)['password'])")
    psql -h 127.0.0.1 -p {{rds_port}} -U postgres -d {{rds_db}} -X -t -A -c "{{SQL}}"
    exit $?

# ── AWS / Cognito Setup ───────────────────────────────────────────────────────

# Configure Google + GitHub sign-in in Cognito (interactive, uses dev-account profile)
setup-cognito:
    yarn setup:cognito

# Same but pass explicit region and pool id
setup-cognito-explicit region pool_id:
    npx tsx scripts/setup-cognito-providers.ts --region {{region}} --pool-id {{pool_id}}

# Enable ALLOW_USER_PASSWORD_AUTH on the Cognito App Client (required for email/password sign-in)
enable-password-auth:
    npx tsx scripts/enable-password-auth.ts

# Add production domain to Cognito App Client callback + logout URL allowlist
update-cognito-prod:
    yarn update:cognito-prod

# Pass explicit app URL (e.g. just update-cognito-prod-url https://tucaken.io)
update-cognito-prod-url app_url:
    npx tsx scripts/update-cognito-prod.ts --app-url {{app_url}}

# Same but skip discovery prompts
update-cognito-prod-explicit region pool_id client_id:
    npx tsx scripts/update-cognito-prod.ts --region {{region}} --pool-id {{pool_id}} --client-id {{client_id}}
