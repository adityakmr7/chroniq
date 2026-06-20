/**
 * branding.ts — Channel Branding System
 *
 * Manages channel identity settings: name, tagline, accent color, outro card.
 * The outro card is a 5-second full-screen branded end screen rendered by Remotion.
 */

export interface ChannelBranding {
  channelName: string;
  tagline: string;
  accentColor: string;     // hex color e.g. "#f97316"
  secondaryColor: string;
  outroMessage: string;    // call to action shown in outro
  logoEmoji: string;       // emoji used as logo placeholder
}

export const DEFAULT_BRANDING: ChannelBranding = {
  channelName: "Chroniq",
  tagline: "The World's Untold Stories",
  accentColor: "#f97316",
  secondaryColor: "#a855f7",
  outroMessage: "Follow for daily stories.",
  logoEmoji: "🎬",
};

/**
 * Convert channel settings Record<string, string> to ChannelBranding object.
 */
export function settingsToBranding(settings: Record<string, string>): ChannelBranding {
  return {
    channelName: settings["channel.name"] || DEFAULT_BRANDING.channelName,
    tagline: settings["channel.tagline"] || DEFAULT_BRANDING.tagline,
    accentColor: settings["channel.accentColor"] || DEFAULT_BRANDING.accentColor,
    secondaryColor: settings["channel.secondaryColor"] || DEFAULT_BRANDING.secondaryColor,
    outroMessage: settings["channel.outroMessage"] || DEFAULT_BRANDING.outroMessage,
    logoEmoji: settings["channel.logoEmoji"] || DEFAULT_BRANDING.logoEmoji,
  };
}

/**
 * Convert ChannelBranding to flat settings map for DB storage.
 */
export function brandingToSettings(branding: Partial<ChannelBranding>): Record<string, string> {
  const map: Record<string, string> = {};
  if (branding.channelName)    map["channel.name"] = branding.channelName;
  if (branding.tagline)        map["channel.tagline"] = branding.tagline;
  if (branding.accentColor)    map["channel.accentColor"] = branding.accentColor;
  if (branding.secondaryColor) map["channel.secondaryColor"] = branding.secondaryColor;
  if (branding.outroMessage)   map["channel.outroMessage"] = branding.outroMessage;
  if (branding.logoEmoji)      map["channel.logoEmoji"] = branding.logoEmoji;
  return map;
}
