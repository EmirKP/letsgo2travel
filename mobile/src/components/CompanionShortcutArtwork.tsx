import { useId } from 'react';

/** Decorative illustrations for the three labelled travel shortcuts. */
export function CompanionShortcutArtwork({ kind, size = 56, className = '' }: {
  kind: 'guide' | 'phrases' | 'etiquette';
  size?: number;
  className?: string;
}) {
  const id=`companion-shortcut-${useId().replace(/[^a-zA-Z0-9_-]/g,'')}`;
  const paint=(name:string)=>`url(#${id}-${name})`;
  return <svg width={size} height={size} viewBox="0 0 80 80" fill="none" aria-hidden="true" focusable="false" className={`companion-shortcut-artwork ${className}`.trim()} data-shortcut-artwork={kind}>
    <defs>
      <linearGradient id={`${id}-blue`} x1="18" y1="15" x2="61" y2="65" gradientUnits="userSpaceOnUse"><stop stopColor="#65CBFF"/><stop offset=".46" stopColor="#238CFA"/><stop offset="1" stopColor="#0852C7"/></linearGradient>
      <linearGradient id={`${id}-navy`} x1="17" y1="25" x2="58" y2="65" gradientUnits="userSpaceOnUse"><stop stopColor="#287BCB"/><stop offset="1" stopColor="#124581"/></linearGradient>
      <linearGradient id={`${id}-yellow`} x1="27" y1="20" x2="59" y2="65" gradientUnits="userSpaceOnUse"><stop stopColor="#FFF2A4"/><stop offset=".45" stopColor="#FFDA38"/><stop offset="1" stopColor="#F6B51A"/></linearGradient>
      <linearGradient id={`${id}-paper`} x1="23" y1="13" x2="58" y2="59" gradientUnits="userSpaceOnUse"><stop stopColor="#FFFFFF"/><stop offset="1" stopColor="#DFEFFB"/></linearGradient>
      <linearGradient id={`${id}-hand`} x1="26" y1="30" x2="53" y2="56" gradientUnits="userSpaceOnUse"><stop stopColor="#FFF4C6"/><stop offset="1" stopColor="#FFCE6A"/></linearGradient>
      <linearGradient id={`${id}-hand-light`} x1="47" y1="30" x2="32" y2="58" gradientUnits="userSpaceOnUse"><stop stopColor="#FFFBE9"/><stop offset="1" stopColor="#FFE8A3"/></linearGradient>
    </defs>

    {kind==='guide'&&<>
      <path d="M15 27C17 12 34 7 49 12c14 5 20 19 17 31-3 12-18 21-34 18C16 58 12 41 15 27Z" fill="#E8F5FF"/>
      <ellipse cx="40" cy="70" rx="28" ry="4" fill="#154C94" opacity=".12"/>
      <g transform="rotate(-8 38 33)">
        <rect x="23" y="12" width="36" height="42" rx="5" fill="#BDD9EE"/>
        <rect x="20" y="9" width="36" height="42" rx="5" fill={paint('paper')} stroke="#C6E2F5"/>
        <path d="M26 17h17m-17 6h23" stroke="#A9CFE9" strokeWidth="2.5" strokeLinecap="round"/>
      </g>
      <path d="M11 28V23a5 5 0 0 1 5-5h14l6 7h25a6 6 0 0 1 6 6v28a7 7 0 0 1-7 7H17a6 6 0 0 1-6-6V28Z" fill={paint('navy')}/>
      <path d="M10 31a5 5 0 0 1 5-5h45a6 6 0 0 1 6 7v26a6 6 0 0 1-6 6H16a6 6 0 0 1-6-6V31Z" fill={paint('blue')}/>
      <path d="M16 31h31" stroke="#B5E5FF" strokeWidth="2" strokeLinecap="round" opacity=".7"/>
      <rect x="19" y="35" width="29" height="20" rx="4" fill={paint('paper')}/>
      <rect x="24" y="40" width="7" height="10" rx="1.5" fill="#2487E8"/>
      <path d="M26 40h5v4h-5" fill="#FFDA38"/>
      <path d="M36 41h7m-7 5h7m-7 5h4" stroke="#6F9FCB" strokeWidth="2" strokeLinecap="round"/>
      <g transform="rotate(14 61 23)">
        <path d="M57 13h8l5 6v17a3 3 0 0 1-3 3H55a3 3 0 0 1-3-3V19l5-6Z" fill="#BC861C" opacity=".18" transform="translate(1 2)"/>
        <path d="M57 11h8l5 6v17a3 3 0 0 1-3 3H55a3 3 0 0 1-3-3V17l5-6Z" fill={paint('yellow')}/>
        <circle cx="61" cy="18" r="2.3" fill="#E8F5FF" stroke="#DDAE29"/>
        <path d="M60 16c-2-6-5-8-9-6" stroke="#4B8EC4" strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M57 25h8m-8 5h5" stroke="#9A741A" strokeWidth="1.8" strokeLinecap="round" opacity=".8"/>
      </g>
      <circle cx="59" cy="59" r="14" fill="#1B559C" opacity=".2" transform="translate(0 2)"/>
      <circle cx="58" cy="57" r="14" fill={paint('yellow')} stroke="#FFF4BC" strokeWidth="1.5"/>
      <path d="M49 52a10 10 0 0 1 8-5" stroke="#FFF9DC" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="58" cy="51" r="2" fill="#164E93"/>
      <path d="M56 56h2v8m-2 0h5" stroke="#164E93" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
    </>}

    {kind==='phrases'&&<>
      <path d="M14 29C14 14 31 6 47 11c14 4 20 17 17 30-3 14-17 23-32 20C17 58 12 42 14 29Z" fill="#EAF6FF"/>
      <ellipse cx="40" cy="70" rx="27" ry="4" fill="#154C94" opacity=".12"/>
      <path d="M15 43V32a20 20 0 0 1 40 0v12" stroke="#164D8D" strokeWidth="8" strokeLinecap="round"/>
      <path d="M14 40V31a20 20 0 0 1 40 0v10" stroke={paint('blue')} strokeWidth="7" strokeLinecap="round"/>
      <path d="M22 17a20 20 0 0 1 19-5" stroke="#B3E7FF" strokeWidth="2" strokeLinecap="round"/>
      <rect x="8" y="34" width="13" height="22" rx="6" fill={paint('navy')}/>
      <rect x="8" y="34" width="7" height="20" rx="3.5" fill={paint('blue')}/>
      <rect x="49" y="34" width="12" height="22" rx="6" fill={paint('navy')}/>
      <path d="M17 54v3a9 9 0 0 0 9 9h9" stroke="#1F6CC0" strokeWidth="3" strokeLinecap="round"/>
      <rect x="30" y="63" width="10" height="5" rx="2.5" fill="#FFD545"/>
      <path d="M31 31h32a9 9 0 0 1 9 9v12a9 9 0 0 1-9 9h-7l-10 8v-8H31a9 9 0 0 1-9-9V40a9 9 0 0 1 9-9Z" fill="#D19E21" opacity=".24" transform="translate(0 2)"/>
      <path d="M31 29h32a9 9 0 0 1 9 9v12a9 9 0 0 1-9 9h-7l-10 8v-8H31a9 9 0 0 1-9-9V38a9 9 0 0 1 9-9Z" fill={paint('yellow')}/>
      <path d="M31 34h15" stroke="#FFF8D5" strokeWidth="2" strokeLinecap="round"/>
      <g stroke="#17539A" strokeWidth="3" strokeLinecap="round"><path d="M33 43v4m7-9v14m7-18v21m7-16v11m7-7v4"/></g>
      <path d="M49 8h16a8 8 0 0 1 8 8v5a8 8 0 0 1-8 8H54l-8 5v-6a8 8 0 0 1-5-7v-5a8 8 0 0 1 8-8Z" fill={paint('paper')} stroke="#C4E0F2"/>
      <g fill="#2489E5"><circle cx="49" cy="18" r="2"/><circle cx="57" cy="18" r="2"/><circle cx="65" cy="18" r="2"/></g>
    </>}

    {kind==='etiquette'&&<>
      <path d="M16 32C15 18 26 9 40 9s25 9 24 23v23H16V32Z" fill="#E7F4FF"/>
      <path d="M23 33V28a17 17 0 0 1 34 0v5" stroke="#C9E6FA" strokeWidth="2.5" strokeLinecap="round"/>
      <ellipse cx="40" cy="70" rx="28" ry="4" fill="#154C94" opacity=".12"/>
      <path d="M40 25s-8-4.5-8-9a4.5 4.5 0 0 1 8-2.8 4.5 4.5 0 0 1 8 2.8c0 4.5-8 9-8 9Z" fill={paint('yellow')}/>
      <path d="M34 15c.5-1 1.5-1.6 2.7-1.4" stroke="#FFF8D8" strokeWidth="1.6" strokeLinecap="round"/>
      <path d="m19 42 11-10a8 8 0 0 1 9-1l13 8 10 9-14 15a5 5 0 0 1-7 0L22 49l-3-7Z" fill="#1B559C" opacity=".14" transform="translate(0 2)"/>
      <path d="m19 40 11-10a8 8 0 0 1 9-1l13 8 10 9-14 15a5 5 0 0 1-7 0L22 47l-3-7Z" fill={paint('hand')}/>
      <path d="m61 39-10-9a8 8 0 0 0-9-1L29 38a4 4 0 0 0 4 7l9-5 13 11 9-8-3-4Z" fill={paint('hand-light')} stroke="#E2B65D" strokeWidth=".8" strokeLinejoin="round"/>
      <path d="m29 38 9-7a6 6 0 0 1 6-1" stroke="#FFFCED" strokeWidth="2" strokeLinecap="round"/>
      <path d="m35 49 11 10m-6-15 12 11m-7-15 12 11" stroke="#D9A54B" strokeWidth="1.7" strokeLinecap="round"/>
      <path d="m22 48-3 3 12 11a3.4 3.4 0 0 0 5-4L25 47a2.3 2.3 0 0 0-3 1Z" fill={paint('hand-light')} stroke="#E2B65D" strokeWidth=".7"/>
      <path d="m7 41 10-8a3 3 0 0 1 4 1l12 16a3 3 0 0 1-1 4l-11 9L7 41Z" fill={paint('navy')} transform="translate(0 2)"/>
      <path d="m6 39 10-8a3 3 0 0 1 4 1l12 16a3 3 0 0 1-1 4l-11 9L6 39Z" fill={paint('blue')}/>
      <path d="m10 39 8-6" stroke="#BAE8FF" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="23" cy="52" r="2" fill="#DFF3FF"/>
      <path d="m74 41-10-8a3 3 0 0 0-4 1L48 50a3 3 0 0 0 1 4l11 9 14-22Z" fill="#D2A128" transform="translate(0 2)"/>
      <path d="m74 39-10-8a3 3 0 0 0-4 1L48 48a3 3 0 0 0 1 4l11 9 14-22Z" fill={paint('yellow')}/>
      <path d="m70 39-8-6" stroke="#FFF9D7" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="57" cy="52" r="2" fill="#A07B20"/>
    </>}
  </svg>;
}
