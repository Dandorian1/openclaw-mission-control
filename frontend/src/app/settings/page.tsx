"use client";

export const dynamic = "force-dynamic";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth, useUser } from "@/auth/clerk";
import { useQueryClient } from "@tanstack/react-query";
import {
  Globe,
  Mail,
  Monitor,
  Moon,
  Palette,
  RotateCcw,
  Save,
  Settings2,
  Sun,
  Trash2,
  User,
} from "lucide-react";

import {
  useDeleteMeApiV1UsersMeDelete,
  getGetMeApiV1UsersMeGetQueryKey,
  type getMeApiV1UsersMeGetResponse,
  useGetMeApiV1UsersMeGet,
  useUpdateMeApiV1UsersMePatch,
} from "@/api/generated/users/users";
import { ApiError } from "@/api/mutator";
import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { Button } from "@/components/ui/button";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
import { Input } from "@/components/ui/input";
import SearchableSelect from "@/components/ui/searchable-select";
import { getSupportedTimezones } from "@/lib/timezones";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SettingsSection = "appearance" | "account";

type ThemeOption = "light" | "dark" | "system";

type ClerkGlobal = {
  signOut?: (options?: { redirectUrl?: string }) => Promise<void> | void;
};

// ---------------------------------------------------------------------------
// Settings Navigation
// ---------------------------------------------------------------------------

const NAV_ITEMS: { id: SettingsSection; label: string; icon: typeof Palette }[] = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "account", label: "Account", icon: User },
];

