export function logEvent(type: string, data: any) {
  console.log(`[${type}]`, {
    ...data,
    timestamp: new Date().toISOString(),
  });
}
