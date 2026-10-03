import React from 'react';
import { Image, Text, View } from 'react-native';
import { OrgMinorsSettings, isUnderAge } from '@sk/shared';
import { getAvatarUrl } from '../../services/assets';

/**
 * Small pieces the People list and the person page share, so a row and the banner it opens say the
 * same thing in the same way (docs/people.md).
 */

export type ImageConfig = { scale: number; x: number; y: number };

/** A stored image config, which older rows hold as a JSON string. Never throws. */
export function parseImageConfig(config: any): ImageConfig {
  if (!config) return { scale: 1, x: 0, y: 0 };
  if (typeof config === 'string') {
    try {
      return JSON.parse(config);
    } catch {
      return { scale: 1, x: 0, y: 0 };
    }
  }
  return { scale: config.scale ?? 1, x: config.x ?? 0, y: config.y ?? 0 };
}

/** A person's photo, placed by its image config, or their initial when there is none. */
export function PersonAvatar({ name, image, imageConfig, size }: { name: string; image?: string | null; imageConfig?: any; size: number }) {
  const conf = parseImageConfig(imageConfig);
  const initialSize = Math.round(size * 0.38);
  return (
    <View
      className="rounded-full bg-orange-100 dark:bg-brand-orange/15 overflow-hidden items-center justify-center"
      style={{ width: size, height: size }}
    >
      {image ? (
        <View style={{ width: size, height: size, transform: [{ scale: conf.scale }, { translateX: conf.x * size }, { translateY: conf.y * size }] }}>
          <Image source={{ uri: getAvatarUrl(image, size > 48 ? 'large' : 'thumb') }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        </View>
      ) : (
        <Text className="font-inter-bold text-orange-700 dark:text-brand-orange" style={{ fontSize: initialSize }}>
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
        ? 'bg-orange-50 dark:bg-brand-orange/10 border-orange-200 dark:border-brand-orange/30'
        : 'bg-blue-50 dark:bg-blue-400/10 border-blue-200 dark:border-blue-400/30'}
      textClassName={kind === 'admin' ? 'text-orange-900 dark:text-orange-300' : 'text-blue-800 dark:text-blue-300'}
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
    <Pill label="Minor" size={size} className="bg-amber-50 dark:bg-amber-400/10 border-amber-200 dark:border-amber-300/30" textClassName="text-amber-900 dark:text-amber-300" />
  ) : (
    <Pill label="Dependant" size={size} className="bg-violet-50 dark:bg-violet-400/10 border-violet-200 dark:border-violet-300/30" textClassName="text-violet-800 dark:text-violet-300" />
  );
}

function Pill({ label, size, className, textClassName }: { label: string; size: 'sm' | 'md'; className: string; textClassName: string }) {
  return (
    <View className={`rounded-full border flex-shrink-0 ${size === 'md' ? 'px-2.5 py-0.5' : 'px-2 py-px'} ${className}`}>
      <Text className={`font-inter-semibold ${size === 'md' ? 'text-xs' : 'text-[11px]'} ${textClassName}`}>{label}</Text>
    </View>
  );
}
