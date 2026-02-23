import * as Y from 'yjs';
import { pool } from '../index';

/**
 * Y.js PostgreSQL persistence provider.
 *
 * Stores Y.js document state as binary in a `yjs_documents` table.
 * This table should be created via migration:
 *
 * CREATE TABLE IF NOT EXISTS yjs_documents (
 *   doc_id TEXT PRIMARY KEY,
 *   state BYTEA NOT NULL,
 *   updated_at TIMESTAMP DEFAULT NOW()
 * );
 */

export async function loadDocument(docId: string): Promise<Uint8Array | null> {
  try {
    const result = await pool.query(
      'SELECT state FROM yjs_documents WHERE doc_id = $1',
      [docId],
    );
    if (result.rows.length > 0 && result.rows[0].state) {
      return new Uint8Array(result.rows[0].state);
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveDocument(docId: string, doc: Y.Doc): Promise<void> {
  const state = Buffer.from(Y.encodeStateAsUpdate(doc));
  await pool.query(
    `INSERT INTO yjs_documents (doc_id, state, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (doc_id) DO UPDATE SET state = $2, updated_at = NOW()`,
    [docId, state],
  );
}

export async function deleteDocument(docId: string): Promise<void> {
  await pool.query('DELETE FROM yjs_documents WHERE doc_id = $1', [docId]);
}
