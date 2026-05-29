import { useEffect } from 'react';

/**
 * Submit a form with Cmd+Enter (mac) or Ctrl+Enter (other) while a modal is open.
 * Esc closes the dialog by default; this just adds the inverse for power users.
 *
 * Pass an `enabled` flag (typically the modal's `open` state) so the listener
 * is registered only while the modal is visible.
 */
export function useSubmitOnCmdEnter(formRef, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;

    const handler = (event) => {
      const isCmdOrCtrlEnter =
        event.key === 'Enter' && (event.metaKey || event.ctrlKey);
      if (!isCmdOrCtrlEnter) return;
      const form = formRef?.current;
      if (!form) return;
      event.preventDefault();
      // Prefer the form's submit button so React state updates fire normally.
      const submitter = form.querySelector('button[type="submit"]');
      if (submitter && !submitter.disabled) {
        submitter.click();
      } else if (typeof form.requestSubmit === 'function') {
        form.requestSubmit();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [formRef, enabled]);
}
