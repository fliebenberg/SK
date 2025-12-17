export function createPositionTable(schema: string) {
  return `
    CREATE TABLE IF NOT EXISTS ${schema}."position" (
      "id" serial PRIMARY KEY,
      "name" varchar(100) NOT NULL,
      "code" varchar(3),
      "sportId" int NOT NULL REFERENCES sport(id),
      "deleted" boolean DEFAULT false
    );
  `;
}
