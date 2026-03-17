"use client";

import { useState } from "react";
import { Eye, EyeOff, Loader2, Lock } from "lucide-react";

import { setLocalAuthToken } from "@/auth/localAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getApiBaseUrl } from "@/lib/api-base";

const LOCAL_AUTH_TOKEN_MIN_LENGTH = 50;

async function validateLocalToken(token: string): Promise<string | null> {
  let baseUrl: string;
  try {
    baseUrl = getApiBaseUrl();
  } catch {
    return "Unable to resolve backend URL.";
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/v1/users/me`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  } catch {
    return "Unable to reach backend to validate token.";
  }

  if (response.ok) {
    return null;
  }
  if (response.status === 401 || response.status === 403) {
    return "Token is invalid.";
  }
  return `Unable to validate token (HTTP ${response.status}).`;
}

type LocalAuthLoginProps = {
  onAuthenticated?: () => void;
};

const defaultOnAuthenticated = () => window.location.reload();

export function LocalAuthLogin({ onAuthenticated }: LocalAuthLoginProps) {
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const handleTokenChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setToken(event.target.value);
    // Clear error as soon as the user edits the field
    if (error) setError(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleaned = token.trim();
    if (!cleaned) {
      setError("Access token is required.");
      return;
    }
    if (cleaned.length < LOCAL_AUTH_TOKEN_MIN_LENGTH) {
      setError(
        `Access token must be at least ${LOCAL_AUTH_TOKEN_MIN_LENGTH} characters.`,
      );
      return;
    }

    setIsValidating(true);
    const validationError = await validateLocalToken(cleaned);
    setIsValidating(false);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLocalAuthToken(cleaned);
    setError(null);
    (onAuthenticated ?? defaultOnAuthenticated)();
  };

  const tokenReady = token.trim().length >= LOCAL_AUTH_TOKEN_MIN_LENGTH;

  const counterClass =
    token.length >= LOCAL_AUTH_TOKEN_MIN_LENGTH
      ? "text-[color:var(--success)]"
      : error
        ? "text-[color:var(--danger)]"
        : "text-muted";

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-app px-4 py-10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-28 -left-24 h-72 w-72 rounded-full bg-[color:var(--accent-soft)] blur-3xl" />
        <div className="absolute -right-28 -bottom-24 h-80 w-80 rounded-full bg-[rgba(14,165,233,0.12)] blur-3xl" />
      </div>

      <Card className="relative w-full max-w-lg animate-fade-in-up">
        <CardHeader className="space-y-5 border-b border-[color:var(--border)] pb-5">
          <div className="flex items-center justify-between">
            <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
              Self-host mode
            </span>
            <div
              className="rounded-xl bg-[color:var(--accent-soft)] p-2 text-[color:var(--accent)]"
              title="Self-hosted secure mode"
              aria-label="Self-hosted secure mode"
            >
              <Lock className="h-5 w-5" aria-hidden />
            </div>
          </div>
          <div className="space-y-1">
            {/* Branding wordmark */}
            <div className="mb-1 flex items-center gap-2">
              <span className="text-base font-bold tracking-tight text-strong">OpenClaw</span>
              <span className="text-sm text-muted">Mission Control</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-strong">
              Local Authentication
            </h1>
            <p className="text-sm text-muted">
              Enter your access token to unlock Mission Control.
            </p>
          </div>
        </CardHeader>
        <CardContent className="pt-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="local-auth-token"
                className="text-xs font-semibold uppercase tracking-[0.08em] text-muted"
              >
                Access token
              </label>
              {/* Show/hide toggle wrapper */}
              <div className="relative">
                <Input
                  id="local-auth-token"
                  type={showToken ? "text" : "password"}
                  value={token}
                  onChange={handleTokenChange}
                  placeholder="Paste your access token"
                  autoFocus
                  disabled={isValidating}
                  className="pr-10 font-mono"
                  hasError={!!error}
                  aria-describedby={error ? "local-auth-error" : "local-auth-hint"}
                />
                <button
                  type="button"
                  aria-label={showToken ? "Hide token" : "Show token"}
                  onClick={() => setShowToken((v) => !v)}
                  disabled={isValidating}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted transition hover:text-strong disabled:pointer-events-none"
                >
                  {showToken
                    ? <EyeOff className="h-4 w-4" aria-hidden />
                    : <Eye className="h-4 w-4" aria-hidden />}
                </button>
              </div>
              {/* Character counter */}
              <div className="flex justify-end">
                <span className={`text-xs tabular-nums ${counterClass}`}>
                  {token.length}/{LOCAL_AUTH_TOKEN_MIN_LENGTH} characters
                </span>
              </div>
            </div>

            {error ? (
              <p
                id="local-auth-error"
                role="alert"
                className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-sm text-danger"
              >
                {error}
              </p>
            ) : (
              <p id="local-auth-hint" className="text-xs text-muted">
                Access token must be at least {LOCAL_AUTH_TOKEN_MIN_LENGTH} characters.
              </p>
            )}

            {/* Help link */}
            <p className="text-xs text-muted">
              Need help?{" "}
              <a
                href="https://docs.openclaw.ai/self-hosting/auth-token"
                target="_blank"
                rel="noopener noreferrer"
                className="underline-offset-2 hover:text-strong hover:underline"
              >
                How do I find my access token?
              </a>
            </p>

            <Button
              type="submit"
              className={`w-full transition-opacity ${
                !tokenReady && !isValidating ? "opacity-50" : "opacity-100"
              }`}
              size="lg"
              disabled={isValidating}
            >
              {isValidating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Validating…
                </>
              ) : (
                "Continue"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
