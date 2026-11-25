// Which GGUF file each of Hugging Face's quant chips stands for.

import { auxKind, auxTags, type AuxTag } from "../shared/hfAuxFiles";

function stem(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base.replace(/-\d{5}-of-\d{5}\.gguf$/i, "").replace(/\.gguf$/i, "");
}

const NOT_A_QUANT = /mmproj|imatrix/i;

/** Not a model by name: a projector, an importance matrix, an MTP head or a
 * DFlash/DSpark/EAGLE3 draft. For lists that only show models (web/app.ts). */
export function isAuxiliary(path: string): boolean {
  const kind = auxKind(path);
  // "…-MTP-Q4_K_M" mid-name is a model that keeps its head; a lone head is "mtp-…" or in "MTP/".
  return NOT_A_QUANT.test(path) || (kind === "mtp" ? /(^|\/)mtp[-_.]/i.test(path) : kind != null);
}

const LATER_SHARD = /-0000[2-9]-of-|-000[1-9]\d-of-|-00[1-9]\d\d-of-/i;

export interface ChipFiles {
  /** Chip label to the model file it stands for. */
  models: Map<string, string>;
  /** Chip labels that stand for an MTP head or a DFlash/DSpark/EAGLE3 draft
   * Hugging Face shows without a badge: they get our badge (worded like
   * Hugging Face's) instead of a mark, and their headers are never read. */
  drafts: Map<string, AuxTag>;
}

/** Splits a repo's GGUFs into models and drafts (shared/hfAuxFiles.ts) and
 * maps each chip label to one of them. A chip's label (BF16, Q8_0) must never
 * resolve to a projector, an importance matrix or a draft: they share the quant
 * names but are a few hundred MB. Chips Hugging Face badges itself never get
 * here (content.ts skips them). */
export function mapChipFiles(labels: string[], files: { path: string; size?: number | null }[]): ChipFiles {
  const ggufs = files.filter((f) => /\.gguf$/i.test(f.path) && !NOT_A_QUANT.test(f.path) && !LATER_SHARD.test(f.path));
  const tags = auxTags(ggufs.map((f) => ({ path: f.path, sizeBytes: f.size ?? 0, level: "" })));
  const paths = ggufs.map((f) => f.path);
  const models = matchLabels(labels, paths.filter((p) => !tags.has(p)));
  const drafts = new Map<string, AuxTag>();
  for (const [label, path] of matchLabels(labels, paths.filter((p) => tags.get(p)?.byHf === false))) {
    if (!models.has(label)) drafts.set(label, tags.get(path)!);
  }
  return { models, drafts };
}

/** Each chip label to one GGUF: the file whose name (or folder) ends with that
 * label. A file goes to the longest label it matches, so "flint-UD-Q4_K_M"
 * is UD-Q4_K_M's and never Q4_K_M's. Shard 1 stands for a split model. */
function matchLabels(labels: string[], ggufs: string[]): Map<string, string> {
  const byLen = [...new Set(labels)].sort((a, b) => b.length - a.length);
  const out = new Map<string, string>();
  const matches = (file: string, label: string) => {
    const s = stem(file).toLowerCase();
    const l = label.toLowerCase();
    const folder = file.includes("/") ? file.split("/").slice(-2, -1)[0].toLowerCase() : "";
    return s === l || s.endsWith(`-${l}`) || s.endsWith(`_${l}`) || s.endsWith(`.${l}`) || folder === l;
  };
  const sorted = ggufs.toSorted((a, b) => a.length - b.length);
  for (const f of sorted) {
    const label = byLen.find((l) => matches(f, l));
    if (label && !out.has(label)) out.set(label, f);
  }
  return out;
}
