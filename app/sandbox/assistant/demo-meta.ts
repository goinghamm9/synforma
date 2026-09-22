/**
 * Demo descriptor for the Lumen Workspace sandbox. A plain data module with
 * no imports: Mission Control reads it to pre-fill the demo form. Nothing
 * here is used by the engine to recognize the application.
 */

export interface AssistantDemoMeta {
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

export const ASSISTANT_DEMO: AssistantDemoMeta = {
  id: "assistant",
  name: "Lumen Workspace",
  version: "2.3",
  versionV2: "2.4 preview",
  basePath: "/sandbox/assistant",
  entryPath: "/sandbox/assistant/projects",
  uiVersionKey: "lumen-ui-version",
  objective: `I want team leads to create a new assistant project in this workspace with approved instructions from the start.

A correctly created project must have:
1. A project name
2. Instructions from an approved template
3. At least one connected knowledge source
4. Data retention of 30 days or less
5. A reviewer assigned

Team leads must not share projects outside the organization. Success is every new project meeting all five requirements.`,
  context: {
    entryUrl: "/sandbox/assistant/projects",
    projectName: "Support triage helper",
    purpose: "Drafts first replies to support tickets from the knowledge base",
    reviewer: "Priya Natarajan — Head of Support",
  },
  contextFields: [
    { key: "entryUrl", label: "Entry page", hint: "URL of the project list to start from" },
    { key: "projectName", label: "Project name", hint: "Name of the new project" },
    { key: "purpose", label: "Purpose", hint: "Recorded on the project if the form asks" },
    { key: "reviewer", label: "Reviewer", hint: "Reviewer to assign, as listed in the workspace" },
  ],
  script: [
    "This is an AI-assistant workspace the engine has never seen: projects, knowledge sources, members and a four-step New project wizard.",
    "The objective is a platform lead's rules for new projects: a name, approved instructions, a connected knowledge source, retention of 30 days or less and a reviewer.",
    "Discovery reads the workspace by roles and labels only; watch it find the wizard, the template select and the commit control.",
    "Run it: the engine names the project, picks an approved template, connects a knowledge source, sets retention and assigns the reviewer, then stops at Create project for approval.",
    "The outcome page shows every requirement as a labelled value: Instruction template, Knowledge sources, Data retention and Reviewer.",
    "Now the vendor ships 2.4 preview: Assistants, Create assistant, Data source, Continue and a Governance tab holding retention. Run again and the same plan self-heals.",
  ],
};
