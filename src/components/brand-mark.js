/** The bicone mark from riften.ai — its own asset, black ground built in. */
export function BrandMark({ size = 22, className = "" }) {
  return (
    <img
      src="/riften-mark.png"
      alt=""
      width={size}
      height={size}
      className={`shrink-0 select-none ${className}`}
      draggable={false}
    />
  );
}
