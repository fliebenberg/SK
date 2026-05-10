import { Sport } from "../../models/sport/Sport";
import { RUGBY_EVENTS } from "./events";
import settings from "./settings";

export const RUGBY_CONFIG: Sport = {
  ...settings,
  eventTemplates: RUGBY_EVENTS
};
