type AbuseCheckResult = {
  allowed: boolean;
  message?: string;
};

export function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function canUserVote(params: {
  accountCreatedAt: Date;
  lastVoteAt?: Date | null;
  dailyVoteCount: number;
  dailyVoteCountDate: string;
  riskScore: number;
}): AbuseCheckResult {
  const now = Date.now();
  const createdAt = new Date(params.accountCreatedAt).getTime();
  const accountAgeMs = now - createdAt;

  const minAccountAgeMs = 5 * 60 * 1000;
  if (accountAgeMs < minAccountAgeMs) {
    return {
      allowed: false,
      message: "Your account is too new to vote yet. Please wait a few minutes.",
    };
  }

  if (params.riskScore >= 10) {
    return {
      allowed: false,
      message: "Your account is temporarily restricted from voting due to suspicious activity.",
    };
  }

  if (params.lastVoteAt) {
    const lastVoteTime = new Date(params.lastVoteAt).getTime();
    const cooldownMs = 15 * 1000;

    if (now - lastVoteTime < cooldownMs) {
      return {
        allowed: false,
        message: "Please wait a few seconds before voting again.",
      };
    }
  }

  const today = getTodayKey();
  if (params.dailyVoteCountDate === today && params.dailyVoteCount >= 50) {
    return {
      allowed: false,
      message: "You have reached the daily vote limit.",
    };
  }

  return { allowed: true };
}
