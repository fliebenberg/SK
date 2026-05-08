import { Sport } from "../../models/sport/Sport";
import { RUGBY_EVENTS } from "./events";
import settings from "./settings";

export const RUGBY_CONFIG: Sport = {
  id: "sport-rugby",
  name: "Rugby",
  categoryId: "rugby",
  participantType: "TEAM",
  matchTopology: "HEAD_TO_HEAD",
  facilityTerm: settings.facilityTerm,
  periodTerm: settings.periodTerm,
  defaultSettings: {
    maxReserves: settings.maxReserves,
    positions: settings.positions
  },
  eventTemplates: RUGBY_EVENTS
};
