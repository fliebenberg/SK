import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Team, Sport } from "@sk/types";
import { Card, CardContent } from "@/components/ui/card";
import { GroupedTeamList } from "@/components/admin/GroupedTeamList";

interface DeactivatedTeamsSectionProps {
  teams: Team[];
  organizationId: string;
  sports: Sport[];
  groupBy: 'none' | 'sport' | 'age';
}

export function DeactivatedTeamsSection({ teams, organizationId, sports, groupBy }: DeactivatedTeamsSectionProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (teams.length === 0) return null;

  return (
    <div className="space-y-4 pt-8 border-t border-border/50">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors group"
      >
        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <span className="font-medium text-sm">Deactivated Teams ({teams.length})</span>
      </button>

      {isOpen && (
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm mt-2">
          <CardContent className="p-0 md:p-6">
            <GroupedTeamList 
              teams={teams} 
              organizationId={organizationId} 
              sports={sports} 
              groupBy={groupBy}
              isActive={false} 
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
