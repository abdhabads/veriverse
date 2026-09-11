// components/Icons.tsx
// Unified icon foundation. Previously ActionIcons.tsx and TrustIcons.tsx
// each defined their own identical `Svg` wrapper (24x24 viewBox,
// aria-hidden, stroke-based, currentColor) and duplicated the "flag" icon
// path verbatim. This file is the single source of truth for both; the
// two original files now re-export from here unchanged, so every existing
// `import ActionIcon from "@/components/ActionIcons"` /
// `import TrustIcon from "@/components/TrustIcons"` keeps working with no
// call-site edits and no visual change to any icon.
import type { ReactElement } from "react";

type IconProps = {
  className?: string;
  size?: number;
};

function Svg({
  size,
  className,
  children,
}: IconProps & { size: number; children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

// ---- Shared path (was duplicated verbatim in both original files) ----

function FlagIcon({ size = 14, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M5 3V21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M5 4H17.5C18.4 4 18.85 5.09 18.2 5.72L15 9L18.2 12.28C18.85 12.91 18.4 14 17.5 14H5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ---- Action icon set (post/user action buttons) - default size 14 ----

export type ActionIconName =
  | "thumbsUp"
  | "thumbsDown"
  | "repost"
  | "bookmark"
  | "bookmarkFilled"
  | "pencil"
  | "trash"
  | "userPlus"
  | "userCheck"
  | "mute"
  | "unmute"
  | "shieldOff"
  | "flag"
  | "chevronDown"
  | "arrowRight";

function ThumbsUpIcon({ size = 14, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path
        d="M7 22V10M2 13V19C2 20.66 3.34 22 5 22H17.42C18.49 22 19.41 21.24 19.61 20.19L21.34 11.19C21.6 9.83 20.56 8.58 19.18 8.58H14.5L15.17 4.86C15.34 3.9 14.98 2.93 14.22 2.31C13.16 1.44 11.61 1.65 10.81 2.77L7 8.15"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function ThumbsDownIcon({ size = 14, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path
        d="M17 2V14M22 11V5C22 3.34 20.66 2 19 2H6.58C5.51 2 4.59 2.76 4.39 3.81L2.66 12.81C2.4 14.17 3.44 15.42 4.82 15.42H9.5L8.83 19.14C8.66 20.1 9.02 21.07 9.78 21.69C10.84 22.56 12.39 22.35 13.19 21.23L17 15.85"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function RepostIcon({ size = 14, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M17 1L21 5L17 9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 11V9C3 6.79 4.79 5 7 5H21" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 23L3 19L7 15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 13V15C21 17.21 19.21 19 17 19H3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function BookmarkIcon({ size = 14, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M5 3C5 1.9 5.9 1 7 1H17C18.1 1 19 1.9 19 3V22L12 18L5 22V3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </Svg>
  );
}

function BookmarkFilledIcon({ size = 14, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M5 3C5 1.9 5.9 1 7 1H17C18.1 1 19 1.9 19 3V22L12 18L5 22V3Z" fill="currentColor" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </Svg>
  );
}

function PencilIcon({ size = 14, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M4 20H8L18.5 9.5C19.33 8.67 19.33 7.33 18.5 6.5C17.67 5.67 16.33 5.67 15.5 6.5L5 17V20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.5 8.5L16.5 11.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </Svg>
  );
}

function TrashIcon({ size = 14, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M4 7H20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M9 7V4.5C9 3.67 9.67 3 10.5 3H13.5C14.33 3 15 3.67 15 4.5V7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 7L6.75 19.5C6.8 20.5 7.63 21.3 8.63 21.3H15.37C16.37 21.3 17.2 20.5 17.25 19.5L18 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function UserPlusIcon({ size = 14, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <circle cx="9" cy="8" r="4" stroke="currentColor" strokeWidth="1.7" />
      <path d="M2 21C2 16.86 5.13 13.5 9 13.5C12.87 13.5 16 16.86 16 21" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M19 8V14M22 11H16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </Svg>
  );
}

function UserCheckIcon({ size = 14, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <circle cx="9" cy="8" r="4" stroke="currentColor" strokeWidth="1.7" />
      <path d="M2 21C2 16.86 5.13 13.5 9 13.5C12.87 13.5 16 16.86 16 21" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M16 12L18 14L22 9.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function MuteIcon({ size = 14, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M4 9V15H8L13 20V4L8 9H4Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M17 8L22 16M22 8L17 16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </Svg>
  );
}

function UnmuteIcon({ size = 14, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M4 9V15H8L13 20V4L8 9H4Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M17 8.5C18.24 9.74 18.24 14.26 17 15.5M19.5 6C22 8.5 22 15.5 19.5 18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </Svg>
  );
}

function ShieldOffIcon({ size = 14, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M12 2L4 6V12C4 17 7.6 21.4 12 22C16.4 21.4 20 17 20 12V6L12 2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 9L15 15M15 9L9 15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </Svg>
  );
}

function ChevronDownIcon({ size = 14, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function ArrowRightIcon({ size = 14, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M5 12H19M13 6L19 12L13 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const ACTION_ICONS: Record<ActionIconName, (props: IconProps) => ReactElement> = {
  thumbsUp: ThumbsUpIcon,
  thumbsDown: ThumbsDownIcon,
  repost: RepostIcon,
  bookmark: BookmarkIcon,
  bookmarkFilled: BookmarkFilledIcon,
  pencil: PencilIcon,
  trash: TrashIcon,
  userPlus: UserPlusIcon,
  userCheck: UserCheckIcon,
  mute: MuteIcon,
  unmute: UnmuteIcon,
  shieldOff: ShieldOffIcon,
  flag: FlagIcon,
  chevronDown: ChevronDownIcon,
  arrowRight: ArrowRightIcon,
};

export function ActionIcon({ name, ...props }: IconProps & { name: ActionIconName }) {
  const Icon = ACTION_ICONS[name];
  return <Icon {...props} />;
}

// ---- Trust/verdict icon set - default size 13 ----

export type TrustIconName = "check" | "x" | "search" | "clock" | "alert" | "flag" | "clipboard" | "circle";

function CheckIcon({ size = 13, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M4 12.5L9.5 18L20 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function XIcon({ size = 13, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </Svg>
  );
}

function SearchIcon({ size = 13, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2.2" />
      <path d="M21 21L16.5 16.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </Svg>
  );
}

function ClockIcon({ size = 13, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7V12L15 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function AlertIcon({ size = 13, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M12 9V13M12 17H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M10.29 3.86L1.82 18A2 2 0 0 0 3.55 21H20.45A2 2 0 0 0 22.18 18L13.71 3.86A2 2 0 0 0 10.29 3.86Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function ClipboardIcon({ size = 13, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <rect x="5" y="4" width="14" height="17" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9 3.5H15V6H9V3.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M9 12H15M9 16H13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </Svg>
  );
}

function CircleIcon({ size = 13, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
    </Svg>
  );
}

function TrustFlagIcon({ size = 13, ...rest }: IconProps) {
  return <FlagIcon size={size} {...rest} />;
}

const TRUST_ICONS: Record<TrustIconName, (props: IconProps) => ReactElement> = {
  check: CheckIcon,
  x: XIcon,
  search: SearchIcon,
  clock: ClockIcon,
  alert: AlertIcon,
  flag: TrustFlagIcon,
  clipboard: ClipboardIcon,
  circle: CircleIcon,
};

export function TrustIcon({ name, ...props }: IconProps & { name: TrustIconName }) {
  const Icon = TRUST_ICONS[name];
  return <Icon {...props} />;
}

// ---- Shell/nav icon set (P2.2) - default size 18 ----

export type ShellIconName = "home" | "search" | "bell" | "mail" | "user" | "plus";

function HomeIcon({ size = 18, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M4 11L12 4L20 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 9.5V19C6 19.55 6.45 20 7 20H17C17.55 20 18 19.55 18 19V9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 20V14H14V20" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </Svg>
  );
}

function ShellSearchIcon({ size = 18, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path d="M21 21L16.5 16.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  );
}

function BellIcon({ size = 18, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M6 10C6 6.69 8.69 4 12 4C15.31 4 18 6.69 18 10V14L20 17H4L6 14V10Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M9.5 20C9.8 20.85 10.83 21.5 12 21.5C13.17 21.5 14.2 20.85 14.5 20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </Svg>
  );
}

function MailIcon({ size = 18, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M4 6.5L12 13L20 6.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function UserIcon({ size = 18, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.7" />
      <path d="M4 21C4 16.86 7.58 13.5 12 13.5C16.42 13.5 20 16.86 20 21" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </Svg>
  );
}

function PlusIcon({ size = 18, ...rest }: IconProps) {
  return (
    <Svg size={size} {...rest}>
      <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

const SHELL_ICONS: Record<ShellIconName, (props: IconProps) => ReactElement> = {
  home: HomeIcon,
  search: ShellSearchIcon,
  bell: BellIcon,
  mail: MailIcon,
  user: UserIcon,
  plus: PlusIcon,
};

export function ShellIcon({ name, ...props }: IconProps & { name: ShellIconName }) {
  const Icon = SHELL_ICONS[name];
  return <Icon {...props} />;
}
