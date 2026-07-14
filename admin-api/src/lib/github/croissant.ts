/**
 * MLCommons Croissant data-card builder — self-contained port of
 * @bedrock/shared `rag/croissant.ts` (admin-api cannot import the shared
 * package). Describes a repo's RAG knowledge base (document_embeddings chunk
 * corpus) as a standard Croissant 1.0 dataset — the RAG-domain counterpart to
 * the CycloneDX SBOM port in `./sbom.ts`. Keep in sync with the shared source.
 */

export interface CroissantInput {
    readonly repoFullName: string;
    readonly recordCount: number;
    readonly commitSha?: string;
    readonly embeddingModel?: string;
    readonly embeddingDim?: number;
    readonly enrichmentModel?: string;
    readonly skills?: string[];
}

interface CroissantField {
    readonly '@type': 'cr:Field';
    readonly '@id': string;
    readonly name: string;
    readonly description: string;
    readonly dataType: string;
    readonly repeated?: boolean;
}

interface CroissantRecordSet {
    readonly '@type': 'cr:RecordSet';
    readonly '@id': string;
    readonly name: string;
    readonly description: string;
    readonly field: CroissantField[];
}

export interface CroissantDataset {
    readonly '@context': Record<string, unknown>;
    readonly '@type': 'sc:Dataset';
    readonly conformsTo: 'http://mlcommons.org/croissant/1.0';
    readonly name: string;
    readonly description: string;
    readonly version?: string;
    readonly keywords?: string[];
    readonly recordSet: readonly CroissantRecordSet[];
}

const CROISSANT_CONTEXT: Record<string, unknown> = {
    '@language':  'en',
    '@vocab':     'https://schema.org/',
    sc:           'https://schema.org/',
    cr:           'http://mlcommons.org/croissant/',
    dct:          'http://purl.org/dc/terms/',
    conformsTo:   'dct:conformsTo',
    dataType:     { '@id': 'cr:dataType', '@type': '@vocab' },
    field:        'cr:field',
    recordSet:    'cr:recordSet',
    repeated:     'cr:repeated',
    keywords:     'sc:keywords',
};

function datasetName(repoFullName: string): string {
    return `rag-kb-${repoFullName.replaceAll('/', '-')}`;
}

function chunkFields(): CroissantField[] {
    const f = (name: string, dataType: string, description: string, repeated?: boolean): CroissantField => ({
        '@type': 'cr:Field',
        '@id':   `chunks/${name}`,
        name,
        description,
        dataType,
        ...(repeated ? { repeated: true } : {}),
    });
    return [
        f('file_path',   'sc:Text',    'Source file the chunk was extracted from.'),
        f('chunk_index', 'sc:Integer', 'Ordinal of the chunk within the file.'),
        f('line_start',  'sc:Integer', '1-based first source line of the chunk (citable provenance).'),
        f('line_end',    'sc:Integer', '1-based last source line of the chunk.'),
        f('commit_sha',  'sc:Text',    'Commit the content was ingested from.'),
        f('content',     'sc:Text',    'The chunk text.'),
        f('skills',      'sc:Text',    'Canonical skills the chunk evidences.', true),
        f('embedding',   'sc:Float',   'Embedding vector for similarity retrieval.', true),
    ];
}

/** Build a Croissant data card describing a repo's RAG knowledge base. */
export function buildCroissant(input: CroissantInput): CroissantDataset {
    let embeddingNote: string | null = null;
    if (input.embeddingModel) {
        const dim = input.embeddingDim ? ` (${input.embeddingDim}d)` : '';
        embeddingNote = `embeddings ${input.embeddingModel}${dim}`;
    }
    const provenance = [
        `${input.recordCount} chunks`,
        input.commitSha ? `commit ${input.commitSha}` : null,
        embeddingNote,
        input.enrichmentModel ? `enrichment ${input.enrichmentModel}` : null,
    ].filter((p): p is string => p !== null).join('; ');

    return {
        '@context':  CROISSANT_CONTEXT,
        '@type':     'sc:Dataset',
        conformsTo:  'http://mlcommons.org/croissant/1.0',
        name:        datasetName(input.repoFullName),
        description: `RAG knowledge base for ${input.repoFullName} — ${provenance}.`,
        ...(input.commitSha ? { version: input.commitSha } : {}),
        ...(input.skills && input.skills.length > 0 ? { keywords: input.skills } : {}),
        recordSet: [{
            '@type':     'cr:RecordSet',
            '@id':       'chunks',
            name:        'chunks',
            description: 'One record per embedded document chunk.',
            field:       chunkFields(),
        }],
    };
}

/** Row shape returned by the document_embeddings aggregate the route runs. */
export interface CroissantAggregateRow {
    record_count: number;
    skills: string[] | null;
    commit_sha: string | null;
    lineage: { embedding_model?: string; embedding_dim?: number; enrichment_model?: string } | null;
}

/** Map the aggregate row to a Croissant data card (the route's query->build wrapper). */
export function croissantFromAggregate(repoFullName: string, row: CroissantAggregateRow | undefined): CroissantDataset {
    return buildCroissant({
        repoFullName,
        recordCount: row?.record_count ?? 0,
        ...(row?.skills ? { skills: row.skills } : {}),
        ...(row?.commit_sha ? { commitSha: row.commit_sha } : {}),
        ...(row?.lineage?.embedding_model ? { embeddingModel: row.lineage.embedding_model } : {}),
        ...(row?.lineage?.embedding_dim ? { embeddingDim: row.lineage.embedding_dim } : {}),
        ...(row?.lineage?.enrichment_model ? { enrichmentModel: row.lineage.enrichment_model } : {}),
    });
}
