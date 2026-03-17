import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LocalAuthLogin } from "./LocalAuthLogin";

const setLocalAuthTokenMock = vi.hoisted(() => vi.fn());
const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("@/auth/localAuth", async () => {
  const actual =
    await vi.importActual<typeof import("@/auth/localAuth")>(
      "@/auth/localAuth",
    );
  return {
    ...actual,
    setLocalAuthToken: setLocalAuthTokenMock,
  };
});

describe("LocalAuthLogin", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    setLocalAuthTokenMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:8000/");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  // ── Copy / terminology ──────────────────────────────────────────────────────

  it("requires a non-empty token — shows 'Access token is required.'", async () => {
    const user = userEvent.setup();
    render(<LocalAuthLogin />);

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByText("Access token is required.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(setLocalAuthTokenMock).not.toHaveBeenCalled();
  });

  it("requires token length of at least 50 chars — uses 'Access token' copy", async () => {
    const user = userEvent.setup();
    render(<LocalAuthLogin />);

    await user.type(
      screen.getByPlaceholderText("Paste your access token"),
      "x".repeat(49),
    );
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      screen.getByText("Access token must be at least 50 characters."),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(setLocalAuthTokenMock).not.toHaveBeenCalled();
  });

  it("hint text reads 'Access token must be at least 50 characters.'", () => {
    render(<LocalAuthLogin />);
    expect(
      screen.getByText("Access token must be at least 50 characters."),
    ).toBeInTheDocument();
  });

  // ── Error state / accessibility ─────────────────────────────────────────────

  it("error paragraph has role=alert and id=local-auth-error", async () => {
    const user = userEvent.setup();
    render(<LocalAuthLogin />);

    await user.click(screen.getByRole("button", { name: "Continue" }));

    const errorEl = screen.getByRole("alert");
    expect(errorEl).toBeInTheDocument();
    expect(errorEl).toHaveAttribute("id", "local-auth-error");
  });

  it("input has aria-invalid=true when error is shown", async () => {
    const user = userEvent.setup();
    render(<LocalAuthLogin />);

    await user.click(screen.getByRole("button", { name: "Continue" }));

    const input = screen.getByPlaceholderText("Paste your access token");
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("input has aria-describedby pointing to error id when error is shown", async () => {
    const user = userEvent.setup();
    render(<LocalAuthLogin />);

    await user.click(screen.getByRole("button", { name: "Continue" }));

    const input = screen.getByPlaceholderText("Paste your access token");
    expect(input).toHaveAttribute("aria-describedby", "local-auth-error");
  });

  it("input has aria-describedby pointing to hint id when no error", () => {
    render(<LocalAuthLogin />);
    const input = screen.getByPlaceholderText("Paste your access token");
    expect(input).toHaveAttribute("aria-describedby", "local-auth-hint");
  });

  it("clears error and resets aria-describedby when user edits the field", async () => {
    const user = userEvent.setup();
    render(<LocalAuthLogin />);

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("alert")).toBeInTheDocument();

    const input = screen.getByPlaceholderText("Paste your access token");
    await user.type(input, "a");

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "local-auth-hint");
  });

  // ── Show / hide toggle ──────────────────────────────────────────────────────

  it("input starts as type=password", () => {
    render(<LocalAuthLogin />);
    const input = screen.getByPlaceholderText("Paste your access token");
    expect(input).toHaveAttribute("type", "password");
  });

  it("show/hide button toggles input type between password and text", async () => {
    const user = userEvent.setup();
    render(<LocalAuthLogin />);

    const input = screen.getByPlaceholderText("Paste your access token");
    const toggleBtn = screen.getByRole("button", { name: "Show token" });

    await user.click(toggleBtn);
    expect(input).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide token" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hide token" }));
    expect(input).toHaveAttribute("type", "password");
  });

  // ── Character counter ───────────────────────────────────────────────────────

  it("shows 0/50 counter initially", () => {
    render(<LocalAuthLogin />);
    expect(screen.getByText("0/50 characters")).toBeInTheDocument();
  });

  it("updates counter as user types", async () => {
    const user = userEvent.setup();
    render(<LocalAuthLogin />);

    await user.type(
      screen.getByPlaceholderText("Paste your access token"),
      "abc",
    );
    expect(screen.getByText("3/50 characters")).toBeInTheDocument();
  });

  // ── Button opacity ──────────────────────────────────────────────────────────

  it("Continue button has opacity-50 class when token is under 50 chars", () => {
    render(<LocalAuthLogin />);
    const btn = screen.getByRole("button", { name: "Continue" });
    expect(btn.className).toContain("opacity-50");
  });

  it("Continue button has opacity-100 class when token reaches 50 chars", async () => {
    const user = userEvent.setup();
    render(<LocalAuthLogin />);

    await user.type(
      screen.getByPlaceholderText("Paste your access token"),
      "x".repeat(50),
    );
    const btn = screen.getByRole("button", { name: "Continue" });
    expect(btn.className).toContain("opacity-100");
  });

  // ── Branding ────────────────────────────────────────────────────────────────

  it("renders 'OpenClaw' wordmark", () => {
    render(<LocalAuthLogin />);
    expect(screen.getByText("OpenClaw")).toBeInTheDocument();
  });

  it("renders 'Mission Control' sub-label", () => {
    render(<LocalAuthLogin />);
    expect(screen.getByText("Mission Control")).toBeInTheDocument();
  });

  // ── Help link ───────────────────────────────────────────────────────────────

  it("renders a help link with the correct href", () => {
    render(<LocalAuthLogin />);
    const link = screen.getByRole("link", {
      name: "How do I find my access token?",
    });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute(
      "href",
      "https://docs.openclaw.ai/self-hosting/auth-token",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  // ── Lock icon tooltip ───────────────────────────────────────────────────────

  it("lock icon container has aria-label 'Self-hosted secure mode'", () => {
    render(<LocalAuthLogin />);
    expect(
      screen.getByLabelText("Self-hosted secure mode"),
    ).toBeInTheDocument();
  });

  // ── Loading / submitting state ──────────────────────────────────────────────

  it("shows 'Validating…' and disables button during async validation", async () => {
    let resolveValidation!: (v: Response) => void;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((res) => { resolveValidation = res; }),
    );
    const user = userEvent.setup();
    render(<LocalAuthLogin />);

    await user.type(
      screen.getByPlaceholderText("Paste your access token"),
      "x".repeat(50),
    );
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByRole("button", { name: /Validating/i })).toBeDisabled();

    // Resolve the pending fetch
    resolveValidation(new Response(null, { status: 200 }));
  });

  // ── Existing happy/sad path tests (updated copy/placeholder) ────────────────

  it("rejects invalid token values", async () => {
    const onAuthenticatedMock = vi.fn();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    const user = userEvent.setup();
    render(<LocalAuthLogin onAuthenticated={onAuthenticatedMock} />);

    await user.type(
      screen.getByPlaceholderText("Paste your access token"),
      "x".repeat(50),
    );
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() =>
      expect(screen.getByText("Token is invalid.")).toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/users/me",
      expect.objectContaining({
        method: "GET",
        headers: { Authorization: `Bearer ${"x".repeat(50)}` },
      }),
    );
    expect(setLocalAuthTokenMock).not.toHaveBeenCalled();
    expect(onAuthenticatedMock).not.toHaveBeenCalled();
  });

  it("saves token only after successful backend validation", async () => {
    const onAuthenticatedMock = vi.fn();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
    const user = userEvent.setup();
    render(<LocalAuthLogin onAuthenticated={onAuthenticatedMock} />);

    const token = `  ${"g".repeat(50)} `;
    await user.type(
      screen.getByPlaceholderText("Paste your access token"),
      token,
    );
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() =>
      expect(setLocalAuthTokenMock).toHaveBeenCalledWith("g".repeat(50)),
    );
    expect(onAuthenticatedMock).toHaveBeenCalledTimes(1);
  });

  it("shows a clear error when backend is unreachable", async () => {
    const onAuthenticatedMock = vi.fn();
    fetchMock.mockRejectedValueOnce(new TypeError("network error"));
    const user = userEvent.setup();
    render(<LocalAuthLogin onAuthenticated={onAuthenticatedMock} />);

    await user.type(
      screen.getByPlaceholderText("Paste your access token"),
      "t".repeat(50),
    );
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() =>
      expect(
        screen.getByText("Unable to reach backend to validate token."),
      ).toBeInTheDocument(),
    );
    expect(setLocalAuthTokenMock).not.toHaveBeenCalled();
    expect(onAuthenticatedMock).not.toHaveBeenCalled();
  });
});
