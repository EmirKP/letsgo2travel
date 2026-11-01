import type { AppLocale } from './locale';

export type SharedTripInvite = {
  code: string;
  tripId: string;
  expiresAt: number;
  clockOffset: number;
  lifetimeMs: number;
  monotonicStartedAt: number | null;
};

export function sharedInviteMonotonicNow(): number | null {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : null;
}

/** The server clock is authoritative, including on phones with a wrong clock. */
export function readSharedTripInvite(data: { inviteCode: string; expiresAt: string; serverNow: string }, tripId: string, receivedAt = Date.now(), monotonicStartedAt = sharedInviteMonotonicNow()): SharedTripInvite | null {
  const expiresAt = Date.parse(data.expiresAt);
  const serverNow = Date.parse(data.serverNow);
  const remaining = expiresAt - serverNow;
  if (!/^\d{6}$/.test(data.inviteCode) || !Number.isFinite(expiresAt) || !Number.isFinite(serverNow) || remaining <= 0 || remaining > 300_000) return null;
  return { code: data.inviteCode, tripId, expiresAt, clockOffset: serverNow - receivedAt, lifetimeMs: remaining, monotonicStartedAt };
}

export function sharedInviteSeconds(invite: SharedTripInvite | null, now = Date.now(), monotonicNow = sharedInviteMonotonicNow()): number {
  if (!invite) return 0;
  const remaining = invite.monotonicStartedAt !== null && monotonicNow !== null
    ? invite.lifetimeMs - Math.max(0, monotonicNow - invite.monotonicStartedAt)
    : invite.expiresAt - now - invite.clockOffset;
  return Math.max(0, Math.ceil(remaining / 1000));
}

