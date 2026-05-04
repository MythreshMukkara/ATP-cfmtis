import { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export const Input = (props: InputHTMLAttributes<HTMLInputElement>) => (
  <input
    className="h-11 w-full rounded-[4px] border border-border bg-card px-3 text-primary outline-none transition placeholder:text-secondary/65 focus:border-cyan"
    {...props}
  />
);

export const Select = (props: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select
    className="h-11 w-full rounded-[4px] border border-border bg-card px-3 text-primary outline-none transition focus:border-cyan"
    {...props}
  />
);

export const Textarea = (props: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea
    className="min-h-28 w-full rounded-[4px] border border-border bg-card px-3 py-3 text-primary outline-none transition placeholder:text-secondary/65 focus:border-cyan"
    {...props}
  />
);
