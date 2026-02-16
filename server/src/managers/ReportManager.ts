import { Pool } from 'pg';
import pool from '../db';
import { Report } from '@sk/types';
import { randomBytes } from 'crypto';

export class ReportManager {
  private pool: Pool;

  constructor() {
    this.pool = pool;
  }

  async submitReport(data: {
    reporterUserId: string;
    entityType: string;
    entityId: string;
    reason: string;
    description?: string;
  }): Promise<Report> {
    const id = `rep-${randomBytes(8).toString('hex')}`;
    const res = await this.pool.query(
      `INSERT INTO reports (id, reporter_user_id, entity_type, entity_id, reason, description)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, reporter_user_id as "reporterUserId", entity_type as "entityType", 
                 entity_id as "entityId", reason, description, status, 
                 resolved_by_user_id as "resolvedByUserId", resolved_at as "resolvedAt", 
                 created_at as "createdAt"`,
      [id, data.reporterUserId, data.entityType, data.entityId, data.reason, data.description]
    );
    return res.rows[0];
  }

  async getReportsForEntity(entityType: string, entityId: string): Promise<Report[]> {
    const res = await this.pool.query(
      `SELECT id, reporter_user_id as "reporterUserId", entity_type as "entityType", 
              entity_id as "entityId", reason, description, status, 
              resolved_by_user_id as "resolvedByUserId", resolved_at as "resolvedAt", 
              created_at as "createdAt"
       FROM reports
       WHERE entity_type = $1 AND entity_id = $2
       ORDER BY created_at DESC`,
      [entityType, entityId]
    );
    return res.rows;
  }
}

export const reportManager = new ReportManager();
