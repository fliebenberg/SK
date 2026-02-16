"use client";

import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { store } from "@/app/store/store";
import { Person } from "@sk/types";
import { Search, UserPlus, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface PersonnelAutocompleteProps {
  organizationId: string;
  value: string;
  onChange: (value: string) => void;
  onSelectPerson: (person: Person | null) => void;
  placeholder?: string;
  className?: string;
}

export function PersonnelAutocomplete({
  organizationId,
  value,
  onChange,
  onSelectPerson,
  placeholder = "Search or enter name...",
  className,
}: PersonnelAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<Person[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!value.trim() || value.length < 2) {
      setSuggestions([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsLoading(true);
      try {
        const results = await store.searchPeople(value, organizationId);
        setSuggestions(results);
      } catch (error) {
        console.error("Fuzzy search failed:", error);
      } finally {
        setIsLoading(false);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [organizationId, value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
    setIsOpen(true);
    onSelectPerson(null); // Reset selection when typing
  };

  const handleSelect = (person: Person) => {
    onChange(person.name);
    onSelectPerson(person);
    setIsOpen(false);
  };

  return (
    <div className={cn("relative w-full", className)} ref={dropdownRef}>
      <div className="relative">
        <Input
          value={value}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="pr-10"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
          <Search className="w-4 h-4" />
        </div>
      </div>

      {isOpen && (value.trim() !== "") && (
        <div className="absolute z-50 w-full mt-1 bg-card/95 backdrop-blur-md border border-border/50 rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          <div className="max-h-60 overflow-y-auto">
            {suggestions.length > 0 ? (
              <>
                <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/30 bg-muted/30">
                  Search Results
                </div>
                {suggestions.map((person) => (
                  <button
                    key={person.id}
                    type="button"
                    onClick={() => handleSelect(person)}
                    className="w-full px-4 py-2.5 text-left hover:bg-primary/10 flex items-center justify-between group transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold">
                        {person.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-medium">{person.name}</span>
                        {person.email && (
                          <span className="text-xs text-muted-foreground">{person.email}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {person.birthdate && (
                        <span className="text-xs text-muted-foreground italic">
                          ({new Date(person.birthdate).toLocaleDateString()})
                        </span>
                      )}
                      <Check className="w-4 h-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </button>
                ))}
              </>
            ) : null}

            <div className={cn(
              "px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/30 bg-muted/30 mt-0",
              suggestions.length > 0 && "border-t"
            )}>
              New Person
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="w-full px-4 py-2.5 text-left hover:bg-primary/10 flex items-center gap-3 transition-colors text-primary"
            >
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                <UserPlus className="w-4 h-4" />
              </div>
              <span className="font-medium">Add "{value}" as a new person</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
