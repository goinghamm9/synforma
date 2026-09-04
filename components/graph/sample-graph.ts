import type { EdgeType, GraphEdge, GraphNode, NodeStatus, NodeType, WorkGraph } from "@/lib/synforma/types";
import { nodeId } from "@/lib/synforma/graph/work-graph";

/**
 * Illustrative Work Graph for one role, from the thesis example. Shown on /graph
 * when no program exists yet. It is hand-written and labelled as such in the UI;
 * nothing here is presented as discovered.
 */

const T0 = 1_756_684_800_000; // fixed timestamp: the sample never changes

interface Spec {
  type: NodeType;
  label: string;
  status?: NodeStatus;
  confidence?: number;
  description?: string;
  data?: Record<string, unknown>;
}

function node(spec: Spec): GraphNode {
  return {
    id: nodeId(spec.type, spec.label),
    type: spec.type,
    label: spec.label,
    description: spec.description,
    confidence: spec.confidence ?? (spec.status === "hypothesis" ? 0.55 : spec.status === "confirmed" ? 1 : 0.8),
    status: spec.status ?? "observed",
    discoveredAt: T0,
    data: spec.data,
  };
}

function edge(from: GraphNode, to: GraphNode, type: EdgeType, label?: string): GraphEdge {
  return { id: `${type}:${from.id}->${to.id}`, from: from.id, to: to.id, type, label };
}

const james = node({ type: "person", label: "James", status: "confirmed", description: "Signed-in employee. Identity-linked: a seat, not a segment." });
const ae = node({ type: "role", label: "Account Executive", status: "confirmed", description: "Role held by James." });

const buildPipeline = node({ type: "objective", label: "Build pipeline", status: "confirmed" });
const prepareMeetings = node({ type: "objective", label: "Prepare for meetings", status: "confirmed" });
const updateCrm = node({ type: "objective", label: "Update CRM", status: "confirmed", description: "Every new opportunity is properly qualified." });

const prospectResearch = node({ type: "workflow", label: "Prospect research", data: { steps: 0 } });
const meetingPrep = node({ type: "workflow", label: "Meeting preparation", data: { steps: 0 } });
const followUp = node({ type: "workflow", label: "Follow-up", data: { steps: 0 } });
const oppManagement = node({ type: "workflow", label: "Opportunity management", status: "hypothesis", confidence: 0.72, description: "Inferred from the objective and the discovered screens.", data: { steps: 4 } });

const salesforce = node({ type: "application", label: "Salesforce", status: "confirmed", data: { baseUrl: "https://example.my.salesforce.com" } });
const gmail = node({ type: "application", label: "Gmail", status: "confirmed" });
const slack = node({ type: "application", label: "Slack", status: "confirmed" });
const zoom = node({ type: "application", label: "Zoom", status: "confirmed" });
const chatgpt = node({ type: "application", label: "ChatGPT", status: "confirmed" });

const accountResearch = node({ type: "capability", label: "Account research", status: "hypothesis" });
const callSummarization = node({ type: "capability", label: "Call summarization", status: "hypothesis" });
const draftGeneration = node({ type: "capability", label: "Draft generation", status: "hypothesis" });
const crmExtraction = node({ type: "capability", label: "CRM extraction", status: "hypothesis", confidence: 0.4, description: "Candidate capability, pending evidence." });

const timeSaved = node({ type: "outcome", label: "Time saved", status: "hypothesis" });
const crmCompleteness = node({ type: "outcome", label: "CRM completeness", status: "hypothesis", description: "Share of new opportunities meeting all five requirements." });
const meetingsBooked = node({ type: "outcome", label: "Meetings booked", status: "hypothesis" });
const pipelineGenerated = node({ type: "outcome", label: "Pipeline generated", status: "hypothesis", confidence: 0.4 });

const leadRecord = node({ type: "screen", label: "Lead record", description: "/leads/:id", data: { route: "/leads/:id", fields: 0, actions: 2 } });
const oppWizard = node({ type: "screen", label: "New opportunity", description: "/opportunities/new", data: { route: "/opportunities/new", fields: 5, actions: 2 } });
const oppRecord = node({ type: "screen", label: "Opportunity record", description: "/opportunities/:id", data: { route: "/opportunities/:id", fields: 0, actions: 1 } });

