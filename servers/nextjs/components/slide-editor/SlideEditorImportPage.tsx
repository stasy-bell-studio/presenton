"use client";

import { useEffect, useState } from "react";
import { SlideEditor } from "./SlideEditor";
import { editorTheme, baseFont, displayFont, styles } from "./editorStyles";
import { importPptxFile } from "./lib/pptx-import";
import type { Deck } from "./lib/slide-schema";
import {
  readStagedPptxImport,
  removeStagedPptxImport,
} from "./lib/pptx-import-handoff";
import { neoGeneralDeck } from "./templates";

const IMPORT_CACHE_DELETE_DELAY_MS = 60_000;

type ImportState =
  | { status: "loading" }
  | { status: "ready"; deck: Deck }
  | { status: "error"; message: string };

export function SlideEditorImportPage({ importId }: { importId?: string }) {
  const [importState, setImportState] = useState<ImportState>(() =>
    importId ? { status: "loading" } : { status: "ready", deck: neoGeneralDeck },
  );

  useEffect(() => {
    if (!importId) {
      setImportState({ status: "ready", deck: neoGeneralDeck });
      return;
    }

    let cancelled = false;
    setImportState({ status: "loading" });

    const importDeck = async () => {
      try {
        const stagedImport = await readStagedPptxImport(importId);
        if (!stagedImport) {
          throw new Error("The selected PPTX could not be found. Please choose it again.");
        }

        const result = await importPptxFile(stagedImport.file);
        if (cancelled) return;

        setImportState({ status: "ready", deck: result.deck });
        if (result.warnings.length > 0) {
          console.warn("PPTX import warnings:", result.warnings);
        }

        window.setTimeout(() => {
          void removeStagedPptxImport(
            importId,
            stagedImport.createdAt,
          ).catch((error) => {
            console.warn("Could not clear staged PPTX import:", error);
          });
        }, IMPORT_CACHE_DELETE_DELAY_MS);
      } catch (error) {
        if (cancelled) return;
        console.error("PPTX import failed:", error);
        setImportState({
          status: "error",
          message:
            error instanceof Error ? error.message : "Failed to import PPTX.",
        });
      }
    };

    void importDeck();

    return () => {
      cancelled = true;
    };
  }, [importId]);

  if (importState.status === "loading") {
    return (
      <EditorImportStatus
        title="Importing PPTX"
        description="Opening your deck in the editor..."
      />
    );
  }

  if (importState.status === "error") {
    return (
      <EditorImportStatus
        title="Import failed"
        description={importState.message}
      />
    );
  }

  return (
    <SlideEditor
      key={importId ?? "default-slide-editor"}
      importTemplateMode={Boolean(importId)}
      initialDeck={importState.deck}
    />
  );
}

function EditorImportStatus({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: editorTheme.background,
        color: editorTheme.text,
        fontFamily: baseFont,
      }}
    >
      <section
        style={{
          width: "min(420px, 100%)",
          display: "grid",
          gap: 12,
          padding: 24,
          borderRadius: 8,
          border: `1px solid ${editorTheme.border}`,
          background: editorTheme.surface,
          boxShadow: "0 14px 34px rgba(16,19,35,0.08)",
        }}
        aria-live="polite"
      >
        <div style={styles.eyebrow}>Slide Editor</div>
        <h1
          style={{
            margin: 0,
            fontFamily: displayFont,
            fontSize: 22,
            lineHeight: 1.2,
          }}
        >
          {title}
        </h1>
        <p
          style={{
            margin: 0,
            color: editorTheme.textSoft,
            fontSize: 14,
            lineHeight: 1.5,
          }}
        >
          {description}
        </p>
      </section>
    </main>
  );
}
