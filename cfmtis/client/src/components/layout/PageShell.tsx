import { PropsWithChildren } from "react";
import { Topbar } from "./Topbar";

export const PageShell = ({ children, caseId }: PropsWithChildren<{ caseId?: string }>) => (
  <div className="min-h-screen bg-deep text-primary">
    <Topbar caseId={caseId} />
    <main className="px-6 pb-6 pt-[86px]">{children}</main>
  </div>
);
