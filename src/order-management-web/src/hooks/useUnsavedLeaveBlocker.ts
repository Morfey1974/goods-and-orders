import { useCallback, useEffect, useState } from 'react';
import { useBlocker } from 'react-router-dom';

type Options = {
  when: boolean;
  onSave: () => Promise<boolean>;
  /** Successful save already navigates away — cancel the blocked transition instead of proceeding. */
  saveReplacesNavigation?: boolean;
};

export function useUnsavedLeaveBlocker({
  when,
  onSave,
  saveReplacesNavigation = false,
}: Options) {
  const blocker = useBlocker(when);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (blocker.state === 'blocked') {
      setLeaveOpen(true);
    }
  }, [blocker.state]);

  useEffect(() => {
    if (!when) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [when]);

  const closeDialog = useCallback(() => {
    setLeaveOpen(false);
    if (blocker.state === 'blocked') blocker.reset();
  }, [blocker]);

  const proceed = useCallback(() => {
    setLeaveOpen(false);
    if (blocker.state === 'blocked') blocker.proceed();
  }, [blocker]);

  const handleSave = useCallback(async () => {
    setBusy(true);
    try {
      const ok = await onSave();
      if (!ok) return;
      setLeaveOpen(false);
      if (blocker.state === 'blocked') {
        if (saveReplacesNavigation) blocker.reset();
        else blocker.proceed();
      }
    } finally {
      setBusy(false);
    }
  }, [onSave, blocker, saveReplacesNavigation]);

  const handleDiscard = useCallback(() => {
    proceed();
  }, [proceed]);

  return {
    leaveOpen,
    leaveBusy: busy,
    closeLeaveDialog: closeDialog,
    handleLeaveSave: handleSave,
    handleLeaveDiscard: handleDiscard,
  };
}
