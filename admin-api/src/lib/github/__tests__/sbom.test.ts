/** @format */
import { toPurl, preferSpecificPurls, bomFromEvidenceRows } from '../../github/sbom.js';

describe('toPurl', () => {
    it('maps ecosystem→type, encodes npm scope, appends version, falls back to generic', () => {
        expect(toPurl({ ecosystem: 'npm', name: 'cors' })).toBe('pkg:npm/cors');
        expect(toPurl({ ecosystem: 'npm', name: '@aws-sdk/client-s3', version: '3.0.0' }))
            .toBe('pkg:npm/%40aws-sdk/client-s3@3.0.0');
        expect(toPurl({ ecosystem: 'aws', name: 's3' })).toBe('pkg:generic/s3');
    });
});

describe('preferSpecificPurls', () => {
    it('drops a generic component when a package one exists for the same name', () => {
        expect(preferSpecificPurls([
            { name: 'cdk-nag', purl: 'pkg:npm/cdk-nag' },
            { name: 'cdk-nag', purl: 'pkg:generic/cdk-nag' },
            { name: 'k8s', purl: 'pkg:generic/k8s' },
        ])).toEqual([
            { name: 'cdk-nag', purl: 'pkg:npm/cdk-nag' },
            { name: 'k8s', purl: 'pkg:generic/k8s' },
        ]);
    });
});

describe('bomFromEvidenceRows', () => {
    it('builds a deduped CycloneDX 1.6 BOM with the repo as metadata.component', () => {
        const bom = bomFromEvidenceRows('o/r', [
            { raw_name: 'cdk-nag', ecosystem: 'npm', version: null, commit_sha: 'sha1' },
            { raw_name: 'cdk-nag', ecosystem: 'typescript', version: null, commit_sha: 'sha1' },
            { raw_name: 'react', ecosystem: 'npm', version: '18.2.0', commit_sha: 'sha1' },
        ]);
        expect(bom.bomFormat).toBe('CycloneDX');
        expect(bom.specVersion).toBe('1.6');
        expect(bom.metadata.component).toEqual({ type: 'application', name: 'o/r', version: 'sha1' });
        expect(bom.components).toEqual([
            { type: 'library', name: 'cdk-nag', purl: 'pkg:npm/cdk-nag' },
            { type: 'library', name: 'react', purl: 'pkg:npm/react@18.2.0', version: '18.2.0' },
        ]);
    });
});
