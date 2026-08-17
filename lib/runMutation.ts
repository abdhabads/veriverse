import { getErrorMessage } from "@/lib/apiClient";

type MutationOptions<T> = {
  action: () => Promise<T>;
  onSuccess?: (result: T) => void | Promise<void>;
  onError?: (message: string) => void;
  onFinally?: () => void;
  successMessage?: string;
  showSuccess?: (message: string) => void;
};

export async function runMutation<T>(options: MutationOptions<T>) {
  try {
    const result = await options.action();

    if (options.onSuccess) {
      await options.onSuccess(result);
    }

    if (options.successMessage && options.showSuccess) {
      options.showSuccess(options.successMessage);
    }

    return result;
  } catch (error: any) {
    const message = getErrorMessage(error, "Action failed");
    if (options.onError) {
      options.onError(message);
    }
    return null;
  } finally {
    options.onFinally?.();
  }
}
