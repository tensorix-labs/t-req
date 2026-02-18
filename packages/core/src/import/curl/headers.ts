function hasHeader(headers: Record<string, string>, name: string): boolean {
  const needle = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === needle);
}

export function setHeaderIfMissing(
  headers: Record<string, string>,
  name: string,
  value: string
): void {
  if (!hasHeader(headers, name)) {
    headers[name] = value;
  }
}
