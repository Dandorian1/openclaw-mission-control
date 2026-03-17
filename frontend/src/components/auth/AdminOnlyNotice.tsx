type AdminOnlyNoticeProps = {
  message: string;
};

export function AdminOnlyNotice({ message }: AdminOnlyNoticeProps) {
  return (
    <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-6 py-5 text-sm text-muted shadow-sm">
      {message}
    </div>
  );
}
