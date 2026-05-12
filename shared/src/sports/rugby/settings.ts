import { MatchTopology, SportParticipantType, SportTemplate } from "../../models/sport/Sport";

const settings: SportTemplate = {
  id: "sport-rugby",
  name: "Rugby",
  categoryId: "rugby",
  participantType: SportParticipantType.TEAM,
  matchTopology: MatchTopology.HEAD_TO_HEAD,
  facilityTerm: "Field",
  periodTerm: "Half",
  timerShowHours: false,
  defaultSettings: {
    maxReserves: 8,
    positions: [
      { id: "1", name: "Loosehead Prop" },
      { id: "2", name: "Hooker" },
      { id: "3", name: "Tighthead Prop" },
      { id: "4", name: "Lock" },
      { id: "5", name: "Lock" },
      { id: "6", name: "Blindside Flanker" },
      { id: "7", name: "Openside Flanker" },
      { id: "8", name: "Number 8" },
      { id: "9", name: "Scrum-half" },
      { id: "10", name: "Fly-half" },
      { id: "11", name: "Left Wing" },
      { id: "12", name: "Inside Center" },
      { id: "13", name: "Outside Center" },
      { id: "14", name: "Right Wing" },
      { id: "15", name: "Full-back" }
    ],
    yellowCardDurationMS: 600000, // 10 minutes
    redCardDurationMS: 0, // Permanent
    isRedCardPermanent: true
  }
};

export default settings;
