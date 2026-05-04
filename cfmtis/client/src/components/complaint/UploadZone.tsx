import { useDropzone } from "react-dropzone";

export const UploadZone = ({ onFiles }: { onFiles: (files: File[]) => void }) => {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: onFiles,
    multiple: true,
    accept: {
      "text/csv": [".csv"],
      "application/json": [".json"],
      "application/pdf": [".pdf"],
      "text/plain": [".txt"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"]
    }
  });

  return (
    <div
      {...getRootProps()}
      className={`mt-6 rounded-[4px] border border-dashed p-10 text-center transition ${
        isDragActive ? "border-cyan bg-cyan/10" : "border-border bg-card"
      }`}
    >
      <input {...getInputProps()} />
      <div className="mx-auto h-10 w-10 rounded-[4px] border border-border bg-panel" />
      <div className="mt-3 font-cond text-xl uppercase tracking-[0.16em] text-primary">Drop Transaction Files Here</div>
      <div className="mt-2 text-sm text-secondary">Accepted formats: CSV, XLSX, JSON, PDF, TXT</div>
    </div>
  );
};
