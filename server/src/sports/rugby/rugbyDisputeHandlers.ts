import { DisputeResolutionHandler, DisputeConfig } from '../core/SportDisputeHandler';

const conversionHandler: DisputeResolutionHandler = {
    getDisputeConfig(eventData: any, subType: string): DisputeConfig | undefined {
        if (subType === 'Conversion') {
            const wasSuccessful = eventData?.successful === true || eventData?.successful === 'true';
            return {
                heading: 'Change Conversion',
                // APPROVE = toggle the outcome
                approveLabel: wasSuccessful ? 'Missed' : 'Converted',
                rejectLabel: wasSuccessful ? 'Converted' : 'Missed',
            };
        }
        return undefined;
    },

    async handleApprovedDispute(dispute: any, evt: any, manager: any): Promise<boolean> {
        if (evt.sub_type !== 'Conversion') return false;

        // Toggle Conversion outcome — sub_type stays 'Conversion', only flip successful + pointsDelta
        const wasSuccessful = evt.event_data?.successful === true || evt.event_data?.successful === 'true';
        const newSuccessful = !wasSuccessful;
        const newPoints = newSuccessful ? 2 : 0;
        const diff = newSuccessful ? 2 : -2;

        try {
            // Update game event
            await manager.query(`
                UPDATE game_events 
                SET event_data = jsonb_set(
                        jsonb_set(COALESCE(event_data, '{}'::jsonb), '{successful}', $1::jsonb),
                        '{pointsDelta}', $2::jsonb
                    )
                WHERE id = $3
            `, [newSuccessful ? 'true' : 'false', newPoints.toString(), dispute.gameEventId]);

            // Adjust game score
            if (evt.game_participant_id) {
                await manager.query(`
                    UPDATE games 
                    SET live_state = jsonb_set(
                      live_state, 
                      '{scores}', 
                      COALESCE(live_state->'scores', '{}'::jsonb) || jsonb_build_object($1::text, (COALESCE((live_state->'scores'->$1)::numeric, 0) + $2)::numeric)
                    ),
                    updated_at = NOW()
                    WHERE id = $3
                `, [evt.game_participant_id, diff, dispute.gameId]);
            }

            return true;
        } catch (err: any) {
             console.error(`[Dispute Sync Error] Failed to process database update during dispute resolution in custom handler:`, err);
             throw err; // Manager catches this
        }
    }
};

const rugbyHandlers: Record<string, DisputeResolutionHandler> = {
    'Conversion': conversionHandler
};

export default rugbyHandlers;
