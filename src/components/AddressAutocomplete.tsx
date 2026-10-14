"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ChangeEvent, CSSProperties, KeyboardEvent } from "react";
import { MIN_QUERY_LENGTH, type AddressSuggestion, type SuggestionProvider } from "@/lib/geocoding";
import { lookupSuggestions } from "@/lib/addressLookup";

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  name?: string;
  className?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  multiline?: boolean;
  rows?: number;
  style?: CSSProperties;
}

interface DropdownPosition {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  listMaxHeight: number;
  maxHeight: number;
}

const DEBOUNCE_MS = 300;

export default function AddressAutocomplete({
  value,
  onChange,
  id,
  name,
  className = "dr-input",
  placeholder,
  required,
  disabled,
  multiline = false,
  rows = 2,
  style,
}: AddressAutocompleteProps) {
  const generatedId = useId();
  const inputId = id || `address-${generatedId}`;
  const listboxId = `${inputId}-suggestions`;
  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [provider, setProvider] = useState<SuggestionProvider | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "empty" | "error">("idle");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [dropdownPosition, setDropdownPosition] = useState<DropdownPosition | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      const bounds = inputRef.current?.getBoundingClientRect();
      if (!bounds || bounds.bottom < 0 || bounds.top > window.innerHeight) {
        setDropdownPosition(null);
        setIsOpen(false);
        return;
      }

      const viewportPadding = 8;
      const availableBelow = window.innerHeight - bounds.bottom - viewportPadding;
      const availableAbove = bounds.top - viewportPadding;
      const placeAbove = availableBelow < 220 && availableAbove > availableBelow;
      const available = Math.max(80, placeAbove ? availableAbove : availableBelow);
      const width = Math.min(bounds.width, window.innerWidth - viewportPadding * 2);

      setDropdownPosition({
        left: Math.max(viewportPadding, Math.min(bounds.left, window.innerWidth - width - viewportPadding)),
        width,
        ...(placeAbove
          ? { bottom: window.innerHeight - bounds.top + 4 }
          : { top: bounds.bottom + 4 }),
        listMaxHeight: Math.max(60, Math.min(240, available - 56)),
        maxHeight: available,
      });
    };

    const positionFrame = window.requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.cancelAnimationFrame(positionFrame);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen]);

  useEffect(() => {
    const query = value.trim();
    if (!isOpen || query.length < MIN_QUERY_LENGTH) return;

    const controller = new AbortController();

    const timer = window.setTimeout(async () => {
      try {
        const result = await lookupSuggestions(query, controller.signal);
        if (controller.signal.aborted) return;
        setSuggestions(result.suggestions);
        setProvider(result.provider);
        setStatus(result.suggestions.length > 0 ? "idle" : "empty");
      } catch {
        if (controller.signal.aborted) return;
        setSuggestions([]);
        setProvider(null);
        setStatus("error");
      }
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [isOpen, value]);

  function handleChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const nextValue = event.target.value;
    onChange(nextValue);
    setHighlightedIndex(-1);

    if (nextValue.trim().length >= MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setStatus("loading");
      setIsOpen(true);
    } else {
      setIsOpen(false);
      setDropdownPosition(null);
      setSuggestions([]);
      setStatus("idle");
    }
  }

  function selectSuggestion(suggestion: AddressSuggestion) {
    onChange(suggestion.label);
    setIsOpen(false);
    setDropdownPosition(null);
    setSuggestions([]);
    setProvider(null);
    setStatus("idle");
    setHighlightedIndex(-1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      setIsOpen(false);
      setDropdownPosition(null);
      setHighlightedIndex(-1);
      return;
    }

    if (!isOpen || suggestions.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
    } else if (event.key === "Enter" && highlightedIndex >= 0) {
      event.preventDefault();
      selectSuggestion(suggestions[highlightedIndex]);
    }
  }

  const inputProps = {
    ref: (element: HTMLInputElement | HTMLTextAreaElement | null) => {
      inputRef.current = element;
    },
    id: inputId,
    name,
    className,
    style,
    value,
    placeholder,
    required,
    disabled,
    autoComplete: "off",
    role: "combobox" as const,
    "aria-autocomplete": "list" as const,
    "aria-haspopup": "listbox" as const,
    "aria-expanded": isOpen,
    "aria-controls": listboxId,
    "aria-activedescendant":
      isOpen && highlightedIndex >= 0
        ? `${inputId}-option-${highlightedIndex}`
        : undefined,
    onChange: handleChange,
    onKeyDown: handleKeyDown,
    onBlur: () => {
      // Let a pointer click on a suggestion complete before closing the menu.
      window.setTimeout(() => {
        setIsOpen(false);
        setDropdownPosition(null);
      }, 150);
    },
  };

  const suggestionMenu =
    isOpen && dropdownPosition ? (
      <div
        className="address-autocomplete__dropdown"
        style={{
          left: dropdownPosition.left,
          width: dropdownPosition.width,
          top: dropdownPosition.top ?? "auto",
          bottom: dropdownPosition.bottom ?? "auto",
          maxHeight: dropdownPosition.maxHeight,
          zIndex: 1001,
        }}
      >
        <ul
          id={listboxId}
          className="address-autocomplete__list"
          role="listbox"
          aria-label="Address suggestions"
          aria-busy={status === "loading"}
          style={{ maxHeight: dropdownPosition.listMaxHeight }}
        >
          {suggestions.map((suggestion, index) => (
            <li key={`${suggestion.label}-${index}`} role="presentation">
              <button
                id={`${inputId}-option-${index}`}
                type="button"
                role="option"
                aria-selected={index === highlightedIndex}
                className="address-autocomplete__option"
                onMouseEnter={() => setHighlightedIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectSuggestion(suggestion)}
              >
                <span aria-hidden="true" className="address-autocomplete__pin">📍</span>
                <span>{suggestion.label}</span>
              </button>
            </li>
          ))}
        </ul>

        {status === "loading" && (
          <div className="address-autocomplete__message" role="status">
            Searching addresses…
          </div>
        )}
        {status === "empty" && (
          <div className="address-autocomplete__message" role="status">
            No matches found. Keep typing or enter the address manually.
          </div>
        )}
        {status === "error" && (
          <div className="address-autocomplete__message" role="status">
            Address suggestions are unavailable right now. You can still enter the address manually.
          </div>
        )}

        <div className="address-autocomplete__attribution">
          {provider === "zippopotam" ? (
            <>
              ZIP suggestions by <a href="https://zippopotam.us/" target="_blank" rel="noreferrer">Zippopotam.us</a>.
            </>
          ) : provider === "census" ? (
            <>
              Address suggestions by the{" "}
              <a href="https://www.census.gov/programs-surveys/geography/technical-documentation/complete-technical-documentation/geocoder.html" target="_blank" rel="noreferrer">
                U.S. Census Bureau
              </a>.
            </>
          ) : (
            <>
              Address suggestions by <a href="https://photon.komoot.io/" target="_blank" rel="noreferrer">Photon</a>. ©{" "}
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>.
            </>
          )}
        </div>
      </div>
    ) : null;

  return (
    <div className="address-autocomplete">
      {multiline ? (
        <textarea {...inputProps} rows={rows} />
      ) : (
        <input {...inputProps} type="text" />
      )}
      {suggestionMenu && typeof document !== "undefined"
        ? createPortal(suggestionMenu, document.body)
        : null}
    </div>
  );
}
