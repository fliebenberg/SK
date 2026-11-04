import React, { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { OrgProfile, isValidEmail, normalizeEmail } from '@sk/shared';
import { useSocketQuery } from '../../hooks/useSocketQuery';

/**
 * Beside an email or org ID on an add form: someone who left this organisation with it, so they can
 * come back with their history rather than as a copy (docs/people.md §9). Only ever a question, as
 * the address may have changed hands; ignoring it adds someone new. Admin and Staff only, by the
 * read's room: anyone else never sees it.
 */
export function FormerPersonNote({ orgId, email, identifier, onSamePerson }: {
  orgId: string;
  email?: string;
  identifier?: string;
  onSamePerson: (person: OrgProfile) => void;
}) {
  const typedEmail = email?.trim() && isValidEmail(email.trim()) ? normalizeEmail(email) : '';
  const typedId = identifier?.trim() || '';
  const typed = `${typedEmail}|${typedId}`;
  const [asked, setAsked] = useState('');
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setAsked(typed), 400);
    return () => clearTimeout(timer);
  }, [typed]);

  const { data } = useSocketQuery<OrgProfile | null>(
    'former_person',
    { orgId, email: typedEmail || undefined, identifier: typedId || undefined },
    { enabled: asked === typed && (!!typedEmail || !!typedId), suppressToast: true },
  );

  if (!data?.id || dismissed === data.id) return null;
  // The answer to an earlier value is no answer to this one.
  const byEmail = !!typedEmail && normalizeEmail(data.email) === typedEmail;
  const byId = !!typedId && data.identifier === typedId;
  if (!byEmail && !byId) return null;

  return (
    <View testID="former-person-note" className="gap-1.5 rounded-xl bg-warning-soft border border-warning-line px-3 py-2">
      <Text className="font-inter text-xs text-warning-ink">
        {data.name} left this organisation and had this {byEmail ? 'email' : 'org ID'}. Is this them?
      </Text>
      <View className="flex-row flex-wrap gap-x-4 gap-y-1">
        <TouchableOpacity testID="former-person-same" onPress={() => onSamePerson(data)} accessibilityRole="button">
          <Text className="font-inter-bold text-xs text-primary-ink">Yes, bring them back</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="former-person-new" onPress={() => setDismissed(data.id)} accessibilityRole="button">
          <Text className="font-inter-bold text-xs text-ink-muted">No, someone new</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
