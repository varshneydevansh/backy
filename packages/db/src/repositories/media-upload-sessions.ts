import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { BackyMediaUploadSession, BackyMediaUploadSessionRepository } from '@backy-cms/core';
import type { DatabaseInstance } from '../adapters';
import { postgresResultRows } from '../adapters/postgres-result';

const unavailable = () => Object.assign(new Error('Durable uploads require PostgreSQL and migration031.'), { code: 'MEDIA_UPLOAD_SESSIONS_UNAVAILABLE' });
const conflict = () => Object.assign(new Error('Upload offset or state changed. Read its current status before continuing.'), { code: 'MEDIA_UPLOAD_OFFSET_CONFLICT' });
const view = (row: any): BackyMediaUploadSession => ({ id: row.id, siteId: row.site_id, actorId: row.actor_id, filename: row.filename, mimeType: row.mime_type, sha256: row.sha256, sizeBytes: Number(row.size_bytes), offset: Number(row.uploaded_offset), fields: row.fields, state: row.state, mediaId: row.media_id, expiresAt: new Date(row.expires_at).toISOString() });
export function createMediaUploadSessionRepository(db: DatabaseInstance, adapterType: string): BackyMediaUploadSessionRepository {
  const database = db as unknown as NodePgDatabase;
  const ensure = () => { if (adapterType !== 'postgres') throw unavailable(); };
  const get = async (connection: NodePgDatabase, siteId: string, actorId: string, id: string, lock = false) => {
    const result = await connection.execute(sql`SELECT * FROM media_upload_sessions WHERE site_id=${siteId}::uuid AND actor_id=${actorId}::uuid AND id=${id}::uuid ${lock ? sql`FOR UPDATE` : sql``}`);
    return postgresResultRows<any>(result)[0];
  };
  return {
    async list(siteId,actorId,limit,offset) {
      ensure(); return database.transaction(async tx=>{
        const rows=await tx.execute(sql`SELECT * FROM media_upload_sessions WHERE site_id=${siteId}::uuid AND actor_id=${actorId}::uuid AND state<>'complete' ORDER BY created_at DESC,id LIMIT ${limit} OFFSET ${offset}`);
        const totals=await tx.execute(sql`SELECT count(*)::text AS total FROM media_upload_sessions WHERE site_id=${siteId}::uuid AND actor_id=${actorId}::uuid AND state<>'complete'`);
        return {items:postgresResultRows<any>(rows).map(view),total:Number(postgresResultRows<any>(totals)[0].total)};
      },{isolationLevel:'repeatable read',accessMode:'read only'});
    },
    async create(input) {
      ensure(); const result = await database.execute(sql`INSERT INTO media_upload_sessions(id,site_id,actor_id,filename,mime_type,size_bytes,sha256,fields,expires_at) VALUES (${input.id}::uuid,${input.siteId}::uuid,${input.actorId}::uuid,${input.filename},${input.mimeType},${input.sizeBytes},${input.sha256},${JSON.stringify(input.fields)}::jsonb,${input.expiresAt}::timestamptz) RETURNING *`);
      return view(postgresResultRows(result)[0]);
    },
    async get(siteId, actorId, id) { ensure(); const row = await get(database, siteId, actorId, id); return row ? view(row) : null; },
    async append(siteId, actorId, id, offset, bytes) {
      ensure(); return database.transaction(async tx => {
        const row = await get(tx as unknown as NodePgDatabase, siteId, actorId, id, true);
        if (!row) return null;
        if (row.state !== 'uploading' || new Date(row.expires_at).getTime() <= Date.now() || Number(row.uploaded_offset) !== offset || !bytes.length || bytes.length > 1048576 || offset + bytes.length > Number(row.size_bytes)) throw conflict();
        await tx.execute(sql`INSERT INTO media_upload_chunks(upload_id,chunk_offset,bytes) VALUES (${id}::uuid,${offset},${Buffer.from(bytes)})`);
        const updated = await tx.execute(sql`UPDATE media_upload_sessions SET uploaded_offset=uploaded_offset+${bytes.length} WHERE id=${id}::uuid RETURNING *`);
        return view(postgresResultRows(updated)[0]);
      });
    },
    async claim(siteId, actorId, id) {
      ensure(); const result = await database.execute(sql`UPDATE media_upload_sessions SET state='completing' WHERE site_id=${siteId}::uuid AND actor_id=${actorId}::uuid AND id=${id}::uuid AND state='uploading' AND uploaded_offset=size_bytes AND expires_at>now() RETURNING *`);
      const row = postgresResultRows(result)[0]; return row ? view(row) : null;
    },
    async readChunks(siteId, actorId, id) {
      ensure(); const result = await database.execute(sql`SELECT c.chunk_offset,c.bytes FROM media_upload_chunks c JOIN media_upload_sessions s ON s.id=c.upload_id WHERE s.site_id=${siteId}::uuid AND s.actor_id=${actorId}::uuid AND s.id=${id}::uuid AND s.state='completing' ORDER BY c.chunk_offset`);
      let offset = 0;
      return postgresResultRows<any>(result).map(row => { if (Number(row.chunk_offset) !== offset || !Buffer.isBuffer(row.bytes) || !row.bytes.length || row.bytes.length > 1048576) throw unavailable(); offset += row.bytes.length; return row.bytes; });
    },
    async settle(siteId, actorId, id, mediaId) {
      ensure(); await database.transaction(async tx => {
        const result = await tx.execute(sql`UPDATE media_upload_sessions SET state=${mediaId ? 'complete' : 'failed'},media_id=${mediaId}::uuid WHERE site_id=${siteId}::uuid AND actor_id=${actorId}::uuid AND id=${id}::uuid AND state='completing' RETURNING id`);
        if (!postgresResultRows(result).length) throw conflict();
        await tx.execute(sql`DELETE FROM media_upload_chunks WHERE upload_id=${id}::uuid`);
      });
    },
    async cancel(siteId, actorId, id) {
      ensure(); const result = await database.execute(sql`DELETE FROM media_upload_sessions WHERE site_id=${siteId}::uuid AND actor_id=${actorId}::uuid AND id=${id}::uuid AND state<>'completing' RETURNING id`); return !!postgresResultRows(result).length;
    },
    async reservedBytes(siteId, excludeId) {
      ensure(); const result = await database.execute(sql`SELECT COALESCE(sum(size_bytes),0)::text AS bytes FROM media_upload_sessions WHERE site_id=${siteId}::uuid AND state IN ('uploading','completing') ${excludeId ? sql`AND id<>${excludeId}::uuid` : sql``}`);
      const bytes = Number(postgresResultRows<any>(result)[0]?.bytes); if (!Number.isSafeInteger(bytes) || bytes < 0) throw unavailable(); return bytes;
    },
    async pruneExpired(siteId) { ensure(); await database.execute(sql`DELETE FROM media_upload_sessions WHERE site_id=${siteId}::uuid AND expires_at<=now() AND state IN ('uploading','failed')`); },
  };
}
