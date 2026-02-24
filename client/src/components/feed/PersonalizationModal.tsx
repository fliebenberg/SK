import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { store } from "@/app/store/store";
import { useState, useEffect } from "react";
import { Sport } from "@sk/types";

interface PersonalizationModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    userId: string;
}

export const PersonalizationModal = ({ open, onOpenChange, userId }: PersonalizationModalProps) => {
    const [sports, setSports] = useState<Sport[]>(store.getSports());
    const [selectedSports, setSelectedSports] = useState<string[]>([]);
    
    useEffect(() => {
        const handleStoreUpdate = () => {
            setSports(store.getSports());
        };
        const unsubscribe = store.subscribe(handleStoreUpdate);
        return () => unsubscribe();
    }, []);

    const handleSave = () => {
        // Implement save logic via UserManager updating UserPreferences
        console.log("Saving preferences:", { favoriteSports: selectedSports });
        onOpenChange(false);
    };

    const toggleSport = (sportId: string) => {
        setSelectedSports(prev => 
            prev.includes(sportId) ? prev.filter(id => id !== sportId) : [...prev, sportId]
        );
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-bold font-orbitron text-center">Make it Yours</DialogTitle>
                    <DialogDescription className="text-center text-md">
                        Select the sports you love to follow to customize your feed.
                    </DialogDescription>
                </DialogHeader>
                
                <div className="py-6">
                    <h3 className="text-lg font-semibold mb-4 text-center">Sports</h3>
                    <div className="flex flex-wrap gap-3 justify-center">
                        {sports.map(sport => (
                            <Button
                                key={sport.id}
                                variant={selectedSports.includes(sport.id) ? "default" : "outline"}
                                className={`rounded-full px-6 py-2 transition-all ${
                                    selectedSports.includes(sport.id) 
                                        ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90' 
                                        : 'hover:border-primary hover:text-primary'
                                }`}
                                onClick={() => toggleSport(sport.id)}
                            >
                                {sport.name}
                            </Button>
                        ))}
                    </div>
                </div>

                <div className="flex justify-between items-center bg-muted/30 p-4 -mx-6 -mb-6 mt-4 pt-6 border-t border-border">
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Skip for now</Button>
                    <Button 
                        onClick={handleSave} 
                        className="px-8 font-semibold shadow-md shadow-primary/20"
                        disabled={selectedSports.length === 0}
                    >
                        Save Preferences
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};
