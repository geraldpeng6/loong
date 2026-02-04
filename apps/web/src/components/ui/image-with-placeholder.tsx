import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

export type ImageWithPlaceholderProps = {
  src: string;
  alt: string;
  className?: string;
  imageClassName?: string;
  previewSrc?: string | null;
  loading?: "lazy" | "eager";
};

const ImageWithPlaceholder = ({
  src,
  alt,
  className,
  imageClassName,
  previewSrc,
  loading = "lazy",
}: ImageWithPlaceholderProps) => {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setErrored(false);
  }, [src]);

  const showPlaceholder = !loaded && !errored;

  return (
    <div className={cn("relative overflow-hidden bg-muted", className)}>
      {previewSrc && showPlaceholder ? (
        <img
          src={previewSrc}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full scale-105 object-cover blur-md"
        />
      ) : null}
      {showPlaceholder ? <div className="absolute inset-0 animate-pulse bg-muted/80" /> : null}
      {errored ? (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
          unavailable
        </div>
      ) : null}
      <img
        src={src}
        alt={alt}
        loading={loading}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setErrored(true)}
        className={cn(
          "h-full w-full object-cover transition-opacity duration-300",
          showPlaceholder && "opacity-0",
          imageClassName,
        )}
      />
    </div>
  );
};

export default ImageWithPlaceholder;
