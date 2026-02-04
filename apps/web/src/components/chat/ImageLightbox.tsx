import * as DialogPrimitive from "@radix-ui/react-dialog";

import { Dialog, DialogOverlay, DialogPortal } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type ImageLightboxProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  src: string | null;
  alt?: string;
  className?: string;
};

const ImageLightbox = ({ open, onOpenChange, src, alt, className }: ImageLightboxProps) => {
  if (!src) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="bg-black/70" />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 flex max-h-[95vh] max-w-[95vw] -translate-x-1/2 -translate-y-1/2 items-center justify-center focus:outline-none",
            className,
          )}
        >
          <img
            src={src}
            alt={alt || "preview"}
            className="max-h-[95vh] max-w-[95vw] select-none object-contain"
          />
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
};

export default ImageLightbox;
