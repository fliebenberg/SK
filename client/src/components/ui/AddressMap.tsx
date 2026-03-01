"use client";

import React, { useState, useEffect } from "react";
import { Address } from "@sk/types";
import { ExternalLink, Loader2, Map as MapIcon, Layers, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "./button";

interface AddressMapProps {
  address?: Address;
  className?: string;
  zoom?: number;
}

export function AddressMap({ address, className, zoom = 15 }: AddressMapProps) {
  const [mapType, setMapType] = useState<"roadmap" | "satellite">("satellite");
  const [zoomLevel, setZoomLevel] = useState(zoom);

  // Sync zoomLevel with prop if it changes
  useEffect(() => {
    setZoomLevel(zoom);
  }, [zoom]);

  if (!address || (!address.latitude && !address.longitude && !address.fullAddress)) {
    return (
      <div className={`flex flex-col items-center justify-center bg-muted/30 rounded-lg border border-dashed border-border p-8 text-muted-foreground ${className}`}>
        <MapIcon className="h-8 w-8 mb-2 opacity-20" />
        <p className="text-sm font-medium">No location to display</p>
        <p className="text-xs">Select an address to see it on the map.</p>
      </div>
    );
  }

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  
  // Preferred: latitude,longitude. Fallback: fullAddress
  const query = address.latitude && address.longitude 
    ? `${address.latitude},${address.longitude}`
    : encodeURIComponent(address.fullAddress);

  // Embed API URL (Unlimited Free for simple place displays)
  const embedUrl = `https://www.google.com/maps/embed/v1/place?key=${apiKey}&q=${query}&zoom=${zoomLevel}&maptype=${mapType}`;

  // Google Maps URL for external app (Free)
  const externalUrl = address.latitude && address.longitude
    ? `https://www.google.com/maps/search/?api=1&query=${address.latitude},${address.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.fullAddress)}`;

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="relative aspect-video w-full rounded-xl overflow-hidden border border-border shadow-sm bg-muted/20">
        <iframe
          key={`${zoomLevel}-${mapType}-${query}`} // Force reload on control change
          width="100%"
          height="100%"
          style={{ border: 0 }}
          loading="lazy"
          allowFullScreen
          referrerPolicy="no-referrer-when-downgrade"
          src={embedUrl}
          className={mapType === 'roadmap' ? "grayscale-[0.2]" : ""}
        ></iframe>

        {/* Map Controls Overlay */}
        <div className="absolute top-3 right-3 flex flex-col gap-2">
            <Button
                variant="secondary"
                size="icon"
                className="h-9 w-9 shadow-lg bg-background/90 backdrop-blur hover:bg-background"
                onClick={() => setMapType(mapType === "roadmap" ? "satellite" : "roadmap")}
                title={mapType === "roadmap" ? "Switch to Satellite" : "Switch to Map"}
            >
                <Layers className={`h-4 w-4 ${mapType === "satellite" ? "text-primary" : ""}`} />
            </Button>
            
            <div className="flex flex-col rounded-md shadow-lg bg-background/90 backdrop-blur overflow-hidden">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-none border-b border-border/50 hover:bg-accent"
                    onClick={() => setZoomLevel(prev => Math.min(prev + 1, 21))}
                    title="Zoom In"
                >
                    <ZoomIn className="h-4 w-4" />
                </Button>
                <Button
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
      </div>
      
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground truncate">
            Selected Location
          </p>
          <p className="text-sm font-medium text-foreground leading-snug" title={address.fullAddress}>
            {address.fullAddress}
          </p>
        </div>
        
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 h-9 px-3 gap-2 border-primary/20 hover:border-primary/50 hover:bg-primary/5 group"
          asChild
        >
          <a href={externalUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            <span className="hidden sm:inline">Open in Maps</span>
          </a>
        </Button>
      </div>
    </div>
  );
}
