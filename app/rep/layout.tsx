// /rep paths are deprecated and redirect to the unified /sales experience.
// This layout is intentionally a passthrough so individual pages can render redirects.
export default function RepLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
