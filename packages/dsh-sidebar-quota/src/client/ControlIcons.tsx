/** Small inline SVGs inherit the DSH theme without extra runtime dependencies. */
export function RefreshIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12a7 7 0 1 1-5-6.7M20 4l1.2 2.8L24 8l-2.8 1.2L20 12l-1.2-2.8L16 8l2.8-1.2zM13 2v4h-4"/></svg>
}
export function ChevronIcon({collapsed}:{collapsed:boolean}) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={collapsed?'m9 6 6 6-6 6':'m6 9 6 6 6-6'}/></svg>
}
