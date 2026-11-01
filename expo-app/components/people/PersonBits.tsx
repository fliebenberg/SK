import React from 'react';
import { Image, Text, View } from 'react-native';
import { OrgMinorsSettings, isUnderAge } from '@sk/shared';
import { getAvatarUrl } from '../../services/assets';

/**
 * Small pieces the People list and the person page share, so a row and the banner it opens say the
 * same thing in the same way (docs/people.md).
 */

/** A person's photo, or their initial when there is none. */
export function PersonAvatar({ name, image, size }: { name: string; image?: string | null; size: number }) {
  const initialSize = Math.round(size * 0.38);
  return (
    <View
      className="rounded-full bg-primary-soft overflow-hidden items-center justify-center"
      style={{ width: size, height: size }}
    >
      {image ? (
        <Image source={{ uri: getAvatarUrl(image, size > 48 ? 'large' : 'thumb') }} style={{ width: size, height: size }} resizeMode="cover" />
      ) : (
        <Text className="font-inter-bold text-primary-ink" style={{ fontSize: initialSize }}>
          {(name || '?').charAt(0).toUpperCase()}
        </Text>
      )}
    </View>
  );
}

/**
 * Staff and Admin only. Member is what most people are, so it carries no badge; the role is still
 * shown and changed in the person page's Edit identity.
 */
export function RoleBadge({ roleId, roleName, size = 'sm' }: { roleId?: string; roleName?: string; size?: 'sm' | 'md' }) {
  const kind = roleId === 'role-org-admin' ? 'admin' : roleId === 'role-org-staff' ? 'staff' : null;
  if (!kind) return null;
  return (
    <Pill
      label={roleName || (kind === 'admin' ? 'Admin' : 'Staff')}
      size={size}
      className={kind === 'admin'
        ? 'bg-primary-soft border-primary-line'
        : 'bg-info-soft border-info-line'}
      textClassName={kind === 'admin' ? 'text-primary-ink' : 'text-info-ink'}
    />
  );
}

/**
 * Why someone answers to a guardian. **Minor**: younger than the org's minor age. **Dependant**: at
 * or over it, but with a guardian. The app treats the two the same (`isMinorIn` in `@sk/shared`);
 * only the word differs, so an adult with a guardian is not called a minor.
 */
export type Guardianship = 'minor' | 'dependant' | null;

export function guardianshipOf(birthdate: string | null | undefined, settings: OrgMinorsSettings, hasGuardian: boolean): Guardianship {
  if (isUnderAge(birthdate, settings.minorAge)) return 'minor';
  return hasGuardian ? 'dependant' : null;
}

export function GuardianshipTag({ kind, size = 'sm' }: { kind: Guardianship; size?: 'sm' | 'md' }) {
  if (!kind) return null;
  return kind === 'minor' ? (
    <Pill label="Minor" size={size} className="bg-warning-soft border-warning-line" textClassName="text-warning-ink" />
  ) : (
    <Pill label="Dependant" size={size} className="bg-special-soft border-special-line" textClassName="text-special-ink" />
  );
}

function Pill({ label, size, className, textClassName }: { label: string; size: 'sm' | 'md'; className: string; textClassName: string }) {
  return (
    <View className={`rounded-full border flex-shrink-0 ${size === 'md' ? 'px-2.5 py-0.5' : 'px-2 py-px'} ${className}`}>
      <Text className={`font-inter-semibold ${size === 'md' ? 'text-xs' : 'text-[11px]'} ${textClassName}`}>{label}</Text>
    </View>
  );
}
