/**
 * Demo descriptor for the Nimbus Data Console sandbox. A plain data module
 * with no imports: Mission Control reads it to pre-fill the demo form.
 * Nothing here is used by the engine to recognize the application.
 */

export interface DataDemoMeta {
  id: string;
  name: string;
  version: string;
  versionV2: string;
  basePath: string;
  entryPath: string;
  uiVersionKey: string;
  objective: string;
  context: Record<string, string>;
  contextFields: { key: string; label: string; hint: string }[];
  script: string[];
}

export const DATA_DEMO: DataDemoMeta = {
  id: "data",
  name: "Nimbus Data Console",
  version: "2.14",
  versionV2: "2.15 preview",
  basePath: "/sandbox/data",
  entryPath: "/sandbox/data/projects/PRJ-2001/tables",
  uiVersionKey: "nimbus-ui-version",
  objective: `I want developers to create a new table in this project with row level security switched on from the start.

A correctly created table must have:
1. A table name in snake_case
2. A primary key column named id
3. Row level security enabled
4. A policy that allows authenticated users to read their own rows
5. A description recorded for the table

Developers must not disable row level security on existing tables. Success is every new table meeting all five requirements.`,
  context: {
    entryUrl: "/sandbox/data/projects/PRJ-2001/tables",
    tableName: "customer_notes",
    description: "Free-text notes agents attach to a customer",
    policyName: "Users read own rows",
  },
  contextFields: [
    { key: "entryUrl", label: "Entry page", hint: "URL of the table list to start from" },
    { key: "tableName", label: "Table name", hint: "snake_case name for the new table" },
    { key: "description", label: "Description", hint: "Recorded on the table" },
    { key: "policyName", label: "Policy name", hint: "Name of the read-own-rows policy" },
  ],
  script: [
    "This is a developer console the engine has never seen: a project, a table editor and a four-step New table wizard.",
    "The objective asks for five things on every new table: a snake_case name, an id primary key, row level security, a read-own-rows policy and a description.",
    "Discovery reads the console by roles and labels only; watch it find the wizard, the Row level security switch and the policy form.",
    "Run it: the engine names the table customer_notes, keeps the id primary key, switches RLS on, adds the policy and records the description, then stops at Create table for approval.",
    "The outcome page shows every requirement as a labelled value: Primary key id, Row level security Enabled, the policy and the description.",
    "Now the vendor ships 2.15 preview: Tables, Create table, RLS protection and a Policies tab. Run again and the same plan self-heals.",
  ],
};
