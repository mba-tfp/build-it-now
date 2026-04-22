import { cn } from "@/lib/utils";

/**
 * Scrollable table wrapper with a sticky header and configurable max height.
 * Use around any data table that may grow long, to keep page layout stable.
 */
export function ScrollTable({
  children,
  maxHeight = "calc(100vh - 320px)",
  className,
}: {
  children: React.ReactNode;
  maxHeight?: string;
  className?: string;
}) {
  return (
    <div
      className={cn("relative w-full overflow-auto rounded-md", className)}
      style={{ maxHeight }}
    >
      {children}
    </div>
  );
}
