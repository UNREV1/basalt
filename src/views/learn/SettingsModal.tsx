import { useEffect, useState } from "react";
import { CARD_ORDERS, updateLearnSettings, useLearnSettings, type CardOrder } from "./store.ts";
import { IconX } from "./icons.tsx";

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const s = useLearnSettings();
  const [newPerDay, setNewPerDay] = useState(String(s.newPerDay));
  const [maxReviews, setMaxReviews] = useState(String(s.maxReviews));
  const [order, setOrder] = useState<CardOrder>(s.order);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const parse = (v: string, fallback: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };

  const save = () => {
    updateLearnSettings({ newPerDay: parse(newPerDay, s.newPerDay), maxReviews: parse(maxReviews, s.maxReviews), order });
    onClose();
  };

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="modal learn-modal-narrow"
        role="dialog"
        aria-label="Study settings"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="modal-header">
          Study settings
          <span className="spacer" />
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <IconX />
          </button>
        </div>
        <div className="modal-body">
          <label className="learn-field">
            <span className="learn-field-label">New cards per day</span>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              min={0}
              max={9999}
              value={newPerDay}
              onChange={(e) => setNewPerDay(e.target.value)}
              autoFocus
            />
            <span className="learn-field-help">How many unseen cards to introduce each day. 10–20 is sustainable for most people.</span>
          </label>
          <label className="learn-field">
            <span className="learn-field-label">Maximum reviews per day</span>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              min={0}
              max={99999}
              value={maxReviews}
              onChange={(e) => setMaxReviews(e.target.value)}
            />
            <span className="learn-field-help">Caps reviews of cards you already know. Cards in learning are always shown.</span>
          </label>
          <label className="learn-field">
            <span className="learn-field-label">Card order</span>
            <select className="select" value={order} onChange={(e) => setOrder(e.target.value as CardOrder)}>
              {CARD_ORDERS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <p className="learn-field-help">
            Scheduling uses FSRS with 90% desired retention: intervals adapt to how well you know each card. These
            settings are saved on this device.
          </p>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
