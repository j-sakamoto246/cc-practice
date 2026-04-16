export function now(): string {
  return new Date().toISOString().replace("T", " ").replace("Z", "").split(".")[0]!;
}
