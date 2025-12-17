export function createTeamRoleTable(schema: string) {
  return `
    CREATE TABLE IF NOT EXISTS ${schema}."teamRole" (
      "id" serial PRIMARY KEY,
      "name" varchar(100) NOT NULL,
      "deleted" boolean DEFAULT false
    );
    INSERT INTO ${schema}."teamRole"
    ("name")
    VALUES
    ('Coach'),
    ('Assistant Coach'),
    ('Scorer'),
    ('Time Keeper'),
    ('First Aid')
    ;
  `;
}
