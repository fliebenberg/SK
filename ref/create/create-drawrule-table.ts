export function createDrawRuleTable(schema: string) {
  return `
    CREATE TABLE IF NOT EXISTS ${schema}."drawRule" (
      "id" serial PRIMARY KEY,
      "name" varchar(100) NOT NULL,
      "description" varchar(500),
      "deleted" boolean DEFAULT false
    );
    INSERT INTO ${schema}."drawRule"
    ("name", "description")
    VALUES
    ('Nothing', 'Match can end in draw'),
    ('Sudden Death', 'Match ends as soon as a team scores'),
    ('Extra Time', 'Match is extended with extra play time')
    ;
  `;
}
