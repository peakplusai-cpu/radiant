import Image from "next/image";

export function ProductImage({
  src,
  hex,
  alt,
  className,
  sizes = "(max-width: 768px) 50vw, 320px",
  priority = false,
}: {
  src?: string;
  hex?: string;
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  if (src) {
    return <Image src={src} alt={alt} fill sizes={sizes} className={className} priority={priority} />;
  }
  return (
    <div
      className="placeholder"
      style={hex ? { background: `color-mix(in srgb, ${hex} 14%, #fff)` } : undefined}
      role="img"
      aria-label={alt}
    >
      <span>R</span>
    </div>
  );
}
