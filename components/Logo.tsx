// components/Logo.tsx
// Shared brand mark: a coral-gradient badge with a checkmark, used
// wherever the VeriVerse wordmark appears (navbar, auth screens).

type Props = {
  size?: number;
};

export default function Logo({ size = 30 }: Props) {
  return (
    <div
      style={{ width: size, height: size, borderRadius: size * 0.3 }}
      className="flex shrink-0 items-center justify-center bg-gradient-to-br from-veriverse-purple to-[#f48b5d]"
    >
      <svg
        width={size * 0.55}
        height={size * 0.55}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M4 12.5L9.5 18L20 6"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
