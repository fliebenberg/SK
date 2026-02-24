---
name: MetalButton Icons
description: Enforces using the `icon` prop on `MetalButton` components instead of placing icons inside `children` or fragments.
---

# MetalButton Icon Prop Usage

When using the `MetalButton` component (`@/components/ui/MetalButton`), **always** pass icons via the `icon` prop rather than nesting them within the `children` or standard React fragments.

## Why?
The `MetalButton` component uses specific flexbox alignment that relies on the `icon` prop to keep the icon and text on a single line. This prevents inappropriate text wrapping that occurs when icons are passed as generic children.

## Correct Usage
```tsx
<MetalButton 
  icon={<PowerOff className="w-4 h-4" />}
  variantType="outlined"
>
  Deactivate Organization
</MetalButton>
```

## Incorrect Usage
```tsx
<MetalButton variantType="outlined">
  <><PowerOff className="w-4 h-4 mr-2" /> Deactivate Organization</>
</MetalButton>
```
