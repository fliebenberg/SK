export function createMatchStatusTable(schema: string) {
  return `
    CREATE TABLE IF NOT EXISTS ${schema}."matchStatus" (
      "id" serial PRIMARY KEY,
      "name" varchar(100) NOT NULL,
      "description" varchar(500),
      "deleted" boolean DEFAULT false
    );
    INSERT INTO ${schema}."matchStatus"
    ("name", "description")
    VALUES
    ('Not Started', 'Match has not started yet'),
    ('In Progress', 'Match is currently in progress'),
    ('Ended', 'Match has ended'),
    ('Abondoned', 'Match was abondoned or could not be finished')
    ;
  `;
}
