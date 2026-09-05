export type MapTransform = {scale:number;x:number;y:number};
export const MAP_MAX_SCALE = 20;
export function mapPixelsPerUnit(width: number,height: number) {
  return Math.max(.001,Math.min(width/800,height/400));
}
export function boundedMapTransform(next: MapTransform,width: number,height: number): MapTransform {
  const scale = Math.max(1,Math.min(MAP_MAX_SCALE,next.scale));
  const unit = mapPixelsPerUnit(width,height);
  const maxX = Math.max(0,(800*unit*scale-width)/2);
  const maxY = Math.max(0,(400*unit*scale-height)/2);
  return {scale,x:Math.max(-maxX,Math.min(maxX,next.x)),y:Math.max(-maxY,Math.min(maxY,next.y))};
}
