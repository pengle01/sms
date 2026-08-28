import { Paperclip } from "lucide-react";
import { formatBytes } from "@/lib/attachments";
import { cn } from "@/lib/utils";

/**
 * Download chip for a stored file. Every attachment surface renders this so the
 * link, the truncation behaviour and the size formatting stay identical.
 * The href is always the authorised route — files are never served statically.
 */
export function AttachmentLink({
  file,
  className,
}: {
  file: { id: string; filename: string; size: number };
  className?: string;
}) {
  return (
    <a
      href={`/api/files/${file.id}`}
      className={cn(
        "inline-flex max-w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:border-emerald-300 hover:bg-emerald-50",
        className,
      )}
    >
      <Paperclip className="w-4 h-4 flex-shrink-0 text-slate-400" />
      <span className="truncate">{file.filename}</span>
      <span className="flex-shrink-0 text-xs text-slate-400">{formatBytes(file.size)}</span>
    </a>
  );
}

/**
 * Every attachment on one post. Wraps rather than repeating the map at each
 * call site, and renders nothing at all when there are none.
 */
export function AttachmentList({
  files,
  className,
}: {
  files: { id: string; filename: string; size: number }[];
  className?: string;
}) {
  if (files.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {files.map((f) => (
        <AttachmentLink key={f.id} file={f} />
      ))}
    </div>
  );
}
