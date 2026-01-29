import * as React from "react"
import { cn } from "../../lib/utils"

interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

const ScrollArea = React.forwardRef<HTMLDivElement, ScrollAreaProps>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "relative overflow-hidden",
        className
      )}
      {...props}
    >
      <style>{`
        .scroll-area-viewport > * {
          display: block;
        }
      `}</style>
      <div
        className="h-full w-full overflow-auto scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent"
        style={{
          scrollbarWidth: "thin",
          scrollbarColor: "rgb(63 63 70) transparent",
        }}
      >
        <div className="scroll-area-viewport">
          {children}
        </div>
      </div>
    </div>
  )
)
ScrollArea.displayName = "ScrollArea"

const ScrollBar = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    orientation?: "vertical" | "horizontal"
  }
>(({ className, orientation = "vertical", ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex touch-none select-none transition-colors",
      orientation === "vertical"
        ? "h-full w-2.5 border-l border-l-transparent p-[1px]"
        : "h-2.5 flex-col border-t border-t-transparent p-[1px]",
      className
    )}
    {...props}
  />
))
ScrollBar.displayName = "ScrollBar"

export { ScrollArea, ScrollBar }
