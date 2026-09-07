// ➤ An advert's text split into sentences, the unit the screens read: a requirement is stated
// ➤ in a whole sentence ("5+ years of experience", "a degree in mechanical engineering"), so
// ➤ the years, degrees and languages the visitor is judged against are read off sentences and
// ➤ not off stray words. The text itself never leaves the builder: only what the screens found.
export function sentences(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .split(/(?<=[.!?])\s+|\n+|\s*[•·▪●]\s*/)
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(s => s.length > 2);
}
