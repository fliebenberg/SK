export function formatTime(isoString: string): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDate(isoString: string, short: boolean = false): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (short) {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

export function getInitials(name: string, code?: string) {
  if (code) return code.toUpperCase();
  const words = name.split(" ").filter(w => w.length > 0);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}
