type Props = {
  size?: number;
  dark?: boolean;
};

export default function Logo({ size = 30, dark = false }: Props) {
  const stroke = dark ? "#F5EEE2" : "#0D1B2A";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
      className="shrink-0 -mr-1"
    >
      <rect width="100" height="100" rx="22" fill="#E8623F" />
      <path d="M 26 46 L 40 62" stroke={stroke} strokeWidth="9.5" strokeLinecap="round" fill="none" />
      <path d="M 40 62 L 76 30" stroke="#0D1B2A" strokeWidth="9.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}
