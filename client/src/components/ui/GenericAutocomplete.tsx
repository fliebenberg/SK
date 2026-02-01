"use client";

import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Search, Plus, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface AutocompleteItem {
  id: string;
  label: string;
  subLabel?: string;
  data: any;
}

interface GenericAutocompleteProps {
  items: AutocompleteItem[];
  value: string;
  onChange: (value: string) => void;
  onSelect: (item: AutocompleteItem | null) => void;
  onCreateNew?: (name: string) => void;
  placeholder?: string;
  createLabel?: string;
  className?: string;
  isLoading?: boolean;
}

export function GenericAutocomplete({
  items,
  value,
  onChange,
  onSelect,
  onCreateNew,
  placeholder = "Search...",
  createLabel = "Create",
  className,
  isLoading
}: GenericAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filter items based on value if not handled externally (we'll do basic local filtering)
  const filteredItems = items.filter(item => 
      item.label.toLowerCase().includes(value.toLowerCase()) || 
      item.subLabel?.toLowerCase().includes(value.toLowerCase())
  );

  const exactMatch = filteredItems.find(
      item => item.label.toLowerCase() === value.toLowerCase()
  );

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
    onSelect(null); // Clear selection on type
  };

  const handleSelect = (item: AutocompleteItem) => {
    onChange(item.label);
    onSelect(item);
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
          disabled={isLoading}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
          <Search className="w-4 h-4" />
        </div>
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-popover text-popover-foreground border rounded-md shadow-md animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
          <div className="max-h-[200px] overflow-y-auto p-1">
            {filteredItems.length > 0 && (
                <>
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase">
                    {value.trim() === "" ? "Available Options" : "Existing Results"}
                </div>
                {filteredItems.map(item => (
                    <div
                    key={item.id}
                    onClick={() => handleSelect(item)}
                    className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 cursor-pointer"
                    >
                    <div className="flex flex-col">
                        <span>{item.label}</span>
                        {item.subLabel && <span className="text-xs text-muted-foreground">{item.subLabel}</span>}
                    </div>
                    {item.label.toLowerCase() === value.toLowerCase() && (
                        <Check className="ml-auto h-4 w-4" />
                    )}
                    </div>
                ))}
                </>
            )}

            {!exactMatch && onCreateNew && value.trim() !== "" && (
                <>
                    {filteredItems.length > 0 && <div className="h-px bg-border my-1" />}
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase">
                        New Entry
                    </div>
                    <div
                        onClick={() => {
                            onCreateNew(value);
                            setIsOpen(false);
                        }}
                        className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground cursor-pointer text-primary font-medium"
                    >
                        <Plus className="mr-2 h-4 w-4" />
                        {createLabel} "{value}"
                    </div>
                </>
            )}
            
            {filteredItems.length === 0 && !onCreateNew && (
                <div className="py-6 text-center text-sm text-muted-foreground">
                    No results found.
                </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
