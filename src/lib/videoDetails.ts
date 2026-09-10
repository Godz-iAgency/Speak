export function formatDuration(seconds: number) {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
export function defaultTitle() {
  return `Recording · ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}
export function shareLink(id: string, seconds = 0) {
  const url = new URL(`/v/${encodeURIComponent(id)}`, window.location.origin);
  if (seconds > 0 && Number.isFinite(seconds)) url.searchParams.set('t', String(Math.floor(seconds)));
  return url.href;
}
