/** JSON contract shared by mobile, moderation and the authenticated social API. */
export type SocialVisibility = "public" | "followers";
export type SocialPlace = { name: string; countryCode?: string; lat?: number; lng?: number };
export type SocialAuthor = { key: string; userId: string; username: string; avatarUrl: string | null; isOfficial: boolean };
export type SocialPost = {
  id: string; author: SocialAuthor; caption: string; visibility: SocialVisibility;
  place: SocialPlace | null; photoUrl: string; createdAt: string;
  status: "pending" | "published" | "hidden";
  likeCount: number; commentCount: number; liked: boolean; saved: boolean; isOwn: boolean; collectionIds: string[];
  editorial?: boolean;
};
export type SocialComment = {
  id: string; author: SocialAuthor; body: string; parentId: string | null;
  createdAt: string; status: "pending" | "published" | "hidden"; isOwn: boolean;
  isDeleted?: boolean; editedAt?: string | null;
};
export type SocialPage<T> = { items: T[]; nextOffset: number | null };
export type SocialDetail = { post: SocialPost; comments: SocialPage<SocialComment> & { previousOffset?: number | null } };
export type SocialCollection = { id: string; name: string; postCount: number };
export type SocialNotificationPreferences = { comments: boolean; replies: boolean; follows: boolean; price_alert_email: boolean; price_alert_push: boolean };
export const SOCIAL_UNDO_SECONDS = 30;
export const SOCIAL_PHOTO_BUCKET = "travel-social-photos";
