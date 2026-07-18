/**
 * @format
 * GitHub App authentication helpers.
 *
 * Generates short-lived installation tokens used by the ingestion K8s Job.
 * The App's private key never leaves this process — only the derived token
 * (valid 1 hour) is injected into the Job spec as GITHUB_TOKEN.
 *
 * JWT flow (RFC 7519 + GitHub App spec):
 *   1. Sign a 10-minute JWT with the App private key (RS256)
 *   2. POST /app/installations/{id}/access_tokens with the JWT as Bearer
 *   3. Use the returned token as GITHUB_TOKEN for API or ingestion calls
 *
 * All GitHub API calls use the same raw HTTPS helper as GitHubAdapter to keep
 * the network layer consistent.
 */

import { createPrivateKey } from 'node:crypto';
import https from 'node:https';

import { SignJWT, importPKCS8 } from 'jose';

// =============================================================================
// INTERNAL TYPES
// =============================================================================

interface GitHubInstallationResponse {
    id:          number;
    account:     { id: number; login: string; avatar_url: string };
    app_slug:    string;
    target_type: string;
}

interface GitHubAccessTokenResponse {
    token:      string;
    expires_at: string;
}

interface GitHubRepoListResponse {
    total_count:  number;
    repositories: GitHubRawRepo[];
}

export interface GitHubRawRepo {
    id:             number;
    full_name:      string;
    owner:          { login: string };
    name:           string;
    default_branch: string;
    private:        boolean;
    updated_at:     string;
}

// =============================================================================
// JWT GENERATION
// =============================================================================

/**
 * Generate a GitHub App JWT valid for up to 10 minutes.
 * Issued 60 seconds in the past to absorb clock skew between this server
 * and GitHub's auth endpoint.
 */
export async function generateAppJwt(appId: string, privateKeyPem: string): Promise<string> {
    // GitHub App keys are PKCS#1; jose requires PKCS#8 — normalise via Node crypto
    const pkcs8Pem = createPrivateKey(privateKeyPem)
        .export({ type: 'pkcs8', format: 'pem' }) as string;
    const privateKey = await importPKCS8(pkcs8Pem, 'RS256');
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({})
        .setProtectedHeader({ alg: 'RS256' })
        .setIssuer(appId)
        .setIssuedAt(now - 60)
        .setExpirationTime(now + 600)
        .sign(privateKey);
}

// =============================================================================
// INSTALLATION TOKEN
// =============================================================================

/**
 * Exchange a GitHub App JWT for a short-lived installation access token.
 * The token is scoped to repos the App is installed on for this installation.
 * Lifespan: 1 hour. Never stored — generated per Job dispatch.
 */
export async function generateInstallationToken(
    appId: string,
    privateKeyPem: string,
    installationId: string,
): Promise<string> {
    const jwt  = await generateAppJwt(appId, privateKeyPem);
    const data = await githubRequest<GitHubAccessTokenResponse>(
        'POST',
        `/app/installations/${installationId}/access_tokens`,
        jwt,
    );
    return data.token;
}

// =============================================================================
// INSTALLATION INFO
// =============================================================================

/**
 * Fetch installation metadata (account login, avatar) using the App JWT.
 * Called when a user first connects their GitHub account.
 */
export async function getInstallationInfo(
    appId: string,
    privateKeyPem: string,
    installationId: string,
): Promise<{ accountId: string; accountLogin: string; accountAvatarUrl: string }> {
    const jwt  = await generateAppJwt(appId, privateKeyPem);
    const data = await githubRequest<GitHubInstallationResponse>(
        'GET',
        `/app/installations/${installationId}`,
        jwt,
    );
    return {
        accountId:         String(data.account.id),
        accountLogin:      data.account.login,
        accountAvatarUrl:  data.account.avatar_url,
    };
}

// =============================================================================
// REPO LISTING
// =============================================================================

/**
 * List all repositories accessible to an installation.
 * Uses the installation token (not the App JWT) — called after
 * generateInstallationToken().
 *
 * GitHub caps the response at 100 repos per page. For portfolio scale
 * (< 50 repos) a single page is always sufficient.
 */
export async function listInstallationRepos(installationToken: string): Promise<GitHubRawRepo[]> {
    const first = await githubRequest<GitHubRepoListResponse>(
        'GET',
        '/installation/repositories?per_page=100&page=1',
        installationToken,
    );
    const repos = [...first.repositories];
    const totalPages = Math.ceil(first.total_count / 100);
    for (let page = 2; page <= totalPages; page++) {
        const next = await githubRequest<GitHubRepoListResponse>(
            'GET',
            `/installation/repositories?per_page=100&page=${page}`,
            installationToken,
        );
        repos.push(...next.repositories);
    }
    return repos;
}

