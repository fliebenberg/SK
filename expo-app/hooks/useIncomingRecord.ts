import { useCallback, useState } from 'react';
import { reseedDecision } from '@sk/shared';

/** Said beside Save while a form holds unsaved edits over a version that has since changed. */
export const CHANGED_ELSEWHERE_NOTICE = 'Changed elsewhere while you were editing. Save replaces that change; Cancel shows it.';

/**
 * The same, on a screen whose save says what it was based on (`SYNC-11`): the server refuses it over
 * that change, and `<EditConflictModal>` shows what *Save mine anyway* would replace.
 */
export const CHANGED_ELSEWHERE_CHECKED_NOTICE = 'Changed elsewhere while you were editing. Save asks before replacing that change; Cancel shows it.';

/**
 * A form's answer to a newer version of the record it edits, arriving by a re-read or a room push
 * (`SYNC-10`). It decides with {@link reseedDecision}: with nothing typed the form takes the new
 * version; mid-edit it keeps the drafts *and their baseline*, and holds the new version as `newer`
 * so the screen can say so ({@link CHANGED_ELSEWHERE_NOTICE}) and Cancel can show it. Nothing here
 * stops Save replacing that change: that is the server's check (`SYNC-11`), done so far for the team
 * sheet and season settings, which say {@link CHANGED_ELSEWHERE_CHECKED_NOTICE} instead.
 *
 * Pass the baseline and drafts as they are *now* — from a ref when the answer lands after a read,
 * since the render that sent the read may be several keystrokes old.
 *
 * @param same Equality over the fields the form edits. Keep it stable (defined outside the component).
 */
export function useIncomingRecord<T>(same: (a: T, b: T) => boolean) {
  const [newer, setNewer] = useState<T | null>(null);

  const offer = useCallback((args: { baseline: T | null; drafts: T; incoming: T; seed: (value: T) => void }) => {
    const decision = reseedDecision({ baseline: args.baseline, drafts: args.drafts, incoming: args.incoming, same });
    if (decision === 'adopt') {
      args.seed(args.incoming);
      setNewer(null);
    } else if (decision === 'keep') {
      setNewer(args.incoming);
    } else {
      // Back to what this form was seeded from: nothing has changed under it any more.
      setNewer(null);
    }
  }, [same]);

  const clear = useCallback(() => setNewer(null), []);

  return { newer, offer, clear };
}
