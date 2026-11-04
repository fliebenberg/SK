import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { CellphoneOnRecord, parseCellphone } from '@sk/shared';
import { useSocketQuery } from '../../hooks/useSocketQuery';

/**
 * Beside a cell number field: anyone else in the organisation with that number, while it is being
 * typed, so it can be someone already on record rather than a copy (`MEMBER-7`). Only ever a note, as
 * people do share a phone, and it never stops a save. A coach is told it is on record, not whose.
 */
export function CellphoneOnRecordNote({ orgId, cellphone, excludeProfileId }: {
  orgId: string;
  cellphone: string;
  /** The person being edited, who is not "someone else". */
  excludeProfileId?: string;
}) {
  const parsed = parseCellphone(cellphone);
  const number = parsed?.ok ? parsed.value : null;
  const [asked, setAsked] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setAsked(number), 400);
    return () => clearTimeout(timer);
  }, [number]);

  const { data } = useSocketQuery<CellphoneOnRecord>(
    'cellphone_on_record',
    { orgId, cellphone: asked, excludeProfileId },
    { enabled: !!asked && asked === number, suppressToast: true },
  );

  // The answer to an earlier number is no answer to this one.
  if (!number || data?.cellphone !== number || !data.count) return null;
  const who = data.names.length ? data.names.join(', ') : 'someone else in this organisation';
  return (
    <Text testID="cellphone-on-record" className="font-inter text-xs text-warning-ink">
      Also on record for {who}. You can still save it.
    </Text>
  );
}
