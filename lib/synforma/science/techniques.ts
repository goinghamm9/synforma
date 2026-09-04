import type { BarrierType, EvidenceClass, InterventionTechnique } from "../types";

/**
 * Intervention technique registry.
 *
 * The adoption engine can only select from this list. If a live LLM proposes
 * something outside it, the UI labels it "Experimental suggestion".
 *
 * Evidence classes describe the general research base of a technique. Applying
 * it to software-mediated work is a product hypothesis that Synforma tests per
 * program with control/treatment cohorts.
 */

export const EVIDENCE_LABEL: Record<EvidenceClass, string> = {
  strong: "Strong evidence",
  promising: "Promising evidence",
  theoretical: "Theoretical",
  philosophical: "Philosophical",
  experimental: "Experimental",
};

export const EVIDENCE_WEIGHT: Record<EvidenceClass, number> = {
  strong: 1,
  promising: 0.75,
  theoretical: 0.5,
  philosophical: 0.3,
  experimental: 0.35,
};

export const BARRIER_LABEL: Record<BarrierType, string> = {
  capability_knowledge: "Knowledge: does not know the step exists or what it means",
  capability_skill: "Skill: knows what to do, the interaction itself is hard",
  opportunity_visibility: "Visibility: the control is hidden, collapsed or elsewhere",
  opportunity_friction: "Friction: the interface makes the step slow or error-prone",
  motivation_uncertainty: "Uncertainty: hesitates because the right thing is unclear",
  motivation_value: "Value: does not see why the step matters",
};

export const BARRIER_SHORT: Record<BarrierType, string> = {
  capability_knowledge: "Knowledge",
  capability_skill: "Skill",
  opportunity_visibility: "Visibility",
  opportunity_friction: "Friction",
  motivation_uncertainty: "Uncertainty",
  motivation_value: "Value",
};

export const TECHNIQUES: InterventionTechnique[] = [
  {
    id: "contextual_pointer",
    name: "Contextual pointer",
    mechanism: "Recognition over recall: show where the control is, at the moment it is needed, anchored to the live interface.",
    barriers: ["opportunity_visibility", "capability_knowledge"],
    description: "Highlights the semantic element (not a selector) the person needs next and names what to do there.",
    example: "\"Competitors and next step are under Advanced qualification — expand it.\" with the disclosure highlighted.",
    mode: "guide",
    evidence: "theoretical",
    sourceIds: ["nielsen1994", "sweller1988"],
    cautions: ["Do not show pointers for steps the person already completes reliably."],
    burden: 0.1,
  },
  {
    id: "inline_explanation",
    name: "Inline explanation",
    mechanism: "Instruction on how to perform the behavior, tied to the organization's own requirement wording.",
    barriers: ["capability_knowledge", "motivation_value"],
    description: "Explains what a requirement means and why it matters, quoting the objective rather than inventing policy.",
    example: "\"A named decision-maker is required so forecasting excludes unqualified deals (requirement 1).\"",
    mode: "guide",
    evidence: "theoretical",
    sourceIds: ["michie2013"],
    cautions: ["Keep to two sentences; long explanations add load."],
    burden: 0.15,
  },
  {
    id: "format_example",
    name: "Worked example",
    mechanism: "A concrete example of the expected input reduces extraneous cognitive load.",
    barriers: ["capability_skill"],
    description: "Shows the exact format the field accepts with a valid example the person can copy.",
    example: "\"Enter the date as YYYY-MM-DD, e.g. 2026-09-18.\"",
    mode: "guide",
    evidence: "theoretical",
    sourceIds: ["sweller1988", "michie2013"],
    cautions: [],
    burden: 0.1,
  },
  {
    id: "policy_clarification",
    name: "Policy clarification",
    mechanism: "Removes reflective-motivation uncertainty by surfacing the relevant rule at the moment of hesitation.",
    barriers: ["motivation_uncertainty"],
    description: "Quotes the applicable requirement or policy constraint next to the decision point.",
    example: "\"Budget counts as confirmed only when Approved or Allocated (requirement 2).\"",
    mode: "guide",
    evidence: "theoretical",
    sourceIds: ["michie2011"],
    cautions: ["Only quote policy text that exists in the program; never invent policy."],
    burden: 0.15,
  },
  {
    id: "if_then_cue",
    name: "If-then cue",
    mechanism: "Links a situational cue to the intended action so the step is triggered by context rather than remembered.",
    barriers: ["capability_knowledge", "motivation_uncertainty"],
    description: "Frames the next action as an if-then plan anchored to something the person will see.",
    example: "\"When the Review step opens, check the five qualification requirements before creating.\"",
    mode: "guide",
    evidence: "promising",
    sourceIds: ["gollwitzer2006", "sheeran2016"],
    cautions: ["Evidence comes from personal goal pursuit; transfer to enterprise workflows is a product hypothesis."],
    burden: 0.2,
  },
  {
    id: "requirement_checklist",
    name: "Requirement checklist",
    mechanism: "Progress monitoring: makes the gap between current state and the objective visible.",
    barriers: ["capability_knowledge", "motivation_value"],
    description: "A live checklist of the objective's requirements, ticking as the interface reflects them.",
    example: "\"3 of 5 requirements met — missing: competitors, next step date.\"",
    mode: "guide",
    evidence: "promising",
    sourceIds: ["harkin2016", "locke2002"],
    cautions: ["Checklist status must be computed from the live interface, never assumed."],
    burden: 0.2,
  },
  {
    id: "prefill_assist",
    name: "Prefill and review",
    mechanism: "Partial automation: Synforma prepares derivable inputs; the person reviews and decides.",
    barriers: ["opportunity_friction", "capability_skill"],
    description: "Fills fields that can be derived from context and asks the person to confirm the ones needing judgment.",
    example: "\"I've prepared amount, close date and next step from the lead. Review decision-maker and budget.\"",
    mode: "assist",
    evidence: "theoretical",
    sourceIds: ["parasuraman2000", "amershi2019"],
    cautions: ["Never prefill judgment fields with guesses.", "Show what was prefilled and why."],
    burden: 0.3,
  },
  {
    id: "act_on_behalf",
    name: "Act on behalf",
    mechanism: "Full automation of a step with no judgment content, under authorization, logging and approval.",
    barriers: ["opportunity_friction"],
    description: "Synforma performs the step; commits require approval and every action is audited.",
    example: "\"I've opened the conversion form from the lead's Actions menu.\"",
    mode: "act",
    evidence: "theoretical",
    sourceIds: ["parasuraman2000"],
    cautions: ["Never for steps that require human judgment.", "Commit actions are always approval-gated."],
    burden: 0.05,
  },
  {
    id: "graded_first_run",
    name: "Graded first run",
    mechanism: "Mastery experience: the first attempt is broken into smaller confirmations so competence builds.",
    barriers: ["capability_skill", "motivation_uncertainty"],
    description: "On a person's first run, confirm after each step instead of at the end.",
    example: "\"Basics done. Next: qualification — I'll point out each requirement as you go.\"",
    mode: "guide",
    evidence: "promising",
    sourceIds: ["bandura1977", "michie2013"],
    cautions: ["Fade out after the first successful run to avoid nagging."],
    burden: 0.35,
  },
];

export const TECHNIQUE_BY_ID: Record<string, InterventionTechnique> = Object.fromEntries(TECHNIQUES.map((t) => [t.id, t]));

export function techniquesForBarrier(barrier: BarrierType): InterventionTechnique[] {
  return TECHNIQUES.filter((t) => t.barriers.includes(barrier));
}
