export function getCaller(number: number = 0): string {
  const error = new Error();
  const stack = error?.stack?.split('\n');
  const callerLine = stack?.[3 + number] ?? 'Unknown location';
  const match = callerLine.match(/at\s+(.+)/);
  return match ? match[1] : 'Unknown location';
}
