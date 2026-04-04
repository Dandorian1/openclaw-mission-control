"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";
import {
  Pencil,
  X,
  Paperclip,
  FileUp,
  Trash2,
  ImageIcon,
  Download,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/atoms/Markdown";
import { Button } from "@/components/ui/button";
import { BoardChatComposer } from "@/components/BoardChatComposer";
import { DependencyBanner, type DependencyBannerDependency } from "@/components/molecules/DependencyBanner";
import type { TaskCustomFieldDefinitionRead } from "@/api/generated/model";
import {
  formatCustomFieldDetailValue,
  isCustomFieldVisible,
  type TaskCustomFieldValues,
} from "../custom-field-utils";
import type {
  Task,
  TaskComment,
  Approval,
} from "../board-types";
import { normalizeTagColor, formatShortTimestamp } from "../board-utils";
import { TaskCommentCard } from "./TaskCommentCard";

interface TaskAttachment {
  id: string;
  task_id: string;
  filename: string;
  mimetype: string;
  file_size: number;
  uploaded_at: string;
  uploaded_by_user_id: string | null;
}

interface TaskDetailPanelProps {
  isOpen: boolean;
  selectedTask: Task | null;
  canWrite: boolean;
  boardId: string | undefined;

  // Description & custom fields
  boardCustomFieldDefinitions: TaskCustomFieldDefinitionRead[];
  customFieldDefinitionsLoading: boolean;
  selectedTaskCustomFieldValues: TaskCustomFieldValues;

  // Dependencies
  selectedTaskDependencies: DependencyBannerDependency[];
  selectedTaskResolvedDependencies: DependencyBannerDependency[];

  // Approvals
  approvals: Approval[];
  taskApprovals: Approval[];
  pendingApprovals: Approval[];
  isApprovalsLoading: boolean;
  approvalsError: string | null;
  approvalsUpdatingId: string | null;
  onApprovalDecision: (approvalId: string, status: "approved" | "rejected") => void;

  // Attachments
  attachments: TaskAttachment[];
  attachmentBlobUrls: Record<string, string>;
  attachmentError: string | null;
  isUploadingAttachment: boolean;
  onUploadAttachment: (file: File) => void;
  onDeleteAttachment: (attachmentId: string) => void;
  onDownloadAttachment: (attachmentId: string, filename: string) => void;

  // Lightbox
  onOpenLightbox: (media: { url: string; filename: string; mimetype: string; attachmentId: string }) => void;

  // Comments
  comments: TaskComment[];
  highlightedCommentId: string | null;
  isCommentsLoading: boolean;
  commentsError: string | null;
  isPostingComment: boolean;
  postCommentError: string | null;
  onPostComment: (message: string) => Promise<boolean>;
  boardChatMentionSuggestions: string[];
  allAssigneeById: Map<string, string>;
  currentUserDisplayName: string;

  // Actions
  onClose: () => void;
  onOpenEditDialog: () => void;

  // Approval display helpers
  humanizeApprovalAction: (value: string) => string;
  formatApprovalTimestamp: (value?: string | null) => string;
  approvalRows: (approval: Approval) => Array<{ label: string; value: string }>;
  approvalReason: (approval: Approval) => string | null;
}

export function TaskDetailPanel({
  isOpen,
  selectedTask,
  canWrite,
  boardId,
  boardCustomFieldDefinitions,
  customFieldDefinitionsLoading,
  selectedTaskCustomFieldValues,
  selectedTaskDependencies,
  selectedTaskResolvedDependencies,
  approvals,
  taskApprovals,
  pendingApprovals,
  isApprovalsLoading,
  approvalsError,
  approvalsUpdatingId,
  onApprovalDecision,
  attachments,
  attachmentBlobUrls,
  attachmentError,
  isUploadingAttachment,
  onUploadAttachment,
  onDeleteAttachment,
  onDownloadAttachment,
  onOpenLightbox,
  comments,
  highlightedCommentId,
  isCommentsLoading,
  commentsError,
  isPostingComment,
  postCommentError,
  onPostComment,
  boardChatMentionSuggestions,
  allAssigneeById,
  currentUserDisplayName,
  onClose,
  onOpenEditDialog,
  humanizeApprovalAction,
  formatApprovalTimestamp,
  approvalRows,
  approvalReason,
}: TaskDetailPanelProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <aside
      className={cn(
        "fixed right-0 top-0 z-50 h-full w-full max-w-[99vw] transform bg-[color:var(--surface)] shadow-2xl transition-transform md:w-[max(760px,45vw)]",
        isOpen ? "transform-none" : "translate-x-full",
      )}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-[color:var(--border)] px-4 py-3 md:px-6 md:py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">
              Task detail
            </p>
            <p className="mt-1 text-sm font-medium text-strong">
              {selectedTask?.title ?? "Task"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenEditDialog}
              className="rounded-lg border border-[color:var(--border)] p-2 text-muted transition hover:bg-[color:var(--surface-muted)]"
              disabled={!selectedTask || !canWrite}
              title={canWrite ? "Edit task" : "Read-only access"}
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[color:var(--border)] p-2 text-muted transition hover:bg-[color:var(--surface-muted)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {/* Description */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">
              Description
            </p>
            {selectedTask?.description ? (
              <div className="prose prose-sm max-w-none text-strong">
                <Markdown content={selectedTask.description} variant="description" />
              </div>
            ) : (
              <p className="text-sm text-muted">No description provided.</p>
            )}
          </div>

          {/* Custom fields */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">
              Custom fields
            </p>
            {customFieldDefinitionsLoading ? (
              <p className="text-sm text-muted">Loading custom fields…</p>
            ) : boardCustomFieldDefinitions.length > 0 ? (
              <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-3">
                <dl className="space-y-2">
                  {boardCustomFieldDefinitions.map((definition) => {
                    const value = selectedTaskCustomFieldValues[definition.field_key];
                    if (!isCustomFieldVisible(definition, value)) return null;
                    return (
                      <div
                        key={definition.id}
                        className="grid grid-cols-1 gap-2 sm:grid-cols-[160px_1fr] sm:gap-3"
                      >
                        <dt className="text-xs font-semibold text-muted">
                          {definition.label || definition.field_key}
                          {definition.required === true ? (
                            <span className="ml-1 text-rose-600">*</span>
                          ) : null}
                        </dt>
                        <dd className="text-xs text-slate-800">
                          {formatCustomFieldDetailValue(definition, value)}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
            ) : (
              <p className="text-sm text-muted">No custom fields.</p>
            )}
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">Tags</p>
            {selectedTask?.tags?.length ? (
              <div className="flex flex-wrap gap-2">
                {selectedTask.tags.map((tag) => (
                  <span
                    key={tag.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-2.5 py-1 text-xs font-semibold text-strong"
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: `#${normalizeTagColor(tag.color)}` }}
                    />
                    {tag.name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">No tags assigned.</p>
            )}
          </div>

          {/* Dependencies */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">Dependencies</p>
            {(() => {
              const hasDependencies = (selectedTask?.depends_on_task_ids?.length ?? 0) > 0;
              const hasResolvedDependencies = selectedTaskResolvedDependencies.length > 0;
              const isDependencyModeBlocked = hasDependencies ? selectedTask?.is_blocked === true : false;
              const bannerVariant =
                hasDependencies || hasResolvedDependencies
                  ? isDependencyModeBlocked ? "blocked" : "resolved"
                  : "blocked";
              const displayedDependencies =
                hasDependencies && selectedTask ? selectedTaskDependencies : selectedTaskResolvedDependencies;
              const childrenMessage =
                hasDependencies && selectedTask?.is_blocked
                  ? "Blocked by incomplete dependencies."
                  : hasDependencies
                    ? "Dependencies resolved."
                    : hasResolvedDependencies
                      ? "This task resolves these tasks."
                      : null;
              return (
                <DependencyBanner
                  dependencies={displayedDependencies}
                  variant={bannerVariant}
                  emptyMessage="No dependencies."
                >
                  {childrenMessage}
                </DependencyBanner>
              );
            })()}
          </div>

          {/* Approvals */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Approvals</p>
              <Button variant="outline" size="sm" onClick={() => router.push(`/boards/${boardId}/approvals`)}>
                View all
              </Button>
            </div>
            {approvalsError ? (
              <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-3 text-xs text-muted">
                {approvalsError}
              </div>
            ) : isApprovalsLoading ? (
              <p className="text-sm text-muted">Loading approvals…</p>
            ) : taskApprovals.length === 0 ? (
              <p className="text-sm text-muted">
                No approvals tied to this task.{" "}
                {pendingApprovals.length > 0
                  ? `${pendingApprovals.length} pending on this board.`
                  : "No pending approvals on this board."}
              </p>
            ) : (
              <div className="space-y-3">
                {taskApprovals.map((approval) => (
                  <div key={approval.id} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2 text-xs text-muted">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                          {humanizeApprovalAction(approval.action_type)}
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          Requested {formatApprovalTimestamp(approval.created_at)}
                        </p>
                      </div>
                      <span className="text-xs font-semibold text-strong">
                        {approval.confidence}% confidence · {approval.status}
                      </span>
                    </div>
                    {approvalRows(approval).length > 0 ? (
                      <div className="mt-2 grid gap-2 text-xs text-muted sm:grid-cols-2">
                        {approvalRows(approval).map((row) => (
                          <div key={`${approval.id}-${row.label}`}>
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-quiet">{row.label}</p>
                            <p className="mt-1 text-xs text-strong">{row.value}</p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {approvalReason(approval) ? (
                      <p className="mt-2 text-xs text-muted">{approvalReason(approval)}</p>
                    ) : null}
                    {approval.status === "pending" ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={() => onApprovalDecision(approval.id, "approved")}
                          disabled={approvalsUpdatingId === approval.id || !canWrite}
                          title={canWrite ? "Approve" : "Read-only access"}
                        >
                          Approve
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onApprovalDecision(approval.id, "rejected")}
                          disabled={approvalsUpdatingId === approval.id || !canWrite}
                          title={canWrite ? "Reject" : "Read-only access"}
                          className="border-slate-300 text-strong"
                        >
                          Reject
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Attachments */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                <Paperclip className="mr-1 inline h-3.5 w-3.5" />
                Attachments
              </p>
              {canWrite ? (
                <button
                  type="button"
                  disabled={isUploadingAttachment}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1 rounded-md border border-[color:var(--border)] px-2 py-1 text-xs text-muted transition hover:bg-[color:var(--surface-strong)] disabled:opacity-50"
                >
                  <FileUp className="h-3 w-3" />
                  {isUploadingAttachment ? "Uploading…" : "Upload"}
                </button>
              ) : null}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/quicktime,video/webm,application/pdf,text/markdown,text/plain,.pdf,.md,.markdown,.txt"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    onUploadAttachment(file);
                    e.target.value = "";
                  }
                }}
              />
            </div>
            {attachmentError ? <p className="text-xs text-rose-600">{attachmentError}</p> : null}
            {attachments.length > 0 ? (
              <div className="space-y-2">
                {attachments.map((att) => {
                  const isImage = att.mimetype.startsWith("image/");
                  const isVideo = att.mimetype.startsWith("video/");
                  const isDocument = att.mimetype === "application/pdf" || att.mimetype.startsWith("text/");
                  const blobUrl = attachmentBlobUrls[att.id];
                  const sizeLabel =
                    att.file_size >= 1024 * 1024
                      ? `${(att.file_size / (1024 * 1024)).toFixed(1)} MB`
                      : `${(att.file_size / 1024).toFixed(1)} KB`;
                  return (
                    <div key={att.id} className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-2">
                      {isImage && blobUrl ? (
                        <button
                          type="button"
                          onClick={() => onOpenLightbox({ url: blobUrl, filename: att.filename, mimetype: att.mimetype, attachmentId: att.id })}
                          className="block w-full cursor-pointer"
                          title="Click to enlarge"
                        >
                          <img src={blobUrl} alt={att.filename} className="mb-2 max-h-48 w-full rounded-md object-contain" />
                        </button>
                      ) : isVideo && blobUrl ? (
                        <button
                          type="button"
                          onClick={() => onOpenLightbox({ url: blobUrl, filename: att.filename, mimetype: att.mimetype, attachmentId: att.id })}
                          className="block w-full cursor-pointer"
                          title="Click to enlarge"
                        >
                          <video className="mb-2 max-h-48 w-full rounded-md pointer-events-none" preload="metadata">
                            <source src={blobUrl} type={att.mimetype} />
                          </video>
                        </button>
                      ) : (isImage || isVideo) && !blobUrl ? (
                        <div className="mb-2 flex h-24 items-center justify-center rounded-md bg-muted/30">
                          <span className="text-xs text-muted">Loading preview…</span>
                        </div>
                      ) : isDocument ? (
                        <div className="mb-2 flex h-16 items-center justify-center gap-2 rounded-md bg-muted/20">
                          <FileText className="h-6 w-6 text-muted" />
                          <span className="text-xs text-muted">{att.mimetype === "application/pdf" ? "PDF Document" : "Text Document"}</span>
                        </div>
                      ) : null}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {isImage ? (
                            <ImageIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
                          ) : isDocument ? (
                            <FileText className="h-3.5 w-3.5 shrink-0 text-muted" />
                          ) : (
                            <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted" />
                          )}
                          <button
                            type="button"
                            onClick={() => onDownloadAttachment(att.id, att.filename)}
                            className="truncate text-xs font-medium text-strong hover:underline cursor-pointer text-left"
                          >
                            {att.filename}
                          </button>
                          <span className="shrink-0 text-xs text-muted">{sizeLabel}</span>
                        </div>
                        {canWrite ? (
                          <button
                            type="button"
                            onClick={() => onDeleteAttachment(att.id)}
                            className="shrink-0 rounded p-1 text-muted transition hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-950"
                            title="Delete attachment"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted">No attachments.</p>
            )}
          </div>

          {/* Comments */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">Comments</p>
            <div className="space-y-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-3">
              <BoardChatComposer
                placeholder={
                  canWrite
                    ? "Write a message for the assigned agent. Tag @lead or @name."
                    : "Read-only access. Comments are disabled."
                }
                isSending={isPostingComment}
                onSend={onPostComment}
                disabled={!canWrite}
                mentionSuggestions={boardChatMentionSuggestions}
              />
              {postCommentError ? <p className="text-xs text-rose-600">{postCommentError}</p> : null}
              {!canWrite ? (
                <p className="text-xs text-muted">Read-only access. You cannot post comments on this board.</p>
              ) : null}
            </div>
            {isCommentsLoading ? (
              <p className="text-sm text-muted">Loading comments…</p>
            ) : commentsError ? (
              <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-3 text-xs text-muted">
                {commentsError}
              </div>
            ) : comments.length === 0 ? (
              <p className="text-sm text-muted">No comments yet.</p>
            ) : (
              <div className="space-y-3">
                {comments.map((comment) => (
                  <TaskCommentCard
                    key={comment.id}
                    comment={comment}
                    isHighlighted={highlightedCommentId === comment.id}
                    authorLabel={
                      comment.agent_id
                        ? (allAssigneeById.get(comment.agent_id) ?? "Agent")
                        : currentUserDisplayName
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
