// components/TrustIcons.tsx
// Thin compatibility re-export - the real implementation now lives in
// components/Icons.tsx (unified with ActionIcons.tsx, which previously
// duplicated this file's Svg wrapper and its "flag" icon path verbatim).
// Kept so existing `import TrustIcon from "@/components/TrustIcons"` call
// sites don't need to change.
export { TrustIcon as default, type TrustIconName } from "@/components/Icons";
