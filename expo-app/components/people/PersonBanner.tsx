import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { OrgMember } from '@sk/shared';
import { EditLink } from '../ReadCard';
import { isOnScoreKeeper } from '../InviteToScoreKeeper';
import { Guardianship, GuardianshipTag, PersonAvatar, RoleBadge } from './PersonBits';

/**
 * The top of the person page: the person as the People list shows them, larger (docs/people.md).
 * Photo, name, then the Staff/Admin badge and the Minor/Dependant tag, as on their list row; under
 * the name, the org ID with no label, and "On ScoreKeeper" once they have an account — which then
 * needs no card of its own.
 */
export function PersonBanner({ member, guardianship, isNarrow, onEdit, onEditPhoto }: {
  member: OrgMember;
  guardianship: Guardianship;
  isNarrow: boolean;
  /** Absent for a viewer who cannot edit. */
  onEdit?: () => void;
  onEditPhoto?: () => void;
}) {
  const size = isNarrow ? 60 : 76;
  const onApp = isOnScoreKeeper(member);
  return (
    <View className="flex-row items-center gap-4 rounded-2xl border p-4 bg-white dark:bg-slate-900 border-slate-200 dark:border-white/5">
      <TouchableOpacity
        onPress={onEditPhoto}
        disabled={!onEditPhoto}
        accessibilityRole={onEditPhoto ? 'button' : undefined}
        accessibilityLabel={onEditPhoto ? 'Edit photo' : undefined}
      >
        <PersonAvatar name={member.name} image={member.image} imageConfig={member.imageConfig} size={size} />
        {onEditPhoto ? (
          <View className="absolute -right-0.5 -bottom-0.5 w-6 h-6 rounded-full bg-brand-orange border-2 border-white dark:border-slate-900 items-center justify-center">
            <Ionicons name="camera" size={11} color="white" />
          </View>
        ) : null}
      </TouchableOpacity>

      <View className="flex-1 min-w-0">
        <View className="flex-row items-center flex-wrap gap-2">
          <Text className={`font-inter-bold ${isNarrow ? 'text-lg' : 'text-2xl'} leading-tight text-slate-900 dark:text-white`}>
            {member.name}
          </Text>
          <RoleBadge roleId={member.roleId} roleName={member.roleName} size="md" />
          <GuardianshipTag kind={guardianship} size="md" />
        </View>
        {member.personOrgId || onApp ? (
          <View className="flex-row items-center flex-wrap gap-x-4 gap-y-1 mt-1">
            {member.personOrgId ? (
              <Text className="font-inter text-sm text-slate-500 dark:text-slate-400" style={{ fontVariant: ['tabular-nums'] }}>
                {member.personOrgId}
              </Text>
            ) : null}
            {onApp ? (
              <View className="flex-row items-center gap-1">
                <Ionicons name="checkmark-circle" size={14} color="#059669" />
                <Text className="font-inter-semibold text-sm text-emerald-700 dark:text-emerald-400">On ScoreKeeper</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      {onEdit ? <View className="self-start"><EditLink onPress={onEdit} /></View> : null}
    </View>
  );
}