const convertLead = node({ type: "action", label: "Convert to opportunity", description: "menu item · commit", data: { role: "menuitem", commit: true } });
const saveOpp = node({ type: "action", label: "Save opportunity", description: "button · commit", data: { role: "button", commit: true } });

const fDecisionMaker = node({ type: "field", label: "Decision-maker", data: { role: "combobox", required: true } });
const fBudget = node({ type: "field", label: "Budget status", data: { role: "combobox", options: ["Unknown", "Approved", "Allocated"] } });
const fTimeline = node({ type: "field", label: "Decision timeline", data: { role: "combobox", options: ["Unknown", "This quarter", "Next quarter"] } });
const fCompetitors = node({ type: "field", label: "Competitors", data: { role: "textbox" } });
const fNextStep = node({ type: "field", label: "Next step date", data: { role: "textbox", inputType: "date" } });

const lead = node({ type: "object", label: "Lead", description: "Attributes: Name, Company, Status" });
const opportunity = node({ type: "object", label: "Opportunity", description: "Attributes: Name, Amount, Stage, Close date" });

const rDecisionMaker = node({ type: "requirement", label: "A named decision-maker contact", status: "confirmed", data: { kind: "field", judgment: true } });
const rBudget = node({ type: "requirement", label: "Budget status confirmed", status: "confirmed", data: { kind: "field", judgment: false } });
const rTimeline = node({ type: "requirement", label: "A decision timeline", status: "confirmed", data: { kind: "field", judgment: false } });
const rCompetitors = node({ type: "requirement", label: "Competitors recorded", status: "confirmed", data: { kind: "field", judgment: true } });
const rNextStep = node({ type: "requirement", label: "Next step within 14 days", status: "confirmed", data: { kind: "field", judgment: false } });
const policy = node({ type: "policy", label: "No contract terms in free-text notes", status: "confirmed", data: { kind: "policy" } });

const s1 = node({ type: "step", label: "1. Open the inbound lead", status: "hypothesis", confidence: 0.72, description: "Guide: the person chooses which lead to work.", data: { mode: "guide", commit: false, judgment: true } });
const s2 = node({ type: "step", label: "2. Convert to opportunity", status: "hypothesis", confidence: 0.72, description: "Act: a menu action opens the wizard.", data: { mode: "act", commit: false, judgment: false } });
const s3 = node({ type: "step", label: "3. Qualify the opportunity", status: "hypothesis", confidence: 0.72, description: "Assist: fields are prepared, the person confirms judgment calls.", data: { mode: "assist", commit: false, judgment: true } });
const s4 = node({ type: "step", label: "4. Schedule the next step", status: "hypothesis", confidence: 0.72, description: "Act with approval: saving commits the record.", data: { mode: "act", commit: true, judgment: false } });

const intervention = node({ type: "intervention", label: "Inline note on budget status", status: "hypothesis", confidence: 0.5, description: "Proposed for step 3 after repeated hesitation on the budget field.", data: { technique: "just-in-time explanation", status: "proposed" } });

const nodes: GraphNode[] = [
  james, ae,
  buildPipeline, prepareMeetings, updateCrm,
  prospectResearch, meetingPrep, followUp, oppManagement,
  salesforce, gmail, slack, zoom, chatgpt,
  accountResearch, callSummarization, draftGeneration, crmExtraction,
  timeSaved, crmCompleteness, meetingsBooked, pipelineGenerated,
  leadRecord, oppWizard, oppRecord,
  convertLead, saveOpp,
  fDecisionMaker, fBudget, fTimeline, fCompetitors, fNextStep,
  lead, opportunity,
  rDecisionMaker, rBudget, rTimeline, rCompetitors, rNextStep, policy,
  s1, s2, s3, s4,
  intervention,
];

