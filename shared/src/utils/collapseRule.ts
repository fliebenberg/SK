/**
 * The collapse rule (U15), in one place because it is applied in several.
 *
 * **A level with exactly one child renders that child inline and shows no picker for it.** One
 * division → the Schedule tab *is* the division's panel. One stage → no stage tabs.
 *
 * **Narrowed for divisions by U50 (2026-09-19).** The rule used to hide the *concept* as well as
 * the picker — "the word Division never appears while there is only one". That is withdrawn for
 * divisions: tournament setup always lists the division, one included, because an organiser who
 * never met the idea had nothing to reason from when they needed a second. What survives is the
 * layout half — no picker over a list of one, and a single division's fixtures shown inline. For
 * stages the rule stands whole.
 *
 * The rule is worth stating as code rather than as a convention because the failure mode is
 * asymmetric: forgetting it *adds* furniture — a picker with one option, a tab bar with one tab.
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
    // U50: the word "division" is on screen from the start now, so this no longer introduces the
    // concept or a name nobody has seen — only the change of layout a second one causes.
    return {
      title: 'This will restructure the Schedule tab',
      description:
        `This tournament has one division, so its fixtures are shown directly on the Schedule tab. ` +
        `Adding a second means the tab lists the divisions instead, and each one's fixtures, ` +
        `entrants and standings move onto its own screen.` +
        (existingName ? `

"${existingName}" keeps everything it has.` : ''),
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
