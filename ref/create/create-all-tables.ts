import { customError, logger } from "../../../libs/logger";
import * as db from "../../connect";
import { createSportTable } from "./create-sport-table";
import { createTeamTable } from "./create-team-table";
import { createOfficialTypeTable } from "./create-officialtype-table";
import { createPositionTable } from "./create-position-table";
import { createDrawRuleTable } from "./create-drawrule-table";
import { createAddressTable } from "./create-address-table";
import { createVenueTable } from "./create-venue-table";
import { createFieldTable } from "./create-field-table";
import { createTeamRoleTable } from "./create-teamrole-table";
import { createMatchTable } from "./create-match-table";
import { createMatchOfficialTable } from "./create-matchofficial-table";
import { createMatchPlayerTable } from "./create-matchplayer-table";
import { createMatchStatusTable } from "./create-matchstatus-table";
import { createMatchStatsTable } from "./create-matchstats-table";
import { createEventTable } from "./create-event-table";
import { createOrganisationTable } from "../../models/organisation.srv";
import { createPersonTable } from "../../models/person.srv";

// list of all tables. Tabes will be created in the order they are specified. Tables will be dropped in reverse order.
const allTables = [
  { name: "person", queryFn: createPersonTable },
  { name: "sport", queryFn: createSportTable },
  { name: "drawRule", queryFn: createDrawRuleTable },
  { name: "address", queryFn: createAddressTable },
  { name: "teamRole", queryFn: createTeamRoleTable },
  { name: "matchStatus", queryFn: createMatchStatusTable },

  { name: "organisation", queryFn: createOrganisationTable },
  { name: "venue", queryFn: createVenueTable },
  { name: "event", queryFn: createEventTable },
  { name: "field", queryFn: createFieldTable },
  { name: "team", queryFn: createTeamTable },
  { name: "officialType", queryFn: createOfficialTypeTable },
  { name: "position", queryFn: createPositionTable },
  { name: "match", queryFn: createMatchTable },
  { name: "matchOfficial", queryFn: createMatchOfficialTable },
  { name: "matchPlayer", queryFn: createMatchPlayerTable },
  { name: "matchStats", queryFn: createMatchStatsTable },
];

export async function createTables(schema: string, tableNames: string[] = []) {
  let tables = [...allTables];
  if (tableNames.length > 0) {
    tables = tables.filter((table) => tableNames.includes(table.name));
  }
  if (
    await confirmCreateTables(
      schema,
      tables.map((table) => table.name)
    )
  ) {
    for (const table of tables) {
      logger.debug(`Creating table: ${schema}.${table.name}`);
      try {
        let queryResult = await db.query(table.queryFn(schema), []);
        logger.debug(`Successfully created table: ${schema}.${table.name}`);
      } catch (error) {
        customError(`Error creating table ${schema}.${table.name}: `, error);
      }
    }
  }
}

export async function dropTables(schema: string, tableNames: string[] = []) {
  let tables = [...allTables].map((table) => table.name).reverse();
  if (tableNames.length > 0) {
    tables = tables.filter((table) => tableNames.includes(table));
  }
  if (await confirmDropTables(schema, tables)) {
    for (const table of tables) {
      try {
        await db.query(
          `
          DROP TABLE IF EXISTS ${schema}."${table}";
        `,
          []
        );
        logger.debug(`Successfully dropped table: ${schema}.${table}`);
      } catch (error) {
        throw customError(`Error dropping table ${schema}.${table}: `, error);
      }
    }
  }
}

const readline = require("readline");

function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) =>
    rl.question(query, (ans: string) => {
      rl.close();
      resolve(ans);
    })
  );
}

export async function confirmDropTables(schema: string, tableNames: string[]) {
  let questionStr =
    `DELETING Tables from database: ${db.database} on server: ${db.server}\n` +
    tableNames.map((name) => `${schema}.${name}`).join(", \n");
  logger.warn(`${questionStr}\n`);
  const answer = await askQuestion(
    `Are you sure you want to drop all the above tables? (yes/no):`
  );
  if (answer.toLowerCase() !== "yes") {
    console.log("Drop Tables operation cancelled.");
    return false;
  }
  return true;
}

export async function confirmCreateTables(
  schema: string,
  tableNames: string[]
) {
  let questionStr =
    `CREATING Tables in database: ${db.database} on server: ${db.server} \n` +
    tableNames.map((name) => `${schema}.${name}`).join(", \n");
  logger.warn(`${questionStr}\n`);
  const answer = await askQuestion(
    `Are you sure you want to create all the above tables? (yes/no):`
  );
  if (answer.toLowerCase() !== "yes") {
    console.log("Create Tables operation cancelled.");
    return false;
  }
  return true;
}
