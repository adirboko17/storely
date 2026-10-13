"use client";

import { useEffect, useRef } from "react";
import { useAdmin } from "@/components/admin/layout/admin-provider";

export function useUnsavedEditor(dirty: boolean, saving: boolean, onSave: () => void, onDiscard: () => void) {
  const { setEditor } = useAdmin();
  const setEditorRef = useRef(setEditor);
  const saveRef = useRef(onSave);
  const discardRef = useRef(onDiscard);

  useEffect(() => {
    setEditorRef.current = setEditor;
    saveRef.current = onSave;
    discardRef.current = onDiscard;
  });

  useEffect(() => {
    setEditorRef.current({
      dirty,
      saving,
      onSave: () => saveRef.current(),
      onDiscard: () => discardRef.current(),
    });
  }, [dirty, saving]);

  useEffect(() => {
    return () => setEditorRef.current(null);
  }, []);
}
