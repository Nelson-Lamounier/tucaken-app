/**
 * @format
 * ArticleRepository — typed pg queries for the articles table.
 */
import type { Queryable } from '../pg.js';

export interface Article {
    slug:         string;
    title:        string;
    excerpt:      string | null;
    contentMd:    string;
    tags:         string[];
    status:       string;
    aiGenerated:  boolean;
    aiModel:      string | null;
    publishedAt:  Date | null;
    coverImage:   string | null;
    destinations: string[];
    /** users.id of the owner. Set on the article-job placeholder so
     *  AI-generated articles are attributed; preserved on re-upsert. */
    authorId?:   string | null;
    createdAt?:  Date | undefined;
    updatedAt?:  Date | undefined;
}

const LIST_BY_STATUS_LIMIT = 100;
const LIST_ALL_LIMIT = 200;

export function rowToArticle(row: Record<string, unknown>): Article {
    return {
        slug:         row['slug']          as string,
        title:        row['title']         as string,
        excerpt:      row['excerpt']       as string | null,
        contentMd:    row['content_md']    as string,
        tags:         (row['tags']         as string[]) ?? [],
        status:       row['status']        as string,
        aiGenerated:  row['ai_generated']  as boolean,
        aiModel:      row['ai_model']      as string | null,
        publishedAt:  row['published_at']  ? new Date(row['published_at'] as string) : null,
        coverImage:   row['cover_image']   as string | null,
        destinations: (row['destinations'] as string[]) ?? ['portfolio'],
        authorId:     (row['author_id']    as string | null) ?? null,
        createdAt:    row['created_at']    ? new Date(row['created_at']   as string) : undefined,
        updatedAt:    row['updated_at']    ? new Date(row['updated_at']   as string) : undefined,
    };
}

export async function upsertArticle(pool: Queryable, article: Article): Promise<void> {
    await pool.query(
        `INSERT INTO articles
             (slug, title, excerpt, content_md, tags, status, ai_generated, ai_model,
              published_at, cover_image, author_id, destinations)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (slug) DO UPDATE SET
             title        = EXCLUDED.title,
             excerpt      = EXCLUDED.excerpt,
             content_md   = EXCLUDED.content_md,
             tags         = EXCLUDED.tags,
             status       = EXCLUDED.status,
             ai_generated = EXCLUDED.ai_generated,
             ai_model     = EXCLUDED.ai_model,
             published_at = EXCLUDED.published_at,
             cover_image  = EXCLUDED.cover_image,
             destinations = EXCLUDED.destinations,
             -- Preserve the owner once set: the article-job placeholder
             -- sets author_id; later content upserts must not null it.
             author_id    = COALESCE(articles.author_id, EXCLUDED.author_id),
             updated_at   = NOW()`,
        [
            article.slug,
            article.title,
            article.excerpt ?? null,
            article.contentMd,
            article.tags,
            article.status,
            article.aiGenerated,
            article.aiModel ?? null,
            article.publishedAt ?? null,
            article.coverImage ?? null,
            article.authorId ?? null,
            article.destinations ?? ['portfolio'],
        ],
    );
}

/**
 * Fetch an article by slug WITHOUT an owner filter.
 *
 * Slugs are globally unique, so this is only for global concerns like
 * slug-availability checks. Do NOT use it on user-facing read/mutation paths —
 * use getArticleBySlugForAuthor so one user cannot see or edit another's
 * article. See the articles router.
 */
export async function getArticleBySlug(pool: Queryable, slug: string): Promise<Article | null> {
    const result = await pool.query(
        `SELECT slug, title, excerpt, content_md, tags, status, ai_generated,
                ai_model, published_at, cover_image, destinations, created_at, updated_at
         FROM articles WHERE slug = $1`,
        [slug],
    );
    if (result.rows.length === 0) return null;
    return rowToArticle(result.rows[0] as Record<string, unknown>);
}

/**
 * Owner-scoped fetch: returns the article only if it belongs to `authorId`.
 * Returns null for a non-existent slug OR a slug owned by another user, so
 * callers can treat "not yours" and "not found" identically (404).
 */
export async function getArticleBySlugForAuthor(
    pool: Queryable,
    slug: string,
    authorId: string,
): Promise<Article | null> {
    const result = await pool.query(
        `SELECT slug, title, excerpt, content_md, tags, status, ai_generated,
                ai_model, published_at, cover_image, destinations, author_id,
                created_at, updated_at
         FROM articles WHERE slug = $1 AND author_id = $2`,
        [slug, authorId],
    );
    if (result.rows.length === 0) return null;
    return rowToArticle(result.rows[0] as Record<string, unknown>);
}

export async function listArticlesByStatus(
    pool: Queryable,
    status: string,
    authorId: string,
): Promise<Article[]> {
    const result = await pool.query(
        `SELECT slug, title, excerpt, content_md, tags, status, ai_generated,
                ai_model, published_at, cover_image, destinations, created_at, updated_at
         FROM articles WHERE status = $1 AND author_id = $2
         ORDER BY updated_at DESC LIMIT ${LIST_BY_STATUS_LIMIT}`,
        [status, authorId],
    );
    return (result.rows as Record<string, unknown>[]).map(rowToArticle);
}

export async function listAllArticles(pool: Queryable, authorId: string): Promise<Article[]> {
    const result = await pool.query(
        `SELECT slug, title, excerpt, content_md, tags, status, ai_generated,
                ai_model, published_at, cover_image, destinations, created_at, updated_at
         FROM articles WHERE author_id = $1 ORDER BY updated_at DESC LIMIT ${LIST_ALL_LIMIT}`,
        [authorId],
    );
    return (result.rows as Record<string, unknown>[]).map(rowToArticle);
}

export async function deleteArticle(pool: Queryable, slug: string): Promise<void> {
    await pool.query(`DELETE FROM articles WHERE slug = $1`, [slug]);
}
