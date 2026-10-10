import { useState } from "react";
import { profileAvatarUrl, profileInitials } from "../lib/communityProfiles";
import "./community-profile.css";

export function CommunityAvatar({ username, avatarUrl, size = "small" }: {
  username: string;
  avatarUrl?: string | null;
  size?: "small" | "medium" | "large";
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const url = profileAvatarUrl(avatarUrl);
  const tone = Array.from(username).reduce((hash, character) => (hash * 31 + character.codePointAt(0)!) % 5, 0);
  return <span className={`community-profile-avatar community-profile-avatar-${size} community-profile-avatar-tone-${tone}`} aria-hidden="true">
    {url && failedUrl !== url
      ? <img src={url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailedUrl(url)} />
      : <span>{profileInitials(username)}</span>}
  </span>;
}
