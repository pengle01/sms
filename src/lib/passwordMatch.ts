// The live hint under «Επιβεβαίωση κωδικού». Passwords are compared exactly —
// no trimming or case folding, the same as the server does.

export type ConfirmState = "empty" | "match" | "mismatch";

export function confirmState(password: string, confirm: string): ConfirmState {
  if (confirm === "") return "empty";
  return password === confirm ? "match" : "mismatch";
}
