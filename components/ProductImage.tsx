export function ProductImage({
  src,
  hex,
  alt,
  className,
}: {
  src?: string;
  hex?: string;
  alt: string;
  className?: string;
}) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} className={className} loading="lazy" />;
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
