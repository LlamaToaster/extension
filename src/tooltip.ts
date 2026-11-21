// The hover text on a quant's mark. By default it is the one-line headline,
// which ends with the MTP note. With "More details" on (the popup's checkbox and
// the page's), every figure of the fit follows the headline, one per line.
import type { FitAnswer } from "./fit";

export function tipText(answer: Pick<FitAnswer, "headline" | "details">, moreDetails: boolean): string {
  return moreDetails && answer.details.length > 0 ? [answer.headline, ...answer.details].join("\n") : answer.headline;
}
