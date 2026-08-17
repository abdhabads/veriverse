export async function apiHandler(fn: Function, req: any, res: any) {
  try {
    return await fn(req, res);
  } catch (error: any) {
    console.error("API ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong. Please try again.",
    });
  }
}
