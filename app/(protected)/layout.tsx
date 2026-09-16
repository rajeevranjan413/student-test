export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The app shell (top app bar + bottom nav) lives in the root layout so it also
  // covers the public leaderboard and never flashes between navigations (F11).
  // No min-height here: the app bar lives in the root layout (outside this
  // wrapper), so forcing 100vh would overflow the viewport. The global body
  // background already covers short pages. `/` centers itself (see its page).
  return <div className="bg-background transition-colors duration-300">{children}</div>;
}
