import Link from "next/link";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t bg-background transition-colors duration-300">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-sm text-foreground/60">
            © {currentYear} ScoreKeeper. All rights reserved.
          </div>
          <div className="flex items-center gap-6 text-sm font-medium">
            <Link 
              href="/privacy" 
              className="transition-colors hover:text-foreground/80 text-foreground/60"
            >
              Privacy Policy
            </Link>
            <Link 
              href="/terms" 
              className="transition-colors hover:text-foreground/80 text-foreground/60"
            >
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
