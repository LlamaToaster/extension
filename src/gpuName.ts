// A GPU name as the card lists write it and as a browser reports it, reduced to
// one key. "NVIDIA GeForce RTX 3060 Laptop GPU" and "GeForce RTX 3060 Mobile/ Laptop"
// both give "geforce rtx 3060 laptop"; "Radeon RX 6600 XT (Navi 23)" gives "radeon rx 6600 xt".

export function gpuKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[®™]|\((?:r|tm|c)\)/g, " ")
    .replace(/\[[a-z]\]/g, " ")
    // Codenames in brackets go; "(Notebook)" and "(Mobile)" keep their laptop meaning.
    .replace(/\(([^)]*)\)/g, (_, inner: string) => (/notebook|laptop|mobile/.test(inner) ? " laptop " : " "))
    .replace(/\bwith max-q design\b/g, " max-q ")
    .replace(/\bmobile\s*\/\s*laptop\b/g, " laptop ")
    .replace(/\bmobile\b/g, " laptop ")
    // Sizes in a name ("GeForce RTX 3060 12 GB") are the row's memory, not part of the name.
    .replace(/\b\d+(?:\.\d+)?\s*(?:gb|mb)\b/g, " ")
    // Variants that share a card's memory.
    .replace(/\b(?:oem|rebrand|rev\.?\s*\d+|gddr\d+x?)\b/g, " ")
    .replace(/^(?:nvidia|amd|ati|intel)\b/, " ")
    .replace(/\s+/g, " ")
    .replace(/ gpu$/, "")
    .trim();
}
