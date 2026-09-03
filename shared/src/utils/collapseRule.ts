/**
 * The collapse rule (U15), in one place because it is applied in several.
 *
 * **A level with exactly one child renders that child inline and shows no picker for it.** One
 * division → the event screen *is* the division screen, and the tournament's venues, format and
 * settings are the division's. One stage → no stage tabs. The concept appears at the moment a
 * second child does.
 *
 * The rule is worth stating as code rather than as a convention because the failure mode is
 * asymmetric: forgetting it *adds* a concept — a list of one, a tab bar with one tab, the word
 * "Division" in front of somebody running a single-sport tournament who should never meet it.
 *
 * This generalises past tournaments. Anywhere the app has a container that usually holds one child
 * and occasionally holds several, the same rule applies; see `docs/design_spec.md`.
 */
export function isCollapsed(childCount: number): boolean {
  return childCount <= 1;
}

/**
 * What to say **before** a structural change happens.
 *
 * The second half of U15, and the half that is easy to skip: adding a second division restructures
 * the screen, so the user is told that is what will happen rather than watching the layout change
 * under them. A structural change is never a surprise.
 *
 * The copy names the level, says what will appear, and — where the existing child has a name the
 * user has never seen — says what it is currently called, because that name is about to become
 * visible and is the thing they will most likely want to change.
 */
export function structureAnnouncement(params: {
  level: 'division' | 'stage';
  /** The name the existing, so-far-invisible child carries. */
  existingName?: string;
}): { title: string; description: string; confirmText: string } {
  const { level, existingName } = params;

  if (level === 'division') {
    return {
      title: 'This will restructure the screen',
      description:
        `Until now this tournament has had one division, so it has been shown inline — the word ` +
        `"division" has not appeared anywhere. Adding a second means both are listed by name, and ` +
        `fixtures, entrants and standings move onto each division's own screen.` +
        (existingName
          ? `\n\nThe existing division is called "${existingName}". You can rename it once both are visible.`
          : ''),
      confirmText: 'Add a division',
    };
  }

  return {
    title: 'This will add stage tabs',
    description:
      `This division has one stage, so its fixtures are shown directly. Adding a second means the ` +
      `division gets a tab per stage, and each stage carries its own fixtures and table.` +
      (existingName
        ? `\n\nThe existing stage is called "${existingName}". You can rename it once the tabs appear.`
        : ''),
    confirmText: 'Add a stage',
  };
}

/** "Pools · complete", "Knockout · 4 of 7 played" — the state a stage tab carries (U14). */
export function stageSublabel(params: {
  status?: string;
  played: number;
  total: number;
}): string | undefined {
  const { status, played, total } = params;
  if (!total) return status === 'Complete' ? 'complete' : 'no fixtures';
  if (played >= total) return 'complete';
  if (played === 0) return `${total} to play`;
  return `${played} of ${total} played`;
}
