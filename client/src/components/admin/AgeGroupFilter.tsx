"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AgeGroupFilterProps {
  ageGroups: string[];
  currentAgeGroup: string;
  onFilterChange: (value: string) => void;
}

export function AgeGroupFilter({ ageGroups, currentAgeGroup, onFilterChange }: AgeGroupFilterProps) {
  if (ageGroups.length === 0) return null;

  return (
    <div className="w-[160px]">
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
