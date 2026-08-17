"use client";

import { useCallback, useState } from "react";

export function usePageState() {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "info">("info");

  const showSuccess = useCallback((text: string) => {
    setMessage(text);
    setMessageType("success");
  }, []);

  const showError = useCallback((text: string) => {
    setMessage(text);
    setMessageType("error");
  }, []);

  const clearMessage = useCallback(() => {
    setMessage("");
  }, []);

  return {
    loading,
    setLoading,
    message,
    messageType,
    showSuccess,
    showError,
    clearMessage,
  };
}
