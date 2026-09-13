"use client";

/**
 * Last-resort boundary: replaces the whole document, so it cannot rely on the
 * app's providers, fonts or stylesheet. Everything here is inline and English —
 * the i18n dictionary is exactly what has failed to load in this state.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "#070707",
          color: "#f5f5f4",
          fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
          textAlign: "center",
          padding: "2rem",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.5rem", margin: 0 }}>Something went wrong</h1>
          <p style={{ color: "#a8a8a8", marginTop: "0.5rem" }}>
            SportGo could not load this page.
          </p>
          {error.digest ? (
            <p style={{ color: "#828282", fontSize: "0.75rem", marginTop: "0.75rem" }}>
              {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              padding: "0.5rem 1rem",
              borderRadius: "9px",
              border: "none",
              background: "#f5c518",
              color: "#0a0a0a",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
