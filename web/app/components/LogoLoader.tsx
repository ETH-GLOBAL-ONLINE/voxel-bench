// The logo, as the thing to look at while something slow is on its way:
// reading the chains for a backpack or the marketplace, or a craft that takes
// the best part of a minute. It floats and its glow breathes; with reduced
// motion asked for, it holds still.

import Image from "next/image";

export default function LogoLoader({
  label,
  size = 56,
  inline = false,
}: {
  label?: string;
  size?: number;
  /** Small, beside a line of text, instead of a block of its own. */
  inline?: boolean;
}) {
  if (inline) {
    return (
      <Image
        src="/logo/voxel-bench-logo.png"
        alt=""
        width={20}
        height={20}
        className="logo-loader inline-block h-5 w-5 shrink-0"
      />
    );
  }

  return (
    <div role="status" className="flex flex-col items-center gap-3 py-8">
      <Image
        src="/logo/voxel-bench-logo.png"
        alt=""
        width={size}
        height={size}
        className="logo-loader"
        style={{ width: size, height: size }}
      />
      {label && <p className="label !text-sap">{label}</p>}
    </div>
  );
}
