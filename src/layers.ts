// Layer counts as the header and the popups show them.
//
// GGUF's block_count counts every transformer block, and a quant that keeps the
// model's MTP (multi-token-prediction) head stores it as one more block at the
// end. Qwen3.8-27B shows both kinds of quant: 21 keep the head (block_count 65,
// nextn_predict_layers 1) and the five UD-IQ1/IQ2 quants drop it (block_count
// 64). Both are the same 64-layer model, so the header shows the transformer
// count, and every file says whether it has the MTP head, present or absent.
//
// The "of N" offload total is llama.cpp's own count: block_count plus the output
// layer, which llama.cpp prints as "offloaded X/N layers".

/** The counts one quant's header gives (the fields of ModelFacts). */
export interface LayerCounts {
  /** GGUF block_count: every block, the MTP head included when the file keeps it. */
  nLayer: number;
  /** GGUF nextn_predict_layers: how many of the last blocks are the MTP head; null when the key is absent. */
  mtpLayers: number | null;
}

/** The model's transformer layers: the same in every quant of one model. */
export function transformerLayers(c: LayerCounts): number {
  return Math.max(0, c.nLayer - (c.mtpLayers ?? 0));
}

/** What one file holds: "64 layers + MTP head", or "64 layers, no MTP head". */
export function fileLayersLabel(c: LayerCounts): string {
  const n = transformerLayers(c);
  return c.mtpLayers ? `${n} layers + MTP head` : `${n} layers, no MTP head`;
}

/** The MTP note that ends the one-line headline, present or absent. */
export function mtpNote(c: LayerCounts): string {
  return c.mtpLayers ? " · MTP head" : " · no MTP head";
}

/** What the offload total is made of, e.g. "64 + MTP head + output" (llama.cpp: 66). */
export function offloadTotalNote(c: LayerCounts): string {
  const n = transformerLayers(c);
  return c.mtpLayers ? `${n} + MTP head + output` : `${n} + output`;
}
