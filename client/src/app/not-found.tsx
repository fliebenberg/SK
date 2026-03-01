import Link from "next/link";
import { Logo } from "@/components/Logo";
import { MetalButton } from "@/components/ui/MetalButton";
import { Home, AlertTriangle } from "lucide-react";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 text-center bg-background overflow-hidden relative">
      {/* Background Decorative Elements */}
      <div className="absolute top-1/4 -right-24 w-96 h-96 bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 -left-24 w-96 h-96 bg-orange-500/10 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="relative z-10 flex flex-col items-center max-w-2xl mx-auto">
        <div className="mb-8 animate-in fade-in zoom-in duration-700">
          <Logo size="lg" metalVariant="silver" glowColor="hsl(var(--primary))" />
        </div>

        <div className="space-y-4 mb-12">
          <h1 className="text-8xl md:text-9xl font-black font-orbitron tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-foreground to-muted-foreground/30 leading-none">
            404
          </h1>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-destructive/10 border border-destructive/20 text-destructive text-sm font-bold uppercase tracking-widest">
            <AlertTriangle className="w-4 h-4" /> Page Not Found
          </div>
          <p className="text-xl text-muted-foreground max-w-md mx-auto leading-relaxed">
            We could not find the page you were looking for.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
          <Link href="/" className="w-full sm:w-auto">
            <MetalButton 
              variantType="filled" 
              className="w-full sm:w-auto"
              glowColor="hsl(var(--primary))"
              icon={<Home className="w-5 h-5" />}
            >
              Return Home
            </MetalButton>
          </Link>
        </div>

        <div className="mt-16 text-muted-foreground/40 text-xs font-mono tracking-widest uppercase">
          ScoreKeeper System / Network Error: Route Resolution Failed
        </div>
      </div>

      {/* Grid Pattern Overlay */}
      <div className="fixed inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20 pointer-events-none" />
    </main>
  );
}
