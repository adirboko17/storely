"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

type EditorState = {
  dirty: boolean;
  saving: boolean;
  onDiscard: () => void;
  onSave: () => void;
};

type AdminContextValue = {
  narrow: boolean;
  navCollapsed: boolean;
  navOpen: boolean;
  toggleNav: () => void;
  menu: string | null;
  toggleMenu: (id: string) => void;
  closeMenu: () => void;
  searchOpen: boolean;
  openSearch: () => void;
  closeSearch: () => void;
  toastMessage: string | null;
  toast: (message: string) => void;
  dismissToast: () => void;
  editor: EditorState;
  setEditor: (editor: EditorState | null) => void;
};

const idleEditor: EditorState = {
  dirty: false,
  saving: false,
  onDiscard: () => undefined,
  onSave: () => undefined,
};

const AdminContext = createContext<AdminContextValue | null>(null);

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [narrow, setNarrow] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [navState, setNavState] = useState({ open: false, path: pathname });
  const [menuState, setMenuState] = useState<{ id: string; path: string } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const navOpen = navState.path === pathname && navState.open;
  const menu = menuState?.path === pathname ? menuState.id : null;
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [editor, setEditorState] = useState<EditorState>(idleEditor);
  const toastTimer = useRef<number | null>(null);

  useEffect(() => {
    const apply = () => setNarrow(window.innerWidth < 1000);
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

  useEffect(() => {
    setSearchOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  const toast = useCallback((message: string) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToastMessage(message);
    toastTimer.current = window.setTimeout(() => setToastMessage(null), 3500);
  }, []);

  const value = useMemo<AdminContextValue>(
    () => ({
      narrow,
      navCollapsed,
      navOpen,
      toggleNav: () => {
        if (window.innerWidth < 1000) {
          setNavState((current) => ({
            path: pathname,
            open: current.path === pathname ? !current.open : true,
          }));
        } else {
          setNavCollapsed((collapsed) => !collapsed);
        }
      },
      menu,
      toggleMenu: (id) =>
        setMenuState((current) =>
          current?.path === pathname && current.id === id ? null : { id, path: pathname },
        ),
      closeMenu: () => setMenuState(null),
      searchOpen,
      openSearch: () => {
        setMenuState(null);
        setSearchOpen(true);
      },
      closeSearch: () => setSearchOpen(false),
      toastMessage,
      toast,
      dismissToast: () => setToastMessage(null),
      editor,
      setEditor: (next) => setEditorState(next ?? idleEditor),
    }),
    [narrow, navCollapsed, navOpen, pathname, menu, searchOpen, toastMessage, toast, editor],
  );

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin() {
  const value = useContext(AdminContext);
  if (!value) throw new Error("useAdmin must be used inside AdminProvider");
  return value;
}
