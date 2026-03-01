"use client";

import React, { useRef, useState, useEffect } from "react";
import { useJsApiLoader, Autocomplete } from "@react-google-maps/api";
import { Input } from "@/components/ui/input";
import { Address } from "@sk/types";
import { Loader2, MapPin } from "lucide-react";

const libraries: ("places")[] = ["places"];

interface AddressInputProps {
  value?: string;
  onChange: (address: Address) => void;
  placeholder?: string;
  className?: string;
  id?: string;
}

export function AddressInput({ value, onChange, placeholder, className, id }: AddressInputProps) {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
    libraries,
  });

  const [inputValue, setInputValue] = useState(value || "");
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  useEffect(() => {
    setInputValue(value || "");
    // Clear selection if value is cleared
    if (!value) setSelectedAddress(null);
  }, [value]);

  const onLoad = (autocomplete: google.maps.places.Autocomplete) => {
    autocompleteRef.current = autocomplete;
    // Set fields to restrict what data is returned (saves money)
    autocomplete.setFields(["address_components", "formatted_address", "geometry", "name", "place_id"]);
  };

  const onPlaceChanged = () => {
    if (autocompleteRef.current !== null) {
      const place = autocompleteRef.current.getPlace();
      
      // If we don't have enough info, try to use what we have or return
      if (!place.geometry) return;

      const addressComponents = place.address_components || [];
      const getComponent = (type: string) => 
        addressComponents.find(c => c.types.includes(type))?.long_name || "";

      // For establishments, use the name if it's not already in the address
      const name = place.name || "";
      const formattedAddress = place.formatted_address || "";
      
      const fullDisplay = formattedAddress.includes(name) 
        ? formattedAddress 
        : (name ? `${name}, ${formattedAddress}` : formattedAddress);

      const newAddress: Address = {
        id: place.place_id || Math.random().toString(36).substr(2, 9),
        fullAddress: fullDisplay,
        addressLine1: getComponent("street_number") ? `${getComponent("street_number")} ${getComponent("route")}` : getComponent("route"),
        city: getComponent("locality") || getComponent("postal_town"),
        province: getComponent("administrative_area_level_1") || getComponent("administrative_area_level_2"),
        postalCode: getComponent("postal_code"),
        country: getComponent("country"),
        latitude: place.geometry.location?.lat(),
        longitude: place.geometry.location?.lng(),
      };

      setInputValue(fullDisplay);
      setSelectedAddress(newAddress);
      onChange(newAddress);
    }
  };

  if (loadError) {
    return <Input disabled placeholder="Error loading Maps" value={inputValue} className={className} />;
  }

  if (!isLoaded) {
    return (
      <div className="relative">
        <Input disabled placeholder="Loading suggestions..." value={inputValue} className={className} />
        <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="relative w-full space-y-3">
      <Autocomplete
        onLoad={onLoad}
        onPlaceChanged={onPlaceChanged}
        options={{
            // Allow both addresses and establishments (places like schools/stadiums)
            types: [] 
        }}
      >
        <div className="relative">
            <Input
                id={id}
                type="text"
                placeholder={placeholder || "Start typing address..."}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                className={`pr-10 ${className}`}
            />
            <MapPin className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground opacity-50" />
        </div>
      </Autocomplete>

      {selectedAddress && (
        <div className="animate-in fade-in slide-in-from-top-1 duration-300 p-3 bg-muted/40 rounded-lg border border-border/50 text-xs text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-2">
            <div className="col-span-2 space-y-1 pb-1 border-b border-border/30">
                <p className="font-bold uppercase tracking-tighter opacity-50">Street Address</p>
                <p className="text-foreground font-medium text-sm">{selectedAddress.addressLine1 || selectedAddress.fullAddress.split(',')[0] || "--"}</p>
            </div>
            <div className="space-y-1 pt-1">
                <p className="font-bold uppercase tracking-tighter opacity-50">City</p>
                <p className="text-foreground font-medium">{selectedAddress.city || "--"}</p>
            </div>
            <div className="space-y-1 pt-1">
                <p className="font-bold uppercase tracking-tighter opacity-50">Province</p>
                <p className="text-foreground font-medium">{selectedAddress.province || "--"}</p>
            </div>
            <div className="space-y-1">
                <p className="font-bold uppercase tracking-tighter opacity-50">Postal Code</p>
                <p className="text-foreground font-medium">{selectedAddress.postalCode || "--"}</p>
            </div>
            <div className="space-y-1">
                <p className="font-bold uppercase tracking-tighter opacity-50">Country</p>
                <p className="text-foreground font-medium">{selectedAddress.country || "--"}</p>
            </div>
            <div className="col-span-2 pt-1 border-t border-border/30 mt-1 flex items-center gap-1 opacity-70 italic">
                <MapPin className="h-3 w-3" />
                <span>Coordinates: {selectedAddress.latitude?.toFixed(4)}, {selectedAddress.longitude?.toFixed(4)}</span>
            </div>
        </div>
      )}
    </div>
  );
}
