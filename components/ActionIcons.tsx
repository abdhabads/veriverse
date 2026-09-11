// components/ActionIcons.tsx
// Thin compatibility re-export - the real implementation now lives in
// components/Icons.tsx (unified with TrustIcons.tsx, which previously
// duplicated this file's Svg wrapper and its "flag" icon path verbatim).
// Kept so existing `import ActionIcon from "@/components/ActionIcons"`
// call sites don't need to change.
export { ActionIcon as default, type ActionIconName } from "@/components/Icons";
