export type ExplorerLevel = 'Yeni Kaşif' | 'Belgeli Gezgin' | 'Deneyimli Gezgin' | 'Kıdemli Kaşif' | 'Efsane Kaşif';

export function calculateLevel(points: number): ExplorerLevel {
  if (points >= 3000) return 'Efsane Kaşif';
  if (points >= 1500) return 'Kıdemli Kaşif';
  if (points >= 700) return 'Deneyimli Gezgin';
  if (points >= 200) return 'Belgeli Gezgin';
  return 'Yeni Kaşif';
}
