export function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0e17]">
      <div className="text-center">
        <div className="inline-block w-8 h-8 border-2 border-[var(--active)] border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm text-[var(--text-faint)]">Loading...</p>
      </div>
    </div>
  );
}
