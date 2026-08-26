export function directChild(el: Element, tag: string): Element | null {
  for (const c of Array.from(el.children)) if (c.tagName === tag) return c
  return null
}

export function directChildren(el: Element, tag: string): Element[] {
  return Array.from(el.children).filter((c) => c.tagName === tag)
}

export function textOf(el: Element | null): string | null {
  return el?.textContent?.trim() ?? null
}

export function numberOf(el: Element | null): number | null {
  const t = textOf(el)
  if (t === null) return null
  const n = parseFloat(t)
  return Number.isFinite(n) ? n : null
}
