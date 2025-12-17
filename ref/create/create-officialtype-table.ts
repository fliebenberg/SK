export function createOfficialTypeTable(schema: string) {
  return `
    CREATE TABLE IF NOT EXISTS ${schema}."officialType" (
      "id" serial PRIMARY KEY,
      "name" varchar(100) NOT NULL,
      "sportId" int REFERENCES sport(id),
      "deleted" boolean DEFAULT false
    );
    INSERT INTO ${schema}."officialType"
    ("name", "sportId")
    VALUES
    ('Time Keeper', null),
    ('Scorer', null)
    ;
  `;
}
