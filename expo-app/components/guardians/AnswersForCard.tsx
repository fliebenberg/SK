import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { OrgGuardianChild } from '@sk/shared';
import { ReadCard } from '../ReadCard';
import { PersonAvatar } from '../people/PersonBits';
import { RELATIONSHIP_LABELS } from './guardianDraft';
import { useActiveTheme } from '../../store/settingsStore';
import { themeColor } from '../../constants/Colors';

/**
 * Who a guardian answers for, each opening that person's page (`PEOPLE-9`, `PEOPLE-16`). On the
 * guardian page and the person page; renders nothing for someone who answers for nobody.
 */
export function AnswersForCard({ orgId, people }: { orgId: string; people: OrgGuardianChild[] }) {
  const router = useRouter();
  if (!people.length) return null;
  return (
    <ReadCard label="Answers for">
      <View>
        {people.map((child, index) => (
          <ChildRow
            key={child.linkId}
            child={child}
            first={index === 0}
            onPress={child.membershipId
              ? () => router.push({ pathname: '/admin/[orgId]/people/[membershipId]', params: { orgId, membershipId: child.membershipId! } })
              : undefined}
          />
        ))}
      </View>
    </ReadCard>
  );
}

function ChildRow({ child, first, onPress }: { child: OrgGuardianChild; first: boolean; onPress?: () => void }) {
  const isDark = useActiveTheme() === 'dark';
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.7}
      accessibilityRole={onPress ? 'link' : undefined}
      className={`flex-row items-center gap-3 py-2.5 ${first ? 'pt-0' : 'border-t border-line-soft'}`}
    >
      <PersonAvatar name={child.name} image={child.image} size={32} />
      <View className="flex-1 min-w-0">
        <Text className="font-inter-semibold text-sm text-ink" numberOfLines={1}>{child.name}</Text>
        <Text className="font-inter text-xs text-ink-muted mt-0.5">
          {RELATIONSHIP_LABELS[child.relationship]}{child.isPrimary ? ' · Primary' : ''}
        </Text>
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={16} color={themeColor(isDark, 'ink-muted')} /> : null}
    </TouchableOpacity>
  );
}
