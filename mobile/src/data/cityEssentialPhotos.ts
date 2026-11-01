import athenaeum from '../assets/city-essentials/otp-romanian-athenaeum.webp';
import villageMuseum from '../assets/city-essentials/otp-dimitrie-gusti-village-museum.webp';

// Venue photographs are opt-in: a city's hero is never used for a landmark.
// Rights, identity and derivative notes are recorded with the source assets.
const OTP_PHOTOS = {
  'romanian-athenaeum': {
    photo: athenaeum,
    photoCredit: {
      title: 'Romanian Atheneum, Bucharest', author: 'Alex Siro',
      source: 'https://commons.wikimedia.org/wiki/File:Romanian_Atheneum,_Bucharest.jpg',
      license: 'CC BY-SA 3.0 RO', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/ro/deed.en',
    },
  },
  'dimitrie-gusti-village-museum': {
    photo: villageMuseum,
    photoCredit: {
      title: 'National Village Museum, house from Dumitra, Alba', author: 'Britchi V.I.Iulia',
      source: 'https://commons.wikimedia.org/wiki/File:Bucharest,_Romania._National_Village_Museum._House_from_Transilvania_(Comuna_Dumitra_Alba)_DSCN8711.jpg',
      license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    },
  },
} as const;

export function cityEssentialPhoto(cityCode: string, placeId: string) {
  if (cityCode !== 'OTP' || !Object.hasOwn(OTP_PHOTOS, placeId)) return undefined;
  const photo = OTP_PHOTOS[placeId as keyof typeof OTP_PHOTOS];
  return { photo: photo.photo, photoCredit: { ...photo.photoCredit } };
}
