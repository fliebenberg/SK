"use client";

import React, { useState, useCallback, useId } from 'react';
import Cropper, { Point, Area } from 'react-easy-crop';
import getCroppedImg from '@/lib/cropImage';
import { MetalButton } from '@/components/ui/MetalButton';
import { Slider } from '@/components/ui/slider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Upload, X, Check, Image as ImageIcon, Pencil } from 'lucide-react';

import { useThemeColors } from '@/hooks/useThemeColors';

interface ImageUploadProps {
  onChange: (base64: string) => void;
  value?: string;
  className?: string;
  minimal?: boolean;
  placeholderPrimary?: string;
  placeholderSecondary?: string;
  initials?: string;
}

export function ImageUpload({ 
  onChange, 
  value, 
  className, 
  minimal = false,
  placeholderPrimary,
  placeholderSecondary,
  initials
}: ImageUploadProps) {
  const { isDark, metalVariant, primaryColor } = useThemeColors();
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(value || null);
  const uniqueId = useId();

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const imageDataUrl = await readFile(file);
      setImageSrc(imageDataUrl);
      setIsDialogOpen(true);
    }
  };

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

  return (
    <div className={className}>
      <div className={minimal ? "w-full h-full" : "flex items-center gap-4"}>
        <div className={`relative group ${minimal ? "w-full h-full cursor-pointer" : ""}`}>
          <label htmlFor={uniqueId} className={`block w-full h-full ${minimal ? "cursor-pointer" : ""}`}>
            <div 
              className={`${minimal ? "w-full h-full" : "w-24 h-24"} rounded-md overflow-hidden border-2 border-border flex items-center justify-center transition-opacity hover:opacity-80`}
              style={{ 
                backgroundColor: !preview && placeholderPrimary ? placeholderPrimary : (preview ? 'transparent' : 'var(--muted)'),
                color: !preview && placeholderSecondary ? placeholderSecondary : 'var(--muted-foreground)'
              }}
            >
                {preview ? (
                <img src={preview} alt="Profile preview" className="w-full h-full object-cover" />
                ) : (
                  initials ? (
                    <span className="font-bold select-none text-2xl" style={{ fontSize: minimal ? '2.5rem' : '1.5rem' }}>{initials}</span>
                  ) : (
                    <ImageIcon className={`${minimal ? "w-1/2 h-1/2" : "w-8 h-8"}`} style={{ opacity: placeholderSecondary ? 0.8 : 0.5 }} />
                  )
                )}
                
                {minimal && (
                  <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                    <div className="bg-background/80 text-foreground text-xs font-semibold px-2 py-1 rounded shadow-sm flex items-center gap-1.5">
                       <Pencil className="w-3 h-3" />
                       Edit
                    </div>
                  </div>
                )}
            </div>
          </label>
          
          {preview && !minimal && (
            <button
              type="button"
              onClick={handleRemoveImage}
              className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-1 shadow-md hover:bg-destructive/90 transition-colors"
              aria-label="Remove image"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {!minimal && (
            <div className="flex-1">
            <input
                type="file"
                accept="image/*"
                onChange={onFileChange}
                className="hidden"
                id={uniqueId}
            />
            <label htmlFor={uniqueId}>
                <div className="inline-flex items-center justify-center rounded-xl font-bold tracking-wider px-4 py-2 transition-all duration-100 cursor-pointer border border-input bg-background hover:bg-accent hover:text-accent-foreground">
                <Upload className="w-4 h-4 mr-2" />
                Upload Image
                </div>
            </label>
            <p className="text-xs text-muted-foreground mt-2">
                Recommended: Square image, max 5MB
            </p>
            </div>
        )}
        
        {minimal && (
             <input
                type="file"
                accept="image/*"
                onChange={onFileChange}
                className="hidden"
                id={uniqueId}
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
              min={1}
              max={3}
              step={0.1}
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
            >
              <Check className="w-4 h-4 mr-2" />
              Apply
            </MetalButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
