export type UploadFileStatus = "pending" | "uploading" | "done" | "error";

export interface UploadProgressFile {
  name: string;
  progress: number;
  status: UploadFileStatus;
}

export interface UploadProgressProps {
  files: UploadProgressFile[];
}

const STATUS_LABEL: Record<UploadFileStatus, string> = {
  pending: "Waiting",
  uploading: "Uploading",
  done: "Uploaded",
  error: "Upload failed",
};

const STATUS_ICON: Record<UploadFileStatus, string> = {
  pending: "…",
  uploading: "↑",
  done: "✓",
  error: "✕",
};

const BAR_COLOUR: Record<UploadFileStatus, string> = {
  pending: "bg-gray-400 haunted:bg-purple-400",
  uploading: "bg-blue-600 haunted:bg-purple-500",
  done: "bg-green-600 haunted:bg-green-400",
  error: "bg-red-600 haunted:bg-red-400",
};

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function summarise(files: UploadProgressFile[]): string {
  const total = files.length;
  if (total === 0) return "";
  const done = files.filter((f) => f.status === "done").length;
  const failed = files.filter((f) => f.status === "error").length;
  const base = `${done} of ${total} ${total === 1 ? "file" : "files"} uploaded`;
  return failed > 0
    ? `${base}, ${failed} failed`
    : base;
}

export function UploadProgress({ files }: UploadProgressProps) {
  return (
    <div className="w-full">
      <p
        role="status"
        aria-live="polite"
        className="mb-2 text-sm font-medium text-gray-800 haunted:text-purple-100"
      >
        {summarise(files)}
      </p>
      <ul className="space-y-3">
        {files.map((file, index) => {
          const pct = clampProgress(file.progress);
          return (
            <li
              key={`${file.name}-${index}`}
              className="rounded-md border border-gray-200 p-3 haunted:border-purple-800 haunted:bg-haunted-surface"
            >
              <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                <span className="truncate font-medium text-gray-900 haunted:text-purple-50">
                  {file.name}
                </span>
                <span className="shrink-0 text-gray-700 haunted:text-purple-200">
                  <span aria-hidden="true">{STATUS_ICON[file.status]} </span>
                  {STATUS_LABEL[file.status]}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div
                  role="progressbar"
                  aria-label={file.name}
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200 haunted:bg-purple-950"
                >
                  <div
                    className={`h-full rounded-full transition-[width] ${BAR_COLOUR[file.status]}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-10 text-right text-xs tabular-nums text-gray-700 haunted:text-purple-200">
                  {pct}%
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
