/**
 * @format
 * Backend-agnostic Job dispatch.
 *
 * Every route keeps building a V1Job via buildPipelineJob / the ingestion
 * builders — this module owns HOW that spec becomes a running workload:
 *
 *   JOB_BACKEND=k8s    (default) → Kubernetes batch/v1, unchanged.
 *   JOB_BACKEND=docker           → POST to the compose host's job-runner
 *                                  (JOB_RUNNER_URL), which runs the job as a
 *                                  sibling docker container.
 *
 * The docker translation covers exactly the V1Job features our builders
 * emit: container[0] image/command/env, envFrom secretRefs (mapped to
 * runner env-files), resource limits, activeDeadlineSeconds, labels and
 * annotations. `valueFrom` env entries cannot cross the HTTP boundary —
 * fieldRef job-name resolves to the literal name, secretKeyRef entries
 * resolve from `opts.secretEnv` (the ingestion GITHUB_TOKEN path, where
 * k8s mode creates a per-Job Secret instead).
 */
import type { V1Job } from '@kubernetes/client-node';

import { getBatchApi } from './k8s.js';

export type JobBackend = 'k8s' | 'docker';

export function jobBackend(): JobBackend {
    return process.env['JOB_BACKEND'] === 'docker' ? 'docker' : 'k8s';
}

function runnerUrl(): string {
    const url = process.env['JOB_RUNNER_URL'];
    if (!url) throw new Error('JOB_BACKEND=docker requires JOB_RUNNER_URL');
    return url.replace(/\/$/, '');
}

/** envFrom secretRef name → runner env-file (rendered on the compose host). */
const ENV_FILE_FOR_SECRET: Record<string, string> = {
    'platform-rds-credentials':   'pg',
    'job-strategist-redis-cache': 'strategist-redis',
};

function parseMemoryMi(mem: string | undefined): number {
    if (!mem) return 2048;
    const m = mem.match(/^(\d+)(Mi|Gi)$/);
    if (!m) return 2048;
    return m[2] === 'Gi' ? Number(m[1]) * 1024 : Number(m[1]);
}

function parseCpuMilli(cpu: string | undefined): number {
    if (!cpu) return 1000;
    return cpu.endsWith('m') ? Number(cpu.slice(0, -1)) : Number(cpu) * 1000;
}

export interface DispatchOpts {
    /**
     * Values for env entries the builder expressed as secretKeyRef
     * (docker mode only) — keyed by env var name, e.g. GITHUB_TOKEN.
     * k8s mode ignores this; the caller creates the Secret itself.
     */
    secretEnv?: Record<string, string>;
}

interface RunnerJobStatus {
    name:        string;
    namespace:   string;
    labels:      Record<string, string>;
    annotations: Record<string, string>;
    createdAt:   string;
    state:       'running' | 'succeeded' | 'failed';
    reason?:     string;
    exitCode?:   number;
}

function toRunnerPayload(namespace: string, job: V1Job, opts?: DispatchOpts): Record<string, unknown> {
    const name = job.metadata?.name ?? '';
    const container = job.spec?.template.spec?.containers[0];
    if (!container) throw new Error(`job ${name}: no container in spec`);

    const env: { name: string; value: string }[] = [];
    for (const e of container.env ?? []) {
        if (e.value !== undefined) {
            env.push({ name: e.name, value: e.value });
        } else if (e.valueFrom?.fieldRef?.fieldPath === "metadata.labels['job-name']") {
            env.push({ name: e.name, value: name });
        } else if (e.valueFrom?.secretKeyRef) {
            const injected = opts?.secretEnv?.[e.name];
            if (injected !== undefined) env.push({ name: e.name, value: injected });
            // absent from secretEnv → dropped; matches an optional K8s secret
        }
    }

    const envFiles = (container.envFrom ?? [])
        .map((ref) => ref.secretRef?.name)
        .filter((n): n is string => Boolean(n))
        .map((n) => ENV_FILE_FOR_SECRET[n])
        .filter((n): n is string => Boolean(n));

    return {
        name,
        namespace,
        labels:          job.metadata?.labels ?? {},
        annotations:     job.metadata?.annotations ?? {},
        image:           container.image,
        command:         container.command ?? [],
        env,
        envFiles,
        deadlineSeconds: job.spec?.activeDeadlineSeconds ?? 1800,
        memoryLimitMi:   parseMemoryMi(container.resources?.limits?.['memory'] as string | undefined),
        cpuLimitMilli:   parseCpuMilli(container.resources?.limits?.['cpu'] as string | undefined),
    };
}

async function runnerFetch(path: string, init?: RequestInit): Promise<Response> {
    const res = await fetch(`${runnerUrl()}${path}`, init);
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`job-runner ${init?.method ?? 'GET'} ${path} -> ${res.status}: ${body.slice(0, 300)}`);
    }
    return res;
}

/**
 * Create (start) a Job on the active backend.
 * Docker mode returns a minimal V1Job echo (metadata.name/uid) — enough
 * for every current caller.
 */
export async function dispatchJob(namespace: string, job: V1Job, opts?: DispatchOpts): Promise<V1Job> {
    if (jobBackend() === 'k8s') {
        return getBatchApi().createNamespacedJob({ namespace, body: job });
    }
    await runnerFetch('/v1/jobs', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(toRunnerPayload(namespace, job, opts)),
    });
    return { metadata: { name: job.metadata?.name ?? '', uid: job.metadata?.name ?? '' } };
}

/**
 * List Jobs on the active backend, returned in V1Job shape so read-time
 * reconciliation (github-shared.ts) works unchanged: docker results carry
 * metadata.{labels,annotations,creationTimestamp} and a status.conditions
 * Failed entry with reason DeadlineExceeded|Error when applicable.
 */
export async function listJobs(namespace: string, labelSelector: string): Promise<V1Job[]> {
    if (jobBackend() === 'k8s') {
        const res = await getBatchApi().listNamespacedJob({ namespace, labelSelector });
        return res.items ?? [];
    }
    const res = await runnerFetch(`/v1/jobs?labelSelector=${encodeURIComponent(labelSelector)}`);
    const body = (await res.json()) as { items: RunnerJobStatus[] };
    return body.items
        .filter((j) => j.namespace === namespace)
        .map((j): V1Job => ({
            metadata: {
                name:              j.name,
                labels:            j.labels,
                annotations:       j.annotations,
                creationTimestamp: new Date(j.createdAt),
            },
            status: j.state === 'failed'
                ? { conditions: [{ type: 'Failed', status: 'True', reason: j.reason ?? 'Error' }] }
                : j.state === 'succeeded'
                    ? { conditions: [{ type: 'Complete', status: 'True' }] }
                    : {},
        }));
}

/** Best-effort delete on the active backend (cleanup paths only). */
export async function deleteJob(namespace: string, name: string): Promise<void> {
    if (jobBackend() === 'k8s') {
        await getBatchApi().deleteNamespacedJob({ namespace, name, propagationPolicy: 'Background' });
        return;
    }
    await runnerFetch(`/v1/jobs/${encodeURIComponent(name)}`, { method: 'DELETE' });
}
