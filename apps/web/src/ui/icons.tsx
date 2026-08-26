/** Status icons - deliberately shape-distinct, not color-only, so status reads under any color vision. */

export function CheckIcon({ title = 'Exact playable note' }: { title?: string }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" role="img" aria-label={title}>
      <title>{title}</title>
      <circle cx="8" cy="8" r="7" fill="#16a34a" />
      <path d="M4.5 8.5l2.2 2.2L11.5 5.5" stroke="white" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function AdjustIcon({ title = 'Changed note' }: { title?: string }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" role="img" aria-label={title}>
      <title>{title}</title>
      <circle cx="8" cy="8" r="7" fill="#d97706" />
      <path d="M4 8h8M8 4v8" stroke="white" strokeWidth="1.6" strokeLinecap="round" transform="rotate(45 8 8)" />
    </svg>
  )
}

export function WarningIcon({ title = 'Unavailable note' }: { title?: string }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" role="img" aria-label={title}>
      <title>{title}</title>
      <polygon points="8,1.5 15,14.5 1,14.5" fill="#dc2626" />
      <rect x="7.2" y="6" width="1.6" height="4.2" fill="white" />
      <rect x="7.2" y="11" width="1.6" height="1.6" fill="white" />
    </svg>
  )
}

export function ConflictIcon({ title = 'Mechanical conflict' }: { title?: string }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" role="img" aria-label={title}>
      <title>{title}</title>
      <rect x="1" y="1" width="14" height="14" rx="2" fill="#7f1d1d" />
      <rect x="4" y="7.2" width="8" height="1.6" fill="white" />
    </svg>
  )
}

export function QuestionIcon({ title = 'OMR uncertainty' }: { title?: string }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" role="img" aria-label={title}>
      <title>{title}</title>
      <circle cx="8" cy="8" r="7" fill="#7c3aed" />
      <text x="8" y="11.5" fontSize="9" fill="white" textAnchor="middle" fontFamily="sans-serif">?</text>
    </svg>
  )
}

export type NoteStatusIcon = 'exact' | 'changed' | 'unresolved' | 'conflict' | 'omr-uncertain'

export function StatusIcon({ kind }: { kind: NoteStatusIcon }) {
  switch (kind) {
    case 'exact': return <CheckIcon />
    case 'changed': return <AdjustIcon />
    case 'unresolved': return <WarningIcon />
    case 'conflict': return <ConflictIcon />
    case 'omr-uncertain': return <QuestionIcon />
  }
}
