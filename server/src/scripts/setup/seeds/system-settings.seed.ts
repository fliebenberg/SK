import { DEFAULT_UNDO_DELAY_MS } from '@sk/shared';

export const SYSTEM_SETTINGS_SEEDS = [
  { key: 'org_admin_invite_cooldown_hours', value: '336' },
  { key: 'dispute_duration_minutes', value: '1' },
  { key: 'undo_delay_ms', value: String(DEFAULT_UNDO_DELAY_MS) }
];
