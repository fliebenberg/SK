import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

/**
 * The org workspace menu, shared by the sidebar (`LeftNavigationRail`) and the phone's workspace
 * menu (`app/admin/[orgId]/_layout.tsx`), so a page added here shows up in both (`UI-27`).
 */
export interface WorkspaceNavItem {
  /** Matches the route segment after the org id; `dashboard` for the Control Panel. */
  name: string;
  label: string;
  /** The filled glyph; menus add `-outline` for pages that are not current. */
  icon: ComponentProps<typeof Ionicons>['name'];
  route: string;
  /** A temporary task drawn in amber above the rest, set apart by a divider. */
  attention?: boolean;
}

export function getWorkspaceNavItems(orgId: string, isClaimed: boolean | undefined): WorkspaceNavItem[] {
  return [
    // While the org has no administrator: a temporary task, set apart above the rest and gone
    // once it is done (docs/org-profile.md §6).
    ...(isClaimed === false
      ? [{ name: 'nominate', label: 'Nominate admin', icon: 'person-add' as const, route: `/admin/${orgId}/nominate`, attention: true }]
      : []),
    { name: 'dashboard', label: 'Control Panel', icon: 'grid', route: `/admin/${orgId}` },
    { name: 'profile', label: 'Profile', icon: 'business', route: `/admin/${orgId}/profile` },
    { name: 'settings', label: 'Settings', icon: 'settings', route: `/admin/${orgId}/settings` },
    { name: 'people', label: 'People & Roles', icon: 'people', route: `/admin/${orgId}/people` },
    { name: 'teams', label: 'Teams & Divisions', icon: 'trophy', route: `/admin/${orgId}/teams` },
    { name: 'sites', label: 'Sites and Facilities', icon: 'location', route: `/admin/${orgId}/sites` },
    { name: 'events', label: 'Fixtures & Events', icon: 'calendar', route: `/admin/${orgId}/events` },
    { name: 'leagues', label: 'Leagues & Seasons', icon: 'list', route: `/admin/${orgId}/leagues` },
  ];
}

/** The `name` of the workspace page on screen, from `useSegments()` under `/admin/[orgId]`. */
export function currentWorkspacePage(segments: string[]): string {
  return segments[2] || 'dashboard';
}
