/**
 * @format
 * CycloneDX 1.6 SBOM builder over technology_evidence rows.
 *
 * NOTE: this is a deliberate, self-contained port of the canonical logic in
 * ai-applications `applications/shared/src/sbom/` (toPurl + cyclonedx). admin-api
 * lives in a separate repo and cannot import `@bedrock/shared`; the logic is
 * pure, small, and spec-defined (Package URL + CycloneDX), so a local copy is
 * preferred over standing up a published shared package. Keep the two in sync.
 */

const KNOWN_PURL_TYPES = new Set([
    'npm', 'pypi', 'gem', 'cargo', 'golang', 'maven', 'nuget',
    'composer', 'docker', 'deb', 'rpm', 'apk', 'conan', 'hex', 'pub', 'swift', 'generic',
]);

/** Package URL from (ecosystem, name, version?). Mirrors shared/sbom/toPurl. */
export function toPurl(input: { ecosystem: string; name: string; version?: string }): string {
    const eco = input.ecosystem.trim().toLowerCase();
    const type = KNOWN_PURL_TYPES.has(eco) ? eco : 'generic';
    const name = input.name.replaceAll('@', '%40');
    const versionSuffix = input.version ? `@${input.version}` : '';
    return `pkg:${type}/${name}${versionSuffix}`;
}

export interface SbomComponent { readonly name: string; readonly purl: string; readonly version?: string }

export interface EvidenceComponentInput {
    readonly rawName: string;
    readonly ecosystem: string | null;
    readonly version?: string;
}

/** Map evidence rows to components, deduped by purl (first occurrence wins). */
export function technologyEvidenceToComponents(rows: readonly EvidenceComponentInput[]): SbomComponent[] {
    const byPurl = new Map<string, SbomComponent>();
    for (const row of rows) {
        const purl = toPurl({
            ecosystem: row.ecosystem ?? '',
            name: row.rawName,
            ...(row.version ? { version: row.version } : {}),
        });
        if (byPurl.has(purl)) continue;
        byPurl.set(purl, { name: row.rawName, purl, ...(row.version ? { version: row.version } : {}) });
    }
    return [...byPurl.values()];
}

const GENERIC_PREFIX = 'pkg:generic/';

/** Drop a generic component when a package-ecosystem one exists for the same name. */
export function preferSpecificPurls(components: SbomComponent[]): SbomComponent[] {
    const namesWithSpecific = new Set(
        components.filter(c => !c.purl.startsWith(GENERIC_PREFIX)).map(c => c.name),
    );
    return components.filter(c => !(c.purl.startsWith(GENERIC_PREFIX) && namesWithSpecific.has(c.name)));
}

export interface CycloneDxBom {
    readonly bomFormat: 'CycloneDX';
    readonly specVersion: '1.6';
    readonly version: number;
    readonly metadata: { component: { type: 'application'; name: string; version?: string } };
    readonly components: Array<{ type: 'library'; name: string; purl: string; version?: string }>;
}

/** Wrap components in a CycloneDX 1.6 envelope. Pure. */
export function buildCycloneDxBom(
    components: SbomComponent[],
    meta: { repoFullName: string; commitSha?: string },
): CycloneDxBom {
    return {
        bomFormat: 'CycloneDX',
        specVersion: '1.6',
        version: 1,
        metadata: {
            component: {
                type: 'application',
                name: meta.repoFullName,
                ...(meta.commitSha ? { version: meta.commitSha } : {}),
            },
        },
        components: components.map(c => ({
            type: 'library',
            name: c.name,
            purl: c.purl,
            ...(c.version ? { version: c.version } : {}),
        })),
    };
}

/** Build a repo's CycloneDX BOM from its technology_evidence rows. */
export function bomFromEvidenceRows(
    repoFullName: string,
    rows: ReadonlyArray<{ raw_name: string; ecosystem: string | null; version: string | null; commit_sha: string }>,
): CycloneDxBom {
    const components = preferSpecificPurls(technologyEvidenceToComponents(
        rows.map(r => ({
            rawName: r.raw_name,
            ecosystem: r.ecosystem,
            ...(r.version ? { version: r.version } : {}),
        })),
    ));
    const commitSha = rows[0]?.commit_sha;
    return buildCycloneDxBom(components, { repoFullName, ...(commitSha ? { commitSha } : {}) });
}
