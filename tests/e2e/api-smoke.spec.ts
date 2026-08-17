import { test, expect, request as playwrightRequest } from "@playwright/test";

test("login API returns success", async ({ baseURL }) => {
  const api = await playwrightRequest.newContext({ baseURL });
  const response = await api.post("/api/login", {
    data: {
      email: "usera@test.com",
      password: "Password123!",
    },
  });

  expect(response.ok()).toBeTruthy();
  const json = await response.json();
  expect(json.success).toBe(true);
  expect(json.user.email).toBe("usera@test.com");
});

test("register API rejects bad email", async ({ baseURL }) => {
  const api = await playwrightRequest.newContext({ baseURL });
  const response = await api.post("/api/register", {
    data: {
      username: "baduser",
      email: "bad-email",
      password: "Password123!",
    },
  });

  expect(response.status()).toBe(400);
});

test("protected access API requires auth", async ({ request }) => {
  const response = await request.get("/api/access");
  expect([401, 403]).toContain(response.status());
});
