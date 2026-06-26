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

// Base angle (degrees) for node i, node 0 at the top (-90), evenly spaced.
export function baseNodeAngle(i: number, total: number): number {
  return (i / total) * 360 - 90
}

// Rotation (degrees) that brings node i to the top of the ring.
export function rotationToTop(i: number, total: number): number {
  return -(i / total) * 360
}

// Cartesian position of a node given its base angle, the current rotation and
// radius. Split into x/y number helpers so frame callbacks allocate nothing.
export function nodeX(baseAngleDeg: number, rotationDeg: number, radius: number): number {
  return radius * Math.cos(((baseAngleDeg + rotationDeg) * Math.PI) / 180)
}

export function nodeY(baseAngleDeg: number, rotationDeg: number, radius: number): number {
  return radius * Math.sin(((baseAngleDeg + rotationDeg) * Math.PI) / 180)
}

// The equivalent of `target` (same angle mod 360) closest to `current`, so a
// snap animation always takes the shortest path.
export function shortestEquivalentAngle(target: number, current: number): number {
  return target + Math.round((current - target) / 360) * 360
}
