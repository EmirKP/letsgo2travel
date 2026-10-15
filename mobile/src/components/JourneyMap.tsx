import { isIOSNative } from '../lib/capacitor';
import { AppleJourneyMap } from './AppleJourneyMap';
import { NativeJourneyMap } from './NativeJourneyMap';
import type { JourneyMapProps } from './journeyMapTypes';

export type { JourneyMapPoint, JourneyMapStop, JourneyMapRoute, JourneyMapViewport, JourneyMapLabels, JourneyMapProps } from './journeyMapTypes';

/** iPhone uses the built-in MapKit view; browser/Android use Apple's web SDK. */
export function JourneyMap(props: JourneyMapProps) {
  return isIOSNative() ? <NativeJourneyMap {...props}/> : <AppleJourneyMap {...props}/>;
}
