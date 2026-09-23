import Image from "next/image";

import { cn } from "@/lib/utils/cn";

const LOGOS = {
  // Full "SBC + SHOSHA BEAUTY COMPANY" logo: login and large placements.
  full: { src: "/brand/logo-full-dark.png", width: 1028, height: 523 },
  // "SBC" letters only: sidebar and mobile header.
  mono: { src: "/brand/logo-mono-dark.png", width: 511, height: 218 },
} as const;

export const COMPANY_NAME = "Shosha Beauty Company";

// width sets the rendered width in px; height follows the file's aspect ratio.
export function Logo({
  variant = "full",
  width,
  priority = false,
  className,
}: {
  variant?: keyof typeof LOGOS;
  width: number;
  priority?: boolean;
  className?: string;
}) {
  const logo = LOGOS[variant];
  const height = Math.round((width * logo.height) / logo.width);
  return (
    <Image
      src={logo.src}
      width={width}
      height={height}
      alt={COMPANY_NAME}
      priority={priority}
      className={cn("h-auto", className)}
    />
  );
}