// =============================================================================
// COMMIT SHA RESOLUTION
// =============================================================================

/**
 * Resolve the HEAD commit sha of a ref (e.g. the default branch) via the
 * installation token (a branch name can't be used in a commit-sha
 * short-circuit). Currently unused after the tech-extract Job retirement;
 * kept as a general GitHub App utility.
 */
export async function resolveHeadSha(token: string, repoFullName: string, ref: string): Promise<string> {
    const data = await githubRequest<{ sha: string }>(
        'GET',
        `/repos/${repoFullName}/commits/${encodeURIComponent(ref)}`,
        token,
    );
    return data.sha;
}

// =============================================================================
// INSTALLATION LISTING (App-wide)
// =============================================================================

export interface AppInstallationSummary {
    /** GitHub installation id (numeric). Compare as string against RDS. */
    id:        number;
    /** ISO timestamp the installation was created — used for a grace window. */
    createdAt: string;
}

/**
 * List every installation of this GitHub App, App-wide, via the App JWT.
 * Page-based pagination (per_page=100), consistent with listInstallationRepos.
 * Used by the orphan-reconciliation sweep to compare GitHub's installations
 * against the installation_ids stored in RDS.
 */
export async function listAppInstallations(
    appId: string,
    privateKeyPem: string,
): Promise<AppInstallationSummary[]> {
    const jwt = await generateAppJwt(appId, privateKeyPem);
    const out: AppInstallationSummary[] = [];
    for (let page = 1; ; page++) {
        const batch = await githubRequest<Array<{ id: number; created_at: string }>>(
            'GET',
            `/app/installations?per_page=100&page=${page}`,
            jwt,
        );
        for (const it of batch) out.push({ id: it.id, createdAt: it.created_at });
        if (batch.length < 100) break;
    }
    return out;
}

// =============================================================================
// INSTALLATION DELETION
// =============================================================================

/**
 * Delete a GitHub App installation — uninstalls the App from the user's account.
 * Requires the App JWT (not an installation token). Returns void; 204 No Content.
 * If the installation is already gone (404), resolves silently.
 */
export async function deleteInstallation(
    appId: string,
    privateKeyPem: string,
    installationId: string,
): Promise<void> {
    const jwt = await generateAppJwt(appId, privateKeyPem);
    await githubDeleteNoBody(`/app/installations/${installationId}`, jwt);
}

// =============================================================================
// HTTPS HELPER — consistent with GitHubAdapter
// =============================================================================

function githubRequest<T>(method: string, path: string, token: string): Promise<T> {
    return new Promise((resolve, reject) => {
        const req = https.request(
            {
                hostname: 'api.github.com',
                path,
                method,
                headers: {
                    Authorization:          `Bearer ${token}`,
                    'User-Agent':           'portfolio-admin-api/1.0',
                    Accept:                 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28',
                },
            },
            (res) => {
                const chunks: Buffer[] = [];
                res.on('data', (c: Buffer) => chunks.push(c));
                res.on('end', () => {
                    const body = Buffer.concat(chunks).toString('utf-8');
                    if (!res.statusCode || res.statusCode >= 400) {
                        reject(new Error(`GitHub API ${method} ${path} → ${res.statusCode}: ${body}`));
                        return;
                    }
                    try { resolve(JSON.parse(body) as T); }
                    catch { reject(new Error(`GitHub API ${path}: invalid JSON`)); }
                });
            },
        );
        req.on('error', reject);
        req.end();
    });
}

/**
 * Fire a DELETE request that returns 204 No Content (no JSON to parse).
 * Resolves on 204; also resolves on 404 (installation already gone).
 * Rejects on any other 4xx/5xx so the caller can decide whether to surface it.
 */
function githubDeleteNoBody(path: string, token: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const req = https.request(
            {
                hostname: 'api.github.com',
                path,
                method:   'DELETE',
                headers: {
                    Authorization:          `Bearer ${token}`,
                    'User-Agent':           'portfolio-admin-api/1.0',
                    Accept:                 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28',
                },
            },
            (res) => {
                const chunks: Buffer[] = [];
                res.on('data', (c: Buffer) => chunks.push(c));
                res.on('end', () => {
                    const status = res.statusCode ?? 0;
                    // 204 = deleted, 404 = already gone — both are success for our purpose.
                    if (status === 204 || status === 404) { resolve(); return; }
                    const body = Buffer.concat(chunks).toString('utf-8');
                    reject(new Error(`GitHub API DELETE ${path} → ${status}: ${body}`));
                });
            },
        );
        req.on('error', reject);
        req.end();
    });
}
