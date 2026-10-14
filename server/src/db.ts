import pg from "pg";

// Return DATE columns as plain 'YYYY-MM-DD' strings instead of JS Dates
pg.types.setTypeParser(1082, (value) => value);

export function createPool(connectionString: string) {
  return new pg.Pool({ connectionString, max: 10 });
}

export type Pool = pg.Pool;
