import { ProductNav } from "@/components/product/product-nav";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function ProductLayout({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-screen flex-col bg-paper">
        <ProductNav />
        <main className="flex flex-1 flex-col">{children}</main>
      </div>
    </TooltipProvider>
  );
}
