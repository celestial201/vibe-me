export const normalizeIdString = (item: unknown): string | undefined => {
  if (!item) return undefined;
  if (typeof item === 'string') {
    return item === '[object Object]' ? undefined : item;
  }
  if (typeof item === 'object' && item !== null) {
    // 1. Check for populated document/object with id properties
    const obj = item as Record<string, unknown>;
    const candidateId = obj._id || obj.id || obj.versionId || obj.courseVersionId;
    if (candidateId) {
      const resolved = normalizeIdString(candidateId);
      if (resolved) return resolved;
    }
    // 2. Check direct toString if overridden
    if (typeof obj.toString === 'function') {
      const str = obj.toString();
      if (str && str !== '[object Object]') return str;
    }
  }
  return undefined;
};

export const bufferToHex = (item: unknown): string => {
  return normalizeIdString(item) || '';
};

// Helper function to get time-based greeting
export const getGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};
