import { AdoptionLoop } from "@/components/site/adoption-loop";
import { AssumptionSection } from "@/components/site/assumption";
import { ConnectEnterprise } from "@/components/site/connect-enterprise";
import { GuideAssistAct } from "@/components/site/guide-assist-act";
import { Hero } from "@/components/site/hero";
import { InteractionLayer } from "@/components/site/interaction-layer";
import { MagicTrick } from "@/components/site/magic-trick";
import { NorthStar } from "@/components/site/north-star";
import { ObjectiveToProgram } from "@/components/site/objective-to-program";
import { Simulation } from "@/components/site/simulation";
import { TrustSection } from "@/components/site/trust";
import { WorkGraphSection } from "@/components/site/work-graph-section";

export default function HomePage() {
  return (
    <>
      <Hero />
      <AssumptionSection />
      <GuideAssistAct />
      <WorkGraphSection />
      <ObjectiveToProgram />
      <AdoptionLoop />
      <InteractionLayer />
      <Simulation />
      <ConnectEnterprise />
      <TrustSection />
      <NorthStar />
      <MagicTrick />
    </>
  );
}
