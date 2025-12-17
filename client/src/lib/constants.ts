export const AVAILABLE_SPORTS = [
  "Rugby",
  "Netball",
  "Hockey",
  "Cricket",
  "Tennis",
  "Chess",
  "Soccer",
] as const;

export type SportType = typeof AVAILABLE_SPORTS[number];
