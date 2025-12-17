import { Logo } from "@/components/Logo";
import { MetalButton } from "@/components/ui/MetalButton";

export default function ComponentsPage() {
  return (
    <main className="flex min-h-screen flex-col items-center p-24 gap-12 bg-slate-50 dark:bg-slate-950">
      <h1 className="text-4xl font-bold mb-8 text-slate-900 dark:text-slate-100">Design Components</h1>
      
      <section className="flex flex-col items-center gap-8 w-full">
        <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-200">Button Variants</h2>
        <div className="flex flex-col gap-8 w-full items-center">
          
          {/* Light Background Examples - Force Light Theme */}
          <div className="light-orange flex flex-col gap-8 p-8 bg-white rounded-xl shadow-sm w-full max-w-4xl">
            <h3 className="w-full text-center text-slate-500 text-lg font-medium mb-4">Light Background</h3>
            
            {/* Green Variations */}
            <div className="flex flex-col gap-4">
              <h4 className="text-slate-400 text-sm font-medium uppercase tracking-wider text-center">Neon Green</h4>
              <div className="flex flex-wrap justify-center gap-8">
                <div className="flex flex-col items-center gap-2">
                  <span className="text-xs text-slate-400">Filled</span>
                  <MetalButton variantType="filled" glowColor="#39ff14" className="text-slate-900">FILLED</MetalButton>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <span className="text-xs text-slate-400">Primary</span>
                  <MetalButton metalVariant="silver" isPrimary glowColor="#39ff14">PRIMARY</MetalButton>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <span className="text-xs text-slate-400">Secondary</span>
                  <MetalButton metalVariant="silver">SECONDARY</MetalButton>
                </div>
              </div>
            </div>

            <div className="w-full h-px bg-slate-100 my-2" />

            {/* Orange Variations */}
            <div className="flex flex-col gap-4">
              <h4 className="text-slate-400 text-sm font-medium uppercase tracking-wider text-center">Neon Orange</h4>
              <div className="flex flex-wrap justify-center gap-8">
                <div className="flex flex-col items-center gap-2">
                  <span className="text-xs text-slate-400">Filled</span>
                  <MetalButton variantType="filled" glowColor="#FF5F1F" className="text-slate-900">FILLED</MetalButton>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <span className="text-xs text-slate-400">Primary</span>
                  <MetalButton metalVariant="silver" isPrimary glowColor="#FF5F1F">PRIMARY</MetalButton>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <span className="text-xs text-slate-400">Secondary</span>
                  <MetalButton metalVariant="silver">SECONDARY</MetalButton>
                </div>
              </div>
            </div>
          </div>

          {/* Dark Background Examples - Force Dark Theme */}
          <div className="dark-green flex flex-col gap-8 p-8 bg-slate-950 rounded-xl shadow-sm w-full max-w-4xl">
            <h3 className="w-full text-center text-slate-400 text-lg font-medium mb-4">Dark Background</h3>
            
            {/* Green Variations */}
            <div className="flex flex-col gap-4">
              <h4 className="text-slate-600 text-sm font-medium uppercase tracking-wider text-center">Neon Green</h4>
              <div className="flex flex-wrap justify-center gap-8">
                <div className="flex flex-col items-center gap-2">
                  <span className="text-xs text-slate-600">Filled</span>
                  <MetalButton variantType="filled" glowColor="#39ff14" className="text-slate-900">FILLED</MetalButton>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <span className="text-xs text-slate-600">Primary</span>
                  <MetalButton metalVariant="silver-dark" isPrimary glowColor="#39ff14">PRIMARY</MetalButton>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <span className="text-xs text-slate-600">Secondary</span>
                  <MetalButton metalVariant="silver-dark">SECONDARY</MetalButton>
                </div>
              </div>
            </div>

            <div className="w-full h-px bg-slate-900 my-2" />

            {/* Orange Variations */}
            <div className="flex flex-col gap-4">
              <h4 className="text-slate-600 text-sm font-medium uppercase tracking-wider text-center">Neon Orange</h4>
              <div className="flex flex-wrap justify-center gap-8">
                <div className="flex flex-col items-center gap-2">
                  <span className="text-xs text-slate-600">Filled</span>
                  <MetalButton variantType="filled" glowColor="#FF5F1F" className="text-slate-900">FILLED</MetalButton>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <span className="text-xs text-slate-600">Primary</span>
                  <MetalButton metalVariant="silver-dark" isPrimary glowColor="#FF5F1F">PRIMARY</MetalButton>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <span className="text-xs text-slate-600">Secondary</span>
                  <MetalButton metalVariant="silver-dark">SECONDARY</MetalButton>
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

      <section className="flex flex-col items-center gap-8 w-full">
        <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-200">Logos</h2>
        
        <div className="flex flex-col gap-8 w-full items-center">
            {/* Light Background Examples */}
            <div className="flex flex-col items-center gap-4 p-8 bg-white rounded-xl shadow-sm w-full max-w-4xl">
                <h3 className="text-lg font-medium text-slate-500">Light Background</h3>
                <div className="flex flex-wrap justify-center gap-8">
                    <div className="flex flex-col items-center gap-2">
                    <span className="text-sm text-muted-foreground">Small</span>
                    <Logo size="sm" />
                    </div>
                    <div className="flex flex-col items-center gap-2">
                    <span className="text-sm text-muted-foreground">Medium</span>
                    <Logo size="md" />
                    </div>
                    <div className="flex flex-col items-center gap-2">
                    <span className="text-sm text-muted-foreground">Large</span>
                    <Logo size="lg" />
                    </div>
                    <div className="flex flex-col items-center gap-2">
                    <span className="text-sm text-muted-foreground">Extra Large</span>
                    <Logo size="xl" />
                    </div>
                </div>

                <div className="flex flex-wrap justify-center gap-8 mt-4">
                    <div className="flex flex-col items-center gap-2">
                    <span className="text-sm text-muted-foreground">Small (Neon Orange)</span>
                    <Logo size="sm" glowColor="#FF5F1F" />
                    </div>
                    <div className="flex flex-col items-center gap-2">
                    <span className="text-sm text-muted-foreground">Medium (Neon Orange)</span>
                    <Logo size="md" glowColor="#FF5F1F" />
                    </div>
                    <div className="flex flex-col items-center gap-2">
                    <span className="text-sm text-muted-foreground">Large (Neon Orange)</span>
                    <Logo size="lg" glowColor="#FF5F1F" />
                    </div>
                    <div className="flex flex-col items-center gap-2">
                    <span className="text-sm text-muted-foreground">Extra Large (Neon Orange)</span>
                    <Logo size="xl" glowColor="#FF5F1F" />
                    </div>
                </div>
            </div>

            {/* Dark Background Examples */}
            <div className="flex flex-col items-center gap-4 p-8 bg-slate-950 rounded-xl shadow-sm w-full max-w-4xl">
                <h3 className="text-lg font-medium text-slate-400">Dark Background</h3>
                
                <div className="flex flex-wrap justify-center gap-8">
                <div className="flex flex-col items-center gap-2">
                    <span className="text-sm text-slate-400">Small (Dark Silver/Green)</span>
                    <Logo size="sm" metalVariant="silver-dark" />
                </div>
                <div className="flex flex-col items-center gap-2">
                    <span className="text-sm text-slate-400">Medium (Dark Silver/Green)</span>
                    <Logo size="md" metalVariant="silver-dark" />
                </div>
                <div className="flex flex-col items-center gap-2">
                    <span className="text-sm text-slate-400">Large (Dark Silver/Green)</span>
                    <Logo size="lg" metalVariant="silver-dark" />
                </div>
                <div className="flex flex-col items-center gap-2">
                    <span className="text-sm text-slate-400">Extra Large (Dark Silver/Green)</span>
                    <Logo size="xl" metalVariant="silver-dark" />
                </div>
                </div>

                <div className="flex flex-wrap justify-center gap-8 mt-4">
                <div className="flex flex-col items-center gap-2">
                    <span className="text-sm text-slate-400">Small (Dark Silver/Orange)</span>
                    <Logo size="sm" metalVariant="silver-dark" glowColor="#FF5F1F" />
                </div>
                <div className="flex flex-col items-center gap-2">
                    <span className="text-sm text-slate-400">Medium (Dark Silver/Orange)</span>
                    <Logo size="md" metalVariant="silver-dark" glowColor="#FF5F1F" />
                </div>
                <div className="flex flex-col items-center gap-2">
                    <span className="text-sm text-slate-400">Large (Dark Silver/Orange)</span>
                    <Logo size="lg" metalVariant="silver-dark" glowColor="#FF5F1F" />
                </div>
                <div className="flex flex-col items-center gap-2">
                    <span className="text-sm text-slate-400">Extra Large (Dark Silver/Orange)</span>
                    <Logo size="xl" metalVariant="silver-dark" glowColor="#FF5F1F" />
                </div>
                </div>

                <div className="flex flex-wrap justify-center gap-8 mt-4">
                <div className="flex flex-col items-center gap-2">
                    <span className="text-sm text-slate-400">Small (Copper/Green)</span>
                    <Logo size="sm" metalVariant="copper" />
                </div>
                <div className="flex flex-col items-center gap-2">
                    <span className="text-sm text-slate-400">Medium (Copper/Green)</span>
                    <Logo size="md" metalVariant="copper" />
                </div>
                <div className="flex flex-col items-center gap-2">
                    <span className="text-sm text-slate-400">Large (Copper/Green)</span>
                    <Logo size="lg" metalVariant="copper" />
                </div>
                <div className="flex flex-col items-center gap-2">
                    <span className="text-sm text-slate-400">Extra Large (Copper/Green)</span>
                    <Logo size="xl" metalVariant="copper" />
                </div>
                </div>

                <div className="flex flex-wrap justify-center gap-8 mt-4">
                <div className="flex flex-col items-center gap-2">
                    <span className="text-sm text-slate-400">Small (Copper/Orange)</span>
                    <Logo size="sm" metalVariant="copper" glowColor="#FF5F1F" />
                </div>
                <div className="flex flex-col items-center gap-2">
                    <span className="text-sm text-slate-400">Medium (Copper/Orange)</span>
                    <Logo size="md" metalVariant="copper" glowColor="#FF5F1F" />
                </div>
                <div className="flex flex-col items-center gap-2">
                    <span className="text-sm text-slate-400">Large (Copper/Orange)</span>
                    <Logo size="lg" metalVariant="copper" glowColor="#FF5F1F" />
                </div>
                <div className="flex flex-col items-center gap-2">
                    <span className="text-sm text-slate-400">Extra Large (Copper/Orange)</span>
                    <Logo size="xl" metalVariant="copper" glowColor="#FF5F1F" />
                </div>
                </div>

                <div className="flex flex-wrap justify-center gap-8 mt-4">
                <div className="flex flex-col items-center gap-2">
                    <span className="text-sm text-slate-400">Small (Yellow Copper)</span>
                    <Logo size="sm" metalVariant="copper-yellow" glowColor="#FF5F1F" />
                </div>
                <div className="flex flex-col items-center gap-2">
                    <span className="text-sm text-slate-400">Medium (Yellow Copper)</span>
                    <Logo size="md" metalVariant="copper-yellow" glowColor="#FF5F1F" />
                </div>
                <div className="flex flex-col items-center gap-2">
                    <span className="text-sm text-slate-400">Large (Yellow Copper)</span>
                    <Logo size="lg" metalVariant="copper-yellow" glowColor="#FF5F1F" />
                </div>
                <div className="flex flex-col items-center gap-2">
                    <span className="text-sm text-slate-400">Extra Large (Yellow Copper)</span>
                    <Logo size="xl" metalVariant="copper-yellow" glowColor="#FF5F1F" />
                </div>
                </div>

                <div className="flex flex-wrap justify-center gap-8 mt-4">
                <div className="flex flex-col items-center gap-2">
                    <span className="text-sm text-slate-400">Small (Red Copper)</span>
                    <Logo size="sm" metalVariant="copper-red" glowColor="#FF5F1F" />
                </div>
                <div className="flex flex-col items-center gap-2">
                    <span className="text-sm text-slate-400">Medium (Red Copper)</span>
                    <Logo size="md" metalVariant="copper-red" glowColor="#FF5F1F" />
                </div>
                <div className="flex flex-col items-center gap-2">
                    <span className="text-sm text-slate-400">Large (Red Copper)</span>
                    <Logo size="lg" metalVariant="copper-red" glowColor="#FF5F1F" />
                </div>
                <div className="flex flex-col items-center gap-2">
                    <span className="text-sm text-slate-400">Extra Large (Red Copper)</span>
                    <Logo size="xl" metalVariant="copper-red" glowColor="#FF5F1F" />
                </div>
                </div>

                <div className="flex flex-wrap justify-center gap-8 mt-4">
                <div className="flex flex-col items-center gap-2">
                    <span className="text-sm text-slate-400">Small (Dark Copper)</span>
                    <Logo size="sm" metalVariant="copper-dark" glowColor="#FF5F1F" />
                </div>
                <div className="flex flex-col items-center gap-2">
                    <span className="text-sm text-slate-400">Medium (Dark Copper)</span>
                    <Logo size="md" metalVariant="copper-dark" glowColor="#FF5F1F" />
                </div>
                <div className="flex flex-col items-center gap-2">
                    <span className="text-sm text-slate-400">Large (Dark Copper)</span>
                    <Logo size="lg" metalVariant="copper-dark" glowColor="#FF5F1F" />
                </div>
                <div className="flex flex-col items-center gap-2">
                    <span className="text-sm text-slate-400">Extra Large (Dark Copper)</span>
                    <Logo size="xl" metalVariant="copper-dark" glowColor="#FF5F1F" />
                </div>
                </div>
            </div>
        </div>
      </section>
    </main>
  );
}
