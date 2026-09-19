import { z } from "zod";

/**
 * Stimulus analysis: the predicted cortical response of an AVERAGE SUBJECT to
 * the screen content a person saw, produced offline by an encoding model
 * (TRIBE v2, Meta FAIR) from a screen recording.
 *
 * What it is: a property of the stimulus (the screens), like a readability
 * score: which brain systems a typical viewer's cortex is predicted to engage
 * while these screens are on display.
 *
 * What it is not: a measurement of anyone's brain, attention, emotion or
 * state. Synforma never records biometrics and never infers traits. The panel
 * that shows this data says so in the same words.
 *
 * The JSON is produced by services/tribe-bridge (Python) and imported here.
 * Nothing in the browser calls the model.
 */

export const STIMULUS_ANALYSIS_VERSION = 1;

/** Coarse cortical systems the bridge aggregates vertex predictions into. */
export const SYSTEM_IDS = ["visual", "language", "attention", "motor", "default", "other"] as const;
export type SystemId = (typeof SYSTEM_IDS)[number];

export const SYSTEM_LABEL: Record<SystemId, string> = {
  visual: "Visual cortex",
  language: "Language network",
  attention: "Dorsal attention / parietal",
  motor: "Sensorimotor",
  default: "Default-mode (medial)",
  other: "Other cortex",
};

const SeriesSchema = z.object({
  id: z.enum(SYSTEM_IDS),
  /** Number of fsaverage5 vertices aggregated into this system. */
  vertices: z.number().int().nonnegative(),
  /** Mean predicted response per sample, z-scored across the recording by the bridge. */
  values: z.array(z.number()),
});

const StepWindowSchema = z.object({
  stepId: z.string(),
  title: z.string(),
  /** Seconds from the start of the recording. */
  startS: z.number().nonnegative(),
  endS: z.number().nonnegative(),
});

export const StimulusAnalysisSchema = z.object({
  version: z.literal(STIMULUS_ANALYSIS_VERSION),
  id: z.string(),
  createdAt: z.number(),
  /** Which run (if any) the recording covers. */
  runId: z.string().optional(),
  programId: z.string().optional(),
  source: z.object({
    fileName: z.string(),
    durationS: z.number().positive(),
    /** Seconds between samples; TRIBE v2 predicts one sample per TR. */
    sampleS: z.number().positive(),
    /** Predictions are shifted back by this many seconds to undo the hemodynamic lag. */
    lagS: z.number(),
  }),
  model: z.object({
    name: z.string(),
    checkpoint: z.string(),
    subject: z.literal("average"),
    license: z.string(),
  }),
  systems: z.array(SeriesSchema).min(1),
  steps: z.array(StepWindowSchema),
  /** Fixed wording the bridge writes; the UI shows it verbatim. */
  disclaimer: z.string(),
});

export type StimulusAnalysis = z.infer<typeof StimulusAnalysisSchema>;
export type StimulusSeries = z.infer<typeof SeriesSchema>;
export type StepWindow = z.infer<typeof StepWindowSchema>;

export const DISCLAIMER =
  "Predicted response of an average subject's cortex to the recorded screen content (TRIBE v2 encoding model). A property of the screens, not a measurement of any person. Research use; the model is licensed CC BY-NC 4.0.";

/** Parse an imported JSON document; returns the analysis or a readable error. */
export function parseStimulusAnalysis(input: unknown): { ok: true; analysis: StimulusAnalysis } | { ok: false; error: string } {
  const result = StimulusAnalysisSchema.safeParse(input);
  if (result.success) {
    const lengths = new Set(result.data.systems.map((s) => s.values.length));
    if (lengths.size > 1) return { ok: false, error: "every system must have the same number of samples" };
    return { ok: true, analysis: result.data };
  }
  const first = result.error.issues[0];
  return { ok: false, error: first ? `${first.path.join(".") || "document"}: ${first.message}` : "invalid document" };
}

/** Mean predicted response of one system inside a step's window. */
export function stepMean(analysis: StimulusAnalysis, systemId: SystemId, step: StepWindow): number | null {
  const series = analysis.systems.find((s) => s.id === systemId);
  if (!series) return null;
  const from = Math.max(0, Math.floor(step.startS / analysis.source.sampleS));
  const to = Math.min(series.values.length, Math.ceil(step.endS / analysis.source.sampleS));
  if (to <= from) return null;
  let sum = 0;
  for (let i = from; i < to; i++) sum += series.values[i];
  return sum / (to - from);
}

/** Per-step, per-system means for a table or small multiples. */
export function stepTable(analysis: StimulusAnalysis): { step: StepWindow; means: Partial<Record<SystemId, number>> }[] {
  return analysis.steps.map((step) => {
    const means: Partial<Record<SystemId, number>> = {};
    for (const s of analysis.systems) {
      const m = stepMean(analysis, s.id, step);
      if (m !== null) means[s.id] = m;
    }
    return { step, means };
  });
}
