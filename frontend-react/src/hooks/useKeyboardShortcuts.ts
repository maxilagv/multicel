import { useEffect } from 'react';

type ShortcutHandler = {
  key: string;
  label: string;
  action: (event: KeyboardEvent) => void;
  allowInInputs?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
};

function normalizeKey(key: string) {
  return String(key || '').toLowerCase();
}

function isEditableTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  const tag = String(element?.tagName || '').toLowerCase();
  return Boolean(
    element?.isContentEditable ||
      tag === 'input' ||
      tag === 'textarea' ||
      tag === 'select'
  );
}

export function useKeyboardShortcuts(shortcuts: ShortcutHandler[]) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const editable = isEditableTarget(event.target);
      const pressedKey = normalizeKey(event.key);

      const shortcut = shortcuts.find((candidate) => {
        if (!candidate.allowInInputs && editable) return false;
        if (normalizeKey(candidate.key) !== pressedKey) return false;
        if (typeof candidate.ctrlKey === 'boolean' && candidate.ctrlKey !== event.ctrlKey) return false;
        if (typeof candidate.metaKey === 'boolean' && candidate.metaKey !== event.metaKey) return false;
        if (typeof candidate.shiftKey === 'boolean' && candidate.shiftKey !== event.shiftKey) return false;
        if (typeof candidate.altKey === 'boolean' && candidate.altKey !== event.altKey) return false;
        return true;
      });

      if (!shortcut) return;
      shortcut.action(event);
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [shortcuts]);
}