export function sharedInviteCountdown(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

const messages = {
  join: ['Kodla katıl', 'Join with code', 'Bashkohu me kod', 'Alătură-te cu un cod'],
  codeLabel: ['6 haneli davet kodu', '6-digit invitation code', 'Kodi i ftesës me 6 shifra', 'Cod de invitație din 6 cifre'],
  codeHint: ['Arkadaşının kodunu yaz.', 'Enter your friend’s code.', 'Shkruaj kodin e mikut.', 'Introdu codul prietenului.'],
  inviteTitle: ['Davet kodun', 'Your invitation code', 'Kodi yt i ftesës', 'Codul tău de invitație'],
  invite: ['Arkadaş davet et', 'Invite friends', 'Fto miqtë', 'Invită prieteni'],
  copy: ['Kopyala', 'Copy', 'Kopjo', 'Copiază'],
  share: ['Paylaş', 'Share', 'Ndaj', 'Distribuie'],
  copied: ['Davet kodu kopyalandı.', 'Invitation code copied.', 'Kodi i ftesës u kopjua.', 'Codul invitației a fost copiat.'],
  copyFailed: ['Kod kopyalanamadı; basılı tutarak kopyalayabilirsin.', 'Could not copy the code. Press and hold it to copy.', 'Kodi nuk u kopjua. Mbaje shtypur për ta kopjuar.', 'Codul nu a fost copiat. Ține apăsat pentru a-l copia.'],
  shared: ['Davet paylaşılmaya hazır.', 'Invitation ready to share.', 'Ftesa është gati për t’u ndarë.', 'Invitația este gata de distribuit.'],
  shareFailed: ['Paylaşım tamamlanmadı. Kodu kopyalayabilirsin.', 'Sharing was not completed. You can copy the code.', 'Ndarja nuk u përfundua. Mund ta kopjosh kodin.', 'Distribuirea nu a fost finalizată. Poți copia codul.'],
  validFor: ['Geçerlilik', 'Valid for', 'I vlefshëm për', 'Valabil încă'],
  renews: ['Kod 5 dakikada bir yenilenir.', 'The code renews every 5 minutes.', 'Kodi rinovohet çdo 5 minuta.', 'Codul se reînnoiește la fiecare 5 minute.'],
  refreshing: ['Kod yenileniyor…', 'Renewing code…', 'Po rinovohet kodi…', 'Se reînnoiește codul…'],
  retry: ['Tekrar dene', 'Retry', 'Provo përsëri', 'Încearcă din nou'],
  inviteFailed: ['Davet kodu alınamadı. Yeniden dene.', 'Could not get the invitation code. Try again.', 'Kodi i ftesës nuk u mor. Provo përsëri.', 'Codul invitației nu a putut fi obținut. Încearcă din nou.'],
  expired: ['Bu davet artık geçerli değil. Arkadaşından yeni 6 haneli kod iste.', 'This invitation is no longer valid. Ask your friend for a new 6-digit code.', 'Kjo ftesë nuk është më e vlefshme. Kërko një kod të ri me 6 shifra nga miku.', 'Invitația nu mai este valabilă. Cere prietenului un cod nou din 6 cifre.'],
  rateLimited: ['Çok fazla kod denemesi yapıldı. Birkaç dakika sonra yeniden dene.', 'Too many code attempts. Try again in a few minutes.', 'U bënë shumë përpjekje me kod. Provo përsëri pas disa minutash.', 'Prea multe încercări de cod. Încearcă din nou peste câteva minute.'],
  joinFailed: ['Davet kabul edilemedi. Kodu kontrol edip yeniden dene.', 'The invitation could not be accepted. Check the code and try again.', 'Ftesa nuk u pranua. Kontrollo kodin dhe provo përsëri.', 'Invitația nu a putut fi acceptată. Verifică codul și încearcă din nou.'],
  unavailable: ['Kısa davet kodları henüz sunucuda hazır değil. Lütfen daha sonra tekrar dene.', 'Short invitation codes are not ready on the server yet. Please try again later.', 'Kodet e shkurtra të ftesës nuk janë ende gati në server. Provo më vonë.', 'Codurile scurte de invitație nu sunt încă disponibile pe server. Încearcă mai târziu.'],
  delete: ['Seyahati sil', 'Delete trip', 'Fshi udhëtimin', 'Șterge călătoria'],
  deleteShort: ['Sil', 'Delete', 'Fshi', 'Șterge'],
  leave: ['Seyahatten ayrıl', 'Leave trip', 'Largohu nga udhëtimi', 'Părăsește călătoria'],
  leaveShort: ['Ayrıl', 'Leave', 'Largohu', 'Ieși'],
  cancel: ['Vazgeç', 'Cancel', 'Anulo', 'Anulează'],
  deleting: ['Siliniyor…', 'Deleting…', 'Po fshihet…', 'Se șterge…'],
  leaving: ['Ayrılınıyor…', 'Leaving…', 'Po largohesh…', 'Se părăsește…'],
  deleteExplanation: ['Bu seyahat, davetleri, oylamaları ve ortak masrafları tüm katılımcılar için silinecek. Bu işlem geri alınamaz.', 'This trip, its invitations, votes and shared expenses will be deleted for everyone. This cannot be undone.', 'Ky udhëtim, ftesat, votat dhe shpenzimet e përbashkëta do të fshihen për të gjithë. Ky veprim nuk zhbëhet.', 'Călătoria, invitațiile, voturile și cheltuielile comune vor fi șterse pentru toți participanții. Acțiunea este definitivă.'],
  leaveExplanation: ['Bu seyahate erişimin sona erecek. Diğer katılımcıların planı korunacak.', 'You will lose access to this trip. The other participants will keep their plan.', 'Nuk do të kesh më qasje në këtë udhëtim. Plani i pjesëmarrësve të tjerë ruhet.', 'Nu vei mai avea acces la călătorie. Planul celorlalți participanți se păstrează.'],
  deleted: ['Ortak seyahat silindi.', 'Shared trip deleted.', 'Udhëtimi i përbashkët u fshi.', 'Călătoria comună a fost ștearsă.'],
  left: ['Ortak seyahatten ayrıldın.', 'You left the shared trip.', 'U largove nga udhëtimi i përbashkët.', 'Ai părăsit călătoria comună.'],
  removeFailed: ['İşlem tamamlanamadı. Seyahatin hâlâ listende.', 'The action could not be completed. The trip is still in your list.', 'Veprimi nuk u përfundua. Udhëtimi është ende në listë.', 'Acțiunea nu a fost finalizată. Călătoria este încă în lista ta.'],
} as const;

export function sharedTripCopy(locale: AppLocale, key: keyof typeof messages): string {
  return messages[key][locale === 'tr' ? 0 : locale === 'en' ? 1 : locale === 'sq' ? 2 : 3];
}
