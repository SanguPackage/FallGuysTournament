/** A rectangle in fractions of the frame, so a capture at another resolution still lands. */
export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Size {
  width: number;
  height: number;
}

export function toPixels(region: Region, size: Size): Box {
  return {
    x: Math.round(region.x * size.width),
    y: Math.round(region.y * size.height),
    w: Math.round(region.w * size.width),
    h: Math.round(region.h * size.height),
  };
}
