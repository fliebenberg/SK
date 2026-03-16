"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface AgeGroupFilterProps {
  ageGroups: string[];
  currentAgeGroup: string;
  onFilterChange: (value: string) => void;
  className?: string;
}

export function AgeGroupFilter({ ageGroups, currentAgeGroup, onFilterChange, className }: AgeGroupFilterProps) {
  if (ageGroups.length === 0) return null;

  return (
    <div className={cn("w-full md:w-[160px]", className)}>
      <Select value={currentAgeGroup} onValueChange={onFilterChange}>
        <SelectTrigger className="h-9">
          <SelectValue placeholder="Filter by age" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Ages</SelectItem>
          {ageGroups.map((age) => (
            <SelectItem key={age} value={age}>
              {age}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

