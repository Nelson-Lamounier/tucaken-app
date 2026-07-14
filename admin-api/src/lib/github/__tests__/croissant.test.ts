import { describe, it, expect } from '@jest/globals';
import { buildCroissant, croissantFromAggregate } from '../../github/croissant.js';

describe('buildCroissant', () => {
    it('emits a Croissant 1.0 dataset with the chunk record set', () => {
        const ds = buildCroissant({ repoFullName: 'owner/repo', recordCount: 12 });
        expect(ds['@type']).toBe('sc:Dataset');
        expect(ds.conformsTo).toBe('http://mlcommons.org/croissant/1.0');
        expect(ds.name).toBe('rag-kb-owner-repo');
        expect(ds.recordSet[0]?.name).toBe('chunks');
        const names = ds.recordSet[0]?.field.map(f => f.name);
        expect(names).toEqual(expect.arrayContaining([
            'file_path', 'line_start', 'line_end', 'commit_sha', 'content', 'skills', 'embedding',
        ]));
    });

    it('carries provenance + lineage into description, version, keywords', () => {
        const ds = buildCroissant({
            repoFullName: 'o/r', recordCount: 200, commitSha: 'abc123',
            embeddingModel: 'titan-v2', embeddingDim: 1024, enrichmentModel: 'haiku',
            skills: ['kubernetes networking', 'gitops'],
        });
        expect(ds.version).toBe('abc123');
        expect(ds.keywords).toEqual(['kubernetes networking', 'gitops']);
        expect(ds.description).toContain('200 chunks');
        expect(ds.description).toContain('titan-v2 (1024d)');
    });
});

describe('croissantFromAggregate', () => {
    it('maps an aggregate row to a Croissant card', () => {
        const ds = croissantFromAggregate('o/r', {
            record_count: 5, skills: ['gitops'], commit_sha: 'deadbeef',
            lineage: { embedding_model: 'titan-v2', embedding_dim: 1024 },
        });
        expect(ds.version).toBe('deadbeef');
        expect(ds.keywords).toEqual(['gitops']);
        expect(ds.description).toContain('5 chunks');
    });

    it('produces a valid empty card when the repo has no chunks (undefined row)', () => {
        const ds = croissantFromAggregate('o/r', undefined);
        expect(ds.recordSet[0]?.name).toBe('chunks');
        expect(ds).not.toHaveProperty('version');
        expect(ds.description).toContain('0 chunks');
    });
});
