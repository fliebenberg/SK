/**
 * A round map marker as an SVG data URL, for the web map, which cannot draw an Ionicons glyph
 * inside a Google marker. Hand-drawn stand-ins for the icons a facility can have
 * ([facilityMarker.ts](file:///c:/Fred/Coding/SK/expo-app/components/address/facilityMarker.ts));
 * anything else is a dot.
 */
export function markerSvgUrl(iconName: string, color: string, isDark: boolean): string {
  const bgColor = isDark ? '#1E293B' : '#FFFFFF';
  let innerSvg: string;
  switch (iconName) {
    case 'american-football':
      innerSvg = `<ellipse cx="16" cy="16" rx="8" ry="4.5" fill="none" stroke="${color}" stroke-width="1.8" transform="rotate(-45 16 16)"/><line x1="11" y1="21" x2="21" y2="11" stroke="${color}" stroke-width="1.5"/><line x1="13" y1="15" x2="17" y2="19" stroke="${color}" stroke-width="1"/><line x1="15" y1="13" x2="19" y2="17" stroke="${color}" stroke-width="1"/>`;
      break;
    case 'football':
      innerSvg = `<circle cx="16" cy="16" r="7" fill="none" stroke="${color}" stroke-width="1.8"/><path d="M16 9v14M9 16h14M11.5 11.5l9 9m0-9l-9 9" stroke="${color}" stroke-width="1" opacity="0.6"/>`;
      break;
    case 'tennisball':
    case 'tennisball-outline':
      innerSvg = `<circle cx="16" cy="16" r="7" fill="none" stroke="${color}" stroke-width="1.8"/><path d="M11.5 11.5a7 7 0 0 1 9 9M20.5 11.5a7 7 0 0 0-9 9" fill="none" stroke="${color}" stroke-width="1" opacity="0.8"/>`;
      break;
    case 'golf':
      innerSvg = `<path d="M13 8v16m0-16l8 4-8 4" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`;
      break;
    case 'baseball':
      innerSvg = `<line x1="10" y1="22" x2="20" y2="12" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/><circle cx="21" cy="11" r="2.5" fill="none" stroke="${color}" stroke-width="1.5"/>`;
      break;
    case 'trophy-outline':
    case 'ribbon-outline':
      innerSvg = `<path d="M11 9h10v5c0 2.5-2 4.5-4.5 4.5h-1C13 18.5 11 16.5 11 14V9zm2.5 9.5V22h-2v1h9v-1h-2v-3.5" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`;
      break;
    case 'home-outline':
      innerSvg = `<path d="M10 21v-7h12v7M8 12.5L16 6l8 6.5" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`;
      break;
    case 'cart-outline':
      innerSvg = `<path d="M9 10h14l-1.5 8h-10L9 10zm0 0L7.5 7H5" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="11" cy="21" r="1.5" fill="${color}"/><circle cx="20" cy="21" r="1.5" fill="${color}"/>`;
      break;
    case 'business-outline':
      innerSvg = `<path d="M9 22V8h14v14" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="11" x2="14" y2="11" stroke="${color}" stroke-width="1.5"/><line x1="12" y1="15" x2="14" y2="15" stroke="${color}" stroke-width="1.5"/><line x1="18" y1="11" x2="20" y2="11" stroke="${color}" stroke-width="1.5"/><line x1="18" y1="15" x2="20" y2="15" stroke="${color}" stroke-width="1.5"/>`;
      break;
    case 'car-outline':
      innerSvg = `<text x="16" y="16.5" font-family="system-ui, -apple-system, sans-serif" font-weight="bold" font-size="12" fill="${color}" dominant-baseline="middle" text-anchor="middle">P</text>`;
      break;
    case 'water-outline':
      innerSvg = `<text x="16" y="16.5" font-family="system-ui, -apple-system, sans-serif" font-weight="bold" font-size="9" fill="${color}" dominant-baseline="middle" text-anchor="middle">WC</text>`;
      break;
    default:
      innerSvg = `<circle cx="16" cy="16" r="3.5" fill="${color}"/>`;
      break;
  }
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="13" fill="${bgColor}" stroke="${color}" stroke-width="2" />
      ${innerSvg}
    </svg>
  `).trim()}`;
}
