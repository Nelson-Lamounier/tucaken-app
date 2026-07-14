/**
 * @format
 * GitHub connection teardown.
 *
 * Cascade-deletes a user's GitHub footprint: document embeddings, repo sync
 * state, connected repositories, then the oauth_connections row itself.
 * Ordering matters — FK-free tables first, then oauth_connections.
 *
 * Shared by the GitHub routes (DELETE /installation, webhook
 * installation.deleted) and the admin-users support tooling.
 */
import type { Pool } from 'pg';

export async function deleteConnection(pool: Pool, userId: string): Promise<void> {
    await pool.query(
        `DELETE FROM document_embeddings
         WHERE user_id = $1::uuid
           AND repo_full_name IN (
             SELECT full_name FROM repositories WHERE user_id = $1::uuid AND provider = 'github'
           )`,
        [userId],
    );
    await pool.query(
        `DELETE FROM repo_sync_state
         WHERE user_id = $1::uuid
           AND repo_full_name IN (
             SELECT full_name FROM repositories WHERE user_id = $1::uuid AND provider = 'github'
           )`,
        [userId],
    );
    await pool.query(
        `DELETE FROM repositories WHERE user_id = $1::uuid AND provider = 'github'`,
        [userId],
    );
    await pool.query(
        `DELETE FROM oauth_connections WHERE user_id = $1::uuid AND provider = 'github'`,
        [userId],
    );
}
