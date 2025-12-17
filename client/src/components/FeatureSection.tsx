"use client";

import React, { useState } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight } from 'lucide-react';

interface Feature {
  title: string;
  description: string;
  imagePath: string;
}

interface FeatureSectionProps {
  title: string;
  description: string;
  features: Feature[];
  alignment?: 'left' | 'right';
  className?: string;
}

export function FeatureSection({ 
  title, 
  description, 
  features, 
  alignment = 'left',
  className 
}: FeatureSectionProps) {
  const [activeFeatureIndex, setActiveFeatureIndex] = useState(0);
  const [direction, setDirection] = useState(0); // -1 for up, 1 for down

  const handleFeatureClick = (index: number) => {
    if (index === activeFeatureIndex) return;
    setDirection(index > activeFeatureIndex ? 1 : -1);
    setActiveFeatureIndex(index);
  };

  const variants = {
    enter: (direction: number) => ({
      y: direction > 0 ? '100%' : '-100%',
      opacity: 0,
      scale: 0.95,
    }),
    center: {
      y: 0,
      opacity: 1,
      scale: 1,
    },
    exit: (direction: number) => ({
      y: direction > 0 ? '-100%' : '100%',
      opacity: 0,
      scale: 0.95,
    }),
  };

  return (
    <section className={cn("py-16 md:py-24 overflow-hidden", className)}>
      <div className="container mx-auto px-4 md:px-8">
        
        {/* Section Header */}
        <div className={cn("max-w-3xl mb-10", alignment === 'right' ? 'ml-auto text-right' : 'mr-auto text-left')}>
          <h2 
            className="text-3xl md:text-5xl font-bold mb-4 text-transparent bg-clip-text bg-gradient-to-b from-foreground to-muted-foreground"
            style={{ fontFamily: 'var(--font-orbitron)' }}
          >
            {title}
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            {description}
          </p>
        </div>

        <div className={cn(
          "flex flex-col gap-8 lg:gap-16",
          alignment === 'right' ? 'lg:flex-row-reverse' : 'lg:flex-row'
        )}>
          
          {/* Feature List */}
          <div className="flex-1 flex flex-col justify-center space-y-4">
            {features.map((feature, index) => (
              <div 
                key={index}
                className={cn(
                  "group cursor-pointer p-4 rounded-xl transition-all duration-300 border border-transparent",
                  activeFeatureIndex === index 
                    ? "bg-muted/50 border-primary/20 shadow-lg" 
                    : "hover:bg-muted/30 hover:border-border"
                )}
                onMouseEnter={() => handleFeatureClick(index)}
                onClick={() => handleFeatureClick(index)}
              >
                <h3 className={cn(
                  "text-lg font-bold mb-1 flex items-center gap-2 transition-colors",
                  activeFeatureIndex === index ? "text-primary" : "text-foreground group-hover:text-primary/80"
                )}>
                  {activeFeatureIndex === index && <ChevronRight className="w-4 h-4" />}
                  {feature.title}
                </h3>
                <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>

          {/* Feature Image Display */}
          <div className="flex-1 relative min-h-[300px] lg:min-h-[500px] rounded-2xl overflow-hidden bg-gradient-to-br from-muted/50 to-background border border-border/50 shadow-2xl">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10" />
            
            <AnimatePresence mode="popLayout" initial={false} custom={direction}>
              <motion.div
                key={activeFeatureIndex}
                custom={direction}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.4, ease: "easeInOut" }}
                className="absolute inset-0 p-6 md:p-10 flex items-center justify-center"
              >
                <div className="relative w-full h-full rounded-lg overflow-hidden shadow-2xl ring-1 ring-white/10">
                  <Image
                    src={features[activeFeatureIndex].imagePath}
                    alt={features[activeFeatureIndex].title}
                    fill
                    className="object-cover"
                    priority
                  />
                  {/* Overlay Gradient for depth */}
                  <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

        </div>
      </div>
    </section>
  );
}
