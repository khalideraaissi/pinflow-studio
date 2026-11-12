import { Link } from "@tanstack/react-router";

export function AppHeader() {
  return (
    <header className="border-b bg-card/70 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-primary font-display text-lg text-primary-foreground">P</span>
          <span className="font-display text-xl">Pin Queue</span>
        </Link>
        <nav className="flex gap-1 text-sm">
          {[{ to: "/", label: "Dashboard" }, { to: "/settings", label: "Settings" }].map((l) => (
            <Link key={l.to} to={l.to} className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              activeProps={{ className: "bg-secondary text-foreground" }} activeOptions={{ exact: true }}>
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