const edges: GraphEdge[] = [
  edge(james, ae, "assigned_to"),
  edge(ae, buildPipeline, "targets"),
  edge(ae, prepareMeetings, "targets"),
  edge(ae, updateCrm, "targets"),

  edge(prospectResearch, buildPipeline, "fulfills"),
  edge(meetingPrep, prepareMeetings, "fulfills"),
  edge(followUp, prepareMeetings, "fulfills"),
  edge(followUp, updateCrm, "fulfills"),
  edge(oppManagement, updateCrm, "fulfills"),
  edge(oppManagement, buildPipeline, "fulfills"),

  edge(prospectResearch, salesforce, "uses"),
  edge(prospectResearch, chatgpt, "uses"),
  edge(meetingPrep, zoom, "uses"),
  edge(meetingPrep, gmail, "uses"),
  edge(meetingPrep, salesforce, "uses"),
  edge(followUp, gmail, "uses"),
  edge(followUp, slack, "uses"),
  edge(followUp, salesforce, "uses"),
  edge(oppManagement, salesforce, "uses"),

  edge(prospectResearch, accountResearch, "depends_on", "augmented by"),
  edge(meetingPrep, callSummarization, "depends_on", "augmented by"),
  edge(followUp, draftGeneration, "depends_on", "augmented by"),
  edge(oppManagement, crmExtraction, "depends_on", "augmented by"),

  edge(accountResearch, chatgpt, "uses"),
  edge(callSummarization, zoom, "uses"),
  edge(draftGeneration, gmail, "uses"),
  edge(crmExtraction, salesforce, "uses"),

  edge(prospectResearch, pipelineGenerated, "produces"),
  edge(prospectResearch, timeSaved, "produces"),
  edge(meetingPrep, meetingsBooked, "produces"),
  edge(followUp, timeSaved, "produces"),
  edge(oppManagement, crmCompleteness, "produces"),
  edge(crmCompleteness, updateCrm, "fulfills"),
  edge(pipelineGenerated, buildPipeline, "fulfills"),
  edge(meetingsBooked, prepareMeetings, "fulfills"),

  edge(salesforce, leadRecord, "contains"),
  edge(salesforce, oppWizard, "contains"),
  edge(salesforce, oppRecord, "contains"),
  edge(leadRecord, oppWizard, "navigates_to", "Convert"),
  edge(oppWizard, oppRecord, "navigates_to", "Save"),
  edge(leadRecord, convertLead, "contains"),
  edge(convertLead, oppWizard, "navigates_to"),
  edge(oppWizard, saveOpp, "contains"),
  edge(saveOpp, oppRecord, "navigates_to"),
  edge(oppWizard, fDecisionMaker, "contains"),
  edge(oppWizard, fBudget, "contains"),
  edge(oppWizard, fTimeline, "contains"),
  edge(oppWizard, fCompetitors, "contains"),
  edge(oppWizard, fNextStep, "contains"),
  edge(leadRecord, lead, "uses", "shows"),
  edge(oppRecord, opportunity, "uses", "shows"),

  edge(fDecisionMaker, rDecisionMaker, "fulfills"),
  edge(fBudget, rBudget, "fulfills"),
  edge(fTimeline, rTimeline, "fulfills"),
  edge(fCompetitors, rCompetitors, "fulfills"),
  edge(fNextStep, rNextStep, "fulfills"),

  edge(oppManagement, s1, "contains"),
  edge(oppManagement, s2, "contains"),
  edge(oppManagement, s3, "contains"),
  edge(oppManagement, s4, "contains"),
  edge(s1, leadRecord, "targets"),
  edge(s2, leadRecord, "targets"),
  edge(s3, oppWizard, "targets"),
  edge(s4, oppWizard, "targets"),
  edge(s3, rDecisionMaker, "requires"),
  edge(s3, rBudget, "requires"),
  edge(s3, rTimeline, "requires"),
  edge(s3, rCompetitors, "requires"),
  edge(s4, rNextStep, "requires"),
  edge(oppManagement, policy, "constrained_by"),
  edge(intervention, s3, "addresses"),
];

export const SAMPLE_GRAPH: WorkGraph = Object.freeze({ id: "sample", nodes, edges, version: 1, updatedAt: T0 }) as WorkGraph;
