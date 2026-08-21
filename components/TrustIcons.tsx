// components/TrustIcons.tsx
// Stroke-based icon set for trust-verdict UI, replacing unicode glyphs
// (✓ ✗ 🔍 ⚠ 📋 🚩 ○) with real SVG so they render consistently across
// platforms/fonts and can inherit color via currentColor.

export type TrustIconName =
  | "check"
  | "x"
  | "search"
  | "clock"
  | "alert"
  | "flag"
  | "clipboard"
  | "circle";

type IconProps = {
  className?: string;
  size?: number;
};

function Svg({
  size = 13,
  className,
  children,
}: IconProps & { children: React.ReactNode }) {
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

function CheckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M4 12.5L9.5 18L20 6"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function XIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M18 6L6 18M6 6L18 18"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </Svg>
  );
}

function SearchIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2.2" />
      <path
        d="M21 21L16.5 16.5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </Svg>
  );
}

function ClockIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 7V12L15 14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function AlertIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M12 9V13M12 17H12.01"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M10.29 3.86L1.82 18A2 2 0 0 0 3.55 21H20.45A2 2 0 0 0 22.18 18L13.71 3.86A2 2 0 0 0 10.29 3.86Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function FlagIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M5 3V21"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M5 4H17.5C18.4 4 18.85 5.09 18.2 5.72L15 9L18.2 12.28C18.85 12.91 18.4 14 17.5 14H5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function ClipboardIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect
        x="5"
        y="4"
        width="14"
        height="17"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M9 3.5H15V6H9V3.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M9 12H15M9 16H13"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </Svg>
  );
}

function CircleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
    </Svg>
  );
}

const ICONS: Record<TrustIconName, (props: IconProps) => React.ReactElement> = {
  check: CheckIcon,
  x: XIcon,
  search: SearchIcon,
  clock: ClockIcon,
  alert: AlertIcon,
  flag: FlagIcon,
  clipboard: ClipboardIcon,
  circle: CircleIcon,
};

export default function TrustIcon({
  name,
  ...props
}: IconProps & { name: TrustIconName }) {
  const Icon = ICONS[name];
  return <Icon {...props} />;
}