function SettingsNav({
  active,
  onSelect,
}: {
  active: SettingsSection;
  onSelect: (section: SettingsSection) => void;
}) {
  return (
    <nav className="w-full lg:w-60 lg:shrink-0" role="tablist" aria-label="Settings sections">
      <div className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelect(item.id)}
              className={cn(
                "flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-[color:var(--accent-soft,var(--surface-muted))] text-[color:var(--accent,var(--foreground))]"
                  : "text-muted hover:bg-[color:var(--surface-muted)] hover:text-strong",
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  isActive ? "bg-[color:var(--accent)]" : "bg-transparent",
                )}
              />
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Appearance Section
// ---------------------------------------------------------------------------

function AppearanceSection() {
  const [theme, setTheme] = useState<ThemeOption>(() => {
    if (typeof document !== "undefined") {
      const current = document.documentElement.getAttribute("data-theme");
      if (current === "dark") return "dark";
      if (current === "light") return "light";
    }
    return "system";
  });

  const applyTheme = (newTheme: ThemeOption) => {
    setTheme(newTheme);
    if (typeof document !== "undefined") {
      if (newTheme === "system") {
        document.documentElement.removeAttribute("data-theme");
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        document.documentElement.setAttribute("data-theme", prefersDark ? "dark" : "light");
      } else {
        document.documentElement.setAttribute("data-theme", newTheme);
      }
    }
    try {
      localStorage.setItem("theme", newTheme);
    } catch {
      // localStorage may be unavailable
    }
  };

  const themeOptions: { value: ThemeOption; label: string; icon: typeof Sun; preview: string }[] = [
    {
      value: "light",
      label: "Light",
      icon: Sun,
      preview: "bg-white border-gray-200",
    },
    {
      value: "dark",
      label: "Dark",
      icon: Moon,
      preview: "bg-gray-900 border-gray-700",
    },
    {
      value: "system",
      label: "System",
      icon: Monitor,
      preview: "bg-gradient-to-r from-white to-gray-900 border-gray-400",
    },
  ];

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-strong">Appearance</h2>
        <p className="mt-1 text-sm text-muted">
          Customize how Mission Control looks to you.
        </p>
      </div>

      {/* Theme Selector */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-strong">Theme</h3>
        <p className="text-xs text-muted">
          Choose how Mission Control looks to you.
        </p>
        <div className="flex gap-3">
          {themeOptions.map((opt) => {
            const Icon = opt.icon;
            const isSelected = theme === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => applyTheme(opt.value)}
                className={cn(
                  "flex w-[140px] flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all",
                  isSelected
                    ? "border-[color:var(--accent)] shadow-sm"
                    : "border-[color:var(--border)] hover:border-[color:var(--border-strong)]",
                )}
              >
                <div
                  className={cn("h-12 w-full rounded-lg border", opt.preview)}
                />
                <span className="text-sm font-medium text-strong">
                  {opt.label}
                </span>
                <Icon className="h-4 w-4 text-muted" />
                <span
                  className={cn(
                    "h-3 w-3 rounded-full border-2",
                    isSelected
                      ? "border-[color:var(--accent)] bg-[color:var(--accent)]"
                      : "border-[color:var(--border)]",
                  )}
                />
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Account Section
// ---------------------------------------------------------------------------

function AccountSection() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isSignedIn } = useAuth();
  const { user } = useUser();

  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState<string | null>(null);
  const [nameEdited, setNameEdited] = useState(false);
  const [timezoneEdited, setTimezoneEdited] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const meQuery = useGetMeApiV1UsersMeGet<
    getMeApiV1UsersMeGetResponse,
    ApiError
  >({
    query: {
      enabled: Boolean(isSignedIn),
      retry: false,
      refetchOnMount: "always",
    },
  });
  const meQueryKey = getGetMeApiV1UsersMeGetQueryKey();

  const profile = meQuery.data?.status === 200 ? meQuery.data.data : null;
  const clerkFallbackName =
    (user as { fullName?: string; firstName?: string; username?: string } | null)?.fullName ??
    (user as { firstName?: string } | null)?.firstName ??
    (user as { username?: string } | null)?.username ??
    "";
  const displayEmail =
    profile?.email ??
    (user as { primaryEmailAddress?: { emailAddress?: string } } | null)?.primaryEmailAddress?.emailAddress ??
    "";
  const resolvedName = nameEdited
    ? name
    : (profile?.name ?? profile?.preferred_name ?? clerkFallbackName);
  const resolvedTimezone = timezoneEdited
    ? (timezone ?? "")
    : (profile?.timezone ?? "");

  const timezones = useMemo(() => getSupportedTimezones(), []);
  const timezoneOptions = useMemo(
    () => timezones.map((value) => ({ value, label: value })),
    [timezones],
  );

  const updateMeMutation = useUpdateMeApiV1UsersMePatch<ApiError>({
    mutation: {
      onSuccess: async () => {
        setSaveError(null);
        setSaveSuccess("Settings saved.");
        await queryClient.invalidateQueries({ queryKey: meQueryKey });
      },
      onError: (error) => {
        setSaveSuccess(null);
        setSaveError(error.message || "Unable to save settings.");
      },
    },
  });

  const deleteAccountMutation = useDeleteMeApiV1UsersMeDelete<ApiError>({
    mutation: {
      onSuccess: async () => {
        setDeleteError(null);
        if (typeof window !== "undefined") {
          const clerk = (window as Window & { Clerk?: ClerkGlobal }).Clerk;
          if (clerk?.signOut) {
            try {
              await clerk.signOut({ redirectUrl: "/sign-in" });
              return;
            } catch {
              // Fall through
            }
          }
        }
        router.replace("/sign-in");
      },
      onError: (error) => {
        setDeleteError(error.message || "Unable to delete account.");
      },
    },
  });

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isSignedIn) return;
    if (!resolvedName.trim() || !resolvedTimezone.trim()) {
      setSaveSuccess(null);
      setSaveError("Name and timezone are required.");
      return;
    }
    setSaveError(null);
    setSaveSuccess(null);
    await updateMeMutation.mutateAsync({
      data: {
        name: resolvedName.trim(),
        timezone: resolvedTimezone.trim(),
      },
    });
  };

  const handleReset = () => {
    setName("");
    setTimezone(null);
    setNameEdited(false);
    setTimezoneEdited(false);
    setSaveError(null);
    setSaveSuccess(null);
  };

  const isSaving = updateMeMutation.isPending;

  return (
    <section className="space-y-6">
      {/* Profile */}
      <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-6">
        <h2 className="text-base font-semibold text-strong">Profile</h2>
        <p className="mt-1 text-sm text-muted">
          Keep your identity and timezone up to date.
        </p>

        <form onSubmit={handleSave} className="mt-6 space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-strong">
                <User className="h-4 w-4 text-muted" />
                Display Name
              </label>
              <Input
                value={resolvedName}
                onChange={(event) => {
                  setName(event.target.value);
                  setNameEdited(true);
                }}
                placeholder="Your name"
                disabled={isSaving}
                className="border-[color:var(--border)] text-strong focus-visible:ring-[color:var(--accent)]"
              />
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-strong">
                <Globe className="h-4 w-4 text-muted" />
                Timezone
              </label>
              <SearchableSelect
                ariaLabel="Select timezone"
                value={resolvedTimezone}
                onValueChange={(value) => {
                  setTimezone(value);
                  setTimezoneEdited(true);
                }}
                options={timezoneOptions}
                placeholder="Select timezone"
                searchPlaceholder="Search timezones..."
                emptyMessage="No matching timezones."
                disabled={isSaving}
                triggerClassName="w-full h-11 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm font-medium text-strong shadow-sm focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)]"
                contentClassName="rounded-xl border border-[color:var(--border)] shadow-lg"
                itemClassName="px-4 py-3 text-sm text-strong data-[selected=true]:bg-[color:var(--surface-muted)] data-[selected=true]:text-strong"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-strong">
              <Mail className="h-4 w-4 text-muted" />
              Email
            </label>
            <Input
              value={displayEmail}
              readOnly
              disabled
              className="border-[color:var(--border)] bg-[color:var(--surface-muted)] text-muted"
            />
          </div>

          {saveError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-700 dark:bg-rose-500/15 dark:text-rose-200">
              {saveError}
            </div>
          ) : null}
          {saveSuccess ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
              {saveSuccess}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={isSaving}>
              <Save className="h-4 w-4" />
              {isSaving ? "Saving…" : "Save settings"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleReset}
              disabled={isSaving}
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
          </div>
        </form>
      </div>

      {/* Danger Zone */}
      <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-6 dark:border-rose-700 dark:bg-rose-500/15">
        <h2 className="text-base font-semibold text-rose-900 dark:text-rose-200">
          Danger Zone
        </h2>
        <p className="mt-1 text-sm text-rose-800 dark:text-rose-200">
          This permanently removes your Mission Control account and related
          personal data. This action cannot be undone.
        </p>
        <div className="mt-4">
          <Button
            type="button"
            className="bg-rose-600 text-white hover:bg-rose-700"
            onClick={() => {
              setDeleteError(null);
              setDeleteDialogOpen(true);
            }}
            disabled={deleteAccountMutation.isPending}
          >
            <Trash2 className="h-4 w-4" />
            Delete account
          </Button>
        </div>
      </div>

      <ConfirmActionDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete your account?"
        description="Your account and personal data will be permanently deleted."
        onConfirm={() => deleteAccountMutation.mutate()}
        isConfirming={deleteAccountMutation.isPending}
        errorMessage={deleteError}
        confirmLabel="Delete account"
        confirmingLabel="Deleting account…"
        ariaLabel="Delete account confirmation"
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Main Settings Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState<SettingsSection>("appearance");

  return (
    <DashboardPageLayout
      signedOut={{
        message: "Sign in to manage your settings.",
        forceRedirectUrl: "/settings",
        signUpForceRedirectUrl: "/settings",
      }}
      title={
        <span className="flex items-center gap-3">
          <Settings2 className="h-6 w-6" />
          Settings
        </span>
      }
      description="Customize your Mission Control experience."
    >
      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Left nav */}
        <SettingsNav active={activeSection} onSelect={setActiveSection} />

        {/* Content */}
        <div className="min-w-0 flex-1">
          {activeSection === "appearance" && <AppearanceSection />}
          {activeSection === "account" && <AccountSection />}
        </div>
      </div>
    </DashboardPageLayout>
  );
}
