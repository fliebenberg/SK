"use client";

import React, { useState, useCallback, useEffect } from "react";
import { GoogleMap, useJsApiLoader, Marker } from "@react-google-maps/api";
import { Loader2, Map as MapIcon, Layers, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "./button";

const containerStyle = {
  width: "100%",
  height: "100%",
};

const libraries: "places"[] = ["places"];

interface LocationPickerProps {
  latitude?: number;
  longitude?: number;
  defaultCenter?: { lat: number; lng: number };
  onChange: (lat: number, lng: number) => void;
  className?: string;
}

export function LocationPicker({
  latitude,
  longitude,
  defaultCenter,
  onChange,
  className,
}: LocationPickerProps) {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
    libraries,
  });

  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [mapType, setMapType] = useState<"roadmap" | "hybrid">("hybrid");
  const [zoomLevel, setZoomLevel] = useState(18);

  const center = (latitude != null && longitude != null)
    ? { lat: latitude, lng: longitude } 
    : (defaultCenter || { lat: 0, lng: 0 });

  // Pan to center when latitude/longitude changes
  useEffect(() => {
    if (map && latitude != null && longitude != null) {
      map.panTo({ lat: latitude, lng: longitude });
    }
  }, [map, latitude, longitude]);

  const onMapClick = useCallback((e: google.maps.MapMouseEvent) => {
    if (e.latLng) {
      onChange(e.latLng.lat(), e.latLng.lng());
    }
  }, [onChange]);

  const onMapLoad = useCallback((map: google.maps.Map) => {
    setMap(map);
  }, []);

  const onMapUnmount = useCallback(() => {
    setMap(null);
  }, []);

  if (loadError) {
    return (
      <div className={`flex items-center justify-center bg-destructive/10 rounded-lg border border-destructive/20 p-8 text-destructive ${className}`}>
        <p className="text-sm font-medium">Error loading Google Maps</p>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className={`flex flex-col items-center justify-center bg-muted/30 rounded-lg border border-dashed border-border p-8 text-muted-foreground ${className}`}>
        <Loader2 className="h-8 w-8 mb-2 animate-spin opacity-20" />
        <p className="text-sm font-medium">Loading Map...</p>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="relative aspect-video w-full rounded-xl overflow-hidden border border-border shadow-sm bg-muted/20">
        <GoogleMap
          mapContainerStyle={containerStyle}
          center={center}
          zoom={zoomLevel}
          onLoad={onMapLoad}
          onUnmount={onMapUnmount}
          onClick={onMapClick}
          options={{
            mapTypeId: mapType,
            disableDefaultUI: true,
            gestureHandling: "greedy",
          }}
        >
          {latitude != null && longitude != null && (
            <Marker position={{ lat: latitude, lng: longitude }} />
          )}
        </GoogleMap>

        {/* Map Controls Overlay */}
        <div className="absolute top-3 right-3 flex flex-col gap-2">
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="h-9 w-9 shadow-lg bg-background/90 backdrop-blur hover:bg-background"
            onClick={() => setMapType(mapType === "roadmap" ? "hybrid" : "roadmap")}
            title={mapType === "roadmap" ? "Switch to Satellite" : "Switch to Map"}
          >
            <Layers className={`h-4 w-4 ${mapType === "hybrid" ? "text-primary" : ""}`} />
          </Button>
          
          <div className="flex flex-col rounded-md shadow-lg bg-background/90 backdrop-blur overflow-hidden">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-none border-b border-border/50 hover:bg-accent"
              onClick={() => setZoomLevel(prev => Math.min(prev + 1, 21))}
              title="Zoom In"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-none hover:bg-accent"
              onClick={() => setZoomLevel(prev => Math.max(prev - 1, 1))}
              title="Zoom Out"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="absolute bottom-3 left-3">
          <div className="bg-background/90 backdrop-blur px-3 py-1.5 rounded-full shadow-lg border border-border/50 text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <MapIcon className="w-3 h-3" />
            Click map to set location
          </div>
        </div>
      </div>
      
      {latitude != null && longitude != null && (
        <div className="flex items-center gap-2 px-1">
          <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">
            Coordinates Set: {latitude.toFixed(6)}, {longitude.toFixed(6)}
          </p>
        </div>
      )}
    </div>
  );
}
