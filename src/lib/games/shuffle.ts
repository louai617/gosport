/**
 * Fisher–Yates over pre-drawn floats — pure, so the server (which draws the
 * floats from the committed seed) and the in-browser verifier (which re-derives
 * them) produce the same permutation.
 *
 * `floats` needs `length − 1` entries; element `i` of the walk uses
 * `floats[length − 1 − i]`.
 */
export function shuffleIndicesFromFloats(length: number, floats: number[]): number[] {
  const indices = Array.from({ length }, (_, index) => index);

  for (let i = length - 1; i > 0; i -= 1) {
    const draw = floats[length - 1 - i] ?? 0;
    const j = Math.floor(draw * (i + 1));
    const a = indices[i]!;
    const b = indices[j]!;
    indices[i] = b;
    indices[j] = a;
  }
  return indices;
}
