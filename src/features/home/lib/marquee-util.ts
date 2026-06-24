// Duplicate a list so a -50% translateX marquee loops seamlessly.
export function repeatForLoop<T>(items: T[], times = 2): T[] {
  const out: T[] = []
  for (let i = 0; i < times; i++) {
    for (let j = 0; j < items.length; j++) out.push(items[j])
  }
  return out
}
