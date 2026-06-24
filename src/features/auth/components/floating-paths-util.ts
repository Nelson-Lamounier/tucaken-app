// Deterministic flowing-path descriptors for the auth brand panel. No
// Math.random — duration/jitter in the component derive from the index too,
// so renders are stable (and Sonar S2245 stays clear).
export interface FloatingPath {
  id: number
  d: string
  width: number
  opacity: number
}

export function buildFloatingPaths(position: number): FloatingPath[] {
  const paths: FloatingPath[] = []
  for (let i = 0; i < 36; i++) {
    paths.push({
      id: i,
      d: `M-${380 - (i + 1) * 5 * position} -${189 + i * 6}C-${380 - (i + 1) * 5 * position} -${189 + i * 6} -${312 - (i + 1) * 5 * position} ${216 - i * 6} ${152 - (i + 1) * 5 * position} ${343 - i * 6}C${616 - (i + 1) * 5 * position} ${470 - i * 6} ${684 - (i + 1) * 5 * position} ${875 - i * 6} ${684 - (i + 1) * 5 * position} ${875 - i * 6}`,
      width: 0.8 + i * 0.05,
      opacity: 0.3 + i * 0.025,
    })
  }
  return paths
}
