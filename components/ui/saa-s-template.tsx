import React from "react";

// ── Button ────────────────────────────────────────────────────────────────────
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "secondary" | "ghost" | "gradient";
  size?: "default" | "sm" | "lg";
  children: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "default", size = "default", className = "", children, ...props }, ref) => {
    const base =
      "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";
    const variants = {
      default:   "bg-white text-black hover:bg-gray-100",
      secondary: "bg-gray-800 text-white hover:bg-gray-700",
      ghost:     "hover:bg-gray-800/50 text-white",
      gradient:  "bg-gradient-to-b from-white via-white/95 to-white/60 text-black hover:scale-105 active:scale-95",
    };
    const sizes = {
      default: "h-10 px-4 py-2 text-sm",
      sm:      "h-10 px-5 text-sm",
      lg:      "h-12 px-8 text-base",
    };
    return (
      <button ref={ref} className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props}>
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

// ── Icons ─────────────────────────────────────────────────────────────────────
const ArrowRight = ({ className = "", size = 16 }: { className?: string; size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
  </svg>
);

const MenuIcon = ({ className = "", size = 24 }: { className?: string; size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="20" y1="6" y2="6" /><line x1="4" x2="20" y1="18" y2="18" />
  </svg>
);

const XIcon = ({ className = "", size = 24 }: { className?: string; size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M18 6 6 18" /><path d="m6 6 12 12" />
  </svg>
);

// ── Navigation ─────────────────────────────────────────────────────────────────
const Navigation = React.memo(() => {
  const [open, setOpen] = React.useState(false);
  return (
    <header className="fixed top-0 w-full z-50 border-b border-gray-800/50 bg-black/80 backdrop-blur-md">
      <nav className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="text-xl font-semibold text-white">Logo</div>
          <div className="hidden md:flex items-center justify-center gap-8 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            {["Getting started", "Components", "Documentation"].map((label) => (
              <a key={label} href={`#${label.toLowerCase().replace(" ", "-")}`}
                className="text-sm text-white/60 hover:text-white transition-colors">{label}</a>
            ))}
          </div>
          <div className="hidden md:flex items-center gap-4">
            <Button type="button" variant="ghost" size="sm">Sign in</Button>
            <Button type="button" variant="default" size="sm">Sign Up</Button>
          </div>
          <button type="button" className="md:hidden text-white" onClick={() => setOpen(!open)} aria-label="Toggle menu">
            {open ? <XIcon /> : <MenuIcon />}
          </button>
        </div>
      </nav>
      {open && (
        <div className="md:hidden bg-black/95 backdrop-blur-md border-t border-gray-800/50">
          <div className="px-6 py-4 flex flex-col gap-4">
            {["Getting started", "Components", "Documentation"].map((label) => (
              <a key={label} href={`#${label.toLowerCase().replace(" ", "-")}`}
                className="text-sm text-white/60 hover:text-white transition-colors py-2"
                onClick={() => setOpen(false)}>{label}</a>
            ))}
            <div className="flex flex-col gap-2 pt-4 border-t border-gray-800/50">
              <Button type="button" variant="ghost" size="sm">Sign in</Button>
              <Button type="button" variant="default" size="sm">Sign Up</Button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
});
Navigation.displayName = "Navigation";

// ── Hero ──────────────────────────────────────────────────────────────────────
const Hero = React.memo(() => (
  <section className="relative min-h-screen flex flex-col items-center justify-start px-6 py-20 md:py-24"
    style={{ animation: "fadeIn 0.6s ease-out" }}>
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');
      * { font-family: 'Poppins', sans-serif; }
      @keyframes fadeIn { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
      @keyframes slideDown { from { opacity:0; transform:translateY(-10px) } to { opacity:1; transform:translateY(0) } }
    `}</style>

    <aside className="mb-8 inline-flex flex-wrap items-center justify-center gap-2 px-4 py-2 rounded-full border border-gray-700 bg-gray-800/50 backdrop-blur-sm">
      <span className="text-xs text-gray-400">New version of template is out!</span>
      <a href="#new-version" className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-all active:scale-95"
        aria-label="Read more about the new version">
        Read more <ArrowRight size={12} />
      </a>
    </aside>

    <h1 className="text-4xl md:text-5xl lg:text-6xl font-medium text-center max-w-3xl px-6 leading-tight mb-6"
      style={{
        background: "linear-gradient(to bottom, #ffffff, #ffffff, rgba(255,255,255,0.6))",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
        letterSpacing: "-0.05em",
      }}>
      Give your big idea <br />the website it deserves
    </h1>

    <p className="text-sm md:text-base text-center max-w-2xl px-6 mb-10 text-gray-400">
      Landing page kit template with React, Shadcn/ui and Tailwind <br />that you can copy/paste into your project.
    </p>

    <div className="flex items-center gap-4 relative z-10 mb-16">
      <Button type="button" variant="gradient" size="lg" className="rounded-lg" aria-label="Get started with the template">
        Get started
      </Button>
    </div>

    <div className="w-full max-w-5xl relative pb-20">
      <div className="absolute left-1/2 w-[90%] pointer-events-none z-0"
        style={{ top: "-23%", transform: "translateX(-50%)" }} aria-hidden="true">
        <img src="https://i.postimg.cc/Ss6yShGy/glows.png" alt="" className="w-full h-auto" loading="eager" />
      </div>
      <div className="relative z-10">
        <img
          src="https://i.postimg.cc/SKcdVTr1/Dashboard2.png"
          alt="Dashboard preview showing analytics and metrics interface"
          className="w-full h-auto rounded-lg shadow-2xl border border-white/10"
          loading="eager"
        />
      </div>
    </div>
  </section>
));
Hero.displayName = "Hero";

// ── Main export ───────────────────────────────────────────────────────────────
export default function Component() {
  return (
    <main className="min-h-screen bg-black text-white">
      <Navigation />
      <Hero />
    </main>
  );
}
