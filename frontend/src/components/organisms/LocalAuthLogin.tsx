"use client";

import { useState } from "react";
import { ArrowRight, Eye, EyeOff, Loader2, Shield } from "lucide-react";

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
    return "Could not reach the backend. Check that the gateway is running with `openclaw status`";
  }

  if (response.ok) {
    return null;
  }
  if (response.status === 401 || response.status === 403) {
    return "Token not recognized. Generate a new one with `openclaw dashboard --no-open`";
  }
  return `Unable to validate token (HTTP ${response.status}). Check that the gateway is running with \`openclaw status\``;
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
    if (error) setError(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleaned = token.trim();
    if (!cleaned) {
      setError("Enter your Gateway Token above. Find it in your openclaw config or run `openclaw config get gateway.token`");
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

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-app px-4 py-10"
         style={{ background: "linear-gradient(135deg, var(--bg-app) 0%, var(--surface-muted, var(--bg-app)) 100%)" }}>
      {/* Decorative background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-28 -left-24 h-72 w-72 rounded-full bg-[color:var(--accent-soft)] blur-3xl opacity-60" />
        <div className="absolute -right-28 -bottom-24 h-80 w-80 rounded-full bg-[rgba(14,165,233,0.12)] blur-3xl opacity-60" />
      </div>

      {/* Logo & Branding */}
      <div className="relative mb-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[color:var(--accent-soft)] text-[color:var(--accent)]">
          <Shield className="h-7 w-7" aria-hidden />
        </div>
        <h1 className="text-[28px] font-semibold tracking-tight text-strong">
          Mission Control
        </h1>
        <p className="mt-1 text-sm text-muted">
          Connect to your OpenClaw Gateway
        </p>
      </div>

      <Card className="relative w-full max-w-[440px] animate-fade-in-up shadow-[0_4px_24px_rgba(0,0,0,0.1)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
            style={{ borderRadius: "16px" }}>
        <CardHeader className="sr-only">
          <h2>Gateway Authentication</h2>
        </CardHeader>
        <CardContent className="p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Gateway Token */}
            <div className="space-y-2">
              <label
                htmlFor="local-auth-token"
                className="text-sm font-medium text-strong"
              >
                Gateway Token
              </label>
              <div className="relative">
                <Input
                  id="local-auth-token"
                  type={showToken ? "text" : "password"}
                  value={token}
                  onChange={handleTokenChange}
                  placeholder="Paste your gateway token"
                  autoFocus
                  disabled={isValidating}
                  className="h-11 pr-10 font-mono"
                  hasError={!!error}
                  aria-describedby={error ? "local-auth-error" : "local-auth-hint"}
                  style={{ borderRadius: "8px" }}
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
              <p id="local-auth-hint" className="text-xs text-muted">
                Find this in your openclaw config or run{" "}
                <code className="rounded bg-[color:var(--surface-strong)] px-1 py-0.5 font-mono text-xs">openclaw dashboard</code>
              </p>
            </div>

            {/* Error state — between input and button per spec */}
            {error && (
              <div
                id="local-auth-error"
                role="alert"
                className="rounded-lg border-l-4 border-[color:var(--danger)] bg-[rgba(239,68,68,0.1)] px-4 py-3 text-sm text-strong dark:bg-[rgba(239,68,68,0.15)]"
              >
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 text-[color:var(--danger)]">⚠</span>
                  <span>
                    {error.split(/`([^`]+)`/).map((part, i) =>
                      i % 2 === 1 ? (
                        <code key={i} className="rounded bg-[color:var(--surface-strong)] px-1.5 py-0.5 font-mono text-xs">
                          {part}
                        </code>
                      ) : (
                        <span key={i}>{part}</span>
                      )
                    )}
                  </span>
                </div>
              </div>
            )}

            {/* Submit button */}
            <Button
              type="submit"
              className={`group w-full transition-all ${
                !tokenReady && !isValidating ? "opacity-50" : "opacity-100"
              }`}
              size="lg"
              disabled={isValidating}
              style={{ height: "48px" }}
            >
              {isValidating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Connecting…
                </>
              ) : (
                <>
                  Connect to Gateway
                  <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </>
              )}
            </Button>

            {/* Divider */}
            <div className="border-t border-[color:var(--border)]" />

            {/* Help link */}
            <p className="text-center text-sm text-muted">
              Need help?{" "}
              <a
                href="https://docs.openclaw.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[color:var(--accent)] underline-offset-2 hover:underline"
              >
                Read the docs →
              </a>
            </p>
          </form>
        </CardContent>
      </Card>

      {/* Footer */}
      <p className="relative mt-8 text-center text-xs text-muted">
        Powered by OpenClaw
      </p>
    </div>
  );
}
