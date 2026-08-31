import { EventSection, EventTemplate, getEventSections } from '@sk/shared';
import { Sport, SportPosition, SportWritePayload } from '../../../services/api';

/**
 * The sport editor's form model.
 *
 * Everything the three tabs edit lives in one object so that change detection, Cancel and the
 * save payload are each written once rather than once per field. Numbers are held as the text
 * the user typed — a half-typed or cleared number must not become `NaN` on the way through.
 */
export interface SportForm {
  name: string;
  facilityTerm: string;
  periodTerm: string;
  participantType: NonNullable<Sport['participantType']>;
  matchTopology: NonNullable<Sport['matchTopology']>;
  maxReserves: string;
  scheduledPeriods: string;
  periodLengthMinutes: string;
  yellowCardMinutes: string;
  redCardMinutes: string;
  allowTimedRedCard: boolean;
  positions: SportPosition[];
  eventSections: EventSection[];
  eventTemplates: EventTemplate[];
}

export const EMPTY_FORM: SportForm = {
  name: '',
  facilityTerm: '',
  periodTerm: '',
  participantType: 'TEAM',
  matchTopology: 'HEAD_TO_HEAD',
  maxReserves: '',
  scheduledPeriods: '',
  periodLengthMinutes: '',
  yellowCardMinutes: '',
  redCardMinutes: '',
  allowTimedRedCard: false,
  positions: [],
  eventSections: [],
  eventTemplates: [],
};

export const msToMinutes = (ms?: number): string =>
  ms === undefined || ms === null ? '' : String(ms / 60000);

export const minutesToMs = (minutes: string): number | undefined =>
  minutes.trim() === '' ? undefined : Math.round(Number(minutes) * 60000);

export function formFromSport(sport: Sport): SportForm {
  const settings = sport.defaultSettings || {};
  return {
    name: sport.name || '',
    facilityTerm: sport.facilityTerm || '',
    periodTerm: sport.periodTerm || '',
    participantType: sport.participantType || 'TEAM',
    matchTopology: sport.matchTopology || 'HEAD_TO_HEAD',
    maxReserves: settings.maxReserves === undefined ? '' : String(settings.maxReserves),
    scheduledPeriods: settings.scheduledPeriods === undefined ? '' : String(settings.scheduledPeriods),
    periodLengthMinutes: msToMinutes(settings.periodLengthMS),
    yellowCardMinutes: msToMinutes(settings.yellowCardDurationMS),
    redCardMinutes: msToMinutes(settings.redCardDurationMS),
    allowTimedRedCard: !!settings.allowTimedRedCard,
    positions: settings.positions || [],
    // Derived when the sport declares none, so an unmigrated sport opens with the sections its
    // templates are already filed under rather than an empty list.
    eventSections: getEventSections(sport),
    eventTemplates: sport.eventTemplates || [],
  };
}

/** The request body for this form, with settings the editor does not expose carried through. */
export function payloadFromForm(form: SportForm, original: Sport | null): SportWritePayload {
  return {
    name: form.name.trim(),
    facilityTerm: form.facilityTerm.trim(),
    periodTerm: form.periodTerm.trim(),
    participantType: form.participantType,
    matchTopology: form.matchTopology,
    defaultSettings: {
      ...(original?.defaultSettings || {}),
      positions: form.positions,
      maxReserves: form.maxReserves.trim() === '' ? undefined : Number(form.maxReserves),
      scheduledPeriods: form.scheduledPeriods.trim() === '' ? undefined : Number(form.scheduledPeriods),
      periodLengthMS: minutesToMs(form.periodLengthMinutes),
      yellowCardDurationMS: minutesToMs(form.yellowCardMinutes),
      redCardDurationMS: minutesToMs(form.redCardMinutes),
      allowTimedRedCard: form.allowTimedRedCard,
    },
    eventSections: form.eventSections,
    eventTemplates: form.eventTemplates,
  };
}
