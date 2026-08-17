type CaptchaVerificationResult = {
  success: boolean;
  message?: string;
};

export async function verifyCaptchaToken(
  token: string | undefined | null
): Promise<CaptchaVerificationResult> {
  const enabled = process.env.CAPTCHA_ENABLED === "true";

  if (!enabled) {
    return { success: true };
  }

  if (!token || !token.trim()) {
    return {
      success: false,
      message: "Captcha verification is required.",
    };
  }

  // Placeholder logic for now.
  // Later you will replace this with a real provider verification request.
  if (token !== "human-verified") {
    return {
      success: false,
      message: "Captcha verification failed.",
    };
  }

  return { success: true };
}
