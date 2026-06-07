/**
 * StatusBadge — pill rendering an organization status (cross-tenant).
 *
 * Lives in components/ (not a route file) so it can be shared between the
 * organizations list and detail pages. Next.js App Router route files may only
 * export `default` + a few recognised names, never arbitrary components.
 */

const MAP: Record<string, { bg: string; fg: string; label: string }> = {
  ACTIVE: { bg: '#ecfdf5', fg: '#059669', label: 'Active' },
  SUSPENDED: { bg: '#fef2f2', fg: '#dc2626', label: 'Suspendue' },
  ARCHIVED: { bg: '#f5f5f4', fg: '#78716c', label: 'Archivée' },
};

export function StatusBadge({ status }: { status: string }) {
  const s = MAP[status] ?? { bg: '#f5f5f4', fg: '#78716c', label: status };
  return (
    <span
      style={{
        display: 'inline-block',
        background: s.bg,
        color: s.fg,
        fontSize: 12,
        fontWeight: 600,
        padding: '3px 10px',
        borderRadius: 999,
      }}
    >
      {s.label}
    </span>
  );
}
