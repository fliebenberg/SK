import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Switch, Image, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Dependant, GameSummary, SocketAction, formatInviteWait, inviteCooldownRemainingHours, isValidEmail, normalizeEmail } from '@sk/shared';
import { GlassCard } from '../../components/GlassCard';
import { Button } from '../../components/Button';
import { useAuthStore } from '../../store/authStore';
import { useLiveRoom } from '../../hooks/useLiveRoom';
import { sendAction } from '../../services/actions';
import { getAvatarUrl } from '../../services/assets';
import { formatFixtureWhen, formatInstant } from '../../utils/dates';
import { RELATIONSHIP_LABELS } from '../../components/guardians/guardianDraft';
import { useInviteCooldownHours } from '../../components/InviteToScoreKeeper';

/**
 * My Family (`MEMBER-3`, Phase 4): what a guardian sees of the children they are recorded for.
 *
 * Everything here arrives in the guardian's own `USER_MEMBERSHIPS_UPDATED` (`dependants`) — a
 * guardian holds no membership, so the org's member rooms are closed to them. The fixtures come
 * from the org's public fixtures room, filtered to the child's teams: spectator information, which
 * the guardian could read anyway. Nothing about any other child is ever on this screen.
 */
export default function FamilyScreen() {
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 768;
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const dependants = useAuthStore(state => state.dependants || []);

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <ScrollView className="flex-1 px-6 py-6" contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="mb-6">
          {isLargeScreen && (
            <Text className="font-orbitron-bold text-2xl tracking-widest text-slate-800 dark:text-white uppercase mb-2">
              My Family
            </Text>
          )}
          <Text className="font-inter text-sm text-slate-500 dark:text-slate-400">
            The children you are recorded as a parent or guardian for: their teams, their fixtures, and
            whether they may use ScoreKeeper themselves.
          </Text>
        </View>

        {!isAuthenticated || dependants.length === 0 ? (
          <GlassCard className="border border-slate-200 dark:border-white/5 p-6 items-center">
            <Ionicons name="people-outline" size={28} color="#94A3B8" />
            <Text className="font-inter text-sm text-slate-500 dark:text-slate-400 text-center mt-3">
              No children are linked to your account. A school or club records you as a guardian; ask them
              to use this account's email address.
            </Text>
          </GlassCard>
        ) : (
          <View className="space-y-6">
            {dependants.map(child => (
              <DependantCard key={`${child.orgId}:${child.playerProfileId}`} child={child} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const SECTION = 'font-orbitron-bold text-[9px] text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2';

function DependantCard({ child }: { child: Dependant }) {
  const avatar = child.image ? getAvatarUrl(child.image, 'medium') : null;
  const firstName = child.name.split(' ')[0];

  return (
    <GlassCard className="border border-slate-200 dark:border-white/5 p-5 space-y-5">
      {/* Who */}
      <View className="flex-row items-center gap-4">
        <View className="w-14 h-14 rounded-full bg-brand-orange/10 overflow-hidden items-center justify-center">
          {avatar ? (
            <Image source={{ uri: avatar }} style={{ width: 56, height: 56 }} resizeMode="cover" />
          ) : (
            <Text className="font-orbitron-bold text-lg text-brand-orange">{child.name.charAt(0).toUpperCase()}</Text>
          )}
        </View>
        <View className="flex-1">
          <Text className="font-orbitron-bold text-lg text-slate-800 dark:text-white">{child.name}</Text>
          <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {child.orgName} · you are recorded as {RELATIONSHIP_LABELS[child.relationship].toLowerCase()}
            {child.isPrimary ? ' (primary contact)' : ''}
          </Text>
        </View>
      </View>

      {/* Teams */}
      <View>
        <Text className={SECTION}>Teams</Text>
        {child.teams.length ? (
          <View className="flex-row flex-wrap gap-2">
            {child.teams.map(team => (
              <View key={team.teamId} className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5">
                <Text className="font-inter-bold text-xs text-slate-700 dark:text-slate-200">{team.name}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text className="font-inter text-xs text-slate-500 dark:text-slate-400">Not on a team yet.</Text>
        )}
      </View>

      {/* Fixtures */}
      <ChildFixtures child={child} />

      {/* Their own account */}
      <OwnAccount child={child} firstName={firstName} />

      {/* The guardian's own details */}
      <View className="border-t border-slate-200 dark:border-white/5 pt-4">
        <Text className={SECTION}>Your details at {child.orgName}</Text>
        <Text className="font-inter text-sm text-slate-800 dark:text-white">{child.guardianName}</Text>
        <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          {[child.guardianEmail, child.guardianCellphone].filter(Boolean).join(' · ') || 'No contact details on record'}
        </Text>
        <Text className="font-inter text-[11px] text-slate-400 mt-1">Ask {child.orgName} to change these.</Text>
      </View>
    </GlassCard>
  );
}

/** The child's teams' fixtures, from the org's public fixtures room. */
function ChildFixtures({ child }: { child: Dependant }) {
  const teamIds = useMemo(() => new Set(child.teams.map(t => t.teamId)), [child.teams]);
  const { items, isLoading } = useLiveRoom<GameSummary>(child.teams.length ? `org:${child.orgId}:fixtures` : null, {
    reduce: message => {
      if (message.type === 'GAME_SUMMARIES_SYNC') return { kind: 'replace', items: message.data || [] };
      if (message.type === 'GAME_SUMMARY_UPDATED' && message.data?.id) return { kind: 'upsert', item: message.data };
      if (message.type === 'GAME_SUMMARY_REMOVED' && message.data?.id) return { kind: 'remove', id: message.data.id };
      return { kind: 'ignore' };
    },
  });

  const { upcoming, recent } = useMemo(() => {
    const mine = items.filter(game => game.participants?.some(p => p.teamId && teamIds.has(p.teamId)));
    const when = (game: GameSummary) => new Date(game.scheduledStartTime || game.startTime || 0).getTime();
    return {
      upcoming: mine
        .filter(game => game.status === 'Scheduled' || game.status === 'Live')
        .sort((a, b) => when(a) - when(b))
        .slice(0, 5),
      recent: mine
        .filter(game => game.status === 'Finished')
        .sort((a, b) => when(b) - when(a))
        .slice(0, 3),
    };
  }, [items, teamIds]);

  if (!child.teams.length) return null;

  return (
    <View>
      <Text className={SECTION}>Fixtures</Text>
      {isLoading ? (
        <Text className="font-inter text-xs text-slate-400">Loading fixtures…</Text>
      ) : upcoming.length === 0 && recent.length === 0 ? (
        <Text className="font-inter text-xs text-slate-500 dark:text-slate-400">No fixtures scheduled.</Text>
      ) : (
        <View className="space-y-1.5">
          {upcoming.map(game => <FixtureRow key={game.id} game={game} />)}
          {recent.length ? (
            <Text className="font-inter-bold text-[10px] text-slate-400 uppercase tracking-wider mt-2">Recent results</Text>
          ) : null}
          {recent.map(game => <FixtureRow key={game.id} game={game} />)}
        </View>
      )}
    </View>
  );
}

function FixtureRow({ game }: { game: GameSummary }) {
  const [home, away] = [...(game.participants || [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const score = (side?: { id: string }) => (side && game.scores ? game.scores[side.id] : undefined);
  const finished = game.status === 'Finished';
  return (
    <View className="flex-row items-center justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-2.5">
      <View className="flex-1 mr-3">
        <Text className="font-inter-bold text-sm text-slate-800 dark:text-white" numberOfLines={1}>
          {home?.name || home?.entrantLabel || 'TBC'} vs {away?.name || away?.entrantLabel || 'TBC'}
        </Text>
        <Text className="font-inter text-[11px] text-slate-500 dark:text-slate-400">
          {game.status === 'Live' ? 'Live now' : formatFixtureWhen(game.scheduledStartTime || game.startTime, { timeTbd: game.timeTbd })}
        </Text>
      </View>
      {finished && score(home) !== undefined ? (
        <Text className="font-orbitron-bold text-sm text-slate-800 dark:text-white">{score(home)} – {score(away)}</Text>
      ) : null}
    </View>
  );
}

/**
 * Whether the child may use ScoreKeeper themselves — the guardian's say, once the organisation has
 * switched minors on — and, when they may, inviting them.
 */
function OwnAccount({ child, firstName }: { child: Dependant; firstName: string }) {
  const [isSaving, setIsSaving] = useState(false);
  const [email, setEmail] = useState(child.email || '');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [isInviting, setIsInviting] = useState(false);
  const cooldownHours = useInviteCooldownHours();

  const allowed = child.ownAccountAllowed !== false;
  const setBy = child.ownAccountSetByName
    ? ` Last changed by ${child.ownAccountSetByName}${child.ownAccountSetAt ? ` on ${formatInstant(child.ownAccountSetAt)}` : ''}.`
    : '';

  const toggle = async (value: boolean) => {
    setIsSaving(true);
    // On is an explicit yes, so it is recorded who allowed it; off is an explicit no.
    await sendAction(SocketAction.SET_MINOR_ACCOUNT_ACCESS, { playerProfileId: child.playerProfileId, allowed: value });
    setIsSaving(false);
    // The new value arrives in this user's memberships push.
  };

  const invite = async () => {
    const typed = normalizeEmail(email);
    if (!isValidEmail(typed)) {
      setInviteError(`Enter ${firstName}'s own email address.`);
      return;
    }
    setIsInviting(true);
    setInviteError(null);
    const result = await sendAction(
      SocketAction.SEND_DEPENDANT_INVITE,
      { playerProfileId: child.playerProfileId, email: typed },
      { suppressToast: true }
    );
    setIsInviting(false);
    if (!result.ok) setInviteError(result.message);
  };

  const inviteSentHere = Boolean(child.lastInviteSentAt && child.lastInviteEmail
    && normalizeEmail(child.lastInviteEmail) === normalizeEmail(email));
  // The same per-address cooldown as an admin's invite: a different address may go at once.
  const waitHours = inviteCooldownRemainingHours(
    { lastInviteSentAt: child.lastInviteSentAt, lastInviteEmail: child.lastInviteEmail },
    normalizeEmail(email),
    cooldownHours
  );

  return (
    <View className="border-t border-slate-200 dark:border-white/5 pt-4">
      <Text className={SECTION}>{firstName}'s own ScoreKeeper account</Text>

      {!child.minorsAccountsAllowed ? (
        <Text className="font-inter text-sm text-slate-600 dark:text-slate-300">
          {child.orgName} does not give members under {child.minorAge} their own access, so there is nothing
          to decide yet. {child.hasAccount ? `${firstName} can sign in, but sees only their own teams.` : ''}
        </Text>
      ) : (
        <>
          <View className="flex-row items-center justify-between">
            <View className="flex-1 mr-4">
              <Text className="font-inter-bold text-sm text-slate-800 dark:text-white">
                Let {firstName} use ScoreKeeper as a member
              </Text>
              <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {allowed
                  ? `On — ${firstName} sees ${child.orgName} as members do.`
                  : `Off — ${firstName} can sign in, but sees nothing of ${child.orgName} beyond any team they coach or score.`}
                {setBy}
              </Text>
            </View>
            <Switch value={allowed} disabled={isSaving} onValueChange={toggle} />
          </View>

          {child.hasAccount ? (
            <Text className="font-inter text-xs text-emerald-600 dark:text-emerald-400 mt-3">{firstName} is on ScoreKeeper.</Text>
          ) : allowed ? (
            <View className="mt-4">
              <Text className="font-inter text-xs text-slate-500 dark:text-slate-400 mb-2">
                {inviteSentHere
                  ? `An invite went to ${child.lastInviteEmail} on ${formatInstant(child.lastInviteSentAt)}.${waitHours > 0 ? ` You can send it again in ${formatInviteWait(waitHours)}, or to a different address now.` : ''}`
                  : `Invite ${firstName} with their own email address — not yours.`}
              </Text>
              {/* Wraps below phone width rather than pushing the button off the screen. */}
              <View className="flex-row flex-wrap gap-2">
                <TextInput
                  value={email}
                  onChangeText={text => { setEmail(text); setInviteError(null); }}
                  placeholder={`${firstName}'s email`}
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  className="flex-1 min-w-[180px] font-inter text-sm text-slate-800 dark:text-white bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-2.5 outline-none"
                />
                <Button
                  title={waitHours > 0 ? 'Sent' : inviteSentHere ? 'Send again' : 'Invite'}
                  variant="primary"
                  onPress={invite}
                  isLoading={isInviting}
                  disabled={isInviting || waitHours > 0}
                  className="min-h-[40px] px-4"
                />
              </View>
              {inviteError ? <Text className="font-inter text-xs text-red-500 mt-2">{inviteError}</Text> : null}
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}
