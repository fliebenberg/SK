export function createMatchTable(schema: string) {
  return `
    CREATE TABLE IF NOT EXISTS ${schema}.match (
      "id" serial PRIMARY KEY,
      "name" varchar(100) NOT NULL,
      "sportId" int NOT NULL REFERENCES sport(id),
      "eventId" int REFERENCES event(id),
      "fieldId" int REFERENCES field(id),
      "scheduledStart" timestamptz,
      "normalSegments" smallint,
      "normalSegmentTime" smallint,
      "drawRule" int REFERENCES "drawRule"(id),
      "extraSegments" smallint,
      "extraSegmentTime" smallint,
      "statusId" int REFERENCES "matchStatus"(id),
      "deleted" boolean DEFAULT false
    );
  `;
}
