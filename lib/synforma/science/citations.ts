/**
 * Citation registry.
 *
 * Every research reference used anywhere in Synforma must come from this list.
 * The planner and the UI may only reference citations by id. Nothing here was
 * invented: each entry is a real, widely cited publication with its DOI.
 */

export interface Citation {
  id: string;
  authors: string;
  year: number;
  title: string;
  venue: string;
  doi: string;
  /** What Synforma takes from it, stated carefully. */
  relevance: string;
}

export const CITATIONS: Citation[] = [
  {
    id: "michie2011",
    authors: "Michie S, van Stralen MM, West R",
    year: 2011,
    title: "The behaviour change wheel: A new method for characterising and designing behaviour change interventions",
    venue: "Implementation Science 6:42",
    doi: "10.1186/1748-5908-6-42",
    relevance: "The COM-B model (capability, opportunity, motivation → behavior) that Synforma adapts as a barrier taxonomy for software-mediated work.",
  },
  {
    id: "michie2013",
    authors: "Michie S, Richardson M, Johnston M, Abraham C, Francis J, Hardeman W, Eccles MP, Cane J, Wood CE",
    year: 2013,
    title: "The Behavior Change Technique Taxonomy (v1) of 93 hierarchically clustered techniques",
    venue: "Annals of Behavioral Medicine 46(1):81–95",
    doi: "10.1007/s12160-013-9486-6",
    relevance: "A shared vocabulary of behavior change techniques; Synforma's intervention registry maps to it instead of inventing techniques.",
  },
  {
    id: "gollwitzer2006",
    authors: "Gollwitzer PM, Sheeran P",
    year: 2006,
    title: "Implementation intentions and goal achievement: A meta-analysis of effects and processes",
    venue: "Advances in Experimental Social Psychology 38:69–119",
    doi: "10.1016/S0065-2601(06)38002-1",
    relevance: "If-then plans reliably improve goal attainment in the studied domains; Synforma treats their use inside enterprise software as a hypothesis to test.",
  },
  {
    id: "wood2016",
    authors: "Wood W, Rünger D",
    year: 2016,
    title: "Psychology of habit",
    venue: "Annual Review of Psychology 67:289–314",
    doi: "10.1146/annurev-psych-122414-033417",
    relevance: "Repeated behavior in stable contexts becomes cue-driven; durable adoption is about context and repetition, not motivation alone.",
  },
  {
    id: "sheeran2016",
    authors: "Sheeran P, Webb TL",
    year: 2016,
    title: "The intention–behavior gap",
    venue: "Social and Personality Psychology Compass 10(9):503–518",
    doi: "10.1111/spc3.12265",
    relevance: "Intentions alone explain a limited share of behavior; the gap is where Synforma's Intent-to-Outcome Rate lives.",
  },
  {
    id: "ryan2000",
    authors: "Ryan RM, Deci EL",
    year: 2000,
    title: "Self-determination theory and the facilitation of intrinsic motivation, social development, and well-being",
    venue: "American Psychologist 55(1):68–78",
    doi: "10.1037/0003-066X.55.1.68",
    relevance: "Autonomy, competence and relatedness; Synforma's assistance must support autonomy rather than coerce.",
  },
  {
    id: "harkin2016",
    authors: "Harkin B, Webb TL, Chang BPI, Prestwich A, Conner M, Kellar I, Benn Y, Sheeran P",
    year: 2016,
    title: "Does monitoring goal progress promote goal attainment? A meta-analysis of the experimental evidence",
    venue: "Psychological Bulletin 142(2):198–229",
    doi: "10.1037/bul0000025",
    relevance: "Progress monitoring improves goal attainment; basis for requirement checklists during a workflow.",
  },
  {
    id: "locke2002",
    authors: "Locke EA, Latham GP",
    year: 2002,
    title: "Building a practically useful theory of goal setting and task motivation: A 35-year odyssey",
    venue: "American Psychologist 57(9):705–717",
    doi: "10.1037/0003-066X.57.9.705",
    relevance: "Specific goals outperform vague ones; why an objective is converted into observable requirements.",
  },
  {
    id: "bandura1977",
    authors: "Bandura A",
    year: 1977,
    title: "Self-efficacy: Toward a unifying theory of behavioral change",
    venue: "Psychological Review 84(2):191–215",
    doi: "10.1037/0033-295X.84.2.191",
    relevance: "Mastery experiences build confidence; basis for graded first runs rather than automating everything away.",
  },
  {
    id: "sweller1988",
    authors: "Sweller J",
    year: 1988,
    title: "Cognitive load during problem solving: Effects on learning",
    venue: "Cognitive Science 12(2):257–285",
    doi: "10.1207/s15516709cog1202_4",
    relevance: "Extraneous load impairs performance and learning; contextual pointers and worked examples reduce it.",
  },
  {
    id: "nielsen1994",
    authors: "Nielsen J",
    year: 1994,
    title: "Enhancing the explanatory power of usability heuristics",
    venue: "Proceedings of CHI '94",
    doi: "10.1145/191666.191729",
    relevance: "Recognition over recall, visibility of system status; why hidden controls are an opportunity barrier, not a user failing.",
  },
  {
    id: "parasuraman2000",
    authors: "Parasuraman R, Sheridan TB, Wickens CD",
    year: 2000,
    title: "A model for types and levels of human interaction with automation",
    venue: "IEEE Transactions on Systems, Man, and Cybernetics — Part A 30(3):286–297",
    doi: "10.1109/3468.844354",
    relevance: "Levels of automation; the conceptual basis for choosing between Guide, Assist and Act per step.",
  },
  {
    id: "amershi2019",
    authors: "Amershi S, Weld D, Vorvoreanu M, Fourney A, Nushi B, Collisson P, Suh J, Iqbal S, Bennett PN, Inkpen K, Teevan J, Kikin-Gil R, Horvitz E",
    year: 2019,
    title: "Guidelines for Human-AI Interaction",
    venue: "Proceedings of CHI 2019",
    doi: "10.1145/3290605.3300233",
    relevance: "Make clear what the system can do, why it did what it did, and support efficient correction; the basis for 'Why this?' and approval controls.",
  },
];

export const CITATION_BY_ID: Record<string, Citation> = Object.fromEntries(CITATIONS.map((c) => [c.id, c]));

export function cite(id: string): Citation | undefined {
  return CITATION_BY_ID[id];
}
