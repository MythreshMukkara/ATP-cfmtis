export const FileList = ({
  files
}: {
  files: Array<{ id?: string; filename: string; sizeMb?: number; fileType?: string }>;
}) => (
  <div className="mt-4 space-y-2">
    {files.map((file, index) => (
      <div
        key={file.id ?? `${file.filename}-${file.fileType ?? "unknown"}-${index}`}
        className="flex items-center justify-between rounded-[4px] border border-border bg-panel px-4 py-3"
      >
        <div>
          <div className="font-mono text-sm text-primary">{file.filename}</div>
          <div className="text-xs text-secondary">
            {(file.sizeMb ?? 0).toFixed(2)} MB · {file.fileType ?? "LOCAL"}
          </div>
        </div>
        <span className="font-mono text-xs text-green">READY</span>
      </div>
    ))}
  </div>
);
