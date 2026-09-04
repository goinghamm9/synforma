import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui";
import { HeroDiagram } from "./hero-diagram";
import { Container } from "./section";

export function Hero() {
  return (
    <section aria-labelledby="hero-heading">
      <Container className="grid gap-14 py-20 sm:py-24 lg:grid-cols-12 lg:gap-12 lg:py-32">
        <div className="flex flex-col justify-center lg:col-span-6">
          <p className="eyebrow">Autonomous Digital Adoption</p>
          <h1
            id="hero-heading"
            className="display mt-6 text-balance text-4xl text-ink sm:text-5xl lg:text-[3.4rem]"
          >
            Stop teaching people software.
            <br className="hidden sm:block" /> Let software understand people.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-graphite">
            Synforma learns how your organization works — across every application and every AI
            agent — and continuously determines the best way for humans and AI to accomplish the
            outcome together.
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/demo">
                Run the zero-configuration demo
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/thesis">Read the thesis</Link>
            </Button>
          </div>
          <p className="mt-8 max-w-md text-sm leading-relaxed text-slate">
            Software that learns how your organization works, and continuously makes it work
            better.
          </p>
        </div>
        <div className="flex items-center lg:col-span-6">
          <div className="w-full">
            <HeroDiagram />
          </div>
        </div>
      </Container>
    </section>
  );
}
