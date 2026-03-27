"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Main, Header } from "@/components/layout/Header";
import { Skeleton, SkeletonCard, SkeletonText, SkeletonForm, SkeletonList } from "@/components/ui/skeleton";
import { FormField, FormError } from "@/components/ui/form-error";
import { EmptyState, NoResults, ErrorState } from "@/components/ui/empty-state";

/**
 * Design System / Component Showcase Page
 * 
 * Displays all available UI components and design patterns.
 * Useful for development, QA, and design review.
 */
export default function DesignSystemPage() {
  const [email, setEmail] = useState("");

  return (
    <div className="min-h-screen bg-[color:var(--bg)]">
      <Header
        leftContent={
          <div>
            <h1 className="text-2xl font-bold text-[color:var(--text)]">Design System</h1>
            <p className="text-sm text-[color:var(--text-muted)]">Component library & patterns</p>
          </div>
        }
        rightContent={<ThemeToggle />}
      />

      <Main maxWidth="lg" padded>
        {/* Buttons Section */}
        <section className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-[color:var(--text)] mb-4">Buttons</h2>
            <Card>
              <CardContent className="space-y-4 pt-6">
                <div className="grid grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-[color:var(--text-quiet)]">Small</p>
                    <Button size="sm" variant="primary">Primary</Button>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-[color:var(--text-quiet)]">Medium</p>
                    <Button size="md" variant="primary">Primary</Button>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-[color:var(--text-quiet)]">Large</p>
                    <Button size="lg" variant="primary">Primary</Button>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-[color:var(--text-quiet)]">Disabled</p>
                    <Button variant="primary" disabled>Disabled</Button>
                  </div>
                </div>

                <div className="border-t border-[color:var(--border)] pt-4">
                  <p className="text-xs font-semibold text-[color:var(--text-quiet)] mb-3">Variants</p>
                  <div className="flex flex-wrap gap-3">
                    <Button variant="primary">Primary</Button>
                    <Button variant="secondary">Secondary</Button>
                    <Button variant="outline">Outline</Button>
                    <Button variant="ghost">Ghost</Button>
                    <Button variant="destructive">Destructive</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Input Section */}
          <div>
            <h2 className="text-xl font-semibold text-[color:var(--text)] mb-4">Inputs</h2>
            <Card>
              <CardContent className="space-y-4 pt-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[color:var(--text)]">Default</label>
                  <Input placeholder="Enter text..." />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[color:var(--text)]">With Error</label>
                  <Input placeholder="Invalid input..." hasError />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[color:var(--text)]">Disabled</label>
                  <Input placeholder="Disabled..." disabled />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Cards Section */}
          <div>
            <h2 className="text-xl font-semibold text-[color:var(--text)] mb-4">Cards</h2>
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <h3 className="text-sm font-semibold text-[color:var(--text)]">Card Title</h3>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-[color:var(--text-muted)]">
                    This is a card with header and content sections. Used for grouped information.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-[color:var(--text-muted)]">
                    Card without header. Simple content wrapper.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Badge Section */}
          <div>
            <h2 className="text-xl font-semibold text-[color:var(--text)] mb-4">Badges</h2>
            <Card>
              <CardContent className="flex flex-wrap gap-2 pt-6">
                <Badge variant="default">Default</Badge>
                <Badge variant="accent">Accent</Badge>
                <Badge variant="outline">Outline</Badge>
                <Badge variant="success">Success</Badge>
                <Badge variant="warning">Warning</Badge>
                <Badge variant="danger">Danger</Badge>
              </CardContent>
            </Card>
          </div>

          {/* Colors Section */}
          <div>
            <h2 className="text-xl font-semibold text-[color:var(--text)] mb-4">Color Palette</h2>
            <Card>
              <CardContent className="grid grid-cols-6 gap-4 pt-6">
                <ColorSwatch name="Surface" value="var(--surface)" />
                <ColorSwatch name="Border" value="var(--border)" />
                <ColorSwatch name="Accent" value="var(--accent)" />
                <ColorSwatch name="Success" value="var(--success)" />
                <ColorSwatch name="Warning" value="var(--warning)" />
                <ColorSwatch name="Danger" value="var(--danger)" />
              </CardContent>
            </Card>
          </div>

          {/* Spacing Section */}
          <div>
            <h2 className="text-xl font-semibold text-[color:var(--text)] mb-4">Spacing Scale</h2>
            <Card>
              <CardContent className="space-y-4 pt-6">
                <div className="space-y-2">
                  <p className="text-xs text-[color:var(--text-quiet)]">xs: 0.5rem (8px)</p>
                  <div className="h-2 bg-[color:var(--accent)] rounded w-2" />
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-[color:var(--text-quiet)]">sm: 0.75rem (12px)</p>
                  <div className="h-2 bg-[color:var(--accent)] rounded w-3" />
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-[color:var(--text-quiet)]">md: 1rem (16px)</p>
                  <div className="h-2 bg-[color:var(--accent)] rounded w-4" />
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-[color:var(--text-quiet)]">lg: 1.5rem (24px)</p>
                  <div className="h-2 bg-[color:var(--accent)] rounded w-6" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Typography Section */}
          <div>
            <h2 className="text-xl font-semibold text-[color:var(--text)] mb-4">Typography</h2>
            <Card>
              <CardContent className="space-y-4 pt-6">
                <div>
                  <p className="text-xs text-[color:var(--text-quiet)] mb-1">Heading (2xl)</p>
                  <h1 className="text-2xl font-bold">The quick brown fox</h1>
                </div>
                <div>
                  <p className="text-xs text-[color:var(--text-quiet)] mb-1">Large (lg)</p>
                  <p className="text-lg">The quick brown fox jumps over the lazy dog</p>
                </div>
                <div>
                  <p className="text-xs text-[color:var(--text-quiet)] mb-1">Base (sm)</p>
                  <p className="text-sm">The quick brown fox jumps over the lazy dog</p>
                </div>
                <div>
                  <p className="text-xs text-[color:var(--text-quiet)] mb-1">Small (xs)</p>
                  <p className="text-xs">The quick brown fox jumps over the lazy dog</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Skeleton Loaders Section */}
        <div>
          <h2 className="text-xl font-semibold text-[color:var(--text)] mb-4">Skeleton Loaders</h2>
          <Card>
            <CardContent className="space-y-6 pt-6">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-[color:var(--text-quiet)]">Card Skeleton</p>
                <SkeletonCard />
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-[color:var(--text-quiet)]">Text Skeleton</p>
                <SkeletonText lines={3} />
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-[color:var(--text-quiet)]">Form Skeleton</p>
                <SkeletonForm />
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-[color:var(--text-quiet)]">List Skeleton</p>
                <SkeletonList count={3} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Form Components Section */}
        <div>
          <h2 className="text-xl font-semibold text-[color:var(--text)] mb-4">Form Components</h2>
          <Card>
            <CardContent className="space-y-6 pt-6">
              <FormField label="Email" required helpText="We'll never share your email">
                <Input placeholder="your@email.com" type="email" />
              </FormField>
              <FormField label="Password" required error="Password must be at least 8 characters">
                <Input placeholder="••••••••" type="password" />
              </FormField>
              <FormField label="Confirmed" success="Email verified successfully!">
                <Input value="verified@email.com" disabled />
              </FormField>
            </CardContent>
          </Card>
        </div>

        {/* Empty States Section */}
        <div>
          <h2 className="text-xl font-semibold text-[color:var(--text)] mb-4">Empty States</h2>
          <div className="grid grid-cols-2 gap-4">
            <EmptyState
              type="default"
              title="No items"
              description="Get started by creating your first item."
            />
            <NoResults query="advanced search" />
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-[color:var(--border)] text-center text-sm text-[color:var(--text-muted)]">
          <p>Design System • Last updated 2026-03-27 • Phase 1.5 Advanced Components</p>
        </div>
      </Main>
    </div>
  );
}

function ColorSwatch({
  name,
  value,
}: {
  name: string;
  value: string;
}) {
  return (
    <div className="space-y-2">
      <div
        className="h-16 rounded-lg border border-[color:var(--border)]"
        style={{
          backgroundColor: value.startsWith("var(")
            ? `var(${value.slice(4, -1)})`
            : value,
        }}
      />
      <p className="text-xs font-medium text-[color:var(--text)]">{name}</p>
      <p className="text-xs text-[color:var(--text-quiet)]">{value}</p>
    </div>
  );
}
