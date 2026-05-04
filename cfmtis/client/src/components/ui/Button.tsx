import { ButtonHTMLAttributes, PropsWithChildren } from "react";

type Props = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "ghost" | "danger";
    fullWidth?: boolean;
  }
>;

export const Button = ({ children, variant = "ghost", fullWidth, className = "", ...props }: Props) => {
  const variantClass =
    variant === "primary"
      ? "border-blue/60 bg-blue/15 text-primary hover:bg-blue/22"
      : variant === "danger"
        ? "border-red/45 text-red hover:bg-red/8"
        : "border-bright/70 text-primary hover:bg-hover";

  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-[3px] border px-4 py-2 font-cond text-[13px] uppercase tracking-[0.22em] transition ${variantClass} ${fullWidth ? "w-full" : ""} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
