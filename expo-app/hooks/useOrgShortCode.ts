import { useCallback, useState } from 'react';
import { deriveOrgShortCode, normalizeOrgShortCode } from '@sk/shared';

/**
 * The short-code field on a create-an-organisation form: required, but never in the way.
 *
 * A code is compulsory from 2026-09-20 because the tournament entrants screen puts it in places a
 * full name cannot go. Making a field required is easy; making people mind is the risk, and two of
 * the three create paths are "quick create" modals opened mid-task when you discover a school is
 * not on the system. Stopping that flow for an abbreviation is exactly how a required field gets
 * resented.
 *
 * So the field fills itself in as the name is typed, and stops the moment anyone edits it —
 * `touched` is the whole mechanism. A user who accepts the guess never sees the field as work; one
 * who disagrees types over it and is never corrected again, including if they go back and change
 * the name.
 *
 * Feed it the name through {@link onNameChange} *alongside* the name's own setter — it deliberately
 * does not own the name, because the three call sites keep theirs in different shapes.
 */
export function useOrgShortCode() {
  const [shortCode, setShortCode] = useState('');
  const [touched, setTouched] = useState(false);

  /** Call from the name field's `onChangeText`, in addition to setting the name. */
  const onNameChange = useCallback(
    (name: string) => {
      if (!touched) setShortCode(deriveOrgShortCode(name));
    },
    [touched]
  );

  /** The code field's `onChangeText`. The first keystroke ends the suggestion for good. */
  const onShortCodeChange = useCallback((value: string) => {
    setTouched(true);
    setShortCode(normalizeOrgShortCode(value));
  }, []);

  /** Back to suggesting — for a modal that closes and will be opened again for another org. */
  const reset = useCallback(() => {
    setShortCode('');
    setTouched(false);
  }, []);

  return { shortCode, onNameChange, onShortCodeChange, reset };
}
