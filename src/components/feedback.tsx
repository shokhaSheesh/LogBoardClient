import { AlertCircle } from "lucide-react";
import { Toaster, toast } from "sonner";
import { useTheme } from "../lib/theme";

// One feedback vocabulary for the whole app:
//
//   • A form that fails to save shows <FormError> INSIDE its modal and stays open, so the
//     message sits next to the fields it's about and nothing typed is lost.
//   • Everything else — a save that worked, or a failure with no form on screen (a row
//     action, a background write that got reverted) — is a toast via notify.
//
// Both go through friendlyError, so a raw backend validation string never reaches the UI.

// ─── Error text ───────────────────────────────────────────────────────────────

// The wording itself lives in lib/errors (the API client uses it too); re-exported here so
// screens keep importing their whole feedback vocabulary from one place.
export { friendlyError } from "../lib/errors";

// ─── Toasts ───────────────────────────────────────────────────────────────────

export const notify = {
  success: (msg: string) => toast.success(msg),
  error:   (msg: string) => toast.error(msg, { duration: 6000 }),
};

// Mounted once at the app root.
export function AppToaster() {
  const { theme } = useTheme();
  return (
    <Toaster
      theme={theme}
      position="top-right"
      richColors
      closeButton
      toastOptions={{ style: { fontFamily: "var(--font-sans)", fontSize: 13 } }}
    />
  );
}

// ─── In-form error ────────────────────────────────────────────────────────────

// The banner a modal shows when its save (or a confirm dialog its action) fails.
// Renders nothing without a message, so callers can pass their error state straight in.
export function FormError({ message, style }: { message?: string | null; style?: React.CSSProperties }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      style={{
        display: "flex", alignItems: "flex-start", gap: 9, textAlign: "left",
        padding: "10px 12px", borderRadius: 8,
        backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)",
        ...style,
      }}
    >
      <AlertCircle size={15} color="#EF4444" style={{ flexShrink: 0, marginTop: 1 }} />
      <span style={{ fontFamily: "var(--font-sans)", fontSize: 12.5, lineHeight: 1.5, color: "#DC2626" }}>{message}</span>
    </div>
  );
}

// Where the banner sits in a modal: a fixed strip between the scrolling body and the footer.
export const formErrorInModal: React.CSSProperties = { margin: "0 20px 14px", flexShrink: 0 };
