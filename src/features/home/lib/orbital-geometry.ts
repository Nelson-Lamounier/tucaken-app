// Pure geometry for the radial comparison orbital. Kept React-free so the
// ring maths is unit-testable without rendering.

// Evenly spaced node angles (degrees), first node at the top (-90).
export function nodeAngles(total: number): number[] {
  if (total <= 0) return []
  const out: number[] = []
  for (let i = 0; i < total; i++) {
    out.push((i / total) * 360 - 90)
  }
  return out
}

// Places a node on the ring at `radius` then counter-rotates it so its
// contents stay upright regardless of the node's angle.
export function nodeTransform(angle: number, radius: number): string {
  return `rotate(${angle}deg) translateX(${radius}px) rotate(${-angle}deg)`
}
