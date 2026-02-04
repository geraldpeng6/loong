import { useState } from "react";
import { Play } from "lucide-react";

import ImageLightbox from "@/components/chat/ImageLightbox";
import ImageWithPlaceholder from "@/components/ui/image-with-placeholder";
import { cn } from "@/lib/utils";
import type { AttachmentItem } from "@/components/chat/messageUtils";

export type MediaGridProps = {
  attachments: AttachmentItem[];
  className?: string;
};

const MediaGrid = ({ attachments, className }: MediaGridProps) => {
  const items = attachments.filter((item) => item.kind === "image" || item.kind === "video");
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);

  if (items.length === 0) return null;

  return (
    <>
      <div
        className={cn(
          "grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-0 overflow-hidden rounded-xl border bg-background",
          className,
        )}
      >
        {items.map((attachment, index) => {
          const dataUrl = attachment.data
            ? `data:${attachment.mimeType};base64,${attachment.data}`
            : null;
          const previewUrl = attachment.preview
            ? `data:image/png;base64,${attachment.preview}`
            : null;
          const displayUrl = attachment.url || dataUrl || previewUrl || "";
          const isVideo = attachment.kind === "video";

          return (
            <button
              key={`${attachment.fileName}-${index}`}
              type="button"
              className={cn(
                "group relative aspect-square w-full overflow-hidden border border-border/40",
                !displayUrl && "cursor-not-allowed opacity-60",
              )}
              onClick={() => {
                if (!displayUrl) return;
                if (isVideo) {
                  window.open(displayUrl, "_blank");
                  return;
                }
                setLightbox({ src: displayUrl, alt: attachment.fileName });
              }}
            >
              {displayUrl ? (
                isVideo ? (
                  <video
                    src={displayUrl}
                    muted
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <ImageWithPlaceholder
                    src={displayUrl}
                    alt={attachment.fileName}
                    previewSrc={previewUrl}
                    className="h-full w-full"
                    imageClassName="object-cover"
                  />
                )
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                  unavailable
                </div>
              )}
              {isVideo ? (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20 opacity-100">
                  <span className="rounded-full bg-black/60 p-2 text-white">
                    <Play size={18} />
                  </span>
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
      <ImageLightbox
        open={!!lightbox}
        onOpenChange={(open) => {
          if (!open) setLightbox(null);
        }}
        src={lightbox?.src || null}
        alt={lightbox?.alt}
      />
    </>
  );
};

export default MediaGrid;
