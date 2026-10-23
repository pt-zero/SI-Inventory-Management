// NOTE: Consuming application must have the following dependencies installed:
// - react
// - react-dom/client
import { Children, isValidElement } from "react";
import { createRoot } from "react-dom/client";

// Usage:
//
//   import { alert, confirm }
//
//   // Show an informational alert (resolves when dismissed):
//      await alert("Operation complete."); -- Default title is "Notice"
//
//   // Alert with a title and variant ("info" | "warning" | "error"):
//      await alert("Something went wrong.", { title: "Error", variant: "error" });
//
//   // Alert with JSX content:
//      await alert(<p>Your file has been <strong>saved</strong>.</p>, { title: "Saved" });
//
//   // Note: Confirmation dialogs require the user to explicitly click "OK" or "Cancel"
//            and cannot be dismissed by clicking outside or pressing Escape.
//   // Show a confirmation dialog (resolves true = OK, false = Cancel):
//      const confirmed = await confirm("Delete this item?"); -- Default title is "Confirm"
//      if (confirmed) { /* proceed */ }
//
//   // Confirmation with custom button labels:
//      const yes = await confirm("Are you sure?", {
//        title: "Confirm Delete",
//        variant: "warning",
//        okButtonProps: { text: "Delete" },
//        cancelButtonProps: { text: "Keep" },
//      });
//      -- Default button texts are "OK" and "Cancel"


let openDialogCount = 0;

// Add a case and color code here to define any new variants
function getAccentColor(variant) {
  switch (variant) {
    case "error":
      return "#d9534f";
    case "warning":
      return "#f0ad4e";
    case "info":
    default:
      return "#0068B3";
  }
}

function messageToText(message) {
  if (message == null || message === false) {
    return "";
  }

  if (typeof message === "string" || typeof message === "number") {
    return String(message);
  }

  if (Array.isArray(message)) {
    return message.map(messageToText).join("");
  }

  if (isValidElement(message)) {
    if (message.type === "br") {
      return "\n";
    }

    if (typeof message.props?.source === "string") {
      return message.props.source;
    }

    return Children.toArray(message.props?.children).map(messageToText).join("");
  }

  return String(message);
}

function renderMessage(message) {
  if (message == null || message === false) {
    return null;
  }

  if (typeof message === "string" || typeof message === "number") {
    return <div style={{ whiteSpace: "pre-wrap" }}>{String(message)}</div>;
  }

  if (Array.isArray(message)) {
    return message.map((item, index) => <div key={index}>{renderMessage(item)}</div>);
  }

  return message;
}

function showDialog(message, options = {}, isConfirm = false) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.resolve(isConfirm ? window.confirm(messageToText(message)) : window.alert(messageToText(message)));
  }

  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);

    const root = createRoot(host);
    const accentColor = getAccentColor(options?.variant);

    openDialogCount++;
    if (openDialogCount === 1) document.body.style.overflow = "hidden";

    const cleanup = (result) => {
      openDialogCount--;
      if (openDialogCount === 0) document.body.style.overflow = "";
      root.unmount();
      host.remove();
      resolve(result);
    };

    const okText = options?.okButtonProps?.text || "OK";
    const cancelText = options?.cancelButtonProps?.text || "Cancel";

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !isConfirm) {
        cleanup(isConfirm ? false : undefined);
      }
    };

    root.render(
      <div
        onClick={!isConfirm ? () => cleanup(undefined) : undefined}
        onKeyDown={handleKeyDown}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 10000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          background: "rgba(0, 0, 0, 0.58)",
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          onClick={(event) => event.stopPropagation()}
          style={{
            width: "min(760px, 100%)",
            maxHeight: "min(80vh, 900px)",
            display: "flex",
            flexDirection: "column",
            border: `1px solid ${accentColor}`,
            borderRadius: "10px",
            background: "#1b1d21",
            color: "#ffffff",
            boxShadow: "0 20px 40px rgba(0, 0, 0, 0.45)",
          }}
        >
          <div
            style={{
              padding: "16px 18px 12px",
              borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
              color: "#ffffff",
              fontSize: "20px",
              fontWeight: 600,
              textAlign: "center",
            }}
          >
            {options?.title || (isConfirm ? "Confirm" : "Notice")}
          </div>
          <div
            style={{
              overflowY: "auto",
              padding: "18px",
              lineHeight: 1.5,
              ...options?.bodyStyle,
            }}
          >
            {renderMessage(message)}
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "10px",
              padding: "14px 18px 18px",
              borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            }}
          >
            {isConfirm ? (
              <button
                type="button"
                onClick={() => cleanup(false)}
                style={{
                  minWidth: "90px",
                  padding: "8px 14px",
                  border: "1px solid #4b5563",
                  borderRadius: "8px",
                  background: "#31353b",
                  color: "#ffffff",
                  cursor: "pointer",
                  ...options?.cancelButtonProps?.style,
                }}
              >
                {cancelText}
              </button>
            ) : null}
            <button
              type="button"
              autoFocus
              onClick={() => cleanup(isConfirm ? true : undefined)}
              style={{
                minWidth: "90px",
                padding: "8px 14px",
                border: "1px solid transparent",
                borderRadius: "8px",
                background: accentColor,
                color: "#ffffff",
                cursor: "pointer",
                ...options?.okButtonProps?.style,
              }}
            >
              {okText}
            </button>
          </div>
        </div>
      </div>
    );
  });
}

export const alert = async (message, options = {}) => {
  return showDialog(message, options, false);
};

export const confirm = async (message, options = {}) => {
  return showDialog(message, options, true);
};
