import { useId } from 'react';

export type WelcomeArtworkKind = 'city' | 'culture' | 'food' | 'coast' | 'nature' | 'adventure' | 'shopping';

/** Small destination scenes: the subject explains the choice without a legend. */
export function WelcomeArtwork({ kind, size = 64 }: { kind: WelcomeArtworkKind; size?: number }) {
  const id = `welcome-art-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const paint = (name: string) => `url(#${id}-${name})`;
  return <svg className="welcome-artwork" width={size} height={size} viewBox="0 0 80 80" fill="none" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${id}-sky`} x1="15" y1="10" x2="66" y2="67" gradientUnits="userSpaceOnUse"><stop stopColor="#e4f6ff"/><stop offset="1" stopColor="#b2dfff"/></linearGradient>
      <linearGradient id={`${id}-blue`} x1="20" y1="15" x2="60" y2="65" gradientUnits="userSpaceOnUse"><stop stopColor="#68caff"/><stop offset="1" stopColor="#246adb"/></linearGradient>
      <linearGradient id={`${id}-gold`} x1="20" y1="15" x2="60" y2="65" gradientUnits="userSpaceOnUse"><stop stopColor="#ffe39a"/><stop offset="1" stopColor="#efa638"/></linearGradient>
      <linearGradient id={`${id}-green`} x1="20" y1="25" x2="57" y2="70" gradientUnits="userSpaceOnUse"><stop stopColor="#a9e5a4"/><stop offset="1" stopColor="#379e83"/></linearGradient>
    </defs>
    <rect x="6" y="6" width="68" height="68" rx="22" fill={paint('sky')}/>
    {kind === 'city' && <><circle cx="59" cy="22" r="8" fill={paint('gold')}/><path d="M11 63h58" stroke="#98c4d5" strokeWidth="4" strokeLinecap="round"/><rect x="16" y="31" width="18" height="30" rx="3" fill="#87c5d6"/><path d="M22 37h6m-6 8h6m-6 8h6" stroke="#efffff" strokeWidth="3"/><rect x="35" y="21" width="21" height="40" rx="3" fill={paint('blue')}/><path d="M40 28h10m-10 8h10m-10 8h10m-10 8h10" stroke="#def4ff" strokeWidth="3"/><rect x="55" y="42" width="11" height="19" rx="2" fill={paint('gold')}/></>}
    {kind === 'culture' && <><path d="m13 33 27-17 27 17v6H13Z" fill={paint('gold')}/><path d="m24 31 16-10 16 10Z" fill="#fff0c6"/><path d="M19 40h9v21h-9zm17 0h9v21h-9zm17 0h9v21h-9Z" fill="#faf7e8"/><path d="M16 40h15m2 0h15m2 0h15" stroke="#79a6c7" strokeWidth="3"/><rect x="13" y="61" width="54" height="6" rx="2" fill={paint('blue')}/><circle cx="40" cy="28" r="3" fill="#c88f34"/></>}
    {kind === 'food' && <><ellipse cx="40" cy="47" rx="25" ry="22" fill="#9bc6d8"/><ellipse cx="40" cy="44" rx="25" ry="22" fill="#fffdf5"/><ellipse cx="40" cy="44" rx="18" ry="16" stroke="#dceaf0" strokeWidth="2"/><path d="m29 35 26 4-17 21Z" fill={paint('gold')}/><path d="m29 35 26 4" stroke="#c87e32" strokeWidth="6" strokeLinecap="round"/><circle cx="38" cy="43" r="3" fill="#e85b4a"/><circle cx="46" cy="44" r="3" fill="#e85b4a"/><path d="m35 51 4-4m5 5 3-3" stroke="#69a35b" strokeWidth="2.5" strokeLinecap="round"/><path d="M11 29v11m-4-11v6c0 7 8 7 8 0v-6m-4 12v22M69 29v34m0-34c-7 5-7 17 0 17" stroke="#5288b1" strokeWidth="2.5" strokeLinecap="round"/></>}
    {kind === 'coast' && <><circle cx="57" cy="22" r="9" fill={paint('gold')}/><path d="M8 45c15-7 30 7 64-2v15H8Z" fill="#47c2df"/><path d="M8 57c23-11 39 6 64-5v12a10 10 0 0 1-10 10H24A16 16 0 0 1 8 57Z" fill="#eacb8c"/><path d="m29 26 7 37" stroke="#9f7b51" strokeWidth="3" strokeLinecap="round"/><path d="M14 36c0-22 29-25 35-7L14 36Z" fill="#f5827c"/><path d="M29 26c1-8 3-11 5-11 5 4 7 8 7 16" fill="#fff2dd"/><path d="M45 51c6 3 13 3 18 0" stroke="#d8ffff" strokeWidth="2" strokeLinecap="round"/></>}
    {kind === 'nature' && <><circle cx="56" cy="23" r="8" fill={paint('gold')}/><path d="m9 55 22-32 21 32Z" fill="#8ec3c5"/><path d="m23 35 8-12 8 12-9-3Z" fill="#f3fbf9"/><path d="M9 59c11-17 27-8 36-14 13-9 22 4 27 11v7c0 6-6 11-12 11H25C15 74 9 68 9 59Z" fill={paint('green')}/><path d="M40 53c-12 8 23 9 8 20" stroke="#d9f7f9" strokeWidth="5"/><path d="M20 42v23m-9-9 9-21 9 21Z" fill="#368579" stroke="#368579" strokeWidth="3" strokeLinejoin="round"/></>}
    {kind === 'adventure' && <><path d="m8 59 22-34 13 19 10-15 20 30Z" fill="#7baab7"/><path d="m23 36 7-11 8 12-8-3Z" fill="#f4fcff"/><path d="M8 61h64" stroke="#6bad91" strokeWidth="9"/><path d="m21 62 19-30 20 30Z" fill={paint('gold')}/><path d="m40 32 20 30H39Z" fill="#e59736"/><path d="m32 62 8-16 9 16Z" fill="#725d49"/><path d="m52 14 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" fill="#fff"/></>}
    {kind === 'shopping' && <><path d="M22 32v-9a10 10 0 0 1 20 0v9" stroke="#bc8943" strokeWidth="3"/><path d="M16 29h33l4 36H12Z" fill={paint('gold')}/><path d="M45 39v-9a9 9 0 0 1 18 0v9" stroke="#287bae" strokeWidth="3"/><path d="M38 37h31l3 29H35Z" fill={paint('blue')}/><path d="M22 38v2m20-2v2m3 5v2m17-2v2" stroke="#fff" strokeWidth="3" strokeLinecap="round"/><path d="m48 53 4 4 7-8" stroke="#e4faff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></>}
  </svg>;
}
