import { describe, it, expect, vi, afterEach } from "vitest";
import { api, ApiError } from "./api";

function mockFetchOnce(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({}),
    ...response,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("api client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends credentials and JSON content-type on every request", async () => {
    const fetchMock = mockFetchOnce({ json: async () => ({ ok: true }) });

    await api.get("/api/v1/projects");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/projects",
      expect.objectContaining({
        credentials: "include",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      }),
    );
  });

  it("returns the parsed JSON body on success", async () => {
    mockFetchOnce({ json: async () => ({ id: "abc123", name: "Test Project" }) });

    const result = await api.get<{ id: string; name: string }>("/api/v1/projects/abc123");

    expect(result).toEqual({ id: "abc123", name: "Test Project" });
  });

  it("returns undefined for a 204 No Content response without parsing a body", async () => {
    const jsonSpy = vi.fn();
    mockFetchOnce({ ok: true, status: 204, json: jsonSpy });

    const result = await api.delete("/api/v1/runs/run-1");

    expect(result).toBeUndefined();
    expect(jsonSpy).not.toHaveBeenCalled();
  });

  it("serializes the body and sets the method for post/put/patch", async () => {
    const fetchMock = mockFetchOnce({ json: async () => ({}) });

    await api.post("/api/v1/projects", { name: "New Project" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/projects",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "New Project" }),
      }),
    );
  });

  it("throws ApiError with the server's code and detail on a non-ok response", async () => {
    mockFetchOnce({
      ok: false,
      status: 403,
      json: async () => ({ code: "FORBIDDEN", detail: "Access denied." }),
    });

    await expect(api.get("/api/v1/projects/other-users-project")).rejects.toMatchObject({
      name: "ApiError",
      status: 403,
      code: "FORBIDDEN",
      message: "Access denied.",
    });
  });

  it("falls back to a generic message when the error body isn't parseable JSON", async () => {
    mockFetchOnce({
      ok: false,
      status: 500,
      json: async () => {
        throw new SyntaxError("Unexpected end of JSON input");
      },
    });

    await expect(api.get("/api/v1/runs")).rejects.toMatchObject({
      status: 500,
      code: "UNKNOWN",
      message: "Request failed (500)",
    });
  });

  it("is an instance of ApiError and Error for instanceof checks in catch blocks", async () => {
    mockFetchOnce({ ok: false, status: 404, json: async () => ({}) });

    try {
      await api.get("/api/v1/projects/missing");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect(err).toBeInstanceOf(Error);
    }
  });
});
