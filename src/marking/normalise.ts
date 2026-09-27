/** Port of v1 quiz.js `norm`: what a typed answer becomes before it is compared with the accepted forms. */
export function normaliseAnswer(s: string): string {
  return String(s)
    .toLowerCase()
    .replace(/[£€$]/g, "")
    .replace(/−/g, "-")
    .replace(/π/g, "pi")
    .replace(/²/g, "2")
    .replace(/³/g, "3")
    .replace(/[°º]/g, "")
    .replace(/\bdeg(rees)?\b/g, "")
    .replace(/,/g, "")
    .replace(/\s+/g, "")
    .replace(/^\+/, "")
    .replace(/^(-?)0+(\d)/, "$1$2")
    .replace(/^(-?)\./, (_, sign: string) => `${sign}0.`)
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "");
}
