"use client";

import React, { useState, useCallback, useId, useRef, useEffect } from 'react';
import Cropper, { Point, Area } from 'react-easy-crop';
import getCroppedImg from '@/lib/cropImage';
import { MetalButton } from '@/components/ui/MetalButton';
import { Slider } from '@/components/ui/slider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Upload, X, Check, Image as ImageIcon, Pencil } from 'lucide-react';
import { cn, getOrgInitialsFontSize } from '@/lib/utils';

import { useThemeColors } from '@/hooks/useThemeColors';
import { UserAvatar } from '@/components/UserAvatar';

interface ImageUploadProps {
  onChange: (base64: string) => void;
  value?: string;
  className?: string;
  minimal?: boolean;
  placeholderPrimary?: string;
  placeholderSecondary?: string;
  initials?: string;
  rounded?: "sm" | "md" | "lg" | "xl" | "full" | "none";
}

export function ImageUpload({ 
  onChange, 
  value, 
  className, 
  minimal = false,
  placeholderPrimary,
  placeholderSecondary,
  initials,
  rounded = "md"
}: ImageUploadProps) {
  const { isDark, metalVariant, primaryColor } = useThemeColors();
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(value || null);
  const uniqueId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync preview with value if it changes externally (e.g. session load)
  useEffect(() => {
    if (value !== undefined) {
      setPreview(value || null);
    }
  }, [value]);

  const roundedClasses = {
    none: "rounded-none",
    sm: "rounded-sm",
    md: "rounded-md",
    lg: "rounded-lg",
    xl: "rounded-xl",
    full: "rounded-full",
  };

  const onFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const imageDataUrl = await readFile(file);
      setImageSrc(imageDataUrl);
      setIsDialogOpen(true);
      // Reset input value to allow selecting same file again
      if (e.target) e.target.value = '';
    }
  }, []);

  const readFile = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.addEventListener('load', () => resolve(reader.result as string), false);
      reader.readAsDataURL(file);
    });
  };

  const onCropComplete = useCallback((croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const showCroppedImage = useCallback(async () => {
    if (imageSrc && croppedAreaPixels) {
      try {
        const croppedImage = await getCroppedImg(
          imageSrc,
          croppedAreaPixels
        );
        setPreview(croppedImage);
        onChange(croppedImage);
        setIsDialogOpen(false);
        // Reset state
        setImageSrc(null);
        setZoom(1);
      } catch (e) {
        console.error(e);
      }
    }
  }, [imageSrc, croppedAreaPixels, onChange]);

  const handleRemoveImage = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPreview(null);
    onChange('');
  };

  const handleTriggerClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    fileInputRef.current?.click();
  };

  return (
    <div className={className}>
      <div className={cn("flex flex-col gap-4 w-full", !minimal && "sm:flex-row sm:items-center")}>
        <div className={`relative group/image shrink-0 ${minimal ? "w-full aspect-square" : "w-32 h-32"}`}>
          <div 
            onClick={handleTriggerClick}
            className="block w-full h-full cursor-pointer rounded-inherit"
          >
            <div 
              className={cn(
                "w-full h-full overflow-hidden border-2 border-border flex items-center justify-center transition-opacity hover:opacity-80 shadow-md bg-muted/20",
                roundedClasses[rounded]
              )}
            >
                {preview ? (
                  <img src={preview} alt="Profile preview" className="w-full h-full object-cover" />
                ) : (
                  <UserAvatar 
                    name={initials} 
                    size={minimal ? "xl" : "2xl"} 
                    className="w-full h-full"
                    rounded={rounded}
                  />
                )}
                
                <div className={cn(
                  "absolute inset-0 bg-black/40 opacity-0 group-hover/image:opacity-100 transition-opacity duration-200 flex items-center justify-center",
                  roundedClasses[rounded]
                )}>
                  <div className="bg-background/80 text-foreground text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm flex items-center gap-1.5 border border-white/20">
                     <Pencil className="w-3.5 h-3.5" />
                     {preview ? 'Change' : 'Upload'}
                  </div>
                </div>
            </div>
          </div>
          
          {preview && !minimal && (
            <button
              type="button"
              onClick={handleRemoveImage}
              className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-1.5 shadow-md hover:bg-destructive/90 transition-colors z-10"
              aria-label="Remove image"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {!minimal && (
            <div className="flex-1 min-w-0">
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={onFileChange}
                className="hidden"
            />
            <div onClick={handleTriggerClick} className="cursor-pointer group flex flex-col gap-1 w-fit">
                <span className="text-sm font-bold uppercase tracking-wider text-muted-foreground group-hover:text-primary transition-colors">
                  Upload Profile Avatar
                </span>
                <p className="text-xs text-muted-foreground">
                  Recommended: Square image, max 5MB
                </p>
            </div>
            </div>
        )}
        
        {minimal && (
             <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={onFileChange}
                className="hidden"
            />
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Crop Image</DialogTitle>
            <DialogDescription className="sr-only">
              Adjust the crop area of your uploaded image.
            </DialogDescription>
          </DialogHeader>
          
          <div className="relative w-full h-64 bg-black/5 rounded-lg overflow-hidden mt-4">
            {imageSrc && (
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                minZoom={0.5}
                restrictPosition={false}
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
              />
            )}
          </div>

          <div className="py-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-muted-foreground">Zoom</span>
            </div>
            <Slider
              value={[zoom]}
              min={0.5}
              max={3}
              step={0.05}
              onValueChange={(value: number[]) => setZoom(value[0])}
              className="w-full"
            />
          </div>

          <DialogFooter>
            <MetalButton
              type="button"
              metalVariant={metalVariant}
              variantType="secondary"
              onClick={() => setIsDialogOpen(false)}
            >
              Cancel
            </MetalButton>
            <MetalButton
              type="button"
              metalVariant={metalVariant}
              variantType="filled"
              glowColor={primaryColor}
              onClick={showCroppedImage}
              icon={<Check className="w-4 h-4" />}
            >
              Apply
            </MetalButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
