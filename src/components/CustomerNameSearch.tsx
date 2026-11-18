"use client";

import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { MIN_CUSTOMER_SUGGESTION_LENGTH, type CustomerSuggestion } from "@/lib/customerName";

interface Props {
  value: string;
  status: string;
  bill: string;
  onChange: (name: string) => void;
  onSelect: (customer: CustomerSuggestion) => void;
}

export default function CustomerNameSearch({ value, status, bill, onChange, onSelect }: Props) {
  const inputId = useId();
  const listId = `${inputId}-suggestions`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [reply, setReply] = useState<{ url: string; suggestions: CustomerSuggestion[] | null } | null>(null);
  const query = value.trim();
  const url = open && query.length >= MIN_CUSTOMER_SUGGESTION_LENGTH
    ? `/api/customers?${new URLSearchParams({ suggest: "1", search: query, status, bill })}` : null;
  // Never offer a result from the previous query while the next one is loading.
  const current = reply?.url === url ? reply : null;
  const suggestions = current?.suggestions ?? [];
  const activeOptionId = suggestions[active] ? `${listId}-${suggestions[active].id}` : undefined;

  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error("Suggestion lookup failed");
        const { suggestions } = await res.json();
        if (!controller.signal.aborted) setReply({ url, suggestions });
      } catch {
        if (!controller.signal.aborted) setReply({ url, suggestions: null });
      }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [url]);

  useEffect(() => {
    if (activeOptionId) document.getElementById(activeOptionId)?.scrollIntoView({ block: "nearest" });
  }, [activeOptionId]);

  function dismiss() {
    setOpen(false);
    setActive(-1);
    setReply(null);
  }

  function select(customer: CustomerSuggestion) {
    dismiss();
    onSelect(customer);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape" && url) {
      event.preventDefault();
      dismiss();
    } else if (event.key === "Enter") {
      if (suggestions[active]) {
        event.preventDefault();
        select(suggestions[active]);
      } else {
        dismiss(); // Let the form submit a normal search.
      }
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (query.length < MIN_CUSTOMER_SUGGESTION_LENGTH) return;
      event.preventDefault();
      setOpen(true);
      if (!suggestions.length) return;
      if (event.key === "ArrowDown") setActive((active + 1) % suggestions.length);
      else setActive(active <= 0 ? suggestions.length - 1 : active - 1);
    }
  }

  return (
    <div>
      <label className="dr-label" htmlFor={inputId}>Customer Name</label>
      <div className="relative">
        <input id={inputId} className="dr-input" value={value} placeholder="First, last, or business name"
          autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded={!!url}
          aria-controls={url ? listId : undefined} aria-activedescendant={activeOptionId} aria-describedby={`${inputId}-hint`}
          onFocus={() => setOpen(true)} onBlur={dismiss} onKeyDown={handleKeyDown}
          onChange={(e) => { setActive(-1); setOpen(true); onChange(e.target.value); }} />
        {url && (
          <div className="absolute z-20 mt-1 w-full rounded-lg border border-(--border-color) bg-(--bg-secondary) shadow-lg">
            <ul id={listId} role="listbox" aria-label="Matching customers" aria-busy={!current} className="max-h-60 overflow-y-auto">
              {suggestions.map((customer, index) => (
                <li key={customer.id} role="presentation">
                  <button type="button" tabIndex={-1} role="option" id={`${listId}-${customer.id}`}
                    aria-selected={active === index}
                    className="block w-full cursor-pointer rounded-md px-3 py-2 text-left text-sm aria-selected:bg-orange-500/15"
                    onMouseEnter={() => setActive(index)} onMouseDown={(e) => e.preventDefault()} onClick={() => select(customer)}>
                    <span className="font-medium">{customer.name}</span>
                    <span className="block text-xs text-(--text-secondary)">#{customer.id}{customer.jobAddress && ` · ${customer.jobAddress}`}</span>
                  </button>
                </li>
              ))}
            </ul>
            {!suggestions.length && <p role="status" className="px-3 py-2 text-sm text-(--text-secondary)">
              {!current ? "Looking up names…" : current.suggestions === null ? "Suggestions unavailable. Use Search to try again." : "No matching names."}
            </p>}
          </div>
        )}
      </div>
      <p id={`${inputId}-hint`} className="mt-1 text-xs text-(--text-muted)">
        Suggestions appear after {MIN_CUSTOMER_SUGGESTION_LENGTH} characters.
      </p>
    </div>
  );
}
