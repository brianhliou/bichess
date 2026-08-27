// Curated streamer directory data for /streamer. Hand-maintained, exactly like
// videos-data.ts: adding a streamer is an edit here and a deploy, not a signup
// flow. There is deliberately no backend, no OAuth channel verification, and no
// live-status polling. Those need Twitch Helix and YouTube Data API pollers
// plus caching, and docs-private/streaming/spectator-wedge-features.md makes
// the case against building them before any streamer exists.
//
// Consequence worth knowing: this directory says who streams xiangqi here, not
// who is live right now. When enough people are listed to make "live now" worth
// the infrastructure, that is the moment to add it, not before.
//
// The nav entry for /streamer is derived from this list (see nav-items.ts), so
// the first entry added here lights up the nav and an empty list keeps it
// hidden. Nobody has to remember to flip a separate switch.

export type StreamerPlatform = 'twitch' | 'youtube';

export type StreamerEntry = {
  /** Display name, as the streamer writes it. */
  name: string;
  platform: StreamerPlatform;
  /** Channel URL, linked verbatim. */
  url: string;
  /** One line in the streamer's own words where possible. */
  blurb: string;
  /** Spoken language(s), free text: "English", "English and Mandarin". */
  language: string;
  /** Mistboard handle, when they have an account here. Links to their profile. */
  handle?: string;
  /** ISO-8601 (YYYY-MM-DD) date the entry was added or last verified. */
  addedAt: string;
};

// Empty until real streamers agree to be listed (#192). An unlisted, unseeded
// directory is worse than none: it was linked from the nav for weeks pointing
// at an empty page. Seed it, then it appears.
export const STREAMERS: readonly StreamerEntry[] = [];
