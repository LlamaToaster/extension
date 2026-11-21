// GGUFs that ship next to a model and are not one: MTP heads and DFlash,
// DSpark and EAGLE3 draft models.
//
// Hugging Face's model page tags MTP, DFlash and DSpark files itself. Its table
// and rule are copied here (front build ModelTensorsParams, read 2026-11-21) so
// LlamaToaster tags the same files with the same badge and the same words and
// adds nothing of its own to them. Where Hugging Face puts no badge on such a
// file -- EAGLE3 drafts always, and a repo whose every file is a draft -- we
// add one, worded the way Hugging Face words its own (byHf false).
//
// None of these files gets a fit check or a header read.

export type HfAuxKind = "mtp" | "dflash" | "dspark";
export type AuxKind = HfAuxKind | "eagle3";
/** Hugging Face picks the tooltip by the file's size next to the repo's models. */
export type HfAuxRole = "standalone" | "model" | "neutral";

interface AuxKindInfo {
  pattern: RegExp;
  label: string;
  tooltips: Record<HfAuxRole, string>;
}

export const HF_AUX_KINDS: Record<HfAuxKind, AuxKindInfo> = {
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

/** Ours: Hugging Face has no tag for EAGLE3 drafts ("…-speculator.eagle3-Q4_K_M.gguf").
 * "eagle3" as its own word, so "eagle-3b-preview" (a model) is not one. */
const EAGLE3: AuxKindInfo = {
  pattern: /(?:^|[-_./])eagle3(?:[-_./]|draft|$)/i,
  label: "EAGLE3",
  tooltips: {
    neutral: "Built with an EAGLE3 draft model to speed up inference through speculative decoding.",
    model: "Includes an EAGLE3 draft model, which speeds up inference through speculative decoding.",
    standalone: "EAGLE3 draft model: an auxiliary model that speeds up inference through speculative decoding, not a standalone model.",
  },
};

const ALL_KINDS: Record<AuxKind, AuxKindInfo> = { ...HF_AUX_KINDS, eagle3: EAGLE3 };

/** The badges Hugging Face itself puts on a quant chip, as they read on the page. */
export const HF_AUX_LABELS: readonly string[] = Object.values(HF_AUX_KINDS).map((k) => k.label);

/** Hugging Face's own name test: which of its tags a path gets. */
export function hfAuxKind(path: string): HfAuxKind | undefined {
  return (Object.keys(HF_AUX_KINDS) as HfAuxKind[]).find((k) => HF_AUX_KINDS[k].pattern.test(path));
}

/** Any draft kind by name, EAGLE3 included. */
export function auxKind(path: string): AuxKind | undefined {
  return hfAuxKind(path) ?? (EAGLE3.pattern.test(path) ? "eagle3" : undefined);
}

/** Hugging Face's size test: under 30% of the reference model is the head alone,
 * 70% or more is a model that includes one. */
export function hfAuxRole(sizeBytes: number, referenceBytes: number | undefined): HfAuxRole {
  if (!sizeBytes || !referenceBytes) return "neutral";
  if (sizeBytes >= referenceBytes * 0.7) return "model";
  if (sizeBytes < referenceBytes * 0.3) return "standalone";
  return "neutral";
}

export interface AuxTag {
  kind: AuxKind;
  label: string;
  role: HfAuxRole;
  tooltip: string;
  /** Hugging Face shows this badge itself; false: the badge is ours. */
  byHf: boolean;
}

// unsloth's convention for a lone MTP head: "mtp-…" or an "MTP/" folder. A
// "…-MTP-Q4_K_M.gguf" mid-name is a model that keeps its head.
const MTP_HEAD_NAME = /(^|\/)mtp[-_.]/i;

/** Tags for a repo's quant chips. Hugging Face's own, computed its way: the
 * reference is the largest file of the same bit level it leaves untagged, else
 * the smallest such file; when it would tag every file it tags none. Then ours
 * where it shows nothing: EAGLE3 drafts, and in a repo of drafts only, the
 * DFlash/DSpark drafts and lone MTP heads. A file with no tag is a model. */
export function auxTags(chips: { path: string; sizeBytes: number; level: string }[]): Map<string, AuxTag> {
  const out = new Map<string, AuxTag>();
  const ours = (path: string, kind: AuxKind) => out.set(path, { kind, label: ALL_KINDS[kind].label, role: "standalone", tooltip: ALL_KINDS[kind].tooltips.standalone, byHf: false });

  if (chips.length > 0 && chips.every((c) => hfAuxKind(c.path))) {
    for (const c of chips) {
      const kind = hfAuxKind(c.path)!;
      if (kind !== "mtp" || MTP_HEAD_NAME.test(c.path)) ours(c.path, kind);
    }
    return out;
  }
  let min: number | undefined;
  const perLevelMax = new Map<string, number>();
  for (const c of chips) {
    if (!c.sizeBytes || hfAuxKind(c.path)) continue;
    if (min === undefined || c.sizeBytes < min) min = c.sizeBytes;
    if ((perLevelMax.get(c.level) ?? -1) < c.sizeBytes) perLevelMax.set(c.level, c.sizeBytes);
  }
  for (const c of chips) {
    const kind = auxKind(c.path);
    if (!kind) continue;
    if (kind === "eagle3") {
      ours(c.path, kind);
      continue;
    }
    const role = hfAuxRole(c.sizeBytes, perLevelMax.get(c.level) ?? min);
    out.set(c.path, { kind, label: HF_AUX_KINDS[kind].label, role, tooltip: HF_AUX_KINDS[kind].tooltips[role], byHf: true });
  }
  return out;
}
