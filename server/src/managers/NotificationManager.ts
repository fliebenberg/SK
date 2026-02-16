import { Pool } from 'pg';
import pool from '../db';
import { Notification } from '@sk/types';
import { randomBytes } from 'crypto';

export class NotificationManager {
  private pool: Pool;

  constructor() {
    this.pool = pool;
  }

  async createNotification(
    userId: string,
    title: string,
    message: string,
    type: string,
    link?: string
  ): Promise<Notification> {
    const id = `notif-${randomBytes(8).toString('hex')}`;
    const res = await this.pool.query(
      `INSERT INTO notifications (id, user_id, title, message, type, link)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, user_id as "userId", title, message, type, link, is_read as "isRead", created_at as "createdAt"`,
      [id, userId, title, message, type, link]
    );
    return res.rows[0];
  }

  async getNotifications(userId: string): Promise<Notification[]> {
    const res = await this.pool.query(
      `SELECT id, user_id as "userId", title, message, type, link, is_read as "isRead", created_at as "createdAt"
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );
    return res.rows;
  }

  async markAsRead(id: string): Promise<Notification> {
    const res = await this.pool.query(
      `UPDATE notifications SET is_read = true WHERE id = $1
       RETURNING id, user_id as "userId", title, message, type, link, is_read as "isRead", created_at as "createdAt"`,
      [id]
    );
    return res.rows[0];
  }

  async markAllAsRead(userId: string): Promise<void> {
    await this.pool.query(
      `UPDATE notifications SET is_read = true WHERE user_id = $1`,
      [userId]
    );
  }

  async deleteNotification(id: string): Promise<string> {
    await this.pool.query('DELETE FROM notifications WHERE id = $1', [id]);
    return id;
  }
}

export const notificationManager = new NotificationManager();
