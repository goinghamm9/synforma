import type { RunCapabilities } from "../planner/types";

/**
 * Synthetic users — simulation before rollout.
 *
 * A synthetic user is the real runner with capabilities switched off. It is
 * not a model of a person; it is a bounded agent with a specific limitation.
 * Its runs are labeled "synthetic" everywhere and never mixed into human
 * timing statistics.
 */

export interface Persona {
  id: string;
  name: string;
  description: string;
  capabilities: RunCapabilities;
}

export const PERSONAS: Persona[] = [
  {
    id: "thorough",
    name: "Thorough operator",
    description: "Reads every label, expands sections, fixes validation errors. The reference run.",
    capabilities: { synonyms: true, expand: true, fixValidation: true, fillOptional: true },
  },
  {
    id: "literal",
    name: "Literal reader",
    description: "Only recognizes fields whose label matches the requirement wording exactly; no synonyms.",
    capabilities: { synonyms: false, expand: true, fixValidation: true, fillOptional: true },
  },
  {
    id: "surface",
    name: "Surface skimmer",
    description: "Never expands collapsed sections or secondary tabs; misses hidden fields.",
    capabilities: { synonyms: true, expand: false, fixValidation: true, fillOptional: true },
  },
  {
    id: "hurried",
    name: "Hurried closer",
    description: "Skips fields the interface does not mark as required; gives up on validation errors.",
    capabilities: { synonyms: true, expand: true, fixValidation: false, fillOptional: false },
  },
];

export const PERSONA_BY_ID: Record<string, Persona> = Object.fromEntries(PERSONAS.map((p) => [p.id, p]));
