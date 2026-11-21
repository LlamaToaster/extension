// Hugging Face's own tags for GGUFs that ship next to a model and are not one:
// MTP heads and DFlash / DSpark draft models. Copied from the quant table on
// Hugging Face's model page (front build ModelTensorsParams, read 2026-11-21),
// so LlamaToaster tags the same files with the same badge and the same words.
// Such files get no fit check and no header read: Hugging Face's text is all
// that is shown for them.

export type HfAuxKind = "mtp" | "dflash" | "dspark";
/** Hugging Face picks the tooltip by the file's size next to the repo's models. */
export type HfAuxRole = "standalone" | "model" | "neutral";

export const HF_AUX_KINDS: Record<HfAuxKind, { pattern: RegExp; label: string; tooltips: Record<HfAuxRole, string> }> = {
  mtp: {
    pattern: /(?:^|[-_./])mtp(?:[-_./]|$)/i,
    label: "MTP",
    tooltips: {
      neutral: "Built with Multi-Token Prediction (MTP) to speed up inference.",
      model: "Includes a Multi-Token Prediction (MTP) head, which predicts several tokens at once to speed up inference.",
      standalone: "Multi-Token Prediction (MTP) head: an auxiliary module that speeds up inference, not a standalone model.",
    },
  },
  dflash: {
    pattern: /(?:^|[-_./])dflash(?:[-_./]|$)/i,
    label: "DFLASH",
    tooltips: {
      neutral: "Built with a DFlash draft model to speed up inference through speculative decoding.",
      model: "Includes a DFlash draft model, which speeds up inference through speculative decoding.",
      standalone: "DFlash draft model: an auxiliary model that speeds up inference through speculative decoding, not a standalone model.",
    },
  },
  dspark: {
    pattern: /(?:^|[-_./])dspark(?:[-_./]|$)/i,
    label: "DSPARK",
    tooltips: {
      neutral: "Built with a DSpark draft model to speed up inference through speculative decoding.",
      model: "Includes a DSpark draft model, which speeds up inference through speculative decoding.",
      standalone: "DSpark draft model: an auxiliary model that speeds up inference through speculative decoding, not a standalone model.",
    },
  },
};

/** The badges Hugging Face puts on a quant chip, as they read on the page. */
export const HF_AUX_LABELS: readonly string[] = Object.values(HF_AUX_KINDS).map((k) => k.label);

/** Which tag a file path gets, by name only (Hugging Face's own test). */
export function hfAuxKind(path: string): HfAuxKind | undefined {
  return (Object.keys(HF_AUX_KINDS) as HfAuxKind[]).find((k) => HF_AUX_KINDS[k].pattern.test(path));
}

/** Hugging Face's size test: under 30% of the reference model is the head alone,
 * 70% or more is a model that includes one. */
export function hfAuxRole(sizeBytes: number, referenceBytes: number | undefined): HfAuxRole {
  if (!sizeBytes || !referenceBytes) return "neutral";
  if (sizeBytes >= referenceBytes * 0.7) return "model";
  if (sizeBytes < referenceBytes * 0.3) return "standalone";
  return "neutral";
}

export interface HfAuxTag {
  kind: HfAuxKind;
  label: string;
  role: HfAuxRole;
  tooltip: string;
}

/** Tags for a repo's quant chips, computed the way Hugging Face does: the
 * reference is the largest untagged file of the same bit level, else the
 * smallest untagged file. When every file is tagged by name, Hugging Face shows
 * no badge at all: those paths are left out of the map. */
export function hfAuxTags(chips: { path: string; sizeBytes: number; level: string }[]): Map<string, HfAuxTag> {
  const out = new Map<string, HfAuxTag>();
  if (chips.every((c) => hfAuxKind(c.path))) return out;
  let min: number | undefined;
  const perLevelMax = new Map<string, number>();
  for (const c of chips) {
    if (!c.sizeBytes || hfAuxKind(c.path)) continue;
    if (min === undefined || c.sizeBytes < min) min = c.sizeBytes;
    if ((perLevelMax.get(c.level) ?? -1) < c.sizeBytes) perLevelMax.set(c.level, c.sizeBytes);
  }
  for (const c of chips) {
    const kind = hfAuxKind(c.path);
    if (!kind) continue;
    const role = hfAuxRole(c.sizeBytes, perLevelMax.get(c.level) ?? min);
    out.set(c.path, { kind, label: HF_AUX_KINDS[kind].label, role, tooltip: HF_AUX_KINDS[kind].tooltips[role] });
  }
  return out;
}
