export interface UserBadge {
  id: string;
  userId: string;
  badgeType: 'community_builder';
  earnedAt: Date;
  metadata?: Record<string, any>;
}
