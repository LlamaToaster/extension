// Which GGUF file each of Hugging Face's quant chips stands for.

import { hfAuxKind } from "../shared/hfAuxFiles";

function stem(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base.replace(/-\d{5}-of-\d{5}\.gguf$/i, "").replace(/\.gguf$/i, "");
}

/** GGUFs that are not a model on their own: vision/audio projectors, importance
 * matrices, and the files Hugging Face tags MTP, DFLASH or DSPARK by name
 * ("MTP/mtp-…-BF16.gguf", "dspark-…-Q4_0.gguf"). A chip's label (BF16, Q8_0)
 * must never resolve to one of these: they share the quant names but are a few
 * hundred MB. */
export function isAuxiliary(path: string): boolean {
  return /mmproj|imatrix/i.test(path) || hfAuxKind(path) != null;
}

const LATER_SHARD = /-0000[2-9]-of-|-000[1-9]\d-of-|-00[1-9]\d\d-of-/i;

/** Each chip label to one GGUF: the file whose name (or folder) ends with that
 * label. A file goes to the longest label it matches, so "flint-UD-Q4_K_M"
 * is UD-Q4_K_M's and never Q4_K_M's. Shard 1 stands for a split model. */
export function mapFiles(labels: string[], files: string[]): Map<string, string> {
  return matchLabels(labels, files.filter((f) => /\.gguf$/i.test(f) && !isAuxiliary(f) && !LATER_SHARD.test(f)));
}

/** Chip labels that stand for an MTP head or a DFlash/DSpark draft. Hugging
 * Face puts no badge on them when the whole repo is such files, so the chip
 * looks like a quant: it is left alone, its header never read. */
export function mapDraftFiles(labels: string[], files: string[]): Map<string, string> {
  return matchLabels(labels, files.filter((f) => /\.gguf$/i.test(f) && hfAuxKind(f) != null && !LATER_SHARD.test(f)));
}

function matchLabels(labels: string[], ggufs: string[]): Map<string, string> {
  const byLen = [...new Set(labels)].sort((a, b) => b.length - a.length);
  const out = new Map<string, string>();
  const matches = (file: string, label: string) => {
    const s = stem(file).toLowerCase();
    const l = label.toLowerCase();
    const folder = file.includes("/") ? file.split("/").slice(-2, -1)[0].toLowerCase() : "";
    return s === l || s.endsWith(`-${l}`) || s.endsWith(`_${l}`) || s.endsWith(`.${l}`) || folder === l;
  };
  const sorted = [...ggufs].sort((a, b) => a.length - b.length);
  for (const f of sorted) {
    const label = byLen.find((l) => matches(f, l));
    if (label && !out.has(label)) out.set(label, f);
  }
  return out;
}
