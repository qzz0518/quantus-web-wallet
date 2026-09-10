import { Check, TriangleAlert } from "lucide-react";

/**
 * The one shape every flow uses for the short feedback that follows an action.
 * The slot keeps its height whether or not a message is present, so a success
 * or an error never pushes the surrounding layout around, and the live region
 * stays mounted so assistive technology announces the change.
 */
export function FlowStatus({
  message,
  error,
  errorId,
  className = "",
}: {
  message?: string;
  error?: string;
  errorId?: string;
  className?: string;
}) {
  const tone = error ? "error" : message ? "success" : undefined;
  return (
    <div
      className={`flow-status ${className}`.trimEnd()}
      data-tone={tone}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {tone && (
        <p id={error ? errorId : undefined}>
          {error ? (
            <TriangleAlert size={16} aria-hidden="true" />
          ) : (
            <Check size={16} aria-hidden="true" />
          )}
          {error || message}
        </p>
      )}
    </div>
  );
}
