"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRouter, useSearchParams } from "next/navigation";

interface TeamListFilterProps {
  sports: { id: string; name: string }[];
  currentSport?: string;
  organizationId: string;
}

export function TeamListFilter({ sports, currentSport, organizationId }: TeamListFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleSportChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== "all") {
      params.set("sport", value);
    } else {
      params.delete("sport");
    }
    router.push(`/admin/organizations/${organizationId}/teams?${params.toString()}`);
  };

  // If only one sport, we don't really need to show the filter, or we show it disabled/single option.
  // Requirement: "If the organisation has only 1 sport, then default the selection to that sport."
  // If > 1, add "All".

  const showAllOption = sports.length > 1;
  const value = currentSport || (sports.length === 1 ? sports[0].id : "all");

  if (sports.length === 0) return null;

  return (
    <div className="w-[200px]">
      <Select value={value} onValueChange={handleSportChange} disabled={sports.length <= 1}>
        <SelectTrigger>
          <SelectValue placeholder="Filter by sport" />
        </SelectTrigger>
        <SelectContent>
          {showAllOption && <SelectItem value="all">All Sports</SelectItem>}
          {sports.map((sport) => (
            <SelectItem key={sport.id} value={sport.id}>
              {sport.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
